"use client";

import React, { useState, useEffect, useId } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  Copy,
  Check,
  Video,
  Mic,
  MicOff,
  VideoOff,
  ArrowRight,
  Sparkles,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { useMediaStream } from "@/hooks/useMediaStream";
import { VideoPlayer } from "@/components/media/VideoPlayer";
import { AudioMeter } from "@/components/media/AudioMeter";
import { DeviceSelect } from "@/components/media/DeviceSelect";
import { Badge } from "@/components/ui/Badge";
import {
  generateRoomId,
  generateRoomSecret,
  buildRoomUrl,
} from "@/lib/crypto";

export default function LobbyPage() {
  const router = useRouter();
  const inputId = useId();

  // Cryptographic room credentials
  const [roomId, setRoomId] = useState<string>("");
  const [roomSecret, setRoomSecret] = useState<string>("");
  const [origin, setOrigin] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [joinExistingInput, setJoinExistingInput] = useState<string>("");
  const [joinError, setJoinError] = useState<string | null>(null);

  // Initialize hardware media stream for lobby preview
  const {
    stream,
    isAudioMuted,
    isVideoOff,
    audioLevel,
    audioDevices,
    videoDevices,
    selectedAudioDeviceId,
    selectedVideoDeviceId,
    permissionStatus,
    error: mediaError,
    isLoading: isMediaLoading,
    toggleAudio,
    toggleVideo,
    changeAudioDevice,
    changeVideoDevice,
    startStream,
  } = useMediaStream({ autoStart: true });

  // Generate cryptographic room identifiers on client mount
  useEffect(() => {
    setRoomId(generateRoomId());
    setRoomSecret(generateRoomSecret());
    if (typeof window !== "undefined") {
      setOrigin(window.location.origin);
    }
  }, []);

  const regenerateRoom = () => {
    setRoomId(generateRoomId());
    setRoomSecret(generateRoomSecret());
  };

  const inviteUrl = roomId && roomSecret ? buildRoomUrl(roomId, roomSecret, origin) : "";

  const handleCopyLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback if clipboard API is restricted
      const textArea = document.createElement("textarea");
      textArea.value = inviteUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleStartCall = () => {
    if (!roomId || !roomSecret) return;
    const roomPath = buildRoomUrl(roomId, roomSecret);
    router.push(roomPath);
  };

  const handleJoinExisting = (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);

    const input = joinExistingInput.trim();
    if (!input) return;

    try {
      // Check if user pasted full URL
      if (input.includes("/room/")) {
        const url = new URL(input, origin || "https://dummy.internal");
        if (url.pathname.startsWith("/room/") && url.hash.includes("key=")) {
          router.push(url.pathname + url.hash);
          return;
        } else if (url.pathname.startsWith("/room/")) {
          setJoinError("Invitation link is missing the secret key fragment (#key=...).");
          return;
        }
      }

      setJoinError("Please enter a valid private invitation link containing #key=...");
    } catch {
      setJoinError("Invalid link format. Please paste the full invitation link.");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-between p-4 md:p-8 lg:p-12 relative overflow-hidden">
      {/* Background ambient lighting effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 right-10 w-[400px] h-[400px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* Top Header */}
      <header className="w-full max-w-6xl flex items-center justify-between py-4 border-b border-slate-800/80 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
            <Video className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Private Video Call
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-400 font-mono font-medium border border-cyan-500/30">
                P2P
              </span>
            </h1>
            <p className="text-xs text-slate-400">Zero-knowledge, direct 1-to-1 encrypted calls</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="cyan" className="hidden sm:flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>DTLS-SRTP 256-bit</span>
          </Badge>
          <Badge variant="default" className="text-xs">
            Max 2 Peers
          </Badge>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-start my-auto">
        {/* Left Column: Live Camera & Microphone Test Preview */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          <div className="relative group">
            {/* Video preview element */}
            <VideoPlayer
              stream={stream}
              isMuted={true} // Always mute local playback in preview to avoid acoustic feedback
              isVideoOff={isVideoOff}
              isMirrored={true}
              label="Local Camera Preview"
              className="aspect-video w-full"
            />

            {/* In-preview quick controls overlay */}
            <div className="absolute bottom-4 right-4 flex items-center gap-2 z-20">
              <button
                type="button"
                onClick={() => toggleAudio()}
                className={`p-2.5 rounded-full backdrop-blur-md transition-all shadow-md ${
                  isAudioMuted
                    ? "bg-rose-500/80 text-white hover:bg-rose-600"
                    : "bg-slate-900/80 text-slate-200 hover:bg-slate-800 border border-slate-700"
                }`}
                title={isAudioMuted ? "Unmute Microphone" : "Mute Microphone"}
              >
                {isAudioMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </button>

              <button
                type="button"
                onClick={() => toggleVideo()}
                className={`p-2.5 rounded-full backdrop-blur-md transition-all shadow-md ${
                  isVideoOff
                    ? "bg-rose-500/80 text-white hover:bg-rose-600"
                    : "bg-slate-900/80 text-slate-200 hover:bg-slate-800 border border-slate-700"
                }`}
                title={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}
              >
                {isVideoOff ? <VideoOff className="w-4 h-4" /> : <Video className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Audio level meter bar */}
          <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-slate-900/70 border border-slate-800/90 backdrop-blur-sm shadow-sm">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Mic Sensitivity
              </span>
              <AudioMeter level={audioLevel} isMuted={isAudioMuted} />
            </div>

            {mediaError ? (
              <span className="text-xs text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                Hardware error
              </span>
            ) : isMediaLoading ? (
              <span className="text-xs text-slate-400 animate-pulse">Accessing hardware...</span>
            ) : (
              <span className="text-xs text-emerald-400 font-mono">Ready</span>
            )}
          </div>

          {/* Permission error banner if denied */}
          {permissionStatus === "denied" && (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-rose-200">Hardware Access Denied</p>
                <p className="text-xs text-rose-300/90 mt-1">
                  Camera or microphone permission was blocked. Please enable permissions in your browser URL bar or settings to start a video call.
                </p>
                <button
                  type="button"
                  onClick={() => startStream()}
                  className="mt-2.5 px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-medium border border-rose-500/40 transition-colors"
                >
                  Retry Media Access
                </button>
              </div>
            </div>
          )}

          {/* Hardware Device Selection Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DeviceSelect
              label="Microphone"
              kind="audioinput"
              devices={audioDevices}
              selectedDeviceId={selectedAudioDeviceId}
              onDeviceChange={changeAudioDevice}
            />
            <DeviceSelect
              label="Camera"
              kind="videoinput"
              devices={videoDevices}
              selectedDeviceId={selectedVideoDeviceId}
              onDeviceChange={changeVideoDevice}
            />
          </div>
        </div>

        {/* Right Column: Room Credentials & Invitation Controls */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="p-6 md:p-8 rounded-3xl bg-slate-900/80 border border-slate-800 shadow-2xl backdrop-blur-xl flex flex-col gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-semibold mb-3">
                <Sparkles className="w-3.5 h-3.5" />
                Zero-Knowledge Room
              </div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                Start a Private Call
              </h2>
              <p className="text-sm text-slate-400 mt-1 leading-relaxed">
                Generate an ephemeral 1-to-1 encrypted call. The key is embedded exclusively in the URL hash and never hits web server logs.
              </p>
            </div>

            {/* Room Identifier & Hash Secret Display */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-semibold uppercase tracking-wider text-slate-400">
                  Private Invitation Link
                </span>
                <button
                  type="button"
                  onClick={regenerateRoom}
                  className="inline-flex items-center gap-1 text-slate-400 hover:text-cyan-400 transition-colors text-xs"
                  title="Generate new cryptographic credentials"
                >
                  <RefreshCw className="w-3 h-3" />
                  Regenerate
                </button>
              </div>

              {/* Link Box with Copy Button */}
              <div className="relative flex items-center">
                <input
                  type="text"
                  readOnly
                  value={inviteUrl}
                  className="w-full pl-3.5 pr-28 py-3 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 select-all focus:outline-none focus:border-cyan-500 transition-colors shadow-inner"
                />
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className={`absolute right-1.5 px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm ${
                    copied
                      ? "bg-emerald-600 text-white"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Copy Link
                    </>
                  )}
                </button>
              </div>

              {/* Cryptographic breakdown badge */}
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/70 text-[11px] text-slate-400 space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Room ID:</span>
                  <span className="text-cyan-400 font-semibold">{roomId || "..."}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Hash Secret:</span>
                  <span className="text-amber-400 font-semibold flex items-center gap-1">
                    <Lock className="w-3 h-3 text-amber-400" />
                    {roomSecret ? `${roomSecret.slice(0, 8)}...${roomSecret.slice(-6)}` : "..."}
                  </span>
                </div>
              </div>
            </div>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={handleStartCall}
              disabled={!roomId || !roomSecret}
              className="w-full py-3.5 px-6 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-sm shadow-lg shadow-cyan-900/30 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Private Call
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* Divider */}
            <div className="relative my-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900 px-3 text-slate-500">Or join an existing call</span>
              </div>
            </div>

            {/* Join Existing Call Form */}
            <form onSubmit={handleJoinExisting} className="space-y-2">
              <label htmlFor={inputId} className="text-xs font-medium text-slate-400">
                Paste invitation link:
              </label>
              <div className="flex gap-2">
                <input
                  id={inputId}
                  type="text"
                  placeholder="https://.../room/<id>#key=<secret>"
                  value={joinExistingInput}
                  onChange={(e) => {
                    setJoinExistingInput(e.target.value);
                    setJoinError(null);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  disabled={!joinExistingInput.trim()}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors whitespace-nowrap"
                >
                  Join
                </button>
              </div>
              {joinError && <p className="text-xs text-rose-400 mt-1">{joinError}</p>}
            </form>
          </div>

          {/* Privacy Architecture Guarantees */}
          <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 text-xs text-slate-400 space-y-2">
            <div className="flex items-center gap-2 text-slate-300 font-semibold">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              Security Architecture
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Media is transmitted directly between peers over encrypted WebRTC DTLS-SRTP. The signaling relay never inspects audio or video payloads, and room credentials leave zero footprints in web server logs.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full max-w-6xl py-6 border-t border-slate-800/60 text-center text-xs text-slate-500 mt-8">
        Private Video Call • Ephemeral 1-to-1 WebRTC • Zero-Knowledge Architecture
      </footer>
    </main>
  );
}
