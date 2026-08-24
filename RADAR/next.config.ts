import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // L'indicateur de développement Next.js (pastille « N » en bas à gauche)
  // se superpose à la barre latérale et pollue les captures d'écran.
  devIndicators: false,
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
