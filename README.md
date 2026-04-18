# Vantage Cloud-Relay

![Vantage Headset Pipeline](https://vantage-cloud-relay.app/header.png)

A high-performance, event-driven assistive technology prototype. This system simulates the edge capabilities of the **Vantage Headset** by turning any web-enabled camera (like an iPhone) into a real-time accessibility agent.

It streams camera frames over a persistent WebSocket connection to a custom Node.js/Next.js backend, where images are pushed into a concurrent processing queue. They are then analyzed by the **Gemini 2.0 Flash Vision Model** via OpenRouter, and the resulting scene description is narrated using **ElevenLabs Multilingual V2 TTS**, feeding ultra-low latency audio back directly to the edge device.

## Architecture Pipeline

1. **Edge Device (Client)**: Captures 480x270 JPEG frames every 3 seconds to optimize bandwidth.
2. **WebSocket Ingestion**: A custom Socket.io server intercepts requests alongside the Next.js App Router to maintain a stateful connection.
3. **Queue Mechanism**: Frames enter an in-memory `JobQueue` to decouple ingestion from the sometimes-unpredictable latency of external AI APIs.
4. **Vision LLM**: Frames are sent to `google/gemini-2.0-flash-001` with a rigid system prompt compelling concise, navigation-critical spatial awareness.
5. **Real-time TTS**: The generated text is immediately synthesized into an MP3 via ElevenLabs and streamed back to the client.
6. **Web Audio API**: The edge device plays the returning audio non-blocking without requiring HTML `<audio>` elements.

## Tech Stack

- **Frontend**: Next.js 15 App Router, React 19, TailwindCSS, Socket.io-client
- **Backend**: Custom Express/Node.js server executing Socket.io
- **AI Tooling**: OpenRouter (Gemini), ElevenLabs TTS
- **Telemetry**: Recharts for latency graphing

## Running Locally

1. Install dependencies:

```bash
npm install
```

2. Set up your `.env.local` file at the root of the project with your API keys:

```env
OPENROUTER_API_KEY=your_openrouter_key
ELEVENLABS_API_KEY=your_elevenlabs_key
NEXT_PUBLIC_SOCKET_URL=http://localhost:3000
```

_(Note: Never commit your real API keys! This file is intentionally ignored by git.)_

3. Start the dev server:

```bash
npm run dev
```

### Testing on iOS (PWA setup)

Because iOS strictly mandates HTTPS for secure contexts like camera access, you must use an application like **ngrok** to tunnel localhost:

1. `ngrok http 3000`
2. Update `.env.local` with the new ngrok URL (`NEXT_PUBLIC_SOCKET_URL=https://...ngrok-free.dev`)
3. Restart the dev server
4. Visit the URL on Safari, tap **Share → Add to Home Screen**
5. Launch the app from the Home Screen, tap "Start Camera", and allow permissions.

## Security Constraints

- The browser's `navigator.mediaDevices` relies on explicit user gesture initialization when used in newer WebKit (Safari) and Chromium environments.
- AudioContexts similarly require synchronous initialization inside an `onClick` event on iOS.
- `next.config.ts` must allow `allowedDevOrigins` if exposing over external tunnels to prevent hydration breakage security blockers.
