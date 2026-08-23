import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // L'indicateur de dev de Next (pastille "N" en bas à gauche) était capturé
  // par Playwright et apparaissait dans les montages exportés — visible sur
  // tous les rendus produits jusqu'au 2026-08-21. Il n'a rien à faire dans un
  // visuel destiné à la publication.
  devIndicators: false,
};

export default nextConfig;
