import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Même correctif que RADAR (session du 2026-09-09) : sans ça, Next.js
  // bloque le chargement des chunks JS pour les requêtes qui semblent
  // venir d'une autre origine (proxy d'entreprise sur cette machine de
  // dev) — zéro JS ne charge alors, la page reste une coquille HTML
  // statique sans jamais s'hydrater (découvert en diagnostiquant un
  // contrôle interactif qui ne répondait à aucun événement).
  allowedDevOrigins: ["127.0.0.1", "172.19.117.1"],
  experimental: {
    workerThreads: false,
    cpus: 1,
  },
  // `playwright` manquant ici (trouvé le 16 sept. 2026, logs prod) : sans
  // cette déclaration, Turbopack bundle le module au lieu de le laisser en
  // `require()` runtime — l'ID de module généré ne correspond plus à ce que
  // Playwright résout au chargement, d'où l'échec observé sur TOUS les
  // exports (/api/export) après le déploiement du 16 sept. (commit 67db401).
  serverExternalPackages: ["sharp", "onnxruntime-node", "playwright"],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // Finding 1.7 (AUDIT-PRODUCTION-READINESS, 15 sept. 2026) — même correctif
  // que RADAR/next.config.ts, voir le commentaire là-bas.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};

export default nextConfig;
