import type { WebSocket } from "ws";

/**
 * Represents an active connected peer session within a room.
 */
export interface PeerSession {
  /** Underlying WebSocket connection */
  socket: WebSocket;
  /** Unique client identifier (ephemeral, maintained across page refreshes) */
  peerId: string;
  /** Identifier of the room the peer belongs to */
  roomId: string;
  /** Optional user display name */
  displayName?: string;
  /**
   * Polite peer designation for WebRTC Perfect Negotiation.
   * - Initiator (1st peer) is impolite (polite: false).
   * - Responder (2nd peer) is polite (polite: true).
   */
  polite: boolean;
  /** True if this peer created / first entered the room */
  isInitiator: boolean;
  /** Liveness flag updated on ping/pong activity */
  isAlive: boolean;
  /** Timestamp of the most recent ping/activity received from peer */
  lastPing: number;
}

/**
 * Safely send a JSON payload or serialized string to a peer if the socket is OPEN.
 */
export function sendToPeer(peer: PeerSession, message: unknown): boolean {
  if (peer.socket.readyState === peer.socket.OPEN) {
    const data = typeof message === "string" ? message : JSON.stringify(message);
    peer.socket.send(data);
    return true;
  }
  return false;
}

/**
 * Safely send an error or message directly to a raw WebSocket.
 */
export function sendToSocket(socket: WebSocket, message: unknown): boolean {
  if (socket.readyState === socket.OPEN) {
    const data = typeof message === "string" ? message : JSON.stringify(message);
    socket.send(data);
    return true;
  }
  return false;
}
