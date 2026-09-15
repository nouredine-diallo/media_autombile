/**
 * Résolution du secret de session — un seul point de vérité, importé à la
 * fois par lib/session.ts (runtime Node) et middleware.ts (runtime edge,
 * d'où l'absence ici de "server-only"/next/headers). Avant ce fichier, la
 * même chaîne de repli codée en dur vivait dupliquée à 4 endroits
 * (session.ts RADAR+STUDIO, middleware.ts, google-auth.ts) — trouvé lors de
 * l'audit du 15 sept. 2026 (finding 1.4, AUDIT-PRODUCTION-READINESS) : rien
 * n'empêchait un déploiement mal configuré de tourner silencieusement sur
 * ce secret public plutôt que de planter bruyamment (RADAR/CLAUDE.md §6,
 * "aucune dégradation silencieuse"). Ce secret dérive aussi la clé de
 * chiffrement des tokens Google Drive (google-auth.ts) — un secret
 * compromis compromettait donc les deux.
 *
 * Résolution PARESSEUSE (fonction, pas une constante top-level) : `next
 * build` évalue les modules pour collecter les données de page avant que
 * start-radar.sh charge le vrai .env — un throw à l'évaluation du module
 * casserait le build même quand la variable est bien présente à
 * l'exécution (même piège déjà documenté pour GROQ_API_KEY dans
 * llmProvider.ts, résolu par le même pattern).
 */
const DEV_FALLBACK_SECRET =
  "fallback-very-long-secret-key-that-is-32-bytes-at-least-123456789";

export function getSessionSecretString(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET manquant ou trop court (< 32 caractères) — obligatoire en production. " +
        "Génère-en un avec `openssl rand -base64 32` et configure-le dans l'environnement du process (voir provision-oracle.sh).",
    );
  }

  // Dev/local uniquement — jamais en production (le throw ci-dessus l'empêche).
  return DEV_FALLBACK_SECRET;
}

export function getSessionSecretBytes(): Uint8Array {
  return new TextEncoder().encode(getSessionSecretString().padEnd(32, "0"));
}
