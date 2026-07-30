import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@boardui/ui"],
  async redirects() {
    return [
      { source: "/chat/sessions", destination: "/chat", permanent: false },
      { source: "/chat/sessions/new", destination: "/chat/new", permanent: false },
      { source: "/chat/sessions/:id", destination: "/chat/:id", permanent: false },
      { source: "/chat/session", destination: "/chat", permanent: false },
      { source: "/chat/session/new", destination: "/chat/new", permanent: false },
      { source: "/chat/session/:id", destination: "/chat/:id", permanent: false },
    ];
  },
};

export default nextConfig;
