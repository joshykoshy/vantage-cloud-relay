"use client";

// ─────────────────────────────────────────────────────────────
// hooks/useCamera.ts — Camera & Frame Capture Hook
//
// Abstracts all MediaDevices API complexity. Components just
// call captureFrame() and attach videoRef to a <video> element.
// ─────────────────────────────────────────────────────────────

import { useRef, useState, useCallback, useEffect } from "react";

interface CapturedFrame {
  imageBase64: string;
  timestamp: number;
  sessionId: string;
}

interface UseCameraReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isReady: boolean;
  error: string | null;
  captureFrame: () => CapturedFrame | null;
  startCamera: () => Promise<void>;
  stream: MediaStream | null;
}

// Generate one session ID for the lifetime of this page load.
// Using crypto.randomUUID() — available in all modern browsers and Node.js 14.17+.
const SESSION_ID =
  typeof crypto !== "undefined" ? crypto.randomUUID() : "fallback-session";

export function useCamera(): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startCamera = useCallback(async () => {
    let cancelled = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError(
        "Camera API is not available. Please use Safari and ensure the URL starts with https://",
      );
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });

      if (cancelled) {
        mediaStream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = mediaStream;

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        try {
          await videoRef.current.play();
        } catch (playbackErr) {
          console.warn("Video autoplay prevented", playbackErr);
        }
      }

      if (!cancelled) setIsReady(true);
    } catch (err) {
      if (!cancelled) {
        const e = err as DOMException;
        const msg = e.name ? `${e.name}: ${e.message}` : String(err);
        setError(
          `Camera access failed (${msg}). Please ensure you allowed permission.`,
        );
      }
    }

    // Since we no longer use useEffect cleanup, we handle tearing down the stream
    // when the component unmounts the old-fashioned way.
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /**
   * Captures the current video frame as a compressed JPEG base64 string.
   *
   * We render at 480×270 (quarter of 1080p) for two reasons:
   * 1. Faster network transmission over the WebSocket
   * 2. VLMs like Gemini work well at this resolution for scene understanding
   *
   * Returns null if the camera isn't ready yet.
   */
  const captureFrame = useCallback((): CapturedFrame | null => {
    if (!videoRef.current || !isReady) return null;

    // Reuse the canvas element across captures — creating a new one every 3s
    // would create garbage collection pressure on mobile.
    if (!canvasRef.current) {
      canvasRef.current = document.createElement("canvas");
    }

    const canvas = canvasRef.current;
    canvas.width = 480;
    canvas.height = 270;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(videoRef.current, 0, 0, 480, 270);

    // Quality 0.6 = ~60% JPEG — good balance of quality vs payload size
    const dataUrl = canvas.toDataURL("image/jpeg", 0.6);
    // Strip the `data:image/jpeg;base64,` prefix — the server doesn't need it,
    // and omitting it saves ~22 bytes per frame
    const imageBase64 = dataUrl.split(",")[1];

    return {
      imageBase64,
      timestamp: Date.now(),
      sessionId: SESSION_ID,
    };
  }, [isReady]);

  return {
    videoRef,
    isReady,
    error,
    captureFrame,
    startCamera,
    stream: streamRef.current,
  };
}
