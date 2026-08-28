import { getStudioUrl } from "@/lib/studio-prefill";
import { answerQuery, getFicheById, starterChips } from "./intents";
import {
  RADAR_KNOWLEDGE,
  RADAR_STARTERS,
  STUDIO_LINK,
} from "./knowledge";
import type { AssistantFiche } from "./intents";

/**
 * Résout le token `$STUDIO` des fiches avec l'URL réelle de STUDIO
 * (NEXT_PUBLIC_STUDIO_URL > STUDIO_URL > fallback) — fait en une seule
 * passe au démarrage, côté serveur uniquement (module sous `server-only`).
 */
export function resolveKnowledge(linkToken: string): AssistantFiche[] {
  const studioUrl = getStudioUrl();
  return RADAR_KNOWLEDGE.map((fiche) => {
    if (fiche.link?.href.startsWith(linkToken)) {
      return {
        ...fiche,
        link: {
          ...fiche.link,
          href: fiche.link.href.replace(linkToken, studioUrl),
        },
      };
    }
    return fiche;
  });
}

export const RADAR_KNOWLEDGE_RESOLVED = resolveKnowledge(STUDIO_LINK);

export function getRadarStarters(): AssistantFiche[] {
  return starterChips(RADAR_KNOWLEDGE_RESOLVED, RADAR_STARTERS);
}

export function getRadarFiche(id: string): AssistantFiche | null {
  return getFicheById(RADAR_KNOWLEDGE_RESOLVED, id);
}

export { answerQuery };
export type { AssistantFiche };