import crypto from "node:crypto";
import type { WebSocket } from "ws";
import {
  PROTOCOL_CONSTANTS,
  PROTOCOL_ERROR_CODES,
  WS_CLOSE_CODES,
  createSignalingEnvelope,
  type JoinRoomMessage,
  type LeaveRoomMessage,
} from "@pvc/protocol";
import { type PeerSession, sendToPeer, sendToSocket } from "./peer.js";

/**
 * In-memory room state holding active participant sessions.
 */
export interface RoomState {
  roomId: string;
  roomKeyHash: string;
  peers: Map<string, PeerSession>;
  createdAt: number;
}

export class RoomManager {
  /** Map of roomId -> RoomState */
  private readonly rooms = new Map<string, RoomState>();

  /** Reverse mapping to quickly identify session associated with a WebSocket */
  private readonly socketToSession = new WeakMap<WebSocket, { roomId: string; peerId: string }>();

  /**
   * Compute a secure SHA-256 hex digest of a room invitation key.
   */
  public static hashRoomKey(key: string): string {
    return crypto.createHash("sha256").update(key).digest("hex");
  }

  /**
   * Constant-time comparison between two SHA-256 digests.
   */
  public static verifyKeyHash(expectedHash: string, candidateKey: string): boolean {
    const candidateHash = RoomManager.hashRoomKey(candidateKey);
    const expectedBuf = Buffer.from(expectedHash, "hex");
    const candidateBuf = Buffer.from(candidateHash, "hex");
    if (expectedBuf.length !== candidateBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, candidateBuf);
  }

  /**
   * Get active room state by roomId.
   */
  public getRoom(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Get all active rooms (for monitoring / inspection).
   */
  public getAllRooms(): ReadonlyMap<string, RoomState> {
    return this.rooms;
  }

  /**
   * Get session metadata associated with a raw socket.
   */
  public getSessionForSocket(socket: WebSocket): { roomId: string; peerId: string } | undefined {
    return this.socketToSession.get(socket);
  }

  /**
   * Get the opposing peer in a 1-to-1 room.
   */
  public getOpposingPeer(roomId: string, currentPeerId: string): PeerSession | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    for (const [peerId, peer] of room.peers.entries()) {
      if (peerId !== currentPeerId) {
        return peer;
      }
    }
    return undefined;
  }

  /**
   * Process a client's `join-room` message frame.
   */
  public handleJoin(socket: WebSocket, message: JoinRoomMessage): PeerSession | null {
    const { roomId, senderId: peerId } = message;
    const { roomKey, displayName } = message.payload;

    let room = this.rooms.get(roomId);

    // Case 1: Room does not exist yet -> Create room, first peer is initiator (polite: false)
    if (!room) {
      const roomKeyHash = RoomManager.hashRoomKey(roomKey);
      room = {
        roomId,
        roomKeyHash,
        peers: new Map<string, PeerSession>(),
        createdAt: Date.now(),
      };
      this.rooms.set(roomId, room);

      const session: PeerSession = {
        socket,
        peerId,
        roomId,
        displayName,
        polite: false, // Initiator is impolite
        isInitiator: true,
        isAlive: true,
        lastPing: Date.now(),
      };

      room.peers.set(peerId, session);
      this.socketToSession.set(socket, { roomId, peerId });

      // Dispatch room-joined confirmation
      sendToPeer(
        session,
        createSignalingEnvelope("room-joined", roomId, "system", {
          peerId,
          isInitiator: true,
          polite: false,
          peerCount: 1,
          existingPeers: [],
        }),
      );

      return session;
    }

    // Case 2: Room exists -> Cryptographic validation of roomKey
    if (!RoomManager.verifyKeyHash(room.roomKeyHash, roomKey)) {
      sendToSocket(
        socket,
        createSignalingEnvelope("error", roomId, "system", {
          code: PROTOCOL_ERROR_CODES.UNAUTHORIZED,
          message: "Provided roomKey does not match room secret.",
        }),
      );
      socket.close(WS_CLOSE_CODES.UNAUTHORIZED, "UNAUTHORIZED");
      return null;
    }

    // Case 3: Reconnection / Refresh handling (Same peerId reconnecting)
    const existingSession = room.peers.get(peerId);
    if (existingSession) {
      // Cleanly terminate old socket without removing peer identity from room
      const oldSocket = existingSession.socket;
      if (oldSocket !== socket && oldSocket.readyState === oldSocket.OPEN) {
        oldSocket.close(WS_CLOSE_CODES.CONNECTION_REPLACED, "Replaced by new connection");
      }

      // Update session with new socket and refresh status
      existingSession.socket = socket;
      existingSession.isAlive = true;
      existingSession.lastPing = Date.now();
      if (displayName) {
        existingSession.displayName = displayName;
      }

      this.socketToSession.set(socket, { roomId, peerId });

      const existingPeerIds = Array.from(room.peers.keys()).filter((id) => id !== peerId);

      // Confirm re-join to the reconnecting peer
      sendToPeer(
        existingSession,
        createSignalingEnvelope("room-joined", roomId, "system", {
          peerId,
          isInitiator: existingSession.isInitiator,
          polite: existingSession.polite,
          peerCount: room.peers.size,
          existingPeers: existingPeerIds,
        }),
      );

      // Notify opposing peer that the peer reconnected (allows resetting peer connection)
      const opposingPeer = this.getOpposingPeer(roomId, peerId);
      if (opposingPeer) {
        sendToPeer(
          opposingPeer,
          createSignalingEnvelope("peer-joined", roomId, "system", {
            peerId,
            displayName: existingSession.displayName,
          }),
        );
      }

      return existingSession;
    }

    // Case 4: Room is already full (Strict 1-to-1 capacity limit)
    if (room.peers.size >= PROTOCOL_CONSTANTS.MAX_ROOM_CAPACITY) {
      sendToSocket(
        socket,
        createSignalingEnvelope("error", roomId, "system", {
          code: PROTOCOL_ERROR_CODES.ROOM_FULL,
          message: `Room already contains ${PROTOCOL_CONSTANTS.MAX_ROOM_CAPACITY} active participants. Connection rejected.`,
        }),
      );
      socket.close(WS_CLOSE_CODES.ROOM_FULL, "ROOM_FULL");
      return null;
    }

    // Case 5: Second peer joins with valid roomKey -> Responder (polite: true)
    const existingPeerIds = Array.from(room.peers.keys());
    const session: PeerSession = {
      socket,
      peerId,
      roomId,
      displayName,
      polite: true, // Responder is polite
      isInitiator: false,
      isAlive: true,
      lastPing: Date.now(),
    };

    room.peers.set(peerId, session);
    this.socketToSession.set(socket, { roomId, peerId });

    // Send room-joined to the new responder
    sendToPeer(
      session,
      createSignalingEnvelope("room-joined", roomId, "system", {
        peerId,
        isInitiator: false,
        polite: true,
        peerCount: room.peers.size,
        existingPeers: existingPeerIds,
      }),
    );

    // Notify existing peer of the newcomer
    const existingPeer = this.getOpposingPeer(roomId, peerId);
    if (existingPeer) {
      sendToPeer(
        existingPeer,
        createSignalingEnvelope("peer-joined", roomId, "system", {
          peerId,
          displayName,
        }),
      );
    }

    return session;
  }

