"use client";

import React from "react";
import { Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AudioMeterProps {
  level: number; // 0 to 100
  isMuted?: boolean;
  showIcon?: boolean;
  className?: string;
  barClassName?: string;
}

export const AudioMeter: React.FC<AudioMeterProps> = ({
  level,
  isMuted = false,
  showIcon = true,
  className,
  barClassName,
}) => {
  // Clamp level between 0 and 100
  const clampedLevel = isMuted ? 0 : Math.max(0, Math.min(100, level));

  return (
    <div className={cn("flex items-center gap-2 select-none", className)}>
      {showIcon && (
        <div
          className={cn(
            "p-1.5 rounded-full transition-colors duration-200",
            isMuted
              ? "bg-rose-500/15 text-rose-400"
              : clampedLevel > 15
              ? "bg-cyan-500/20 text-cyan-400"
              : "bg-slate-800 text-slate-400"
          )}
          title={isMuted ? "Microphone Muted" : "Microphone Active"}
        >
          {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
        </div>
      )}

      {/* Level bar container */}
      <div
        className={cn(
          "relative h-2 w-28 bg-slate-800/90 rounded-full overflow-hidden border border-slate-700/50 p-[1px]",
          barClassName
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-75 ease-out",
            isMuted
              ? "w-0 bg-transparent"
              : clampedLevel > 75
              ? "bg-gradient-to-r from-cyan-500 via-yellow-400 to-rose-500"
              : "bg-gradient-to-r from-cyan-500 to-emerald-400"
          )}
          style={{ width: `${clampedLevel}%` }}
        />
      </div>

      <span className="text-[11px] font-mono text-slate-400 w-7 text-right">
        {isMuted ? "OFF" : `${clampedLevel}%`}
      </span>
    </div>
  );
};
