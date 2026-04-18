// ─────────────────────────────────────────────────────────────
// types/index.ts — Shared TypeScript interfaces
// Every layer of the pipeline uses these types so the data
// contract between client, server, and AI clients is explicit.
// ─────────────────────────────────────────────────────────────

/**
 * A single video frame captured from the edge device camera.
 * Emitted over WebSocket as the `frame:upload` event payload.
 */
export interface FramePayload {
  /** Raw base64-encoded JPEG string (no data URL prefix) */
  imageBase64: string;
  /** Unix timestamp (ms) at the moment of capture — used to compute E2E latency */
  timestamp: number;
  /** UUID generated once per page load — ties all frames to a session */
  sessionId: string;
}

/**
 * Server acknowledgement sent immediately after receiving a frame.
 * Gives the client visibility into queue depth without waiting for processing.
 */
export interface FrameAck {
  sessionId: string;
  queueDepth: number;
  serverTimestamp: number;
}

/**
 * The final response emitted after the full pipeline:
 * frame → vision LLM → TTS → base64 MP3 back to client.
 */
export interface AudioResponse {
  description: string;
  audioBase64: string;
  latencyMs: number;
  timestamp: number;
  sessionId: string;
}

/**
 * A job enqueued into the in-memory queue (or Pub/Sub in production).
 * Carries all data needed by the worker to process a frame end-to-end.
 */
export interface QueueJob {
  imageBase64: string;
  timestamp: number;
  sessionId: string;
  /** The socket ID of the originating client, so we can emit the result back to them */
  socketId: string;
}

/**
 * A single latency metric data point, used by the LatencyChart component.
 */
export interface LatencyPoint {
  timestamp: number;
  latencyMs: number;
  label: string;
}

/**
 * Real-time session state surfaced in the StatusHUD.
 */
export interface SessionState {
  isConnected: boolean;
  sessionId: string;
  lastDescription: string;
  lastLatencyMs: number | null;
  framesSent: number;
  queueDepth: number;
}
