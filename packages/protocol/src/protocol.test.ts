import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  SIGNALING_EVENTS,
  PROTOCOL_ERROR_CODES,
  WS_CLOSE_CODES,
  SignalingProtocolError,
  DEFAULT_STUN_SERVERS,
  DefaultIceConfigProvider,
  getRuntimeIceServers,
  createSignalingEnvelope,
  parseSignalingMessage,
  joinRoomPayloadSchema,
  iceCandidatePayloadSchema,
  errorPayloadSchema,
} from "../dist/index.js";

describe("@pvc/protocol test suite", () => {
  test("Constants and Error Codes", () => {
    assert.equal(SIGNALING_EVENTS.JOIN_ROOM, "join-room");
    assert.equal(SIGNALING_EVENTS.OFFER, "offer");
    assert.equal(SIGNALING_EVENTS.ANSWER, "answer");
    assert.equal(SIGNALING_EVENTS.ICE_CANDIDATE, "ice-candidate");
    assert.equal(SIGNALING_EVENTS.ROOM_JOINED, "room-joined");
    assert.equal(SIGNALING_EVENTS.PEER_JOINED, "peer-joined");
    assert.equal(SIGNALING_EVENTS.PEER_LEFT, "peer-left");
    assert.equal(SIGNALING_EVENTS.ERROR, "error");

    assert.equal(PROTOCOL_ERROR_CODES.UNAUTHORIZED, "UNAUTHORIZED");
    assert.equal(PROTOCOL_ERROR_CODES.ROOM_FULL, "ROOM_FULL");
    assert.equal(PROTOCOL_ERROR_CODES.INVALID_MESSAGE, "INVALID_MESSAGE");
    assert.equal(PROTOCOL_ERROR_CODES.PEER_NOT_FOUND, "PEER_NOT_FOUND");
    assert.equal(PROTOCOL_ERROR_CODES.RATE_LIMITED, "RATE_LIMITED");
    assert.equal(PROTOCOL_ERROR_CODES.INTERNAL_ERROR, "INTERNAL_ERROR");

    assert.equal(WS_CLOSE_CODES.UNAUTHORIZED, 4401);
    assert.equal(WS_CLOSE_CODES.ROOM_FULL, 4403);
    assert.equal(WS_CLOSE_CODES.REQUEST_TIMEOUT, 4408);
    assert.equal(WS_CLOSE_CODES.CONNECTION_REPLACED, 4409);
    assert.equal(WS_CLOSE_CODES.RATE_LIMITED, 4429);
  });

  test("IceConfigProvider returns valid STUN servers", () => {
    const defaultProvider = new DefaultIceConfigProvider();
    const servers = defaultProvider.getIceServers();
    assert.ok(Array.isArray(servers));
    assert.equal(servers.length, 3);
    assert.equal(servers[0].urls, "stun:stun.l.google.com:19302");

    const runtimeServers = getRuntimeIceServers();
    assert.deepEqual(runtimeServers, DEFAULT_STUN_SERVERS as unknown as typeof runtimeServers);

    const custom = [{ urls: "stun:custom.stun.org:3478" }];
    const customProvider = new DefaultIceConfigProvider(custom);
    assert.deepEqual(customProvider.getIceServers(), custom);
  });

  test("Payload Schemas Validation", () => {
    // join-room with roomKey
    const validJoin = joinRoomPayloadSchema.parse({
      roomKey: "secret_123456",
      displayName: "Alice",
    });
    assert.equal(validJoin.roomKey, "secret_123456");
    assert.equal(validJoin.displayName, "Alice");

    // join-room without roomKey should fail
    assert.throws(() => {
      joinRoomPayloadSchema.parse({ displayName: "Bob" });
    });

    // ice-candidate with data
    const validCandidate = iceCandidatePayloadSchema.parse({
      candidate: {
        candidate: "candidate:1 1 UDP 2122260223 192.168.1.1 50000 typ host",
        sdpMid: "0",
        sdpMLineIndex: 0,
      },
    });
    assert.ok(validCandidate.candidate);
    assert.equal(validCandidate.candidate?.sdpMid, "0");

    // ice-candidate with null (end-of-candidates)
    const nullCandidate = iceCandidatePayloadSchema.parse({
      candidate: null,
    });
    assert.equal(nullCandidate.candidate, null);

    // error payload
    const validError = errorPayloadSchema.parse({
      code: "ROOM_FULL",
      message: "Room has reached maximum capacity of 2",
    });
    assert.equal(validError.code, "ROOM_FULL");
  });

  test("createSignalingEnvelope & parseSignalingMessage round-trip", () => {
    // 1. Join room envelope
    const joinEnvelope = createSignalingEnvelope(
      SIGNALING_EVENTS.JOIN_ROOM,
      "room_123",
      "peer_abc",
      {
        roomKey: "secret_key_abc",
        displayName: "User A",
      },
    );
    assert.equal(joinEnvelope.type, "join-room");
    assert.equal(joinEnvelope.roomId, "room_123");
    assert.equal(joinEnvelope.senderId, "peer_abc");
    assert.equal(joinEnvelope.payload.roomKey, "secret_key_abc");

    const parsedJoin = parseSignalingMessage(joinEnvelope);
    assert.equal(parsedJoin.type, "join-room");

    // 2. Offer envelope
    const offerEnvelope = createSignalingEnvelope(
      SIGNALING_EVENTS.OFFER,
      "room_123",
      "peer_abc",
      {
        sdp: {
          type: "offer",
          sdp: "v=0\r\no=...",
        },
      },
      "peer_def",
    );
    const parsedOffer = parseSignalingMessage(offerEnvelope);
    assert.equal(parsedOffer.type, "offer");
    assert.equal(parsedOffer.targetId, "peer_def");

    // 3. Room joined envelope
    const roomJoinedEnvelope = createSignalingEnvelope(
      SIGNALING_EVENTS.ROOM_JOINED,
      "room_123",
      "system",
      {
        peerId: "peer_abc",
        isInitiator: true,
        polite: false,
        peerCount: 1,
        existingPeers: [],
      },
    );
    const parsedRoomJoined = parseSignalingMessage(roomJoinedEnvelope);
    assert.equal(parsedRoomJoined.type, "room-joined");

    // 4. Answer envelope
    const answerEnvelope = createSignalingEnvelope(
      SIGNALING_EVENTS.ANSWER,
      "room_123",
      "peer_def",
      {
        sdp: {
          type: "answer",
          sdp: "v=0\r\no=answer...",
        },
      },
      "peer_abc",
    );
    const parsedAnswer = parseSignalingMessage(answerEnvelope);
    assert.equal(parsedAnswer.type, "answer");
    assert.equal(parsedAnswer.targetId, "peer_abc");

    // 5. Peer joined envelope
    const peerJoinedEnvelope = createSignalingEnvelope(
      SIGNALING_EVENTS.PEER_JOINED,
      "room_123",
      "system",
      {
        peerId: "peer_def",
        displayName: "User B",
      },
    );
    const parsedPeerJoined = parseSignalingMessage(peerJoinedEnvelope);
    assert.equal(parsedPeerJoined.type, "peer-joined");

    // 6. Peer left envelope
    const peerLeftEnvelope = createSignalingEnvelope(
      SIGNALING_EVENTS.PEER_LEFT,
      "room_123",
      "system",
      {
        peerId: "peer_def",
        reason: "disconnected",
      },
    );
    const parsedPeerLeft = parseSignalingMessage(peerLeftEnvelope);
    assert.equal(parsedPeerLeft.type, "peer-left");

    // 7. Error envelope
    const errorEnvelope = createSignalingEnvelope(SIGNALING_EVENTS.ERROR, "room_123", "system", {
      code: PROTOCOL_ERROR_CODES.ROOM_FULL,
      message: "Room full",
    });
    const parsedError = parseSignalingMessage(errorEnvelope);
    assert.equal(parsedError.type, "error");
    if (parsedError.type === "error") {
      assert.equal(parsedError.payload.code, "ROOM_FULL");
    }

    // 8. Ping and Pong envelopes
    const pingEnvelope = createSignalingEnvelope(SIGNALING_EVENTS.PING, "room_123", "peer_abc", {});
    const parsedPing = parseSignalingMessage(pingEnvelope);
    assert.equal(parsedPing.type, "ping");

    const pongEnvelope = createSignalingEnvelope(SIGNALING_EVENTS.PONG, "room_123", "system", {});
    const parsedPong = parseSignalingMessage(pongEnvelope);
    assert.equal(parsedPong.type, "pong");

    // 9. Leave room envelope
    const leaveEnvelope = createSignalingEnvelope(
      SIGNALING_EVENTS.LEAVE_ROOM,
      "room_123",
      "peer_abc",
      { reason: "user ended call" },
    );
    const parsedLeave = parseSignalingMessage(leaveEnvelope);
    assert.equal(parsedLeave.type, "leave-room");

    // 10. Malformed message should throw SignalingProtocolError
    assert.throws(
      () => {
        parseSignalingMessage({
          id: "123",
          type: "invalid-type",
          roomId: "room_123",
          senderId: "peer_1",
          payload: {},
          timestamp: Date.now(),
        });
      },
      (err: unknown) => {
        return (
          err instanceof SignalingProtocolError && err.code === PROTOCOL_ERROR_CODES.INVALID_MESSAGE
        );
      },
    );
  });
});
