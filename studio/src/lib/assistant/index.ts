import "server-only";
import { starterChips, answerQuery, getFicheById } from "./intents";
import { STUDIO_KNOWLEDGE, STUDIO_STARTERS } from "./knowledge";
import type { AssistantFiche } from "./intents";

// STUDIO n'a pas de token cross-app : les liens des fiches sont relatifs
// et pointent vers les pages internes de l'app. À l'inverse de RADAR, il
// n'y a donc aucune résolution d'URL au démarrage.

export const STUDIO_KNOWLEDGE_RESOLVED: AssistantFiche[] = STUDIO_KNOWLEDGE;

export function getStudioStarters(): AssistantFiche[] {
  return starterChips(STUDIO_KNOWLEDGE_RESOLVED, STUDIO_STARTERS);
}

export function getStudioFiche(id: string): AssistantFiche | null {
  return getFicheById(STUDIO_KNOWLEDGE_RESOLVED, id);
}

export { answerQuery };
export type { AssistantFiche };