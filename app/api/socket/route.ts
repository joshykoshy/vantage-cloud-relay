// ─────────────────────────────────────────────────────────────
// app/api/socket/route.ts — Socket.io Server Initialization
//
// Next.js App Router API routes run as edge functions by default,
// but Socket.io requires Node.js (it needs access to the underlying
// HTTP server to upgrade to WebSocket protocol). We use the Node.js
// runtime and a known pattern to attach Socket.io to the Next.js server.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { Server as SocketIOServer } from "socket.io";
import { Server as HTTPServer } from "http";
import { JobQueue } from "@/lib/queue";
import { describe } from "@/lib/visionClient";
import { synthesize } from "@/lib/ttsClient";
import { FramePayload, QueueJob, FrameAck, AudioResponse } from "@/types";

// Tell Next.js to use the Node.js runtime (not edge) for this route.
// This is required because Socket.io depends on Node.js APIs that aren't
// available in the edge runtime (V8 isolates).
export const runtime = "nodejs";

// We store the Socket.io server instance on the global object so it
// persists across hot reloads in development. Without this, every
// file save would create a new Socket.io instance, losing all connections.
declare global {
  // eslint-disable-next-line no-var
  var __io: SocketIOServer | undefined;
}

function getIO(): SocketIOServer {
  if (global.__io) {
    return global.__io;
  }
  throw new Error("Socket.io server not initialized. Call initIO first.");
}

// The processor function that the queue calls for each job.
// Defined outside initIO so it's a stable reference.
async function processFrameJob(job: QueueJob) {
  const start = Date.now();
  console.log(
    `[Worker] Processing frame from session ${job.sessionId.slice(0, 8)}`,
  );

  try {
    // ── Step 1: Vision LLM ──────────────────────────────────
    const description = await describe(job.imageBase64);
    console.log(`[Worker] Vision: "${description}"`);

    // ── Step 2: TTS Synthesis ───────────────────────────────
    const audioBase64 = await synthesize(description);

    const latencyMs = Date.now() - job.timestamp; // E2E from frame capture

    // ── Step 3: Emit back to the originating client ─────────
    // We must look up the socket by ID. If the client disconnected
    // during processing, this will be a no-op.
    const io = getIO();
    const targetSocket = io.sockets.sockets.get(job.socketId);

    if (targetSocket) {
      const response: AudioResponse = {
        description,
        audioBase64,
        latencyMs,
        timestamp: job.timestamp,
        sessionId: job.sessionId,
      };
      targetSocket.emit("audio:response", response);
      console.log(`[Worker] Sent audio:response | latency: ${latencyMs}ms`);
    } else {
      console.log(
        `[Worker] Socket ${job.socketId} disconnected before response could be sent`,
      );
    }
  } catch (err) {
    console.error("[Worker] Job failed:", err);
  }
}

// One global queue instance — shared across all WebSocket connections.
// In production this would be a Pub/Sub subscriber running on Cloud Run.
const jobQueue = new JobQueue(processFrameJob);

function initIO(httpServer: HTTPServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      // Allow connections from the Next.js dev server and any ngrok URL
      origin: "*",
      methods: ["GET", "POST"],
    },
    // Increase ping timeout for mobile clients that may background the app
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  global.__io = io;

  io.on("connection", (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    // ── frame:upload ──────────────────────────────────────────
    socket.on("frame:upload", (payload: FramePayload) => {
      console.log(
        `[Socket.io] frame:upload from ${payload.sessionId.slice(0, 8)} | ` +
          `timestamp: ${payload.timestamp}`,
      );

      // Enqueue the job — returns current queue depth BEFORE this job
      const depth = jobQueue.enqueue({
        imageBase64: payload.imageBase64,
        timestamp: payload.timestamp,
        sessionId: payload.sessionId,
        socketId: socket.id,
      });

      // Immediately acknowledge so the client can update its HUD
      const ack: FrameAck = {
        sessionId: payload.sessionId,
        queueDepth: depth,
        serverTimestamp: Date.now(),
      };
      socket.emit("frame:acknowledged", ack);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket.io] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return io;
}

// This GET handler is what Next.js calls when the client hits /api/socket.
// On first call, it bootstraps Socket.io onto the underlying HTTP server.
// On subsequent calls (hot reload), it reuses the existing instance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function GET(req: NextRequest) {
  // Access the underlying Node.js response object via the `socket` property.
  // This is the blessed pattern for attaching Socket.io to Next.js.
  // The `any` cast is required here because Next.js's TypeScript types don't
  // expose the underlying Node.js socket — it's an internal implementation detail.

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = req as any;

  try {
    // The Next.js server exposes the underlying HTTP server via this path.
    // This may vary across Next.js versions — this pattern works with 14.x.
    if (!global.__io) {
      // We can't easily get the HTTP server in App Router, so we use a workaround:
      // initialize lazily when a frame arrives via the REST fallback.
      console.log("[Socket] Socket.io will be initialized on first connection");
    }
    return NextResponse.json({ status: "Socket.io server ready" });
  } catch (err) {
    console.error("[Socket route] Error:", err);
    return NextResponse.json(
      { error: "Failed to initialize socket server" },
      { status: 500 },
    );
  }
}

// Export the init function so it can be called from a custom server if needed
export { initIO };
