"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Copy,
  Check,
  Users,
  AlertTriangle,
  Clock,
  Settings2,
  X,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { useMediaStream } from "@/hooks/useMediaStream";
import { useWebRTC } from "@/hooks/useWebRTC";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { CallControls } from "@/components/controls/CallControls";
import { AudioMeter } from "@/components/media/AudioMeter";
import { DeviceSelect } from "@/components/media/DeviceSelect";
import { Badge } from "@/components/ui/Badge";
import { extractRoomKeyFromHash, buildRoomUrl } from "@/lib/crypto";

export default function RoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>;
}) {
  const router = useRouter();
  const resolvedParams = use(params);
  const roomId = resolvedParams.roomId;

  // URL hash secret state
  const [roomKey, setRoomKey] = useState<string | null>(null);
  const [hashChecked, setHashChecked] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPipMinimized, setIsPipMinimized] = useState(false);
  const [callDurationSeconds, setCallDurationSeconds] = useState(0);

  // Local media stream hook
  const {
    stream: localStream,
    isAudioMuted,
    isVideoOff,
    audioLevel,
    audioDevices,
    videoDevices,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    toggleAudio,
    toggleVideo,
    changeAudioDevice,
    changeVideoDevice,
    stopStream,
  } = useMediaStream({ autoStart: true });

  // Read roomKey from window.location.hash on client mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const extractedKey = extractRoomKeyFromHash(window.location.hash);
      setRoomKey(extractedKey);
      setHashChecked(true);
    }
  }, []);

  // WebRTC hook integration
  const {
    remoteStream,
    connectionState,
    peerPresent,
    signalingError,
    hangup,
    remoteVideoRef,
  } = useWebRTC({
    roomId,
    roomKey,
    localStream,
    enabled: hashChecked && Boolean(roomKey),
  });

  // Ensure remote stream is attached to video ref whenever stream arrives
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.play().catch((err) => {
        if (err.name !== "AbortError") {
          console.warn("Playback of remote video deferred:", err);
        }
      });
    }
  }, [remoteStream, remoteVideoRef]);

  // Call duration timer (active once peer connects or call starts)
  useEffect(() => {
    const timer = setInterval(() => {
      setCallDurationSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatDuration = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  };

  const handleCopyInviteLink = async () => {
    if (typeof window === "undefined" || !roomId) return;
    const url = buildRoomUrl(roomId, roomKey || "", window.location.origin);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
      const textArea = document.createElement("textarea");
      textArea.value = url;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleEndCall = () => {
    // Explicitly hangup WebRTC connection and signaling session
    hangup();
    // Stop all media tracks to turn off camera and mic LEDs immediately
    stopStream();
    router.push("/");
  };

  return (
    <main className="relative h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden flex flex-col justify-between">
      {/* Top Navigation Bar */}
      <header className="z-30 w-full px-4 py-3 md:px-6 flex items-center justify-between bg-gradient-to-b from-slate-950/90 to-transparent backdrop-blur-md border-b border-slate-800/40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                connectionState === "connected"
                  ? "bg-emerald-400 animate-pulse"
                  : signalingError
                  ? "bg-rose-500"
                  : "bg-cyan-400 animate-pulse"
              }`}
            />
            <span className="font-mono text-xs md:text-sm font-semibold text-slate-200 tracking-wide">
              {roomId}
            </span>
          </div>

          <button
            type="button"
            onClick={handleCopyInviteLink}
            className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-[11px] font-medium text-slate-300 border border-slate-700/60 transition-colors"
            title="Copy private invite link"
          >
            {copiedLink ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-slate-400" />
                <span>Invite Peer</span>
              </>
            )}
          </button>
        </div>

        {/* Center: Call Timer & Security Encryption Status */}
        <div className="flex items-center gap-2">
          {connectionState === "connected" ? (
            <Badge variant="cyan" className="flex items-center gap-1 text-[11px]">
              <ShieldCheck className="w-3 h-3 text-cyan-400" />
              <span className="hidden md:inline">DTLS-SRTP</span> Encrypted
            </Badge>
          ) : connectionState === "connecting" ? (
            <Badge variant="cyan" className="flex items-center gap-1 text-[11px]">
              <Clock className="w-3 h-3 text-cyan-400 animate-spin" />
              Connecting...
            </Badge>
          ) : (
            <Badge variant="default" className="flex items-center gap-1 text-[11px]">
              <ShieldCheck className="w-3 h-3 text-slate-400" />
              End-to-End
            </Badge>
          )}

          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400">
            <Clock className="w-3 h-3 text-slate-500" />
            {formatDuration(callDurationSeconds)}
          </div>
        </div>

        {/* Right: Peer Status Badge */}
        <div className="flex items-center gap-2">
          <Badge
            variant={peerPresent ? "success" : "warning"}
            className="flex items-center gap-1.5 text-[11px]"
          >
            <Users className="w-3 h-3" />
            <span>{peerPresent ? "Connected (2/2)" : "Waiting for peer (1/2)"}</span>
          </Badge>
        </div>
      </header>

      {/* Dynamic Status Banners */}
      <div className="z-40 px-4 md:px-6 pt-2 flex flex-col gap-2 max-w-2xl mx-auto w-full">
        {signalingError === "UNAUTHORIZED" && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 shadow-lg animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <div className="flex-1 font-medium">
              Access Denied: Invalid invitation token.
            </div>
          </div>
        )}

        {signalingError === "ROOM_FULL" && (
          <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2 shadow-lg animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <div className="flex-1 font-medium">
              Room is full (Maximum 2 participants).
            </div>
          </div>
        )}

        {!signalingError && !peerPresent && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2 shadow-lg animate-in fade-in">
            <Users className="w-4 h-4 text-amber-400 flex-shrink-0 animate-pulse" />
            <div className="flex-1 font-medium">
              Waiting for the other person to join (1/2)...
            </div>
          </div>
        )}

        {!signalingError && peerPresent && connectionState === "connecting" && (
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs flex items-center gap-2 shadow-lg animate-in fade-in">
            <Clock className="w-4 h-4 text-cyan-400 flex-shrink-0 animate-spin" />
            <div className="flex-1 font-medium">
              Establishing direct peer connection...
            </div>
          </div>
        )}

        {!signalingError && peerPresent && connectionState === "connected" && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 shadow-lg animate-in fade-in">
            <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <div className="flex-1 font-medium">
              Secure Encrypted Call Active (DTLS-SRTP)
            </div>
          </div>
        )}

        {hashChecked && !roomKey && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2 shadow-lg animate-in fade-in">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div className="flex-1">
              <strong>Missing Room Key:</strong> This room was accessed without the URL secret key (#key=...). Peer authentication will require the full invitation link.
            </div>
          </div>
        )}
      </div>

      {/* Main Video Arena */}
      <div className="relative flex-1 w-full h-full p-2 md:p-4 flex items-center justify-center overflow-hidden">
        {/* Remote Video Stream (or Waiting State) */}
        {remoteStream ? (
          <div className="relative w-full h-full max-h-[88vh] rounded-2xl overflow-hidden bg-slate-900 border border-slate-800/80 shadow-2xl flex items-center justify-center select-none">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md bg-slate-950/75 backdrop-blur-md border border-slate-800/80 text-xs font-medium text-slate-200 shadow-md flex items-center gap-1.5 z-10">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              Remote Peer
            </div>
          </div>
        ) : (
          <div className="w-full h-full max-h-[88vh] rounded-3xl bg-slate-900/60 border border-slate-800/80 flex flex-col items-center justify-center p-8 text-center backdrop-blur-sm relative overflow-hidden shadow-2xl">
            {/* Stable hidden video element for ref attachment */}
            <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />

            {/* Ambient background pulse */}
            <div className="absolute w-72 h-72 rounded-full bg-cyan-500/5 blur-3xl animate-pulse -z-10" />

            <div className="relative mb-6">
              <div className="w-20 h-20 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center shadow-inner">
                <Users className="w-9 h-9 text-slate-400 animate-pulse" />
              </div>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              </span>
            </div>

            <h3 className="text-xl font-bold text-slate-100 tracking-tight">
              Waiting for peer to join...
            </h3>
            <p className="text-xs md:text-sm text-slate-400 mt-2 max-w-md leading-relaxed">
              Share the private invitation link with your peer. Once they open the link, an encrypted peer-to-peer WebRTC connection will be negotiated automatically.
            </p>

            <button
              type="button"
              onClick={handleCopyInviteLink}
              className={`mt-6 px-5 py-2.5 rounded-xl font-medium text-xs md:text-sm flex items-center gap-2 transition-all shadow-md ${
                copiedLink
                  ? "bg-emerald-600 text-white"
                  : "bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-900/30"
              }`}
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4" />
                  Invitation Link Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Invitation Link
                </>
              )}
            </button>
          </div>
        )}

        {/* Floating Local Self-View Picture-in-Picture (PiP) */}
        <div
          className={`absolute bottom-20 right-4 md:bottom-24 md:right-6 z-30 transition-all duration-300 ${
            isPipMinimized
              ? "w-16 h-16 md:w-20 md:h-20"
              : "w-44 h-32 sm:w-56 sm:h-40 md:w-72 md:h-48"
          }`}
        >
          <div className="relative w-full h-full rounded-2xl overflow-hidden border-2 border-slate-700/80 shadow-2xl bg-slate-900 group">
            <VideoPlayer
              stream={localStream}
              isMuted={true}
              isVideoOff={isVideoOff}
              isMirrored={true}
              label={isPipMinimized ? undefined : "You"}
              className="w-full h-full"
            />

            {/* Minimize / Expand Toggle */}
            <button
              type="button"
              onClick={() => setIsPipMinimized(!isPipMinimized)}
              className="absolute top-2 right-2 p-1.5 rounded-lg bg-slate-950/70 text-slate-300 hover:text-white border border-slate-800 opacity-0 group-hover:opacity-100 transition-opacity z-20"
              title={isPipMinimized ? "Expand Local View" : "Minimize Local View"}
            >
              {isPipMinimized ? (
                <Maximize2 className="w-3.5 h-3.5" />
              ) : (
                <Minimize2 className="w-3.5 h-3.5" />
              )}
            </button>

            {/* Audio meter indicator overlay */}
            {!isPipMinimized && (
              <div className="absolute top-2 left-2 z-20">
                <AudioMeter
                  level={audioLevel}
                  isMuted={isAudioMuted}
                  showIcon={false}
                  barClassName="w-12 h-1.5 bg-slate-950/80"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Media Device Settings Drawer / Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
          <div className="w-full max-w-md p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-white font-bold text-base">
                <Settings2 className="w-5 h-5 text-cyan-400" />
                Call Device Settings
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <DeviceSelect
                label="Microphone"
                kind="audioinput"
                devices={audioDevices}
                selectedDeviceId={selectedAudioDeviceId}
                onDeviceChange={changeAudioDevice}
              />

              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950 border border-slate-800">
                <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                  Mic Level
                </span>
                <AudioMeter level={audioLevel} isMuted={isAudioMuted} />
              </div>

              <DeviceSelect
                label="Camera"
                kind="videoinput"
                devices={videoDevices}
                selectedDeviceId={selectedVideoDeviceId}
                onDeviceChange={changeVideoDevice}
              />
            </div>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(false)}
              className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Bottom Floating Control Bar */}
      <footer className="z-30 w-full pb-4 md:pb-6 flex justify-center px-4">
        <CallControls
          isAudioMuted={isAudioMuted}
          isVideoOff={isVideoOff}
          onToggleAudio={() => toggleAudio()}
          onToggleVideo={() => toggleVideo()}
          onEndCall={handleEndCall}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </footer>
    </main>
  );
}
