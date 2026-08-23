import { getDb } from './db';

export interface AutoTagResult {
  tag: string;
  pattern: string;
}

const TAG_RULES: { tag: string; patterns: RegExp[] }[] = [
  { tag: 'Électrique', patterns: [/\b(EV|bZ4X|électrique|electrique|autonomie|borne|recharge|kWh|hybride rechargeable)\b/i] },
  { tag: 'Toyota', patterns: [/\b(Toyota|Lexus)\b/i] },
  { tag: 'Peugeot', patterns: [/\b(Peugeot|e-208|e-2008|e-308|e-3008|e-5008)\b/i] },
  { tag: 'Renault', patterns: [/\b(Renault|Mégane E-Tech|Scenic E-Tech|Austral|R5 E-Tech)\b/i] },
  { tag: 'Stellantis', patterns: [/\b(Stellantis|Opel|Fiat|Jeep|Citroën|DS|Alfa Romeo|Maserati)\b/i] },
  { tag: 'Volkswagen', patterns: [/\b(Volkswagen|Audi|Porsche|Seat|Cupra)\b/i] },
  { tag: 'BMW', patterns: [/\b(BMW|Mini)\b/i] },
  { tag: 'Mercedes', patterns: [/\b(Mercedes|AMG)\b/i] },
  { tag: 'Hyundai-Kia', patterns: [/\b(Hyundai|Kia|Ioniq|EV6)\b/i] },
  { tag: 'Sécurité', patterns: [/\b(NCAP|sécurité|airbag|rappel|frein|collision|protéger)\b/i] },
  { tag: 'Ventes', patterns: [/\b(ventes|chiffre|montée|baisse|marché|part de marché|immatriculation)\b/i] },
  { tag: 'Concept', patterns: [/\b(concept|prototype|futur|vision|showcar)\b/i] },
  { tag: 'Sport', patterns: [/\b(GTI|RS|AMG|M Performance|cupra|sport|turbo)\b/i] },
  { tag: 'Prix', patterns: [/\b(prix|€|euros|tarif|coût)\b/i] },
  { tag: 'Réglementation', patterns: [/\b(CO2|émission|norme|Euro 7|réglementation|ZFE)\b/i] },
  { tag: 'IA', patterns: [/\b(IA|intelligence artificielle|autonome|conduite autonome|ADAS)\b/i] },
];

export function extractAutoTags(text: string): AutoTagResult[] {
  const results: AutoTagResult[] = [];
  const seen = new Set<string>();

  for (const rule of TAG_RULES) {
    if (seen.has(rule.tag)) continue;
    for (const pattern of rule.patterns) {
      if (pattern.test(text)) {
        results.push({ tag: rule.tag, pattern: pattern.source });
        seen.add(rule.tag);
        break;
      }
    }
  }

  return results;
}

export function autoTagEvent(eventId: number, title: string, summary: string | null): string[] {
  const db = getDb();
  const text = `${title} ${summary || ''}`;
  const tags = extractAutoTags(text);

  const insert = db.prepare("INSERT OR IGNORE INTO event_tags (event_id, tag) VALUES (?, ?)");
  const tagNames: string[] = [];

  for (const t of tags) {
    insert.run(eventId, t.tag);
    tagNames.push(t.tag);
  }

  return tagNames;
}

export function getEventTags(eventId: number): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT tag FROM event_tags WHERE event_id = ? ORDER BY tag").all(eventId) as { tag: string }[];
  return rows.map(r => r.tag);
}

export function removeEventTag(eventId: number, tag: string): void {
  const db = getDb();
  db.prepare("DELETE FROM event_tags WHERE event_id = ? AND tag = ?").run(eventId, tag);
}
