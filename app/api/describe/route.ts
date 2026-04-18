// ─────────────────────────────────────────────────────────────
// app/api/describe/route.ts — REST Fallback for Frame Description
//
// This endpoint accepts a base64 JPEG and returns a description.
// Used as a fallback when WebSocket isn't available, and also
// useful for testing the vision + TTS pipeline in isolation
// without needing a WebSocket client.
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { describe } from "@/lib/visionClient";
import { synthesize } from "@/lib/ttsClient";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { imageBase64: string };

    if (!body.imageBase64) {
      return NextResponse.json(
        { error: "imageBase64 is required" },
        { status: 400 },
      );
    }

    const start = Date.now();
    const description = await describe(body.imageBase64);
    const audioBase64 = await synthesize(description);
    const latencyMs = Date.now() - start;

    return NextResponse.json({
      description,
      audioBase64,
      latencyMs,
      timestamp: start,
    });
  } catch (err) {
    console.error("[/api/describe]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
