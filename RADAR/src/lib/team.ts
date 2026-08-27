/**
 * Liste unique de la rédaction — partagée entre l'UI de sélection
 * (select-name/page.tsx) et la validation serveur (actions/auth.ts).
 * Réinitialisée le 2026-08-27 sur demande explicite : Daniel, Charlotte, Test
 * uniquement. `selectName()` ne validait aucun nom auparavant (n'importe
 * quelle chaîne passait), ce qui a probablement permis un nom hors liste
 * ("Alexandre") d'apparaître en session sans jamais être dans cette liste.
 */
export const TEAM_MEMBERS = ["Daniel", "Charlotte", "Test"] as const;
