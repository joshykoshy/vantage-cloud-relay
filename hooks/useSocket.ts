"use client";

// ─────────────────────────────────────────────────────────────
// hooks/useSocket.ts — Socket.io Connection & Audio Playback Hook
//
// Handles the full lifecycle of the WebSocket connection and
// decodes + plays audio responses via the Web Audio API.
// ─────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, useCallback } from "react";
import { getSocket } from "@/lib/socket";
import { AudioResponse, FrameAck, SessionState } from "@/types";
import { Socket } from "socket.io-client";

interface UseSocketReturn {
  socket: Socket | null;
  sessionState: SessionState;
  emit: (event: string, data: unknown) => void;
  initAudio: () => void;
  latencyHistory: Array<{
    timestamp: number;
    latencyMs: number;
    label: string;
  }>;
}

// Stable placeholder rendered on the server — replaced immediately on mount
const INITIAL_SESSION_STATE: SessionState = {
  isConnected: false,
  sessionId: "--------", // stable server-side placeholder, never shown
  lastDescription: "Waiting...",
  lastLatencyMs: null,
  framesSent: 0,
  queueDepth: 0,
};

export function useSocket(): UseSocketReturn {
  // Use stable initial state on both server AND client, then update after mount.
  // useState initializers run on the server during SSR, so crypto.randomUUID()
  // would generate a different value server-side vs client-side → hydration mismatch.
  const [sessionState, setSessionState] = useState<SessionState>(
    INITIAL_SESSION_STATE,
  );
  const [latencyHistory, setLatencyHistory] = useState<
    Array<{ timestamp: number; latencyMs: number; label: string }>
  >([]);
  const socketRef = useRef<Socket | null>(null);

  // Set the session ID on the client only — after first render, no hydration mismatch
  useEffect(() => {
    setSessionState((prev) => ({
      ...prev,
      sessionId: crypto.randomUUID().slice(0, 8),
    }));
  }, []);

  // Web Audio API context — created lazily on first user gesture (iOS Safari requirement).
  // iOS blocks AudioContext creation until after a user interaction, so we can't
  // create it on mount. We create it on the first audio:response event, by which
  // point the user has already tapped the screen to grant camera permission.
  const audioCtxRef = useRef<AudioContext | null>(null);

  const initAudio = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume();
    }
  }, []);

  /**
   * Play a base64 MP3 using the Web Audio API.
   * We use Web Audio (not <audio>) because:
   * 1. Non-blocking — doesn't pause the rest of the UI thread
   * 2. Precise timing — we know exactly when playback starts/ends
   * 3. No DOM element needed — cleaner for programmatic playback
   */
  const playAudio = useCallback(async (audioBase64: string) => {
    if (!audioBase64) return;

    try {
      // Create or resume the AudioContext (iOS requires resume() after user gesture)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext
        )();
      }

      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
      }

      // Decode the base64 MP3 back to binary
      const binaryString = atob(audioBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Decode the MP3 ArrayBuffer into an AudioBuffer
      const audioBuffer = await audioCtx.decodeAudioData(bytes.buffer);

      // Create a BufferSource — a one-shot playback node
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioCtx.destination);
      source.start(0); // Play immediately
    } catch (err) {
      console.error("[useSocket] Audio playback error:", err);
    }
  }, []);

  useEffect(() => {
    // Don't try to connect during SSR
    if (typeof window === "undefined") return;

    const socket = getSocket();
    socketRef.current = socket;

    // ── Connection events ──────────────────────────────────
    const onConnect = () => {
      console.log("[Socket] Connected:", socket.id);
      setSessionState((prev) => ({ ...prev, isConnected: true }));
    };

    const onDisconnect = () => {
      console.log("[Socket] Disconnected");
      setSessionState((prev) => ({ ...prev, isConnected: false }));
    };

    // ── Frame acknowledgement ──────────────────────────────
    // The server sends this immediately on receipt — before AI processing.
    // This lets the client show queue depth without waiting for the full pipeline.
    const onFrameAck = (ack: FrameAck) => {
      setSessionState((prev) => ({
        ...prev,
        queueDepth: ack.queueDepth,
      }));
    };

    // ── Full audio response (edge device only) ─────────────────
    const onAudioResponse = (data: AudioResponse) => {
      console.log(
        `[Socket] audio:response | latency: ${data.latencyMs}ms | "${data.description}"`,
      );

      setSessionState((prev) => ({
        ...prev,
        lastDescription: data.description,
        lastLatencyMs: data.latencyMs,
        queueDepth: Math.max(0, prev.queueDepth - 1),
      }));

      addLatencyPoint(data);
      playAudio(data.audioBase64);
    };

    // ── Session update broadcast (all clients including dashboard) ──
    // The server broadcasts this after every frame is processed.
    // It carries the same data as audio:response but without the MP3.
    const onSessionUpdate = (data: Omit<AudioResponse, "audioBase64">) => {
      setSessionState((prev) => ({
        ...prev,
        lastDescription: data.description,
        lastLatencyMs: data.latencyMs,
        queueDepth: Math.max(0, prev.queueDepth - 1),
      }));
      addLatencyPoint(data as AudioResponse);
    };

    function addLatencyPoint(
      data: AudioResponse | Omit<AudioResponse, "audioBase64">,
    ) {
      setLatencyHistory((prev) => {
        const newPoint = {
          timestamp: data.timestamp,
          latencyMs: data.latencyMs,
          label: new Date(data.timestamp).toLocaleTimeString(),
        };
        return [...prev.slice(-19), newPoint];
      });
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("frame:acknowledged", onFrameAck);
    socket.on("audio:response", onAudioResponse);
    socket.on("session:update", onSessionUpdate);

    // If already connected when this hook mounts (e.g., hot reload)
    if (socket.connected) {
      setSessionState((prev) => ({ ...prev, isConnected: true }));
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("frame:acknowledged", onFrameAck);
      socket.off("audio:response", onAudioResponse);
      socket.off("session:update", onSessionUpdate);
      // We do NOT disconnect here — the singleton should stay alive across
      // component re-renders. Only disconnect on full page unload.
    };
  }, [playAudio]);

  const emit = useCallback((event: string, data: unknown) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
      // Increment frames sent counter
      if (event === "frame:upload") {
        setSessionState((prev) => ({
          ...prev,
          framesSent: prev.framesSent + 1,
        }));
      }
    }
  }, []);

  return {
    socket: socketRef.current,
    sessionState,
    emit,
    initAudio,
    latencyHistory,
  };
}
