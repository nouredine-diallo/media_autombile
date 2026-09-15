import path from "node:path";

/**
 * Finding 1.6 (AUDIT-PRODUCTION-READINESS, 15 sept. 2026) : un `startsWith`
 * nu sur un chemin résolu accepte à tort un répertoire frère dont le nom
 * partage le même préfixe (ex. "drive-sync-old" passerait pour
 * "drive-sync"). Extrait de src/app/api/drive/file/route.ts pour être
 * testable — vérifié par test unitaire, pas seulement par lecture de code.
 */
export function isPathWithinAllowedDirs(resolvedPath: string, allowedDirs: string[]): boolean {
  return allowedDirs.some(
    (dir) => resolvedPath === dir || resolvedPath.startsWith(dir + path.sep),
  );
}
