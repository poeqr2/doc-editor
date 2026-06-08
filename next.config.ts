import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack config for Next.js 16
  turbopack: {},
  // Fallback webpack config
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
