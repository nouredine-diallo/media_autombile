import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/studio",
  devIndicators: false,
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
