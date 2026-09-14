"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export type MediaPermissionStatus = "prompt" | "granted" | "denied" | "unsupported";

export interface MediaDeviceOption {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

export interface UseMediaStreamOptions {
  /** Automatically request media on mount (default: true) */
  autoStart?: boolean;
  /** Initial preferred audio device ID */
  defaultAudioDeviceId?: string;
  /** Initial preferred video device ID */
  defaultVideoDeviceId?: string;
}

export interface UseMediaStreamReturn {
  stream: MediaStream | null;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  audioLevel: number; // 0 to 100
  audioDevices: MediaDeviceOption[];
  videoDevices: MediaDeviceOption[];
  selectedAudioDeviceId: string;
  selectedVideoDeviceId: string;
  permissionStatus: MediaPermissionStatus;
  error: string | null;
  isLoading: boolean;
  startStream: (audioId?: string, videoId?: string) => Promise<MediaStream | null>;
  stopStream: () => void;
  toggleAudio: (forceMuted?: boolean) => void;
  toggleVideo: (forceOff?: boolean) => void;
  changeAudioDevice: (deviceId: string) => Promise<void>;
  changeVideoDevice: (deviceId: string) => Promise<void>;
}

export function useMediaStream(options: UseMediaStreamOptions = {}): UseMediaStreamReturn {
  const { autoStart = true, defaultAudioDeviceId = "", defaultVideoDeviceId = "" } = options;

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceOption[]>([]);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceOption[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(defaultAudioDeviceId);
  const [selectedVideoDeviceId, setSelectedVideoDeviceId] = useState(defaultVideoDeviceId);
  const [permissionStatus, setPermissionStatus] = useState<MediaPermissionStatus>("prompt");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Refs for tracking active objects across renders and async callbacks
  const streamRef = useRef<MediaStream | null>(null);
  const isAudioMutedRef = useRef(false);
  const isVideoOffRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const animFrameIdRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);

  // Synchronize state and refs
  isAudioMutedRef.current = isAudioMuted;
  isVideoOffRef.current = isVideoOff;

  /**
   * Cleans up Web Audio nodes and animation loops.
   */
  const cleanupAudioAnalyser = useCallback(() => {
    if (animFrameIdRef.current !== null) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      sourceNodeRef.current = null;
    }
    if (analyserNodeRef.current) {
      try {
        analyserNodeRef.current.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      analyserNodeRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (isMountedRef.current) {
      setAudioLevel(0);
    }
  }, []);

  /**
   * Initializes real-time audio volume detection using Web Audio API.
   */
  const setupAudioAnalyser = useCallback((mediaStream: MediaStream) => {
    cleanupAudioAnalyser();

    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) return;

    try {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtxClass) return;

      const audioCtx = new AudioCtxClass();
      audioContextRef.current = audioCtx;

      // Resume context if browser suspended it due to autoplay policies
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(() => {});
      }

      // Isolate audio stream for analyser
      const isolatedAudioStream = new MediaStream([audioTracks[0]]);
      const source = audioCtx.createMediaStreamSource(isolatedAudioStream);
      sourceNodeRef.current = source;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      analyserNodeRef.current = analyser;

      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkLevel = () => {
        if (!isMountedRef.current || !analyserNodeRef.current) return;

        if (isAudioMutedRef.current) {
          setAudioLevel(0);
        } else {
          analyserNodeRef.current.getByteFrequencyData(dataArray);

          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const avg = sum / bufferLength;

          // Scale and clamp volume between 0 and 100 with non-linear boost for speech
          const normalized = Math.min(100, Math.round(Math.pow(avg / 128, 0.8) * 100));
          setAudioLevel(normalized);
        }

        animFrameIdRef.current = requestAnimationFrame(checkLevel);
      };

      checkLevel();
    } catch (err) {
      console.warn("Failed to initialize Web Audio Analyser:", err);
    }
  }, [cleanupAudioAnalyser]);

  /**
   * Refresh device inventory (audio and video inputs).
   */
  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioIns: MediaDeviceOption[] = [];
      const videoIns: MediaDeviceOption[] = [];

      devices.forEach((dev) => {
        const option: MediaDeviceOption = {
          deviceId: dev.deviceId,
          label: dev.label || (dev.kind === "audioinput" ? `Microphone ${audioIns.length + 1}` : `Camera ${videoIns.length + 1}`),
          kind: dev.kind,
        };

        if (dev.kind === "audioinput") {
          audioIns.push(option);
        } else if (dev.kind === "videoinput") {
          videoIns.push(option);
        }
      });

      if (isMountedRef.current) {
        setAudioDevices(audioIns);
        setVideoDevices(videoIns);
      }
    } catch (err) {
      console.warn("Error enumerating devices:", err);
    }
  }, []);

  /**
   * Completely stops all hardware tracks and extinguishes camera/mic indicator LEDs.
   */
  const stopStream = useCallback(() => {
    cleanupAudioAnalyser();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }

    if (isMountedRef.current) {
      setStream(null);
      setAudioLevel(0);
    }
  }, [cleanupAudioAnalyser]);

  /**
   * Acquires camera and microphone streams with ideal constraints.
   */
  const startStream = useCallback(
    async (audioId?: string, videoId?: string): Promise<MediaStream | null> => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        setError("Media devices are not supported in this browser or context.");
        setPermissionStatus("unsupported");
        return null;
      }

      setIsLoading(true);
      setError(null);

      // Stop any existing tracks before acquiring new ones
      stopStream();

      const targetAudioId = audioId || selectedAudioDeviceId;
      const targetVideoId = videoId || selectedVideoDeviceId;

      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(targetAudioId ? { deviceId: { exact: targetAudioId } } : {}),
      };

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        facingMode: "user",
        frameRate: { ideal: 30, max: 60 },
        ...(targetVideoId ? { deviceId: { exact: targetVideoId } } : {}),
      };

      try {
        let mediaStream: MediaStream;

        try {
          mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: audioConstraints,
            video: videoConstraints,
          });
        } catch (initialErr: unknown) {
          // If overconstrained, fallback to unconstrained request
          if (
            initialErr instanceof DOMException &&
            (initialErr.name === "OverconstrainedError" || initialErr.name === "ConstraintNotSatisfiedError")
          ) {
            console.warn("Constraints unsatisfied, falling back to default media devices:", initialErr);
            mediaStream = await navigator.mediaDevices.getUserMedia({
              audio: { echoCancellation: true, noiseSuppression: true },
              video: { facingMode: "user" },
            });
          } else {
            throw initialErr;
          }
        }

        // Apply existing mute/video-off states to new tracks
        mediaStream.getAudioTracks().forEach((t) => {
          t.enabled = !isAudioMutedRef.current;
        });
        mediaStream.getVideoTracks().forEach((t) => {
          t.enabled = !isVideoOffRef.current;
        });

        streamRef.current = mediaStream;

        if (isMountedRef.current) {
          setStream(mediaStream);
          setPermissionStatus("granted");
          setIsLoading(false);

          // Update active device IDs from tracks
          const activeAudioTrack = mediaStream.getAudioTracks()[0];
          const activeVideoTrack = mediaStream.getVideoTracks()[0];
          if (activeAudioTrack?.getSettings().deviceId) {
            setSelectedAudioDeviceId(activeAudioTrack.getSettings().deviceId!);
          }
          if (activeVideoTrack?.getSettings().deviceId) {
            setSelectedVideoDeviceId(activeVideoTrack.getSettings().deviceId!);
          }
        }

        // Refresh device list now that permissions are granted (labels are now readable)
        await refreshDevices();

        // Setup audio level analyzer
        setupAudioAnalyser(mediaStream);

        return mediaStream;
      } catch (err: unknown) {
        if (!isMountedRef.current) return null;

        setIsLoading(false);

        if (err instanceof DOMException) {
          if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            setPermissionStatus("denied");
            setError("Camera and microphone permission denied. Please enable access in browser settings.");
          } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            setError("No camera or microphone hardware found on this device.");
          } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
            setError("Camera or microphone is already in use by another application.");
          } else {
            setError(`Media hardware error: ${err.message}`);
          }
        } else {
          setError("Failed to access camera and microphone.");
        }

        return null;
      }
    },
    [selectedAudioDeviceId, selectedVideoDeviceId, stopStream, refreshDevices, setupAudioAnalyser]
  );

  /**
   * Toggles audio mute state instantaneously by setting track.enabled.
   * Zero renegotiation or SDP exchange required.
   */
  const toggleAudio = useCallback((forceMuted?: boolean) => {
    const nextMuted = forceMuted !== undefined ? forceMuted : !isAudioMutedRef.current;
    isAudioMutedRef.current = nextMuted;
    setIsAudioMuted(nextMuted);

    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !nextMuted;
      });
    }

    if (nextMuted) {
      setAudioLevel(0);
    }
  }, []);

  /**
   * Toggles video on/off instantaneously by setting track.enabled.
   * Zero renegotiation or SDP exchange required.
   */
  const toggleVideo = useCallback((forceOff?: boolean) => {
    const nextOff = forceOff !== undefined ? forceOff : !isVideoOffRef.current;
    isVideoOffRef.current = nextOff;
    setIsVideoOff(nextOff);

    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach((track) => {
        track.enabled = !nextOff;
      });
    }
  }, []);

  /**
   * Switches the active microphone input device dynamically.
   */
  const changeAudioDevice = useCallback(
    async (deviceId: string) => {
      setSelectedAudioDeviceId(deviceId);

      if (!streamRef.current) {
        await startStream(deviceId, selectedVideoDeviceId);
        return;
      }

      try {
        const newAudioStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: { exact: deviceId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });

        const newAudioTrack = newAudioStream.getAudioTracks()[0];
        if (!newAudioTrack) return;

        newAudioTrack.enabled = !isAudioMutedRef.current;

        // Replace track in current stream
        const currentAudioTracks = streamRef.current.getAudioTracks();
        currentAudioTracks.forEach((t) => {
          streamRef.current?.removeTrack(t);
          t.stop();
        });

        streamRef.current.addTrack(newAudioTrack);

        // Reconnect audio level analyser
        setupAudioAnalyser(streamRef.current);

        // Trigger react state update
        setStream(new MediaStream(streamRef.current.getTracks()));
      } catch (err) {
        console.error("Failed to switch audio input device:", err);
        setError("Failed to switch microphone.");
      }
    },
    [selectedVideoDeviceId, startStream, setupAudioAnalyser]
  );

  /**
   * Switches the active camera input device dynamically.
   */
  const changeVideoDevice = useCallback(
    async (deviceId: string) => {
      setSelectedVideoDeviceId(deviceId);

      if (!streamRef.current) {
        await startStream(selectedAudioDeviceId, deviceId);
        return;
      }

      try {
        const newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            width: { ideal: 1280, max: 1920 },
            height: { ideal: 720, max: 1080 },
            frameRate: { ideal: 30, max: 60 },
          },
        });

        const newVideoTrack = newVideoStream.getVideoTracks()[0];
        if (!newVideoTrack) return;

        newVideoTrack.enabled = !isVideoOffRef.current;

        // Replace track in current stream
        const currentVideoTracks = streamRef.current.getVideoTracks();
        currentVideoTracks.forEach((t) => {
          streamRef.current?.removeTrack(t);
          t.stop();
        });

        streamRef.current.addTrack(newVideoTrack);

        // Trigger react state update
        setStream(new MediaStream(streamRef.current.getTracks()));
      } catch (err) {
        console.error("Failed to switch video input device:", err);
        setError("Failed to switch camera.");
      }
    },
    [selectedAudioDeviceId, startStream]
  );

  // Auto-start on mount if specified
  useEffect(() => {
    isMountedRef.current = true;

    if (autoStart) {
      startStream();
    } else {
      refreshDevices();
    }

    // Listen for device changes (e.g. plugged/unplugged headset or camera)
    const handleDeviceChange = () => {
      refreshDevices();
    };

    if (typeof navigator !== "undefined" && navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    }

    return () => {
      isMountedRef.current = false;
      if (typeof navigator !== "undefined" && navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      }
      stopStream();
    };
  }, [autoStart, startStream, refreshDevices, stopStream]);

  return {
    stream,
    isAudioMuted,
    isVideoOff,
    audioLevel,
    audioDevices,
    videoDevices,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    permissionStatus,
    error,
    isLoading,
    startStream,
    stopStream,
    toggleAudio,
    toggleVideo,
    changeAudioDevice,
    changeVideoDevice,
  };
}
