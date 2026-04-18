"use client";

// ─────────────────────────────────────────────────────────────
// components/CameraView.tsx — Camera Stream + Frame Capture Loop
//
// This component owns the interval that drives the entire pipeline.
// It ties together the camera hook and socket hook, and provides
// the full-screen camera viewfinder with a status overlay.
// ─────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from "react";
import { useCamera } from "@/hooks/useCamera";
import StatusHUD from "./StatusHUD";
import { SessionState } from "@/types";

interface CameraViewProps {
  sessionState: SessionState;
  emit: (event: string, data: unknown) => void;
  initAudio: () => void;
}

// 3000ms = one frame every 3 seconds.
// Chosen because:
// - LLaVA/Gemini Flash processes in ~1-2s, so 3s gives processing headroom
// - For navigation, 3s is fast enough to warn about upcoming obstacles
// - At 60% JPEG quality, a 480×270 frame is ~15-20KB — manageable over 4G
const CAPTURE_INTERVAL_MS = 3000;

export default function CameraView({
  sessionState,
  emit,
  initAudio,
}: CameraViewProps) {
  const { videoRef, isReady, error, captureFrame, startCamera } = useCamera();
  const [isPaused, setIsPaused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start/stop the frame capture loop based on readiness and pause state
  useEffect(() => {
    // Only run when: camera is ready, socket is connected, and not paused
    if (!isReady || !sessionState.isConnected || isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      // iOS Safari bug mitigation: if the video paused itself due to a DOM re-render, kick it back into playback
      if (videoRef.current && videoRef.current.paused) {
        videoRef.current.play().catch(() => {});
      }

      const frame = captureFrame();
      if (frame) {
        emit("frame:upload", frame);
      }
    }, CAPTURE_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isReady, sessionState.isConnected, isPaused, captureFrame, emit]);

  // ── Error state ─────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black text-white p-8 text-center">
        <div className="text-5xl mb-6">📷</div>
        <h2 className="text-xl font-semibold mb-3 text-red-400">
          Camera Access Required
        </h2>
        <p className="text-white/60 text-sm leading-relaxed max-w-xs">
          {error}
        </p>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 px-5 py-2.5 rounded-xl border border-white/20 text-sm text-white/80 hover:bg-white/10 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="relative w-full h-dvh bg-black overflow-hidden">
      {/* Full-screen camera viewfinder */}
      <video
        ref={videoRef}
        // `playsinline` is CRITICAL on iOS Safari — without it, the video takes over
        // fullscreen and the overlay UI becomes inaccessible
        playsInline
        muted
        autoPlay
        className="absolute inset-0 w-full h-full object-cover"
        style={{ transform: "scaleX(1)" }} // Don't mirror rear camera
      />

      {/* Start screen — requires user gesture for iOS */}
      {!isReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black z-50">
          {isStarting ? (
            <div className="text-center">
              <div className="w-10 h-10 border-2 border-[#4F8EF7] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white/50 text-sm font-mono tracking-widest uppercase">
                Requesting Access...
              </p>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-6xl mb-6">📷</div>
              <h1 className="text-xl font-bold tracking-tight text-white mb-2">
                Vantage Cloud Relay
              </h1>
              <p className="text-white/40 text-sm mb-8 px-8 leading-relaxed">
                Position your phone camera outward. The AI will narrate the
                scene.
              </p>
              <button
                onClick={async (e) => {
                  e.preventDefault();
                  // 1. Critical for iOS Web Audio API: Initialize audio context inside synchronous tap
                  initAudio();

                  setIsStarting(true);
                  try {
                    await startCamera();
                  } catch (err) {
                    alert("Camera setup failed: " + String(err));
                    setIsStarting(false);
                  }
                }}
                className="px-8 py-4 rounded-full bg-[#4F8EF7] text-black font-bold tracking-widest text-sm hover:scale-105 transition-transform shadow-[0_0_20px_rgba(79,142,247,0.4)]"
              >
                START CAMERA
              </button>
            </div>
          )}
        </div>
      )}

      {/* Pause/Resume control — positioned top-right to avoid the center of frame */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={() => setIsPaused((p) => !p)}
          className={`
            px-4 py-2 rounded-xl text-xs font-mono font-semibold tracking-wider
            border transition-all duration-200
            ${
              isPaused
                ? "bg-[#4F8EF7]/20 border-[#4F8EF7]/60 text-[#4F8EF7]"
                : "bg-black/60 border-white/20 text-white/70 hover:border-white/40"
            }
          `}
          style={{ backdropFilter: "blur(8px)" }}
        >
          {isPaused ? "▶ RESUME" : "⏸ PAUSE"}
        </button>
      </div>

      {/* Capture rate indicator — top-left */}
      {isReady && !isPaused && sessionState.isConnected && (
        <div
          className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-mono text-white/60"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)" }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[#4F8EF7] animate-pulse" />
          3s INTERVAL
        </div>
      )}

      {/* Status HUD — bottom overlay */}
      <StatusHUD state={sessionState} />
    </div>
  );
}
