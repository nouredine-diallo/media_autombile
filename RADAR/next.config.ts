import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // L'indicateur de développement Next.js (pastille « N » en bas à gauche)
  // se superpose à la barre latérale et pollue les captures d'écran.
  devIndicators: false,
  // Accès depuis le navigateur Windows via l'IP interne WSL2 (localhost
  // forwarding cassé par le VPN d'entreprise, contournement documenté en
  // session le 2026-09-09) — sans ça, Next.js bloque le chargement des
  // chunks JS depuis cette origine et la page reste bloquée sur "Chargement…".
  allowedDevOrigins: ['172.19.117.1'],
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  serverExternalPackages: ['better-sqlite3', '@xenova/transformers', 'jose', 'node-cron'],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
