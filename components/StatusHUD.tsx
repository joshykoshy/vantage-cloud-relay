"use client";

// ─────────────────────────────────────────────────────────────
// components/StatusHUD.tsx — Live Session Metrics Overlay
//
// Positioned over the camera, this is the key demo element.
// All latency, connection state, and AI output visible at a glance.
// ─────────────────────────────────────────────────────────────

import React from "react";
import { SessionState } from "@/types";

interface StatusHUDProps {
  state: SessionState;
}

function LatencyColor({ ms }: { ms: number | null }) {
  if (ms === null) return <span className="text-gray-400">—</span>;
  const color =
    ms < 1500
      ? "text-green-400"
      : ms < 3000
        ? "text-amber-400"
        : "text-red-400";
  return <span className={color}>{ms}ms</span>;
}

function ConnectionDot({ isConnected }: { isConnected: boolean }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full mr-2 ${
        isConnected
          ? "bg-green-400 shadow-[0_0_6px_2px_rgba(74,222,128,0.4)]"
          : "bg-red-500"
      }`}
    />
  );
}

export default function StatusHUD({ state }: StatusHUDProps) {
  return (
    <div
      className="absolute bottom-0 left-0 right-0 p-4 rounded-t-2xl"
      style={{
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      }}
    >
      {/* Connection status */}
      <div className="flex items-center mb-3 pb-3 border-b border-white/10">
        <ConnectionDot isConnected={state.isConnected} />
        <span className="text-xs text-white/80 uppercase tracking-widest">
          {state.isConnected ? "CONNECTED" : "DISCONNECTED"}
        </span>
        <span className="ml-auto text-xs text-white/40">
          SESSION: {state.sessionId.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {/* Last description — the most important output */}
      <div className="mb-3">
        <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1">
          Last Description
        </div>
        <div className="text-sm text-white font-medium leading-snug">
          {state.lastDescription}
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <div className="text-white/40 uppercase tracking-widest text-[9px] mb-0.5">
            Latency
          </div>
          <div className="font-semibold">
            <LatencyColor ms={state.lastLatencyMs} />
          </div>
        </div>
        <div>
          <div className="text-white/40 uppercase tracking-widest text-[9px] mb-0.5">
            Frames Sent
          </div>
          <div className="text-white font-semibold">{state.framesSent}</div>
        </div>
        <div>
          <div className="text-white/40 uppercase tracking-widest text-[9px] mb-0.5">
            Queue Depth
          </div>
          <div
            className={`font-semibold ${state.queueDepth > 3 ? "text-amber-400" : "text-white"}`}
          >
            {state.queueDepth}
          </div>
        </div>
      </div>
    </div>
  );
}
