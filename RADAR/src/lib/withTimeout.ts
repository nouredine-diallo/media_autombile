/**
 * Trouvé le 14 sept. 2026 (event 171948, Bring a Trailer) puis généralisé le
 * 15 sept. : plusieurs routes lancent un calcul qui peut légitimement durer
 * jusqu'à 2 min (génération LLM chaînée, traduction locale) sans aucune
 * limite — le seul filet était le timeout CLIENT (`apiFetch`), qui abandonne
 * la connexion sans jamais arrêter le calcul serveur en cours. Résultat
 * observé : le navigateur affiche un timeout, l'utilisateur croit à un
 * échec, mais le brief/article se termine quand même en tâche de fond et
 * apparaît au prochain chargement — confus, et incite à réessayer par-dessus
 * un calcul déjà en cours (voir `generationLock.ts`).
 *
 * Ce timeout ne libère PAS le CPU déjà engagé (Node ne peut pas interrompre
 * un calcul synchrone en cours) — il garantit seulement qu'une réponse HTTP
 * claire part avant que le client n'abandonne de son côté, plutôt que de
 * laisser le client couper en premier avec un message générique.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms)),
  ]);
}
