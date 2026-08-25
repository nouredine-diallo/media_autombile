import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  serverExternalPackages: ["sharp", "onnxruntime-node"],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
