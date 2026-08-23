import { getDb } from './db';

export interface StyleRule {
  id: number;
  banned: string;
  expected: string;
  is_active: number;
  usage_count: number;
  created_at: string;
  last_used_at: string | null;
}

export interface StyleRuleInput {
  banned: string;
  expected: string;
}

// TODO: seuil provisoire (15 règles) — CLAUDE.md §4.3 : à calibrer une fois le
// nombre de règles réelles connu. Évite qu'un guide de style trop long ne
// dilue ou n'embrouille le prompt système.
const MAX_RULES_IN_PROMPT = 15;

export function getStyleRules(): StyleRule[] {
  const db = getDb();
  return db.prepare('SELECT * FROM style_rules ORDER BY created_at DESC').all() as StyleRule[];
}

export function getStyleRule(id: number): StyleRule | null {
  const db = getDb();
  return db.prepare('SELECT * FROM style_rules WHERE id = ?').get(id) as StyleRule | null;
}

export function addStyleRule(input: StyleRuleInput): StyleRule {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO style_rules (banned, expected)
    VALUES (?, ?)
  `).run(input.banned.trim(), input.expected.trim());

  return db.prepare('SELECT * FROM style_rules WHERE id = ?').get(result.lastInsertRowid) as StyleRule;
}

export function setStyleRuleActive(id: number, isActive: boolean): void {
  const db = getDb();
  db.prepare('UPDATE style_rules SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);
}

export function updateStyleRule(id: number, input: Partial<StyleRuleInput>): void {
  const db = getDb();
  if (input.banned !== undefined) {
    db.prepare('UPDATE style_rules SET banned = ? WHERE id = ?').run(input.banned.trim(), id);
  }
  if (input.expected !== undefined) {
    db.prepare('UPDATE style_rules SET expected = ? WHERE id = ?').run(input.expected.trim(), id);
  }
}

export function deleteStyleRule(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM style_rules WHERE id = ?').run(id);
}

/**
 * Règles injectées dans le prompt système du LLM — "Prompt as Data".
 * Ordonnées par usage puis récence, plafonnées à MAX_RULES_IN_PROMPT pour
 * garder le prompt système stable même si le guide grossit (§4.3 CLAUDE.md).
 */
export function getActiveStyleRulesForPrompt(): StyleRule[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM style_rules
    WHERE is_active = 1
    ORDER BY usage_count DESC, created_at DESC
    LIMIT ?
  `).all(MAX_RULES_IN_PROMPT) as StyleRule[];
}

export function recordStyleRuleUsage(ids: number[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(`
    UPDATE style_rules SET usage_count = usage_count + 1, last_used_at = datetime('now') WHERE id = ?
  `);
  const tx = db.transaction((ruleIds: number[]) => {
    for (const id of ruleIds) stmt.run(id);
  });
  tx(ids);
}

export function formatStyleRulesForPrompt(rules: StyleRule[]): string {
  if (rules.length === 0) return '';
  const lines = rules.map(r => `- Ne jamais écrire "${r.banned}" → utiliser "${r.expected}" à la place`);
  return `RÈGLES DYNAMIQUES DU GUIDE DE STYLE (ajoutées par la rédaction en chef):\n${lines.join('\n')}`;
}
