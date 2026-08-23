import { getDb, Event, Item } from './db';

export interface Correction {
  id: number;
  article_id: number;
  generated_text: string;
  corrected_text: string;
  correction_type: string | null;
  pattern_observed: string | null;
  notes: string | null;
  created_at: string;
}

export interface CorrectionInput {
  article_id: number;
  generated_text: string;
  corrected_text: string;
  correction_type?: string;
  pattern_observed?: string;
  notes?: string;
}

export interface PatternAnalysis {
  total_corrections: number;
  patterns: Array<{
    pattern: string;
    count: number;
    examples: Array<{
      generated: string;
      corrected: string;
    }>;
  }>;
  type_distribution: Array<{
    type: string;
    count: number;
  }>;
}

export function addCorrection(input: CorrectionInput): Correction {
  const db = getDb();
  
  const result = db.prepare(`
    INSERT INTO corrections (article_id, generated_text, corrected_text, correction_type, pattern_observed, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    input.article_id,
    input.generated_text,
    input.corrected_text,
    input.correction_type || null,
    input.pattern_observed || null,
    input.notes || null
  );
  
  return db.prepare('SELECT * FROM corrections WHERE id = ?').get(result.lastInsertRowid) as Correction;
}

export function getCorrections(articleId?: number): Correction[] {
  const db = getDb();
  
  if (articleId) {
    return db.prepare('SELECT * FROM corrections WHERE article_id = ? ORDER BY created_at DESC').all(articleId) as Correction[];
  }
  
  return db.prepare('SELECT * FROM corrections ORDER BY created_at DESC').all() as Correction[];
}

export function getCorrection(id: number): Correction | null {
  const db = getDb();
  return db.prepare('SELECT * FROM corrections WHERE id = ?').get(id) as Correction | null;
}

export function deleteCorrection(id: number): void {
  const db = getDb();
  db.prepare('DELETE FROM corrections WHERE id = ?').run(id);
}

export function analyzePatterns(): PatternAnalysis {
  const db = getDb();
  
  const corrections = db.prepare('SELECT * FROM corrections ORDER BY created_at DESC').all() as Correction[];
  
  // Count patterns
  const patternCounts = new Map<string, { count: number; examples: Array<{ generated: string; corrected: string }> }>();
  
  for (const correction of corrections) {
    const pattern = correction.pattern_observed || 'Non classé';
    const existing = patternCounts.get(pattern) || { count: 0, examples: [] };
    existing.count++;
    if (existing.examples.length < 3) {
      existing.examples.push({
        generated: correction.generated_text.substring(0, 100),
        corrected: correction.corrected_text.substring(0, 100),
      });
    }
    patternCounts.set(pattern, existing);
  }
  
  // Convert to array and sort by count
  const patterns = Array.from(patternCounts.entries())
    .map(([pattern, data]) => ({
      pattern,
      ...data,
    }))
    .sort((a, b) => b.count - a.count);
  
  // Count types
  const typeCounts = new Map<string, number>();
  for (const correction of corrections) {
    const type = correction.correction_type || 'Non classé';
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }
  
  const type_distribution = Array.from(typeCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  
  return {
    total_corrections: corrections.length,
    patterns,
    type_distribution,
  };
}

export function exportCorrectionsCSV(): string {
  const db = getDb();
  const corrections = db.prepare(`
    SELECT c.*, a.title as article_title 
    FROM corrections c 
    JOIN articles a ON c.article_id = a.id 
    ORDER BY c.created_at DESC
  `).all() as (Correction & { article_title: string })[];
  
  const header = 'ID,Article,Texte généré,Texte corrigé,Type,Pattern,Notes,Date\n';
  const rows = corrections.map(c => 
    `${c.id},"${c.article_title}","${c.generated_text.replace(/"/g, '""')}","${c.corrected_text.replace(/"/g, '""')}","${c.correction_type || ''}","${c.pattern_observed || ''}","${c.notes || ''}","${c.created_at}"`
  ).join('\n');
  
  return header + rows;
}
