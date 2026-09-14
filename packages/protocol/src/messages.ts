import { z } from "zod";
import { SIGNALING_EVENTS, type SignalingMessageType } from "./events.js";
import { PROTOCOL_ERROR_CODES, type ProtocolErrorCode, SignalingProtocolError } from "./errors.js";

/**
 * Base envelope shape for all signaling messages.
 */
export interface SignalingEnvelope<T = unknown> {
  id: string;
  type: SignalingMessageType;
  roomId: string;
  senderId: string;
  targetId?: string;
  payload: T;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Payloads - Client -> Server
// ---------------------------------------------------------------------------

export const joinRoomPayloadSchema = z.object({
  /** Invitation secret token passed via URL hash fragment */
  roomKey: z.string().min(1, "roomKey is required"),
  displayName: z.string().optional(),
});
export type JoinRoomPayload = z.infer<typeof joinRoomPayloadSchema>;

export const sdpOfferSchema = z.object({
  type: z.literal("offer"),
  sdp: z.string().min(1, "sdp is required"),
});
export type SdpOffer = z.infer<typeof sdpOfferSchema>;

export const offerPayloadSchema = z.object({
  sdp: sdpOfferSchema,
});
export type OfferPayload = z.infer<typeof offerPayloadSchema>;

export const sdpAnswerSchema = z.object({
  type: z.literal("answer"),
  sdp: z.string().min(1, "sdp is required"),
});
export type SdpAnswer = z.infer<typeof sdpAnswerSchema>;

export const answerPayloadSchema = z.object({
  sdp: sdpAnswerSchema,
});
export type AnswerPayload = z.infer<typeof answerPayloadSchema>;

export const rtcIceCandidateInitSchema = z.object({
  candidate: z.string(),
  sdpMid: z.string().nullable().optional(),
  sdpMLineIndex: z.number().nullable().optional(),
  usernameFragment: z.string().nullable().optional(),
});
export type RTCIceCandidateInitType = z.infer<typeof rtcIceCandidateInitSchema>;

export const iceCandidatePayloadSchema = z.object({
  /** Candidate data or null to indicate end-of-candidates */
  candidate: rtcIceCandidateInitSchema.nullable(),
});
export type IceCandidatePayload = z.infer<typeof iceCandidatePayloadSchema>;

export const leaveRoomPayloadSchema = z
  .object({
    reason: z.string().optional(),
  })
  .default({});
export type LeaveRoomPayload = z.infer<typeof leaveRoomPayloadSchema>;

export const pingPayloadSchema = z.record(z.unknown()).default({});
export type PingPayload = z.infer<typeof pingPayloadSchema>;

// ---------------------------------------------------------------------------
// Payloads - Server -> Client
// ---------------------------------------------------------------------------

export const roomJoinedPayloadSchema = z.object({
  peerId: z.string().min(1),
  isInitiator: z.boolean(),
  polite: z.boolean(),
  peerCount: z.number().int().nonnegative(),
  existingPeers: z.array(z.string()).default([]),
});
export type RoomJoinedPayload = z.infer<typeof roomJoinedPayloadSchema>;

export const peerJoinedPayloadSchema = z.object({
  peerId: z.string().min(1),
  displayName: z.string().optional(),
});
export type PeerJoinedPayload = z.infer<typeof peerJoinedPayloadSchema>;

export const peerLeftPayloadSchema = z.object({
  peerId: z.string().min(1),
  reason: z.string().optional(),
});
export type PeerLeftPayload = z.infer<typeof peerLeftPayloadSchema>;

export const errorPayloadSchema = z.object({
  code: z.enum([
    PROTOCOL_ERROR_CODES.UNAUTHORIZED,
    PROTOCOL_ERROR_CODES.ROOM_FULL,
    PROTOCOL_ERROR_CODES.INVALID_MESSAGE,
    PROTOCOL_ERROR_CODES.ROOM_NOT_FOUND,
    PROTOCOL_ERROR_CODES.PEER_NOT_FOUND,
    PROTOCOL_ERROR_CODES.RATE_LIMITED,
    PROTOCOL_ERROR_CODES.INTERNAL_ERROR,
  ]),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ErrorPayload = z.infer<typeof errorPayloadSchema>;

export const pongPayloadSchema = z.record(z.unknown()).default({});
export type PongPayload = z.infer<typeof pongPayloadSchema>;

// ---------------------------------------------------------------------------
// Complete Message Schemas (Envelope + Payload)
// ---------------------------------------------------------------------------

export const joinRoomMessageSchema = z.object({
  id: z.string().min(1),
  type: z.literal(SIGNALING_EVENTS.JOIN_ROOM),
  roomId: z.string().min(1),
  senderId: z.string().min(1),
  targetId: z.string().optional(),
  payload: joinRoomPayloadSchema,
  timestamp: z.number(),
});
export type JoinRoomMessage = z.infer<typeof joinRoomMessageSchema>;

export const offerMessageSchema = z.object({
  id: z.string().min(1),
  type: z.literal(SIGNALING_EVENTS.OFFER),
  roomId: z.string().min(1),
  senderId: z.string().min(1),
  targetId: z.string().optional(),
  payload: offerPayloadSchema,
  timestamp: z.number(),
});
export type OfferMessage = z.infer<typeof offerMessageSchema>;

export const answerMessageSchema = z.object({
  id: z.string().min(1),
  type: z.literal(SIGNALING_EVENTS.ANSWER),
  roomId: z.string().min(1),
  senderId: z.string().min(1),
  targetId: z.string().optional(),
  payload: answerPayloadSchema,
  timestamp: z.number(),
});
export type AnswerMessage = z.infer<typeof answerMessageSchema>;

export const iceCandidateMessageSchema = z.object({
  id: z.string().min(1),
  type: z.literal(SIGNALING_EVENTS.ICE_CANDIDATE),
  roomId: z.string().min(1),
  senderId: z.string().min(1),
  targetId: z.string().optional(),
  payload: iceCandidatePayloadSchema,
  timestamp: z.number(),
});
export type IceCandidateMessage = z.infer<typeof iceCandidateMessageSchema>;

export const leaveRoomMessageSchema = z.object({
  id: z.string().min(1),
  type: z.literal(SIGNALING_EVENTS.LEAVE_ROOM),
  roomId: z.string().min(1),
  senderId: z.string().min(1),
  targetId: z.string().optional(),
  payload: leaveRoomPayloadSchema,
  timestamp: z.number(),
});
export type LeaveRoomMessage = z.infer<typeof leaveRoomMessageSchema>;

export const pingMessageSchema = z.object({
  id: z.string().min(1),
  type: z.literal(SIGNALING_EVENTS.PING),
  roomId: z.string().min(1),
  senderId: z.string().min(1),
  targetId: z.string().optional(),
  payload: pingPayloadSchema,
  timestamp: z.number(),
});
export type PingMessage = z.infer<typeof pingMessageSchema>;

export const roomJoinedMessageSchema = z.object({
  id: z.string().min(1),
  type: z.literal(SIGNALING_EVENTS.ROOM_JOINED),
  roomId: z.string().min(1),
  senderId: z.string().min(1),
  targetId: z.string().optional(),
  payload: roomJoinedPayloadSchema,
  timestamp: z.number(),
});
export type RoomJoinedMessage = z.infer<typeof roomJoinedMessageSchema>;

export const peerJoinedMessageSchema = z.object({
  id: z.string().min(1),
  type: z.literal(SIGNALING_EVENTS.PEER_JOINED),
  roomId: z.string().min(1),
  senderId: z.string().min(1),
  targetId: z.string().optional(),
  payload: peerJoinedPayloadSchema,
  timestamp: z.number(),
});
export type PeerJoinedMessage = z.infer<typeof peerJoinedMessageSchema>;

export const peerLeftMessageSchema = z.object({
  id: z.string().min(1),
  type: z.literal(SIGNALING_EVENTS.PEER_LEFT),
  roomId: z.string().min(1),
  senderId: z.string().min(1),
  targetId: z.string().optional(),
  payload: peerLeftPayloadSchema,
  timestamp: z.number(),
});
export type PeerLeftMessage = z.infer<typeof peerLeftMessageSchema>;

export const errorMessageSchema = z.object({
  id: z.string().min(1),
  type: z.literal(SIGNALING_EVENTS.ERROR),
  roomId: z.string().min(1),
  senderId: z.string().min(1),
  targetId: z.string().optional(),
  payload: errorPayloadSchema,
  timestamp: z.number(),
});
export type ErrorMessage = z.infer<typeof errorMessageSchema>;

export const pongMessageSchema = z.object({
  id: z.string().min(1),
  type: z.literal(SIGNALING_EVENTS.PONG),
  roomId: z.string().min(1),
  senderId: z.string().min(1),
  targetId: z.string().optional(),
  payload: pongPayloadSchema,
  timestamp: z.number(),
});
export type PongMessage = z.infer<typeof pongMessageSchema>;

// ---------------------------------------------------------------------------
// Discriminated Unions
// ---------------------------------------------------------------------------

export const clientSignalingMessageSchema = z.discriminatedUnion("type", [
  joinRoomMessageSchema,
  offerMessageSchema,
  answerMessageSchema,
  iceCandidateMessageSchema,
  leaveRoomMessageSchema,
  pingMessageSchema,
]);
export type ClientSignalingMessage = z.infer<typeof clientSignalingMessageSchema>;

export const serverSignalingMessageSchema = z.discriminatedUnion("type", [
  roomJoinedMessageSchema,
  peerJoinedMessageSchema,
  peerLeftMessageSchema,
  offerMessageSchema,
  answerMessageSchema,
  iceCandidateMessageSchema,
  errorMessageSchema,
  pongMessageSchema,
]);
export type ServerSignalingMessage = z.infer<typeof serverSignalingMessageSchema>;

export const signalingMessageSchema = z.discriminatedUnion("type", [
  joinRoomMessageSchema,
  offerMessageSchema,
  answerMessageSchema,
  iceCandidateMessageSchema,
  leaveRoomMessageSchema,
  pingMessageSchema,
  roomJoinedMessageSchema,
  peerJoinedMessageSchema,
  peerLeftMessageSchema,
  errorMessageSchema,
  pongMessageSchema,
]);
export type SignalingMessage = z.infer<typeof signalingMessageSchema>;

// ---------------------------------------------------------------------------
// Parsing and Generation Utilities
// ---------------------------------------------------------------------------

/**
 * Generate unique message ID for envelope tracing.
 */
export function generateMessageId(prefix = "msg"): string {
  const rand = Math.random().toString(36).substring(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

/**
 * Validate and parse an incoming raw payload into a strictly-typed SignalingMessage.
 * Throws SignalingProtocolError if validation fails.
 */
export function parseSignalingMessage(raw: unknown): SignalingMessage {
  const parseResult = signalingMessageSchema.safeParse(raw);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new SignalingProtocolError(
      PROTOCOL_ERROR_CODES.INVALID_MESSAGE,
      `Malformed signaling message: ${errorDetails}`,
    );
  }
  return parseResult.data;
}

/**
 * Factory to create valid signaling message envelopes.
 */
export function createSignalingEnvelope<TType extends SignalingMessage["type"]>(
  type: TType,
  roomId: string,
  senderId: string,
  payload: Extract<SignalingMessage, { type: TType }>["payload"],
  targetId?: string,
): Extract<SignalingMessage, { type: TType }> {
  const message = {
    id: generateMessageId(senderId === "system" ? "srv" : "msg"),
    type,
    roomId,
    senderId,
    ...(targetId ? { targetId } : {}),
    payload,
    timestamp: Date.now(),
  };

  return message as unknown as Extract<SignalingMessage, { type: TType }>;
}
