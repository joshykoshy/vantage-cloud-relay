"use client";

// ─────────────────────────────────────────────────────────────
// app/dashboard/page.tsx — Live Session Monitor
//
// A desktop-optimized dashboard for monitoring the relay session
// in real time. Use this on the interviewer's laptop while the
// iPhone demo is running — shows the full latency breakdown.
// ─────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";
import LatencyChart from "@/components/LatencyChart";
import Link from "next/link";

export default function DashboardPage() {
  const { sessionState, latencyHistory } = useSocket();

  useEffect(() => {
    fetch("/api/socket").catch(() => {});
  }, []);

  const latencyColor =
    sessionState.lastLatencyMs === null
      ? "text-white/40"
      : sessionState.lastLatencyMs < 1500
        ? "text-green-400"
        : sessionState.lastLatencyMs < 3000
          ? "text-amber-400"
          : "text-red-400";

  return (
    <main className="min-h-screen bg-[#080808] text-white p-6 overflow-auto">
      {/* Header */}
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              <span className="text-[#4F8EF7]">VANTAGE</span> Cloud Relay
            </h1>
            <p className="text-white/40 text-sm mt-0.5 font-mono">
              Session Monitor
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 rounded-xl border border-white/10 text-sm text-white/60 hover:text-white hover:border-white/30 transition-colors"
          >
            ← Edge View
          </Link>
        </div>

        {/* Status row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Status",
              value: sessionState.isConnected ? "CONNECTED" : "DISCONNECTED",
              color: sessionState.isConnected
                ? "text-green-400"
                : "text-red-400",
            },
            {
              label: "Session ID",
              value: sessionState.sessionId.slice(0, 8).toUpperCase(),
              color: "text-[#4F8EF7]",
            },
            {
              label: "Frames Sent",
              value: sessionState.framesSent.toString(),
              color: "text-white",
            },
            {
              label: "Queue Depth",
              value: sessionState.queueDepth.toString(),
              color:
                sessionState.queueDepth > 3 ? "text-amber-400" : "text-white",
            },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              className="p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]"
            >
              <div className="text-[10px] text-white/30 uppercase tracking-widest mb-2 font-mono">
                {label}
              </div>
              <div className={`text-2xl font-bold font-mono ${color}`}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Last description */}
        <div className="p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] mb-6">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-3 font-mono">
            Last AI Description
          </div>
          <div className="text-2xl font-medium text-white">
            {sessionState.lastDescription}
          </div>
          {sessionState.lastLatencyMs !== null && (
            <div className={`text-sm font-mono mt-2 ${latencyColor}`}>
              End-to-end: {sessionState.lastLatencyMs}ms
            </div>
          )}
        </div>

        {/* Latency chart */}
        <div className="p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] mb-6">
          <div className="text-[10px] text-white/30 uppercase tracking-widest mb-4 font-mono">
            Latency History (last 20 frames)
          </div>
          <LatencyChart data={latencyHistory} />
        </div>

        {/* Architecture note */}
        <div className="p-5 rounded-2xl border border-[#4F8EF7]/10 bg-[#4F8EF7]/[0.03]">
          <div className="text-[10px] text-[#4F8EF7]/60 uppercase tracking-widest mb-3 font-mono">
            Architecture Note
          </div>
          <p className="text-white/50 text-sm leading-relaxed">
            Each frame captured on the iPhone travels over WebSocket to this
            Next.js server, joins an in-memory job queue (simulating Google
            Cloud Pub/Sub), gets processed by the Gemini Flash vision model via
            OpenRouter, synthesized by ElevenLabs TTS, and returned as a base64
            MP3 — played via the Web Audio API on the device. In production, the
            queue would be a Pub/Sub topic with auto-scaling Cloud Run workers.
          </p>
        </div>
      </div>
    </main>
  );
}
