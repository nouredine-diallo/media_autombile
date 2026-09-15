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
  // Finding 1.7 (AUDIT-PRODUCTION-READINESS, 15 sept. 2026) : ni le fichier
  // Next.js ni nginx (media-labs*.conf) ne posait X-Frame-Options — un
  // clickjacking trivial à fermer. Posé ici (app-level) plutôt que dans
  // nginx pour ne pas toucher la config déployée sur la VM sans y avoir
  // accès direct au moment du correctif.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ];
  },
};

export default nextConfig;
