import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import {
  PROTOCOL_ERROR_CODES,
  WS_CLOSE_CODES,
  createSignalingEnvelope,
  type SignalingMessage,
  type RoomJoinedMessage,
  type PeerJoinedMessage,
  type PeerLeftMessage,
  type ErrorMessage,
  type OfferMessage,
  type AnswerMessage,
  type IceCandidateMessage,
  type PongMessage,
} from "@pvc/protocol";
import { createSignalingServer, type SignalingServerInstance } from "../src/server.js";

describe("Signaling Server Integration Tests", () => {
  let serverInstance: SignalingServerInstance;
  let serverPort: number;
  let wsUrl: string;

  beforeAll(async () => {
    // Start on random ephemeral port
    serverInstance = createSignalingServer({
      port: 0,
      heartbeatIntervalMs: 200,
      heartbeatTimeoutMs: 500,
    });
    serverPort = await serverInstance.start(0);
    wsUrl = `ws://127.0.0.1:${serverPort}`;
  });

  afterAll(async () => {
    await serverInstance.close();
  });

  /**
   * Helper to create and track a test WebSocket client
   */
  function createTestClient() {
    const ws = new WebSocket(wsUrl);
    const messages: SignalingMessage[] = [];
    const messageResolvers: ((msg: SignalingMessage) => void)[] = [];

    ws.on("message", (data) => {
      try {
        const parsed = JSON.parse(data.toString()) as SignalingMessage;
        if (messageResolvers.length > 0) {
          const resolver = messageResolvers.shift()!;
          resolver(parsed);
        } else {
          messages.push(parsed);
        }
      } catch (err) {
        console.error("Failed to parse test client message:", err);
      }
    });

    const waitForOpen = () =>
      new Promise<void>((resolve, reject) => {
        if (ws.readyState === WebSocket.OPEN) return resolve();
        ws.once("open", () => resolve());
        ws.once("error", reject);
      });

    const nextMessage = (timeoutMs = 3000): Promise<SignalingMessage> => {
      if (messages.length > 0) {
        return Promise.resolve(messages.shift()!);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = messageResolvers.indexOf(resolve);
          if (idx !== -1) messageResolvers.splice(idx, 1);
          reject(new Error(`Timeout waiting for message after ${timeoutMs}ms`));
        }, timeoutMs);

        messageResolvers.push((msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });
    };

    const waitForClose = (
      timeoutMs = 3000,
    ): Promise<{ code: number; reason: string }> => {
      if (ws.readyState === WebSocket.CLOSED) {
        return Promise.resolve({ code: 1000, reason: "" });
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Timeout waiting for close after ${timeoutMs}ms`));
        }, timeoutMs);
        ws.once("close", (code, reason) => {
          clearTimeout(timer);
          resolve({ code, reason: reason.toString() });
        });
      });
    };

    const send = (envelope: unknown) => {
      ws.send(JSON.stringify(envelope));
    };

    const close = () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    };

    return { ws, waitForOpen, nextMessage, waitForClose, send, close };
  }

  const roomId = "room_test_lifecycle_1";
  const validKey = "sec_test_valid_key_12345";
  const invalidKey = "sec_test_wrong_key_99999";

  let client1: ReturnType<typeof createTestClient>;
  let client2: ReturnType<typeof createTestClient>;

  it("Test 1: Peer 1 creates room with key and receives room-joined (polite: false)", async () => {
    client1 = createTestClient();
    await client1.waitForOpen();

    client1.send(
      createSignalingEnvelope("join-room", roomId, "peer-1", {
        roomKey: validKey,
        displayName: "Peer One",
      }),
    );

    const msg = (await client1.nextMessage()) as RoomJoinedMessage;
    expect(msg.type).toBe("room-joined");
    expect(msg.roomId).toBe(roomId);
    expect(msg.payload.peerId).toBe("peer-1");
    expect(msg.payload.isInitiator).toBe(true);
    expect(msg.payload.polite).toBe(false);
    expect(msg.payload.peerCount).toBe(1);
    expect(msg.payload.existingPeers).toEqual([]);

    const room = serverInstance.roomManager.getRoom(roomId);
    expect(room).toBeDefined();
    expect(room?.peers.size).toBe(1);
  });

  it("Test 2: Invalid room key is rejected with UNAUTHORIZED (4401)", async () => {
    const unauthorizedClient = createTestClient();
    await unauthorizedClient.waitForOpen();

    unauthorizedClient.send(
      createSignalingEnvelope("join-room", roomId, "peer-intruder", {
        roomKey: invalidKey,
        displayName: "Intruder",
      }),
    );

    // Should receive error message
    const errorMsg = (await unauthorizedClient.nextMessage()) as ErrorMessage;
    expect(errorMsg.type).toBe("error");
    expect(errorMsg.payload.code).toBe(PROTOCOL_ERROR_CODES.UNAUTHORIZED);

    // Socket should close with UNAUTHORIZED code 4401
    const { code } = await unauthorizedClient.waitForClose();
    expect(code).toBe(WS_CLOSE_CODES.UNAUTHORIZED);

    // Room still has only 1 peer
    const room = serverInstance.roomManager.getRoom(roomId);
    expect(room?.peers.size).toBe(1);
  });

  it("Test 3: Peer 2 joins with valid key and receives room-joined (polite: true); Peer 1 receives peer-joined", async () => {
    client2 = createTestClient();
    await client2.waitForOpen();

    client2.send(
      createSignalingEnvelope("join-room", roomId, "peer-2", {
        roomKey: validKey,
        displayName: "Peer Two",
      }),
    );

    // Peer 2 receives room-joined
    const joinMsg = (await client2.nextMessage()) as RoomJoinedMessage;
    expect(joinMsg.type).toBe("room-joined");
    expect(joinMsg.roomId).toBe(roomId);
    expect(joinMsg.payload.peerId).toBe("peer-2");
    expect(joinMsg.payload.isInitiator).toBe(false);
    expect(joinMsg.payload.polite).toBe(true);
    expect(joinMsg.payload.peerCount).toBe(2);
    expect(joinMsg.payload.existingPeers).toEqual(["peer-1"]);

    // Peer 1 receives peer-joined
    const peerJoinedMsg = (await client1.nextMessage()) as PeerJoinedMessage;
    expect(peerJoinedMsg.type).toBe("peer-joined");
    expect(peerJoinedMsg.roomId).toBe(roomId);
    expect(peerJoinedMsg.payload.peerId).toBe("peer-2");
    expect(peerJoinedMsg.payload.displayName).toBe("Peer Two");

    const room = serverInstance.roomManager.getRoom(roomId);
    expect(room?.peers.size).toBe(2);
  });

  it("Test 4: 3rd distinct peer is rejected with ROOM_FULL (4403)", async () => {
    const thirdClient = createTestClient();
    await thirdClient.waitForOpen();

    thirdClient.send(
      createSignalingEnvelope("join-room", roomId, "peer-3", {
        roomKey: validKey,
        displayName: "Peer Three",
      }),
    );

    const errorMsg = (await thirdClient.nextMessage()) as ErrorMessage;
    expect(errorMsg.type).toBe("error");
    expect(errorMsg.payload.code).toBe(PROTOCOL_ERROR_CODES.ROOM_FULL);

    const { code } = await thirdClient.waitForClose();
    expect(code).toBe(WS_CLOSE_CODES.ROOM_FULL);

    const room = serverInstance.roomManager.getRoom(roomId);
    expect(room?.peers.size).toBe(2);
  });

  it("Test 5: Peer 1 page reload (same peerId) replaces socket without lockout", async () => {
    // Create new connection for peer-1 (simulating browser reload)
    const client1Reload = createTestClient();
    await client1Reload.waitForOpen();

    client1Reload.send(
      createSignalingEnvelope("join-room", roomId, "peer-1", {
        roomKey: validKey,
        displayName: "Peer One (Reloaded)",
      }),
    );

    // Old socket receives closure with CONNECTION_REPLACED (4409)
    const oldClose = await client1.waitForClose();
    expect(oldClose.code).toBe(WS_CLOSE_CODES.CONNECTION_REPLACED);

    // New socket receives room-joined with original initiator/polite status preserved
    const roomJoined = (await client1Reload.nextMessage()) as RoomJoinedMessage;
    expect(roomJoined.type).toBe("room-joined");
    expect(roomJoined.payload.peerId).toBe("peer-1");
    expect(roomJoined.payload.isInitiator).toBe(true);
    expect(roomJoined.payload.polite).toBe(false);
    expect(roomJoined.payload.peerCount).toBe(2);

    // Peer 2 receives peer-joined notification about the refreshed peer
    const peer2Notification = (await client2.nextMessage()) as PeerJoinedMessage;
    expect(peer2Notification.type).toBe("peer-joined");
    expect(peer2Notification.payload.peerId).toBe("peer-1");

    // Replace client1 reference with the new active connection
    client1 = client1Reload;

    const room = serverInstance.roomManager.getRoom(roomId);
    expect(room?.peers.size).toBe(2);
  });

  it("Test 6: Relay of offer, answer, and ice-candidate to the opposing peer", async () => {
    // 1. Peer 1 sends offer -> Peer 2 receives offer
    const offerSdp = "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
    client1.send(
      createSignalingEnvelope("offer", roomId, "peer-1", {
        sdp: { type: "offer", sdp: offerSdp },
      }),
    );

    const offerMsg = (await client2.nextMessage()) as OfferMessage;
    expect(offerMsg.type).toBe("offer");
    expect(offerMsg.senderId).toBe("peer-1");
    expect(offerMsg.targetId).toBe("peer-2");
    expect(offerMsg.payload.sdp.sdp).toBe(offerSdp);

    // 2. Peer 2 sends answer -> Peer 1 receives answer
    const answerSdp = "v=0\r\no=- 67890 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n";
    client2.send(
      createSignalingEnvelope("answer", roomId, "peer-2", {
        sdp: { type: "answer", sdp: answerSdp },
      }),
    );

    const answerMsg = (await client1.nextMessage()) as AnswerMessage;
    expect(answerMsg.type).toBe("answer");
    expect(answerMsg.senderId).toBe("peer-2");
    expect(answerMsg.targetId).toBe("peer-1");
    expect(answerMsg.payload.sdp.sdp).toBe(answerSdp);

    // 3. Peer 1 sends ice-candidate -> Peer 2 receives ice-candidate
    const iceCandidate = {
      candidate: "candidate:12345 1 udp 2122260223 192.168.1.100 54321 typ host",
      sdpMid: "0",
      sdpMLineIndex: 0,
      usernameFragment: "ufrag1",
    };
    client1.send(
      createSignalingEnvelope("ice-candidate", roomId, "peer-1", {
        candidate: iceCandidate,
      }),
    );

    const iceMsg = (await client2.nextMessage()) as IceCandidateMessage;
    expect(iceMsg.type).toBe("ice-candidate");
    expect(iceMsg.senderId).toBe("peer-1");
    expect(iceMsg.targetId).toBe("peer-2");
    expect(iceMsg.payload.candidate).toEqual(iceCandidate);
  });

  it("Test 7: Heartbeat ping / pong handling", async () => {
    client1.send(
      createSignalingEnvelope("ping", roomId, "peer-1", {}),
    );

    const pongMsg = (await client1.nextMessage()) as PongMessage;
    expect(pongMsg.type).toBe("pong");
    expect(pongMsg.roomId).toBe(roomId);
    expect(pongMsg.targetId).toBe("peer-1");
  });

  it("Test 8: Disconnect notifies remaining peer with peer-left and cleans up room", async () => {
    // Peer 1 explicitly leaves or closes socket
    client1.send(
      createSignalingEnvelope("leave-room", roomId, "peer-1", { reason: "call-ended" }),
    );
    client1.close();

    // Peer 2 receives peer-left
    const peerLeftMsg = (await client2.nextMessage()) as PeerLeftMessage;
    expect(peerLeftMsg.type).toBe("peer-left");
    expect(peerLeftMsg.roomId).toBe(roomId);
    expect(peerLeftMsg.payload.peerId).toBe("peer-1");
    expect(peerLeftMsg.payload.reason).toBe("call-ended");

    // Room now has 1 peer
    let room = serverInstance.roomManager.getRoom(roomId);
    expect(room?.peers.size).toBe(1);

    // Peer 2 leaves
    client2.close();

    // Allow event loop to process close
    await new Promise((r) => setTimeout(r, 50));

    // Room should be deleted from memory (Zero Persistent Storage)
    room = serverInstance.roomManager.getRoom(roomId);
    expect(room).toBeUndefined();
    expect(serverInstance.roomManager.getAllRooms().size).toBe(0);
  });
});
