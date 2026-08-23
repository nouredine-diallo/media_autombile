/**
 * Surbrillance des données sensibles (Étape 3.1 du Garde-Fou).
 * Détection purement regex, exécutée côté client — aucun appel LLM, aucun
 * coût. Sert d'ancrage visuel pour le fact-checking humain, pas de source
 * de vérité : le brief reste la seule autorité factuelle (CLAUDE.md §1).
 */

export interface Segment {
  text: string;
  sensitive: boolean;
  start: number;
  end: number;
}

const MONTHS = 'janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre';
const UNITS = 'kWh|km\\/h|km|chevaux|ch|€|%|kg|Nm|cv|litres|portes?|places?|CO2';

const PATTERN = [
  // Dates écrites en français : "12 mars 2026"
  `\\b\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4}\\b`,
  // Dates ISO : 2026-03-12
  `\\b\\d{4}-\\d{2}-\\d{2}\\b`,
  // Dates JJ/MM/AAAA
  `\\b\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}\\b`,
  // Nombres avec unité technique/monétaire : "700 km", "34 500 €", "150 ch"
  `\\b\\d[\\d\\s.,]*\\s?(?:${UNITS})\\b`,
  // Nombres seuls : prix, années, quantités, désignations de modèle
  `\\b\\d+(?:[.,]\\d+)?\\b`,
  // Acronymes techniques : SUV, PHEV, GTI, NCAP, AMG...
  `\\b[A-Z]{2,6}\\b`,
].join('|');

function buildRegex(): RegExp {
  return new RegExp(PATTERN, 'g');
}

export function getHighlightSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const regex = buildRegex();
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), sensitive: false, start: lastIndex, end: match.index });
    }
    segments.push({ text: match[0], sensitive: true, start: match.index, end: match.index + match[0].length });
    lastIndex = match.index + match[0].length;
    if (match[0].length === 0) regex.lastIndex++;
  }

  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), sensitive: false, start: lastIndex, end: text.length });
  }

  return segments;
}

export function countSensitiveSegments(text: string): number {
  return getHighlightSegments(text).filter(s => s.sensitive).length;
}
