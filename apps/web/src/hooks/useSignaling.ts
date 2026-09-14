"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  SIGNALING_EVENTS,
  PROTOCOL_CONSTANTS,
  PROTOCOL_ERROR_CODES,
  WS_CLOSE_CODES,
  createSignalingEnvelope,
  parseSignalingMessage,
  type OfferPayload,
  type AnswerPayload,
  type IceCandidatePayload,
  type RoomJoinedPayload,
  type PeerJoinedPayload,
  type PeerLeftPayload,
  type ErrorPayload,
  type ProtocolErrorCode,
  type RTCIceCandidateInitType,
} from "@pvc/protocol";

export type SignalingConnectionState = "connecting" | "connected" | "disconnected" | "error";

export interface SignalingCallbacks {
  onOffer?: (payload: OfferPayload, senderId: string) => void;
  onAnswer?: (payload: AnswerPayload, senderId: string) => void;
  onIceCandidate?: (payload: IceCandidatePayload, senderId: string) => void;
  onPeerJoined?: (payload: PeerJoinedPayload) => void;
  onPeerLeft?: (payload: PeerLeftPayload) => void;
  onRoomJoined?: (payload: RoomJoinedPayload) => void;
  onError?: (payload: ErrorPayload) => void;
}

export interface UseSignalingOptions extends SignalingCallbacks {
  roomId: string;
  roomKey: string | null;
  displayName?: string;
  enabled?: boolean;
}

export interface UseSignalingReturn {
  isConnected: boolean;
  signalingState: SignalingConnectionState;
  peerId: string;
  isInitiator: boolean;
  polite: boolean;
  peerPresent: boolean;
  peerCount: number;
  signalingError: ProtocolErrorCode | string | null;
  errorMessage: string | null;
  sendOffer: (sdp: RTCSessionDescriptionInit, targetId?: string) => void;
  sendAnswer: (sdp: RTCSessionDescriptionInit, targetId?: string) => void;
  sendIceCandidate: (
    candidate: RTCIceCandidate | RTCIceCandidateInit | null,
    targetId?: string
  ) => void;
  sendLeaveRoom: (reason?: string) => void;
  disconnect: () => void;
  connect: () => void;
}

/**
 * Retrieves an existing peerId from sessionStorage or generates and persists a new one.
 * Ensures the peer identity persists across page reloads in the same session.
 */
function getOrCreatePeerId(roomId: string): string {
  if (typeof window === "undefined") return "";

  const storageKey = `pvc_peer_id_${roomId}`;
  try {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) {
      return existing;
    }
    const randPart = Math.random().toString(36).substring(2, 10);
    const timePart = Date.now().toString(36);
    const newPeerId = `peer_${timePart}_${randPart}`;
    window.sessionStorage.setItem(storageKey, newPeerId);
    return newPeerId;
  } catch {
    const randPart = Math.random().toString(36).substring(2, 10);
    const timePart = Date.now().toString(36);
    return `peer_${timePart}_${randPart}`;
  }
}

