import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: [],
  reactStrictMode: false,
  // Next.js 15+ blocks JS hydration via ngrok by default. We must whitelist the origin.
  allowedDevOrigins: ["*", "handclap-jolliness-slab.ngrok-free.dev"],
};

export default nextConfig;
