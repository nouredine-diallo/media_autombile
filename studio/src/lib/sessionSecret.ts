/**
 * Résolution du secret de session — même correctif que
 * RADAR/src/lib/sessionSecret.ts (finding 1.4, AUDIT-PRODUCTION-READINESS
 * du 15 sept. 2026) : avant ce fichier, `session.ts` retombait
 * silencieusement sur une chaîne codée en dur si `SESSION_SECRET` était
 * absent — jamais un throw, alors que ce même secret matérialise la
 * session partagée RADAR↔STUDIO en prod.
 *
 * Résolution PARESSEUSE (fonction, pas une constante top-level) : `next
 * build` évalue les modules avant que le vrai `.env` soit chargé — un
 * throw à l'évaluation du module casserait le build.
 */
const DEV_FALLBACK_SECRET =
  "fallback-very-long-secret-key-that-is-32-bytes-at-least-123456789";

export function getSessionSecretBytes(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 32) {
    return new TextEncoder().encode(secret.padEnd(32, "0"));
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET manquant ou trop court (< 32 caractères) — obligatoire en production. " +
        "Génère-en un avec `openssl rand -base64 32` et configure-le dans l'environnement du process (voir provision-oracle.sh).",
    );
  }

  // Dev/local uniquement — jamais en production (le throw ci-dessus l'empêche).
  return new TextEncoder().encode(DEV_FALLBACK_SECRET.padEnd(32, "0"));
}