  /**
   * Handle an explicit `leave-room` message from a peer.
   */
  public handleLeave(socket: WebSocket, message: LeaveRoomMessage): void {
    const { roomId, senderId: peerId } = message;
    const reason = message.payload?.reason ?? "left";
    this.removePeer(roomId, peerId, socket, reason);
  }

  /**
   * Handle socket closure or voluntary disconnect.
   * Ensures that stale/replaced sockets do NOT accidentally evict the active session.
   */
  public handleSocketClose(socket: WebSocket, code?: number, reasonText?: string): void {
    const sessionInfo = this.socketToSession.get(socket);
    if (!sessionInfo) return;

    const { roomId, peerId } = sessionInfo;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const activeSession = room.peers.get(peerId);
    // CRITICAL: Only evict if this closed socket is the current active socket!
    if (activeSession && activeSession.socket === socket) {
      this.removePeer(roomId, peerId, socket, reasonText || "disconnected");
    }
  }

  /**
   * Remove a peer from a room, notify the opposing peer, and clean up empty rooms.
   */
  public removePeer(
    roomId: string,
    peerId: string,
    socket?: WebSocket,
    reason: string = "disconnected",
  ): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const activeSession = room.peers.get(peerId);
    if (socket && activeSession && activeSession.socket !== socket) {
      // Closed socket is not the active one; do nothing
      return;
    }

    room.peers.delete(peerId);

    // Notify opposing peer if present
    const opposingPeer = this.getOpposingPeer(roomId, peerId);
    if (opposingPeer) {
      sendToPeer(
        opposingPeer,
        createSignalingEnvelope("peer-left", roomId, "system", {
          peerId,
          reason,
        }),
      );
    }

    // Zero persistent storage: delete empty room immediately
    if (room.peers.size === 0) {
      this.rooms.delete(roomId);
    }
  }

  /**
   * Check heartbeat status across all rooms and prune stale / unresponsive connections.
   */
  public pruneStalePeers(timeoutMs: number = PROTOCOL_CONSTANTS.HEARTBEAT_TIMEOUT_MS): number {
    const now = Date.now();
    let prunedCount = 0;

    for (const [roomId, room] of this.rooms.entries()) {
      for (const [peerId, peer] of Array.from(room.peers.entries())) {
        const timeSinceLastPing = now - peer.lastPing;
        if (!peer.isAlive || timeSinceLastPing > timeoutMs) {
          prunedCount++;
          if (peer.socket.readyState === peer.socket.OPEN) {
            peer.socket.close(WS_CLOSE_CODES.REQUEST_TIMEOUT, "Heartbeat timeout");
          }
          this.removePeer(roomId, peerId, peer.socket, "timeout");
        } else {
          // Reset alive flag for next round
          peer.isAlive = false;
        }
      }
    }

    return prunedCount;
  }
}
