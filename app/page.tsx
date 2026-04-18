"use client";

// ─────────────────────────────────────────────────────────────
// app/page.tsx — Edge Device UI (Main Camera View)
//
// This is what the user sees on their iPhone. It's intentionally
// minimal — the camera fills the screen, the HUD is the only UI.
// The goal is to feel like a real hardware device, not a web page.
// ─────────────────────────────────────────────────────────────

import { useEffect } from "react";
import { useSocket } from "@/hooks/useSocket";
import CameraView from "@/components/CameraView";

export default function EdgeDevicePage() {
  const { sessionState, emit, socket, initAudio } = useSocket();

  // Initialize the Socket.io server by hitting the API route once on mount.
  // This is required because Next.js App Router lazy-initializes API routes —
  // the server doesn't actually start until the first request hits it.
  useEffect(() => {
    fetch("/api/socket").catch(() => {});
  }, []);

  return (
    <main className="w-full h-dvh bg-black overflow-hidden">
      <CameraView
        sessionState={sessionState}
        emit={emit}
        initAudio={initAudio}
      />
    </main>
  );
}
