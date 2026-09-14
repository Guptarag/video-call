"use client";

import React from "react";
import { Mic, Video } from "lucide-react";
import { type MediaDeviceOption } from "@/hooks/useMediaStream";
import { cn } from "@/lib/utils";

export interface DeviceSelectProps {
  label: string;
  kind: "audioinput" | "videoinput";
  devices: MediaDeviceOption[];
  selectedDeviceId: string;
  onDeviceChange: (deviceId: string) => void;
  disabled?: boolean;
  className?: string;
}

export const DeviceSelect: React.FC<DeviceSelectProps> = ({
  label,
  kind,
  devices,
  selectedDeviceId,
  onDeviceChange,
  disabled = false,
  className,
}) => {
  const Icon = kind === "audioinput" ? Mic : Video;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 text-cyan-400" />
        {label}
      </label>

      <div className="relative">
        <select
          value={selectedDeviceId}
          onChange={(e) => onDeviceChange(e.target.value)}
          disabled={disabled || devices.length === 0}
          className={cn(
            "w-full appearance-none px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700/70 text-slate-200 text-sm font-medium",
            "focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500",
            "disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-sm",
            "pr-9"
          )}
        >
          {devices.length === 0 ? (
            <option value="">No {kind === "audioinput" ? "microphones" : "cameras"} found</option>
          ) : (
            devices.map((device, idx) => (
              <option key={device.deviceId || idx} value={device.deviceId}>
                {device.label || `${kind === "audioinput" ? "Microphone" : "Camera"} ${idx + 1}`}
              </option>
            ))
          )}
        </select>

        {/* Dropdown chevron */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
          <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
            <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
          </svg>
        </div>
      </div>
    </div>
  );
};
