import "server-only";

export interface LookupFact {
  text: string;
  source_title: string;
}

/**
 * Enrichissement optionnel (chantier "P3", 15 sept. 2026) : avant de générer
 * des titres à partir d'un simple thème (mode 2, aucun brief — voir
 * router.ts), on demande à RADAR s'il a déjà ingéré une actualité qui
 * recoupe ce thème, pour donner au LLM de VRAIS faits plutôt que de le
 * laisser en inventer.
 *
 * Timeout volontairement court (600ms) : cet appel s'ajoute au chemin
 * critique de CHAQUE génération de titre — un timeout généreux dégraderait
 * l'expérience STUDIO pour tout le monde à chaque panne/lenteur RADAR,
 * exactement ce qu'on vient de corriger côté RADAR (P1). Même principe que
 * `notifyRadarExported` (runExport.ts) : RADAR_URL absent, injoignable, lent
 * ou sans résultat → tableau vide, jamais une erreur qui remonterait à
 * l'utilisateur. STUDIO doit rester utilisable sans RADAR (studio/CLAUDE.md
 * §1 : "RADAR n'existe pas et ne doit jamais être un prérequis silencieux").
 */
export async function lookupFactsFromRadar(theme: string): Promise<LookupFact[]> {
  const radarUrl = process.env.RADAR_URL;
  if (!radarUrl) return [];

  try {
    const res = await fetch(`${radarUrl}/api/facts-lookup?theme=${encodeURIComponent(theme)}`, {
      signal: AbortSignal.timeout(600),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.facts) ? data.facts : [];
  } catch {
    return [];
  }
}
