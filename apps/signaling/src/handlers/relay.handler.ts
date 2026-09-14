import type { WebSocket } from "ws";
import {
  PROTOCOL_ERROR_CODES,
  createSignalingEnvelope,
  type OfferMessage,
  type AnswerMessage,
  type IceCandidateMessage,
} from "@pvc/protocol";
import type { RoomManager } from "../room/room-manager.js";
import { sendToPeer, sendToSocket } from "../room/peer.js";

export type RelayMessage = OfferMessage | AnswerMessage | IceCandidateMessage;

/**
 * Relays WebRTC negotiation messages (offer, answer, ice-candidate) strictly to the other peer in the room.
 */
export function handleRelayMessage(
  roomManager: RoomManager,
  socket: WebSocket,
  message: RelayMessage,
): boolean {
  const { roomId, senderId } = message;

  const room = roomManager.getRoom(roomId);
  if (!room) {
    sendToSocket(
      socket,
      createSignalingEnvelope("error", roomId, "system", {
        code: PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND,
        message: `Room ${roomId} does not exist.`,
      }),
    );
    return false;
  }

  // Find recipient peer
  let targetPeer = message.targetId ? room.peers.get(message.targetId) : undefined;
  if (!targetPeer) {
    targetPeer = roomManager.getOpposingPeer(roomId, senderId);
  }

  if (!targetPeer) {
    sendToSocket(
      socket,
      createSignalingEnvelope("error", roomId, "system", {
        code: PROTOCOL_ERROR_CODES.PEER_NOT_FOUND,
        message: "No opposing peer found in room to receive message.",
      }),
    );
    return false;
  }

  // Forward message to opposing peer
  const forwardedMessage: RelayMessage = {
    ...message,
    targetId: targetPeer.peerId,
  };

  return sendToPeer(targetPeer, forwardedMessage);
}
