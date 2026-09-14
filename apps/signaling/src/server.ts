import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import {
  PROTOCOL_CONSTANTS,
  PROTOCOL_ERROR_CODES,
  SIGNALING_EVENTS,
  createSignalingEnvelope,
  parseSignalingMessage,
  SignalingProtocolError,
  type SignalingMessage,
} from "@pvc/protocol";
import { RoomManager } from "./room/room-manager.js";
import { handleRelayMessage } from "./handlers/relay.handler.js";
import { sendToSocket } from "./room/peer.js";

dotenv.config();

export interface SignalingServerOptions {
  port?: number;
  allowedOrigins?: string[];
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  allowNoOrigin?: boolean;
}

export interface SignalingServerInstance {
  httpServer: http.Server;
  wss: WebSocketServer;
  roomManager: RoomManager;
  start: (port?: number) => Promise<number>;
  close: () => Promise<void>;
}

/**
 * Validates request Origin against configured allowed origins.
 */
export function isOriginAllowed(
  origin: string | undefined,
  allowedOrigins: string[],
  allowNoOrigin: boolean = true,
): boolean {
  if (!origin) {
    return allowNoOrigin;
  }
  if (allowedOrigins.includes("*")) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

/**
 * Creates and configures the Signaling Server instance.
 */
export function createSignalingServer(
  options: SignalingServerOptions = {},
): SignalingServerInstance {
  const roomManager = new RoomManager();

  const allowedOrigins = options.allowedOrigins ?? (
    process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
      : [
          "http://localhost:3000",
          "http://127.0.0.1:3000",
          "http://localhost:8080",
          "http://127.0.0.1:8080",
        ]
  );

  const heartbeatIntervalMs =
    options.heartbeatIntervalMs ?? PROTOCOL_CONSTANTS.HEARTBEAT_INTERVAL_MS;
  const heartbeatTimeoutMs =
    options.heartbeatTimeoutMs ?? PROTOCOL_CONSTANTS.HEARTBEAT_TIMEOUT_MS;
  const allowNoOrigin = options.allowNoOrigin ?? (process.env.NODE_ENV !== "production");

  // Create native HTTP server
  const httpServer = http.createServer((req, res) => {
    // Health check endpoint
    if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
      const body = JSON.stringify({
        status: "ok",
        service: "@pvc/signaling",
        activeRooms: roomManager.getAllRooms().size,
        timestamp: Date.now(),
      });
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  // Create native WebSocket server
  const wss = new WebSocketServer({
    server: httpServer,
    maxPayload: PROTOCOL_CONSTANTS.MAX_MESSAGE_SIZE_BYTES,
    verifyClient: (info, callback) => {
      const origin = info.origin;
      if (!isOriginAllowed(origin, allowedOrigins, allowNoOrigin)) {
        callback(false, 403, "Forbidden: Origin not allowed");
        return;
      }
      callback(true);
    },
  });

  // Setup connection event
  wss.on("connection", (socket: WebSocket) => {
    // Native WebSocket pong frames
    socket.on("pong", () => {
      const sessionInfo = roomManager.getSessionForSocket(socket);
      if (sessionInfo) {
        const room = roomManager.getRoom(sessionInfo.roomId);
        const peer = room?.peers.get(sessionInfo.peerId);
        if (peer) {
          peer.isAlive = true;
          peer.lastPing = Date.now();
        }
      }
    });

    socket.on("message", (data: Buffer | string, isBinary: boolean) => {
      if (isBinary) {
        sendToSocket(
          socket,
          createSignalingEnvelope("error", "unknown", "system", {
            code: PROTOCOL_ERROR_CODES.INVALID_MESSAGE,
            message: "Binary WebSocket frames are not supported. Expected UTF-8 JSON text.",
          }),
        );
        return;
      }

      let raw: unknown;
      try {
        raw = JSON.parse(data.toString());
      } catch {
        sendToSocket(
          socket,
          createSignalingEnvelope("error", "unknown", "system", {
            code: PROTOCOL_ERROR_CODES.INVALID_MESSAGE,
            message: "Malformed JSON frame received.",
          }),
        );
        return;
      }

      let message: SignalingMessage;
      try {
        message = parseSignalingMessage(raw);
      } catch (err) {
        if (err instanceof SignalingProtocolError) {
          sendToSocket(
            socket,
            createSignalingEnvelope("error", (raw as any)?.roomId || "unknown", "system", {
              code: err.code,
              message: err.message,
            }),
          );
        } else {
          sendToSocket(
            socket,
            createSignalingEnvelope("error", (raw as any)?.roomId || "unknown", "system", {
              code: PROTOCOL_ERROR_CODES.INVALID_MESSAGE,
              message: "Invalid signaling envelope structure.",
            }),
          );
        }
        return;
      }

      // Route signaling messages
      switch (message.type) {
        case SIGNALING_EVENTS.JOIN_ROOM: {
          roomManager.handleJoin(socket, message);
          break;
        }

        case SIGNALING_EVENTS.OFFER:
        case SIGNALING_EVENTS.ANSWER:
        case SIGNALING_EVENTS.ICE_CANDIDATE: {
          handleRelayMessage(roomManager, socket, message);
          break;
        }

        case SIGNALING_EVENTS.LEAVE_ROOM: {
          roomManager.handleLeave(socket, message);
          break;
        }

        case SIGNALING_EVENTS.PING: {
          // Heartbeat ping from client application
          const sessionInfo = roomManager.getSessionForSocket(socket);
          if (sessionInfo) {
            const room = roomManager.getRoom(sessionInfo.roomId);
            const peer = room?.peers.get(sessionInfo.peerId);
            if (peer) {
              peer.isAlive = true;
              peer.lastPing = Date.now();
            }
          }
          sendToSocket(
            socket,
            createSignalingEnvelope("pong", message.roomId, "system", {}, message.senderId),
          );
          break;
        }

        default: {
          // Unhandled or server-originated types sent by client
          sendToSocket(
            socket,
            createSignalingEnvelope("error", message.roomId, "system", {
              code: PROTOCOL_ERROR_CODES.INVALID_MESSAGE,
              message: `Unexpected message type: ${(message as any).type}`,
            }),
          );
          break;
        }
      }
    });

    socket.on("close", (code: number, reason: Buffer) => {
      roomManager.handleSocketClose(socket, code, reason.toString());
    });

    socket.on("error", (err) => {
      console.error("[Signaling] Socket error:", err);
      roomManager.handleSocketClose(socket, 1011, "Internal socket error");
    });
  });

  // Periodic heartbeat timer to ping active sockets and prune stale connections
  const heartbeatTimer = setInterval(() => {
    roomManager.pruneStalePeers(heartbeatTimeoutMs);

    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    }
  }, heartbeatIntervalMs);

  // Ensure timer does not prevent process termination
  heartbeatTimer.unref();

  let isClosing = false;

  const close = async (): Promise<void> => {
    if (isClosing) return;
    isClosing = true;
    clearInterval(heartbeatTimer);

    // Terminate all active clients
    for (const client of wss.clients) {
      try {
        client.close(1001, "Server shutting down");
      } catch {
        client.terminate();
      }
    }

    await new Promise<void>((resolve) => {
      wss.close(() => {
        httpServer.close(() => {
          resolve();
        });
      });
    });
  };

  const start = (port?: number): Promise<number> => {
    const listenPort =
      port ??
      options.port ??
      (process.env.PORT ? Number(process.env.PORT) : PROTOCOL_CONSTANTS.DEFAULT_SIGNALING_PORT);
    return new Promise((resolve, reject) => {
      httpServer.listen(listenPort, () => {
        const addr = httpServer.address();
        const actualPort = typeof addr === "object" && addr ? addr.port : listenPort;
        console.log(`[Signaling] Server listening on port ${actualPort}`);
        resolve(actualPort);
      });
      httpServer.once("error", reject);
    });
  };

  return {
    httpServer,
    wss,
    roomManager,
    start,
    close,
  };
}

// Standalone runner when file is executed directly
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"));

if (isDirectRun && process.env.AUTO_START !== "false") {
  const server = createSignalingServer();
  server.start().catch((err) => {
    console.error("[Signaling] Failed to start:", err);
    process.exit(1);
  });

  const shutdown = async (signal: string) => {
    console.log(`[Signaling] Received ${signal}, gracefully shutting down...`);
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}
