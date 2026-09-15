import { timingSafeEqual } from "node:crypto";

/**
 * Extrait de src/app/actions/auth.ts (2026-09-15, Partie 2 de
 * AUDIT-PRODUCTION-READINESS) pour être testable par un vrai test unitaire
 * (`node --test`) sans dépendre du runtime "use server" de Next.js. Zéro
 * dépendance ajoutée (node:crypto est natif) — cohérent avec RADAR/CLAUDE.md §3.
 */

/**
 * Finding 1.2 : `X-Forwarded-For` posé par nginx via
 * `$proxy_add_x_forwarded_for` AJOUTE le vrai IP au header existant plutôt
 * que de le remplacer — le premier segment reste celui envoyé par le
 * client, entièrement falsifiable. `X-Real-IP: $remote_addr` est posé par
 * nginx sans jamais reprendre de valeur client. Priorité : x-real-ip
 * d'abord, x-forwarded-for seulement en repli (dev local sans nginx devant).
 */
export function getClientIp(headersList: Headers): string {
  const realIp = headersList.get("x-real-ip");
  if (realIp) return realIp.trim();
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

/**
 * Finding 1.5 : comparaison constant-time pour éviter la fuite de longueur/
 * contenu par le temps de traitement (CWE-208).
 */
export function passwordMatches(candidate: string, expected: string): boolean {
  if (!expected) return false; // AUTH_PASSWORD absent/vide : jamais un match
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(a, a); // maintient un temps constant même sur une longueur différente
    return false;
  }
  return timingSafeEqual(a, b);
}
