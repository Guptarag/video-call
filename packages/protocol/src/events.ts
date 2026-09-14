/**
 * Signaling WebSocket protocol event types.
 */
export const SIGNALING_EVENTS = {
  // Client -> Server events
  JOIN_ROOM: "join-room",
  OFFER: "offer",
  ANSWER: "answer",
  ICE_CANDIDATE: "ice-candidate",
  LEAVE_ROOM: "leave-room",
  PING: "ping",

  // Server -> Client events
  ROOM_JOINED: "room-joined",
  PEER_JOINED: "peer-joined",
  PEER_LEFT: "peer-left",
  ERROR: "error",
  PONG: "pong",
} as const;

export type SignalingMessageType = (typeof SIGNALING_EVENTS)[keyof typeof SIGNALING_EVENTS];

export const CLIENT_SIGNALING_EVENTS = [
  SIGNALING_EVENTS.JOIN_ROOM,
  SIGNALING_EVENTS.OFFER,
  SIGNALING_EVENTS.ANSWER,
  SIGNALING_EVENTS.ICE_CANDIDATE,
  SIGNALING_EVENTS.LEAVE_ROOM,
  SIGNALING_EVENTS.PING,
] as const;

export type ClientSignalingMessageType = (typeof CLIENT_SIGNALING_EVENTS)[number];

export const SERVER_SIGNALING_EVENTS = [
  SIGNALING_EVENTS.ROOM_JOINED,
  SIGNALING_EVENTS.PEER_JOINED,
  SIGNALING_EVENTS.PEER_LEFT,
  SIGNALING_EVENTS.ERROR,
  SIGNALING_EVENTS.PONG,
] as const;

export type ServerSignalingMessageType = (typeof SERVER_SIGNALING_EVENTS)[number];
