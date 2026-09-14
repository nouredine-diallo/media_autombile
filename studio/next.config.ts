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
  serverExternalPackages: ["sharp", "onnxruntime-node"],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};

export default nextConfig;
