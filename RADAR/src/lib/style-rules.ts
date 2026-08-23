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

export function getAllRules(): StyleRule[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM style_rules ORDER BY is_active DESC, usage_count DESC, created_at DESC'
  ).all() as StyleRule[];
}

export function getActiveRules(): StyleRule[] {
  const db = getDb();
  // Only load top 15 active rules (most recent or most used)
  return db.prepare(`
    SELECT * FROM style_rules
    WHERE is_active = 1
    ORDER BY usage_count DESC, created_at DESC
    LIMIT 15
  `).all() as StyleRule[];
}

export function addRule(banned: string, expected: string): StyleRule {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO style_rules (banned, expected) VALUES (?, ?)
  `).run(banned, expected);

  return db.prepare(
    'SELECT * FROM style_rules WHERE id = ?'
  ).get(result.lastInsertRowid) as StyleRule;
}

export function updateRule(id: number, updates: Partial<{ banned: string; expected: string; is_active: number }>): void {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | number)[] = [];

  if (updates.banned !== undefined) { sets.push('banned = ?'); values.push(updates.banned); }
  if (updates.expected !== undefined) { sets.push('expected = ?'); values.push(updates.expected); }
  if (updates.is_active !== undefined) { sets.push('is_active = ?'); values.push(updates.is_active); }

  if (sets.length === 0) return;
  values.push(id);

  db.prepare(`UPDATE style_rules SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

export function deleteRule(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM style_rules WHERE id = ?').run(id);
}

export function incrementUsage(id: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE style_rules SET usage_count = usage_count + 1, last_used_at = datetime('now')
    WHERE id = ?
  `).run(id);
}

export function buildStyleRulesPrompt(): string {
  const rules = getActiveRules();
  if (rules.length === 0) return '';

  const lines = rules.map(r => `- Remplacer "${r.banned}" par "${r.expected}"`);
  return `\nRÈGLES DE STYLE PERSONNALISÉES:\n${lines.join('\n')}`;
}
