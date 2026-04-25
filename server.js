// ─────────────────────────────────────────────────────────────
// server.js — Custom Node.js Server
//
// WHY A CUSTOM SERVER?
// Next.js App Router API routes can't intercept HTTP upgrade
// requests needed for WebSocket protocol. Socket.io needs the
// raw Node.js HTTP server. This file wraps Next.js inside a
// plain Node.js HTTP server and attaches Socket.io to it.
// ─────────────────────────────────────────────────────────────

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { Server: SocketIOServer } = require("socket.io");

// Load env variables before anything else
require("dotenv").config({ path: ".env.local" });

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();

// ── Vision LLM Client (inlined from lib/visionClient.ts) ─────
// Inlined here because server.js is plain JS — the TypeScript
// source in lib/ is for the Next.js build pipeline + IDE support.

const SYSTEM_PROMPT =
  "You are an AI navigation assistant for a blind user wearing the Vantage headset. " +
  "Describe only the single most important obstacle or object directly in front of the user " +
  "in 5 words or fewer. Be specific. " +
  "Examples: 'Stairs going down ahead', 'Person walking toward you', 'Door handle on left'. " +
  "Do not describe scenery or background.";

async function describeFrame(imageBase64) {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "https://vantage-cloud-relay.app",
        "X-Title": "Vantage Cloud Relay",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        max_tokens: 40,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "low",
                },
              },
              { type: "text", text: SYSTEM_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${errBody.slice(0, 300)}`);
    }
    const data = await res.json();
    return (
      data.choices?.[0]?.message?.content?.trim() || "Unable to describe scene"
    );
  } catch (err) {
    console.error("[VisionClient]", err.message);
    return "Unable to describe scene";
  }
}

// ── TTS Client (inlined from lib/ttsClient.ts) ────────────────
async function synthesizeAudio(text) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      console.warn("[TTSClient] ELEVENLABS_API_KEY not set — client will use browser fallback");
      return "";
    }

    console.log(`[TTSClient] Synthesizing: "${text}"`);
    const res = await fetch(
      "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM",
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.4, similarity_boost: 0.85 },
        }),
      },
    );

    if (!res.ok) {
      const errBody = await res.text();
      console.error(`[TTSClient] ElevenLabs ${res.status}: ${errBody.slice(0, 300)}`);
      console.warn("[TTSClient] TTS failed — client will use browser speechSynthesis fallback");
      return "";
    }
    const buffer = await res.arrayBuffer();
    console.log(`[TTSClient] OK — ${buffer.byteLength} bytes`);
    return Buffer.from(buffer).toString("base64");
  } catch (err) {
    console.error("[TTSClient] Network error:", err.message);
    return "";
  }
}

// ── In-Memory Job Queue ───────────────────────────────────────
// In production: replace this in-memory queue with Google Cloud Pub/Sub or Redis Bull
class JobQueue {
  constructor(processor) {
    this.jobs = [];
    this.isProcessing = false;
    this.processor = processor;
  }
  enqueue(job) {
    this.jobs.push(job);
    this.processNext().catch(console.error);
    return this.jobs.length;
  }
  get depth() {
    return this.jobs.length;
  }
  async processNext() {
    if (this.isProcessing || this.jobs.length === 0) return;
    this.isProcessing = true;
    const job = this.jobs.shift();
    try {
      await this.processor(job);
    } catch (err) {
      console.error("[Queue]", err);
    } finally {
      this.isProcessing = false;
      if (this.jobs.length > 0) await this.processNext();
    }
  }
}

// ── Server Bootstrap ──────────────────────────────────────────
app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Request error:", err);
      res.statusCode = 500;
      res.end("Internal server error");
    }
  });

  // Attach Socket.io — this is why we need a custom server
  const io = new SocketIOServer(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // One queue instance, shared across all WebSocket connections.
  // The processor closes over `io` to emit results back to the right client.
  const jobQueue = new JobQueue(async (job) => {
    console.log(
      `[Worker] Session ${job.sessionId.slice(0, 8)} | queue: ${jobQueue.depth}`,
    );

    const description = await describeFrame(job.imageBase64);
    console.log(`[Worker] "${description}"`);

    const audioBase64 = await synthesizeAudio(description);
    const latencyMs = Date.now() - job.timestamp;

    const target = io.sockets.sockets.get(job.socketId);
    const payload = {
      description,
      audioBase64,
      latencyMs,
      timestamp: job.timestamp,
      sessionId: job.sessionId,
    };

    if (target) {
      target.emit("audio:response", payload);
      console.log(`[Worker] Delivered | ${latencyMs}ms`);
    } else {
      console.log(`[Worker] Client ${job.socketId} already disconnected`);
    }

    // Broadcast lightweight update to ALL clients (dashboard tabs included).
    // Strip audioBase64 — dashboard only needs the text metrics, not the MP3.
    io.emit("session:update", {
      description,
      latencyMs,
      timestamp: job.timestamp,
      sessionId: job.sessionId,
    });
  });

  io.on("connection", (socket) => {
    console.log(`[Socket.io] + ${socket.id}`);

    socket.on("frame:upload", (payload) => {
      const depth = jobQueue.enqueue({
        imageBase64: payload.imageBase64,
        timestamp: payload.timestamp,
        sessionId: payload.sessionId,
        socketId: socket.id,
      });

      socket.emit("frame:acknowledged", {
        sessionId: payload.sessionId,
        queueDepth: depth,
        serverTimestamp: Date.now(),
      });
    });

    socket.on("disconnect", (reason) => {
      console.log(`[Socket.io] - ${socket.id} (${reason})`);
    });
  });

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`\n  🚀 Vantage Cloud Relay`);
    console.log(`  ├─ Edge View:   http://localhost:${port}`);
    console.log(`  └─ Dashboard:  http://localhost:${port}/dashboard\n`);
  });
});
