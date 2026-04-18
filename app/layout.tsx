// ─────────────────────────────────────────────────────────────
// app/layout.tsx — Root Layout with PWA Meta Tags
// ─────────────────────────────────────────────────────────────

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vantage Cloud Relay",
  description:
    "Edge-to-cloud AI vision relay for the Vantage assistive headset prototype.",
  manifest: "/manifest.json",
  // iOS Safari PWA meta tags — required for true fullscreen home screen experience
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Vantage",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Prevents bouncing/overscroll on iOS — crucial for a camera viewfinder app
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-black">
      <head>
        {/* JetBrains Mono for the status HUD */}
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
        {/* iOS Safari: prevents rubber-band scroll and shows status bar as overlay */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
      </head>
      <body
        className={`${inter.className} bg-black text-white antialiased overflow-hidden`}
      >
        {children}
      </body>
    </html>
  );
}
