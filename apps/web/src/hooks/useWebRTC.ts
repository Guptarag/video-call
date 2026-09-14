"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getRuntimeIceServers,
  type RTCIceCandidateInitType,
  type ProtocolErrorCode,
} from "@pvc/protocol";
import {
  useSignaling,
  type UseSignalingOptions,
  type UseSignalingReturn,
  type SignalingConnectionState,
} from "./useSignaling";

export interface UseWebRTCOptions extends Partial<UseSignalingOptions> {
  roomId: string;
  roomKey: string | null;
  localStream: MediaStream | null;
  displayName?: string;
  enabled?: boolean;
}

export interface UseWebRTCReturn {
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  peerPresent: boolean;
  isInitiator: boolean;
  polite: boolean;
  error: string | null;
  signalingError: ProtocolErrorCode | string | null;
  signalingState: SignalingConnectionState;
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
  hangup: () => void;
  restartIce: () => void;
  signaling: UseSignalingReturn;
}

export function useWebRTC(options: UseWebRTCOptions): UseWebRTCReturn {
  const {
    roomId,
    roomKey,
    localStream,
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

  // WebRTC reactive connection states
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>("new");
  const [iceConnectionState, setIceConnectionState] = useState<RTCIceConnectionState>("new");
  const [error, setError] = useState<string | null>(null);

  // References for WebRTC state machine and negotiation flags
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const candidateQueueRef = useRef<RTCIceCandidateInit[]>([]);

  // W3C Perfect Negotiation tracking flags
  const makingOfferRef = useRef<boolean>(false);
  const ignoreOfferRef = useRef<boolean>(false);
  const isSettingRemoteAnswerPendingRef = useRef<boolean>(false);
  const politeRef = useRef<boolean>(true);
  const peerPresentRef = useRef<boolean>(false);

  // Keep localStream reference in sync
  localStreamRef.current = localStream;

  /**
   * Cleans up remote media stream and clears attached video element.
   */
  const cleanupRemoteMedia = useCallback(() => {
    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;
    }
    setRemoteStream(null);

    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, []);

  /**
   * Completely closes and tears down the RTCPeerConnection instance.
   */
  const closePeerConnection = useCallback(() => {
    candidateQueueRef.current = [];

    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.onnegotiationneeded = null;
        pcRef.current.close();
      } catch (err) {
        console.warn("[WebRTC] Error closing peer connection:", err);
      }
      pcRef.current = null;
    }

    cleanupRemoteMedia();
    setConnectionState("new");
    setIceConnectionState("new");
    makingOfferRef.current = false;
    ignoreOfferRef.current = false;
    isSettingRemoteAnswerPendingRef.current = false;
  }, [cleanupRemoteMedia]);

  /**
   * Drains queued remote ICE candidates once remoteDescription has been established.
   */
  const drainCandidateQueue = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription || !pc.remoteDescription.type) return;

    const queued = [...candidateQueueRef.current];
    candidateQueueRef.current = [];

    for (const cand of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        if (!ignoreOfferRef.current) {
          console.warn("[WebRTC] Failed to add queued ICE candidate:", err);
        }
      }
    }
  }, []);

  /**
   * Handles incoming remote ICE candidate packets (including trickle ICE and end-of-candidates).
   */
  const handleRemoteCandidate = useCallback(
    async (candidatePayload: RTCIceCandidateInitType | null) => {
      const pc = pcRef.current;
      if (!pc) return;

      if (candidatePayload === null) {
        // End-of-candidates indicator
        try {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(undefined as unknown as RTCIceCandidateInit);
          }
        } catch (err) {
          if (!ignoreOfferRef.current) {
            console.warn("[WebRTC] Error handling end-of-candidates candidate:", err);
          }
        }
        return;
      }

      const candidateInit: RTCIceCandidateInit = {
        candidate: candidatePayload.candidate,
        sdpMid: candidatePayload.sdpMid ?? undefined,
        sdpMLineIndex: candidatePayload.sdpMLineIndex ?? undefined,
        usernameFragment: candidatePayload.usernameFragment ?? undefined,
      };

      // If remote description is not set yet, buffer candidate until ready
      if (!pc.remoteDescription || !pc.remoteDescription.type) {
        candidateQueueRef.current.push(candidateInit);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidateInit));
      } catch (err) {
        if (!ignoreOfferRef.current) {
          console.warn("[WebRTC] Failed to add remote ICE candidate:", err);
        }
      }
    },
    []
  );

  /**
   * Creates a new RTCPeerConnection with STUN configuration from protocol package.
   */
  const createPeerConnection = useCallback(
    (sendIceCandidate: (cand: RTCIceCandidate | null) => void, sendOfferFn: (sdp: RTCSessionDescriptionInit) => void): RTCPeerConnection => {
      closePeerConnection();

      const rtcConfig: RTCConfiguration = {
        iceServers: getRuntimeIceServers() as RTCIceServer[],
        iceCandidatePoolSize: 10,
      };

      const pc = new RTCPeerConnection(rtcConfig);
      pcRef.current = pc;

      // Bind local tracks
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      // Trickle ICE emission
      pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
        if (event.candidate) {
          sendIceCandidate(event.candidate);
        } else {
          sendIceCandidate(null);
        }
      };

      // Remote track binding
      pc.ontrack = (event: RTCTrackEvent) => {
        let stream = event.streams[0];
        if (!stream) {
          if (!remoteStreamRef.current) {
            remoteStreamRef.current = new MediaStream();
          }
          remoteStreamRef.current.addTrack(event.track);
          stream = remoteStreamRef.current;
        } else {
          remoteStreamRef.current = stream;
        }

        const newStream = new MediaStream(stream.getTracks());
        setRemoteStream(newStream);

        if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== stream) {
          remoteVideoRef.current.srcObject = stream;
          remoteVideoRef.current.play().catch(() => {});
        }
      };

      // ICE connection monitoring & ICE restart trigger on failure
      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState;
        setIceConnectionState(state);
        if (state === "failed") {
          console.warn("[WebRTC] ICE connection state failed, triggering restartIce()...");
          try {
            pc.restartIce();
          } catch (err) {
            console.warn("[WebRTC] Failed to restart ICE:", err);
          }
        }
      };

      // WebRTC connection state monitoring
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        setConnectionState(state);
        if (state === "failed") {
          console.warn("[WebRTC] Peer connection state failed, triggering restartIce()...");
          try {
            pc.restartIce();
          } catch (err) {
            console.warn("[WebRTC] Failed to restart ICE:", err);
          }
        }
      };

      // Canonical W3C Perfect Negotiation: onnegotiationneeded
      pc.onnegotiationneeded = async () => {
        try {
          if (!peerPresentRef.current) {
            // Gated strictly on peer presence
            return;
          }
          makingOfferRef.current = true;
          await pc.setLocalDescription();
          if (pc.localDescription) {
            sendOfferFn(pc.localDescription);
          }
        } catch (err) {
          console.error("[WebRTC] Negotiation needed error:", err);
        } finally {
          makingOfferRef.current = false;
        }
      };

      return pc;
    },
    [closePeerConnection]
  );

  /**
   * Triggers an explicit offer generation if negotiation is ready.
   */
  const startNegotiation = useCallback(
    async (sendOfferFn: (sdp: RTCSessionDescriptionInit) => void) => {
      const pc = pcRef.current;
      if (!pc || !peerPresentRef.current) return;
      if (pc.signalingState !== "stable") return;

      try {
        makingOfferRef.current = true;
        await pc.setLocalDescription();
        if (pc.localDescription) {
          sendOfferFn(pc.localDescription);
        }
      } catch (err) {
        console.error("[WebRTC] Failed to start negotiation:", err);
      } finally {
        makingOfferRef.current = false;
      }
    },
    []
  );

  /**
   * Canonical W3C Perfect Negotiation remote description processor.
   * Handles glare, polite peer rollback, candidate queue draining, and answer creation.
   */
  const handleRemoteDescription = useCallback(
    async (
      description: RTCSessionDescriptionInit,
      sendAnswerFn: (sdp: RTCSessionDescriptionInit) => void
    ) => {
      const pc = pcRef.current;
      if (!pc) return;

      const isOffer = description.type === "offer";
      const readyForOffer =
        !makingOfferRef.current &&
        (pc.signalingState === "stable" || isSettingRemoteAnswerPendingRef.current);
      const offerCollision = isOffer && !readyForOffer;

      // Impolite peer ignores colliding offers
      ignoreOfferRef.current = !politeRef.current && offerCollision;
      if (ignoreOfferRef.current) {
        console.log("[WebRTC] Impolite peer ignoring colliding offer");
        return;
      }

      try {
        if (offerCollision) {
          console.log("[WebRTC] Polite peer rolling back colliding offer");
          await pc.setLocalDescription({ type: "rollback" });
        }

        const isAnswer = description.type === "answer";
        isSettingRemoteAnswerPendingRef.current = isAnswer;
        await pc.setRemoteDescription(new RTCSessionDescription(description));
        isSettingRemoteAnswerPendingRef.current = false;

        // Drain candidate queue on BOTH offer and answer
        await drainCandidateQueue();

        if (isOffer) {
          await pc.setLocalDescription();
          if (pc.localDescription) {
            sendAnswerFn(pc.localDescription);
          }
        }
      } catch (err) {
        isSettingRemoteAnswerPendingRef.current = false;
        console.error("[WebRTC] Error setting remote description:", err);
        setError("Failed to negotiate media session.");
      }
    },
    [drainCandidateQueue]
  );

  // Instantiate signaling client
  const signaling = useSignaling({
    roomId,
    roomKey,
    displayName,
    enabled,
    onOffer: async (payload) => {
      await handleRemoteDescription(
        {
          type: payload.sdp.type,
          sdp: payload.sdp.sdp,
        },
        signaling.sendAnswer
      );
      onOffer?.(payload, "");
    },
    onAnswer: async (payload) => {
      await handleRemoteDescription(
        {
          type: payload.sdp.type,
          sdp: payload.sdp.sdp,
        },
        signaling.sendAnswer
      );
      onAnswer?.(payload, "");
    },
    onIceCandidate: async (payload) => {
      await handleRemoteCandidate(payload.candidate);
      onIceCandidate?.(payload, "");
    },
    onPeerJoined: (payload) => {
      peerPresentRef.current = true;

      // If we are initiator (impolite), initiate negotiation
      if (!politeRef.current) {
        startNegotiation(signaling.sendOffer);
      }
      onPeerJoined?.(payload);
    },
    onPeerLeft: (payload) => {
      peerPresentRef.current = false;
      cleanupRemoteMedia();
      onPeerLeft?.(payload);
    },
    onRoomJoined: (payload) => {
      politeRef.current = payload.polite;
      const hasPeer =
        payload.peerCount > 1 || (payload.existingPeers && payload.existingPeers.length > 0);
      peerPresentRef.current = Boolean(hasPeer);

      // If room already has existing peers and we are initiator, trigger negotiation
      if (payload.isInitiator && hasPeer) {
        startNegotiation(signaling.sendOffer);
      }
      onRoomJoined?.(payload);
    },
    onError: (payload) => {
      onError?.(payload);
    },
  });

  // Keep polite state synchronized with signaling
  useEffect(() => {
    politeRef.current = signaling.polite;
  }, [signaling.polite]);

  // Keep peerPresent state synchronized with signaling
  useEffect(() => {
    peerPresentRef.current = signaling.peerPresent;
  }, [signaling.peerPresent]);

  // Initialize or reset RTCPeerConnection when signaling connects
  useEffect(() => {
    if (enabled && signaling.isConnected && roomId && roomKey) {
      if (!pcRef.current) {
        createPeerConnection(signaling.sendIceCandidate, signaling.sendOffer);
      }
    }

    return () => {
      // Teardown peer connection when room unmounts or signaling disconnects
      if (!signaling.isConnected) {
        closePeerConnection();
      }
    };
  }, [
    enabled,
    signaling.isConnected,
    roomId,
    roomKey,
    createPeerConnection,
    closePeerConnection,
    signaling.sendIceCandidate,
    signaling.sendOffer,
  ]);

  // Handle dynamic local track changes (e.g. camera or microphone device swap)
  useEffect(() => {
    const pc = pcRef.current;
    if (!pc) return;

    if (!localStream) {
      pc.getSenders().forEach((sender) => {
        if (sender.track) {
          sender.replaceTrack(null).catch(() => {});
        }
      });
      return;
    }

    const senders = pc.getSenders();
    const tracks = localStream.getTracks();

    tracks.forEach((track) => {
      const existingSender = senders.find(
        (s) => s.track && s.track.kind === track.kind
      );
      if (existingSender) {
        if (existingSender.track !== track) {
          existingSender.replaceTrack(track).catch((err) => {
            console.warn(`[WebRTC] Failed to replace ${track.kind} track:`, err);
          });
        }
      } else {
        pc.addTrack(track, localStream);
      }
    });
  }, [localStream]);

  // Attach remoteStream to remoteVideoRef whenever remoteStream changes
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("[WebRTC] Autoplay deferred for remote video:", err);
        }
      });
    }
  }, [remoteStream]);

  /**
   * Explicitly triggers an ICE restart on active RTCPeerConnection.
   */
  const restartIce = useCallback(() => {
    const pc = pcRef.current;
    if (pc) {
      try {
        pc.restartIce();
      } catch (err) {
        console.warn("[WebRTC] Error calling restartIce:", err);
      }
    }
  }, []);

  /**
   * Terminates the call, notifies signaling server, and tears down all peer connection state.
   */
  const hangup = useCallback(() => {
    signaling.sendLeaveRoom("User hung up");
    closePeerConnection();
    signaling.disconnect();
  }, [closePeerConnection, signaling]);

  // Full teardown on hook unmount
  useEffect(() => {
    return () => {
      closePeerConnection();
    };
  }, [closePeerConnection]);

  return {
    remoteStream,
    connectionState,
    iceConnectionState,
    peerPresent: signaling.peerPresent,
    isInitiator: signaling.isInitiator,
    polite: signaling.polite,
    error,
    signalingError: signaling.signalingError,
    signalingState: signaling.signalingState,
    remoteVideoRef,
    hangup,
    restartIce,
    signaling,
  };
}
