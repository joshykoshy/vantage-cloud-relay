// ─────────────────────────────────────────────────────────────
// lib/socket.ts — Socket.io Client Singleton
//
// Next.js re-runs module code on each client-side navigation.
// Without a singleton, every route.push() would create a new
// WebSocket connection, leaking connections and causing duplicate
// event listeners. We solve this by caching the socket on window.
// ─────────────────────────────────────────────────────────────

import { io, Socket } from "socket.io-client";

// Augment the Window interface so TypeScript knows about our global socket.
// We use `any` here because Socket.io's internal type is complex and
// the window global is untyped — this is an intentional pragmatic exception.
declare global {
  interface Window {
    __socket: Socket; // eslint-disable-line @typescript-eslint/no-explicit-any
  }
}

export function getSocket(): Socket {
  // Only create the socket in the browser — this module is imported by client components
  // but may be evaluated during SSR. Guard against that.
  if (typeof window === "undefined") {
    throw new Error("getSocket() must only be called in the browser");
  }

  if (!window.__socket) {
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000";

    window.__socket = io(url, {
      // Use long-polling first, then upgrade to WebSocket.
      // This ensures compatibility with Next.js's HTTP server which
      // shares the same port as both the web app and the Socket.io server.
      transports: ["polling", "websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      // Auto-connect on creation
      autoConnect: true,
    });

    console.log("[Socket] Created new Socket.io client connection to", url);
  }

  return window.__socket;
}
