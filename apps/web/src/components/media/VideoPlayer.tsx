"use client";

import React, { useEffect, useRef } from "react";
import { CameraOff, User } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VideoPlayerProps {
  stream: MediaStream | null;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isMirrored?: boolean;
  label?: string;
  className?: string;
  placeholderName?: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  stream,
  isMuted = false,
  isVideoOff = false,
  isMirrored = false,
  label,
  className,
  placeholderName,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (stream) {
      videoEl.srcObject = stream;
      videoEl.play().catch((err) => {
        // Autoplay may be deferred until user interaction if unmuted
        if (err.name !== "AbortError") {
          console.warn("Video playback deferred:", err);
        }
      });
    } else {
      videoEl.srcObject = null;
    }
  }, [stream]);

  const hasVideoTrack =
    stream &&
    stream.getVideoTracks().length > 0 &&
    stream.getVideoTracks().some((t) => t.enabled);

  const showPlaceholder = isVideoOff || !hasVideoTrack || !stream;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-slate-900 border border-slate-800/80 shadow-2xl flex items-center justify-center select-none",
        className
      )}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className={cn(
          "w-full h-full object-cover transition-opacity duration-300",
          isMirrored && "scale-x-[-1]",
          showPlaceholder ? "opacity-0" : "opacity-100"
        )}
      />

      {/* Fallback / Camera-Off Placeholder */}
      {showPlaceholder && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 text-slate-400 p-6">
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-full bg-slate-800/80 border border-slate-700/60 flex items-center justify-center shadow-inner">
              {isVideoOff ? (
                <CameraOff className="w-10 h-10 text-slate-500" />
              ) : (
                <User className="w-10 h-10 text-slate-400" />
              )}
            </div>
            {isVideoOff && (
              <span className="absolute -bottom-1 -right-1 px-2 py-0.5 text-[10px] font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/40 rounded-full">
                OFF
              </span>
            )}
          </div>
          <span className="text-sm font-medium text-slate-300">
            {placeholderName || label || (isVideoOff ? "Camera is off" : "No video source")}
          </span>
          {isVideoOff && (
            <span className="text-xs text-slate-500 mt-1">Turn camera on to broadcast video</span>
          )}
        </div>
      )}

      {/* Label Badge */}
      {label && (
        <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md bg-slate-950/75 backdrop-blur-md border border-slate-800/80 text-xs font-medium text-slate-200 shadow-md flex items-center gap-1.5 z-10">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
          {label}
        </div>
      )}
    </div>
  );
};
