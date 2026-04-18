// ─────────────────────────────────────────────────────────────
// lib/ttsClient.ts — ElevenLabs TTS Client
//
// Another seam: swap this for Google Cloud TTS, AWS Polly, or
// the browser's SpeechSynthesis API by only changing this file.
// ─────────────────────────────────────────────────────────────

// Rachel voice — natural, clear, good for navigation instructions
const VOICE_ID = "21m00Tcm4TlvDq8ikWAM";
const TTS_URL = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`;

export async function synthesize(text: string): Promise<string> {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set in .env.local");

    const response = await fetch(TTS_URL, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          // stability: 0.4 — slightly more dynamic/expressive than the default 0.5.
          // For navigation cues, a slightly varied tone helps distinguish urgency levels.
          stability: 0.4,
          similarity_boost: 0.85,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `ElevenLabs ${response.status}: ${errText.slice(0, 200)}`,
      );
    }

    // Convert the binary MP3 stream to base64 so it can be sent over WebSocket JSON.
    // The client will decode this back to an ArrayBuffer for Web Audio API playback.
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer).toString("base64");
  } catch (err) {
    console.error("[TTSClient] Error:", err);
    // Return empty string — the client handles missing audio gracefully
    return "";
  }
}
