import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow all origins to hit the agent endpoints — these are meant to be
  // consumed by arbitrary A2A clients. CORS headers are set inline in the
  // route handler for precise control (including SSE streaming responses).
};

export default nextConfig;
