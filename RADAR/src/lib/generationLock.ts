/**
 * Garde-fou en mémoire (process unique, pas de nouvelle dépendance —
 * RADAR/CLAUDE.md §3) contre les générations LLM dupliquées.
 *
 * Trouvé le 15 sept. 2026 : le timeout CLIENT (`apiFetch`) est plus court
 * que la durée réelle d'une génération (30s-2min, RADAR/CLAUDE.md §11) et
 * abandonner la connexion côté client n'arrête jamais le calcul côté
 * serveur. Sans garde-fou, un utilisateur qui voit un faux timeout et
 * clique à nouveau sur "Générer" déclenche un DEUXIÈME appel LLM en
 * parallèle du premier, toujours en cours — double coût sur un quota
 * partagé par toute l'équipe (30 req/min Groq gratuites). Ce verrou
 * mémoire, scindé par `kind` (brief/article/refine) et par id, refuse la
 * requête dupliquée avec un message clair plutôt que de la laisser partir.
 */
export class AlreadyGeneratingError extends Error {
  constructor() {
    super('Génération déjà en cours pour cet élément — patientez, le résultat apparaîtra automatiquement.');
    this.name = 'AlreadyGeneratingError';
  }
}

const inFlight = new Map<string, Set<number>>();

export function tryAcquireGenerationLock(kind: string, id: number): boolean {
  let set = inFlight.get(kind);
  if (!set) {
    set = new Set();
    inFlight.set(kind, set);
  }
  if (set.has(id)) return false;
  set.add(id);
  return true;
}

export function releaseGenerationLock(kind: string, id: number): void {
  inFlight.get(kind)?.delete(id);
}
