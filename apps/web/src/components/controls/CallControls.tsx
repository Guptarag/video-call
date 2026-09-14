"use client";

import React from "react";
import { Mic, MicOff, Video, VideoOff, PhoneOff, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CallControlsProps {
  isAudioMuted: boolean;
  isVideoOff: boolean;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
  onEndCall: () => void;
  onOpenSettings?: () => void;
  className?: string;
  disabled?: boolean;
}

export const CallControls: React.FC<CallControlsProps> = ({
  isAudioMuted,
  isVideoOff,
  onToggleAudio,
  onToggleVideo,
  onEndCall,
  onOpenSettings,
  className,
  disabled = false,
}) => {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-3 md:gap-4 p-3 rounded-2xl bg-slate-900/90 backdrop-blur-xl border border-slate-800 shadow-2xl select-none",
        className
      )}
    >
      {/* Microphone Toggle */}
      <button
        type="button"
        onClick={onToggleAudio}
        disabled={disabled}
        className={cn(
          "relative flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950",
          isAudioMuted
            ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30 focus:ring-rose-500"
            : "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 focus:ring-cyan-500"
        )}
        title={isAudioMuted ? "Unmute Microphone" : "Mute Microphone"}
        aria-label={isAudioMuted ? "Unmute Microphone" : "Mute Microphone"}
      >
        {isAudioMuted ? (
          <MicOff className="w-5 h-5 md:w-6 md:h-6" />
        ) : (
          <Mic className="w-5 h-5 md:w-6 md:h-6" />
        )}
        <span className="sr-only">{isAudioMuted ? "Unmute" : "Mute"}</span>
      </button>

      {/* Camera Toggle */}
      <button
        type="button"
        onClick={onToggleVideo}
        disabled={disabled}
        className={cn(
          "relative flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950",
          isVideoOff
            ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30 focus:ring-rose-500"
            : "bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 focus:ring-cyan-500"
        )}
        title={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}
        aria-label={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}
      >
        {isVideoOff ? (
          <VideoOff className="w-5 h-5 md:w-6 md:h-6" />
        ) : (
          <Video className="w-5 h-5 md:w-6 md:h-6" />
        )}
        <span className="sr-only">{isVideoOff ? "Turn Camera On" : "Turn Camera Off"}</span>
      </button>

      {/* Settings (optional) */}
      {onOpenSettings && (
        <button
          type="button"
          onClick={onOpenSettings}
          disabled={disabled}
          className="relative flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-slate-950"
          title="Device Settings"
          aria-label="Device Settings"
        >
          <Settings className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      )}

      {/* End Call Button */}
      <button
        type="button"
        onClick={onEndCall}
        className="flex items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-900/30 transition-all duration-200 transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 focus:ring-offset-slate-950"
        title="End Call"
        aria-label="End Call"
      >
        <PhoneOff className="w-5 h-5 md:w-6 md:h-6" />
      </button>
    </div>
  );
};
