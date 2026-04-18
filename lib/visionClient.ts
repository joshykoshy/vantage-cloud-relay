// ─────────────────────────────────────────────────────────────
// lib/visionClient.ts — OpenRouter Vision LLM Client
//
// This module is a seam in the architecture: if we want to swap
// in GPT-4o or Claude 3.5 Sonnet, we only change this file.
// The queue processor above doesn't care HOW the description is
// generated — only that it gets a string back.
// ─────────────────────────────────────────────────────────────

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-flash-1.5";

// The exact navigation-focused prompt for the Vantage headset use case.
// "5 words or fewer" keeps TTS playback short enough to be useful in motion.
const SYSTEM_PROMPT =
  "You are an AI navigation assistant for a blind user wearing the Vantage headset. " +
  "Describe only the single most important obstacle or object directly in front of the user " +
  "in 5 words or fewer. Be specific. " +
  "Examples: 'Stairs going down ahead', 'Person walking toward you', 'Door handle on left'. " +
  "Do not describe scenery or background.";

export async function describe(imageBase64: string): Promise<string> {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set in .env.local");

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        // OpenRouter requires these headers to track usage in their dashboard
        "HTTP-Referer": "https://vantage-cloud-relay.vercel.app",
        "X-Title": "Vantage Cloud Relay",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 40, // Hard cap — we never want more than a short phrase
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  // Full data URL is required for the multimodal vision capability
                  url: `data:image/jpeg;base64,${imageBase64}`,
                  detail: "low", // 'low' is faster and cheaper; sufficient for obstacle detection
                },
              },
              {
                type: "text",
                text: SYSTEM_PROMPT,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `OpenRouter ${response.status}: ${errText.slice(0, 200)}`,
      );
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();

    if (!text) throw new Error("OpenRouter returned empty content");
    return text;
  } catch (err) {
    // Always return a string so the TTS pipeline has something to say.
    // Failing silently would leave the user with no audio feedback.
    console.error("[VisionClient] Error:", err);
    return "Unable to describe scene";
  }
}