export function useSignaling(options: UseSignalingOptions): UseSignalingReturn {
  const {
    roomId,
    roomKey,
    displayName,
    enabled = true,
    onOffer,
    onAnswer,
    onIceCandidate,
    onPeerJoined,
    onPeerLeft,
    onRoomJoined,
    onError,
  } = options;

  // Connection and peer identity state
  const [peerId, setPeerId] = useState<string>("");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [signalingState, setSignalingState] = useState<SignalingConnectionState>("disconnected");
  const [isInitiator, setIsInitiator] = useState<boolean>(false);
  const [polite, setPolite] = useState<boolean>(true);
  const [peerPresent, setPeerPresent] = useState<boolean>(false);
  const [peerCount, setPeerCount] = useState<number>(0);
  const [signalingError, setSignalingError] = useState<ProtocolErrorCode | string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // References to preserve mutable objects without causing reconnection loops
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callbacksRef = useRef<SignalingCallbacks>({});
  const peerIdRef = useRef<string>("");

  // Keep callbacks fresh in ref
  callbacksRef.current = {
    onOffer,
    onAnswer,
    onIceCandidate,
    onPeerJoined,
    onPeerLeft,
    onRoomJoined,
    onError,
  };

  // Synchronize peerId
  useEffect(() => {
    if (typeof window !== "undefined" && roomId) {
      const id = getOrCreatePeerId(roomId);
      peerIdRef.current = id;
      setPeerId(id);
    }
  }, [roomId]);

  /**
   * Helper to send JSON-encoded envelopes over active WebSocket.
   */
  const sendEnvelope = useCallback((envelope: unknown): boolean => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(envelope));
        return true;
      } catch (err) {
        console.error("[Signaling] Failed to send envelope:", err);
        return false;
      }
    }
    return false;
  }, []);

  /**
   * Dispatches an SDP Offer envelope to the signaling server.
   */
  const sendOffer = useCallback(
    (sdp: RTCSessionDescriptionInit, targetId?: string) => {
      const currentPeerId = peerIdRef.current;
      if (!currentPeerId || !roomId || !sdp.sdp) return;

      const envelope = createSignalingEnvelope(
        SIGNALING_EVENTS.OFFER,
        roomId,
        currentPeerId,
        {
          sdp: {
            type: "offer",
            sdp: sdp.sdp,
          },
        },
        targetId
      );
      sendEnvelope(envelope);
    },
    [roomId, sendEnvelope]
  );

  /**
   * Dispatches an SDP Answer envelope to the signaling server.
   */
  const sendAnswer = useCallback(
    (sdp: RTCSessionDescriptionInit, targetId?: string) => {
      const currentPeerId = peerIdRef.current;
      if (!currentPeerId || !roomId || !sdp.sdp) return;

      const envelope = createSignalingEnvelope(
        SIGNALING_EVENTS.ANSWER,
        roomId,
        currentPeerId,
        {
          sdp: {
            type: "answer",
            sdp: sdp.sdp,
          },
        },
        targetId
      );
      sendEnvelope(envelope);
    },
    [roomId, sendEnvelope]
  );

  /**
   * Dispatches an ICE candidate envelope to the signaling server.
   * Supports trickle ICE with null representing the end-of-candidates notification.
   */
  const sendIceCandidate = useCallback(
    (candidate: RTCIceCandidate | RTCIceCandidateInit | null, targetId?: string) => {
      const currentPeerId = peerIdRef.current;
      if (!currentPeerId || !roomId) return;

      let candidatePayload: RTCIceCandidateInitType | null = null;
      if (candidate) {
        candidatePayload = {
          candidate: candidate.candidate || "",
          sdpMid: candidate.sdpMid ?? null,
          sdpMLineIndex: candidate.sdpMLineIndex ?? null,
          usernameFragment: candidate.usernameFragment ?? null,
        };
      }

      const envelope = createSignalingEnvelope(
        SIGNALING_EVENTS.ICE_CANDIDATE,
        roomId,
        currentPeerId,
        {
          candidate: candidatePayload,
        },
        targetId
      );
      sendEnvelope(envelope);
    },
    [roomId, sendEnvelope]
  );

  /**
   * Dispatches a leave-room envelope.
   */
  const sendLeaveRoom = useCallback(
    (reason?: string) => {
      const currentPeerId = peerIdRef.current;
      if (!currentPeerId || !roomId) return;

      const envelope = createSignalingEnvelope(
        SIGNALING_EVENTS.LEAVE_ROOM,
        roomId,
        currentPeerId,
        {
          reason: reason || "Client hung up",
        }
      );
      sendEnvelope(envelope);
    },
    [roomId, sendEnvelope]
  );

  /**
   * Cleanly closes the active WebSocket connection and clears intervals.
   */
  const disconnect = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    if (wsRef.current) {
      try {
        if (
          wsRef.current.readyState === WebSocket.OPEN ||
          wsRef.current.readyState === WebSocket.CONNECTING
        ) {
          wsRef.current.close(WS_CLOSE_CODES.NORMAL_CLOSURE, "Normal disconnect");
        }
      } catch (err) {
        console.warn("[Signaling] Error closing socket:", err);
      }
      wsRef.current = null;
    }

    setIsConnected(false);
    setSignalingState("disconnected");
  }, []);

  /**
   * Connects to the WebSocket signaling server and joins the room.
   */
  const connect = useCallback(() => {
    if (typeof window === "undefined" || !roomId || !roomKey) return;

    disconnect();

    const currentPeerId = peerIdRef.current || getOrCreatePeerId(roomId);
    peerIdRef.current = currentPeerId;
    setPeerId(currentPeerId);

    const signalingUrl =
      process.env.NEXT_PUBLIC_SIGNALING_URL ||
      `ws://${window.location.hostname}:8080`;

    setSignalingState("connecting");
    setSignalingError(null);
    setErrorMessage(null);

    try {
      const ws = new WebSocket(signalingUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setSignalingState("connected");

        // Dispatch join-room immediately upon connection
        const joinEnvelope = createSignalingEnvelope(
          SIGNALING_EVENTS.JOIN_ROOM,
          roomId,
          currentPeerId,
          {
            roomKey,
            displayName: displayName || undefined,
          }
        );
        ws.send(JSON.stringify(joinEnvelope));

        // Start 30s heartbeat ping timer
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            const pingEnvelope = createSignalingEnvelope(
              SIGNALING_EVENTS.PING,
              roomId,
              currentPeerId,
              {}
            );
            ws.send(JSON.stringify(pingEnvelope));
          }
        }, PROTOCOL_CONSTANTS.HEARTBEAT_INTERVAL_MS);
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          if (typeof event.data !== "string") return;
          const raw = JSON.parse(event.data);
          const message = parseSignalingMessage(raw);

          switch (message.type) {
            case SIGNALING_EVENTS.ROOM_JOINED: {
              const payload = message.payload;
              setIsInitiator(payload.isInitiator);
              setPolite(payload.polite);
              setPeerCount(payload.peerCount);
              const hasExistingPeer =
                payload.peerCount > 1 || (payload.existingPeers && payload.existingPeers.length > 0);
              setPeerPresent(Boolean(hasExistingPeer));
              callbacksRef.current.onRoomJoined?.(payload);
              break;
            }

            case SIGNALING_EVENTS.PEER_JOINED: {
              setPeerPresent(true);
              setPeerCount(2);
              callbacksRef.current.onPeerJoined?.(message.payload);
              break;
            }

            case SIGNALING_EVENTS.PEER_LEFT: {
              setPeerPresent(false);
              setPeerCount(1);
              callbacksRef.current.onPeerLeft?.(message.payload);
              break;
            }

            case SIGNALING_EVENTS.OFFER: {
              callbacksRef.current.onOffer?.(message.payload, message.senderId);
              break;
            }

            case SIGNALING_EVENTS.ANSWER: {
              callbacksRef.current.onAnswer?.(message.payload, message.senderId);
              break;
            }

            case SIGNALING_EVENTS.ICE_CANDIDATE: {
              callbacksRef.current.onIceCandidate?.(message.payload, message.senderId);
              break;
            }

            case SIGNALING_EVENTS.ERROR: {
              const payload = message.payload;
              setSignalingError(payload.code);
              setErrorMessage(payload.message);
              callbacksRef.current.onError?.(payload);
              break;
            }

            case SIGNALING_EVENTS.PONG: {
              // Heartbeat successfully acknowledged by signaling server
              break;
            }

            default:
              break;
          }
        } catch (err) {
          console.warn("[Signaling] Failed to parse signaling frame:", err);
        }
      };

      ws.onclose = (event: CloseEvent) => {
        setIsConnected(false);
        setSignalingState("disconnected");

        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        if (event.code === WS_CLOSE_CODES.UNAUTHORIZED) {
          setSignalingError(PROTOCOL_ERROR_CODES.UNAUTHORIZED);
          setErrorMessage("Access Denied: Invalid invitation token.");
        } else if (event.code === WS_CLOSE_CODES.ROOM_FULL) {
          setSignalingError(PROTOCOL_ERROR_CODES.ROOM_FULL);
          setErrorMessage("Room is full (Maximum 2 participants).");
        }
      };

      ws.onerror = (err) => {
        console.error("[Signaling] WebSocket error:", err);
        setSignalingState("error");
      };
    } catch (err) {
      console.error("[Signaling] Failed to open WebSocket connection:", err);
      setSignalingState("error");
    }
  }, [roomId, roomKey, displayName, disconnect]);

  // Establish connection when enabled and credentials are ready
  useEffect(() => {
    if (enabled && roomId && roomKey) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, roomId, roomKey, connect, disconnect]);

  return {
    isConnected,
    signalingState,
    peerId,
    isInitiator,
    polite,
    peerPresent,
    peerCount,
    signalingError,
    errorMessage,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    sendLeaveRoom,
    disconnect,
    connect,
  };
}
