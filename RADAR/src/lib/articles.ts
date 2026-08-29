import { getDb, Event } from './db';
import { getBrief, Brief } from './brief';
import { generateChained, generateArticleSmart } from './llm';
import { getActiveStyleRulesForPrompt, recordStyleRuleUsage, formatStyleRulesForPrompt } from './styleRules';
import { getDegradedModeStatus } from './killswitch';
import { verifyArticleAgainstBrief, VerificationResult } from './verification';

export interface Article {
  id: number;
  content_id: string | null;
  event_id: number;
  brief_id: number;
  title: string;
  chapeau: string | null;
  content: string;
  meta_description: string | null;
  word_count: number;
  status: string;
  verification_score: number | null;
  verification_issues: string | null;
  provenance: string;
  generated_at: string;
  validated_at: string | null;
  published_at: string | null;
}

export class DegradedModeError extends Error {
  constructor() {
    super('Mode dégradé actif : génération LLM suspendue après rejets consécutifs.');
    this.name = 'DegradedModeError';
  }
}

export async function generateArticle(eventId: number, provenance: string = 'assisté'): Promise<Article | null> {
  const db = getDb();

  // Kill-switch (Étape 3.3) : si le rédacteur en chef a rejeté plusieurs
  // articles d'affilée, on suspend les appels LLM plutôt que de continuer à
  // produire du contenu potentiellement halluciné.
  if (getDegradedModeStatus().degraded) {
    throw new DegradedModeError();
  }

  // Get or generate brief
  let brief = getBrief(eventId);
  if (!brief) {
    // Import and generate brief
    const { generateBrief } = await import('./brief');
    brief = await generateBrief(eventId);
    if (!brief) return null;
  }

  // Build prompt from brief
  const briefData = {
    headline: brief.headline,
    lede: brief.lede || '',
    body: brief.body || '',
    facts: brief.facts || [],
    angle_suggestion: brief.angle_suggestion || '',
  };

  // "Prompt as Data" (Étape 3.2) : règles ajoutées par la rédacteur en chef via /style-guide
  const styleRules = getActiveStyleRulesForPrompt();
  const extraStyleRules = formatStyleRulesForPrompt(styleRules);

  // Pipeline intelligent : détection de type → few-shot → génération chaînée
  // Essaie d'abord la chaîne (2 passes, meilleure qualité), fallback sur 1 passe
  let response;
  try {
    response = await generateChained(briefData, extraStyleRules || undefined);
  } catch {
    // Fallback : génération directe (1 passe, plus rapide)
    response = await generateArticleSmart(briefData, extraStyleRules || undefined);
  }

  let parsed = parseGeneratedArticle(response.content);
  if (parsed.wordCount < 10 && response.content.length < 100) {
    // Model returned empty/buggy content — retry once with direct generation
    response = await generateArticleSmart(briefData, extraStyleRules || undefined);
    parsed = parseGeneratedArticle(response.content);
  }

  if (styleRules.length > 0) {
    recordStyleRuleUsage(styleRules.map(r => r.id));
  }

  // Supprimer les brouillons existants pour cet événement avant de créer le nouvel article
  db.pragma('foreign_keys = OFF');
  db.prepare('DELETE FROM articles WHERE event_id = ? AND status = ?').run(eventId, 'draft');
  db.pragma('foreign_keys = ON');

  // Store article in database
  const contentId = `LMA-ART-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const result = db.prepare(`
    INSERT INTO articles (content_id, event_id, brief_id, title, chapeau, content, meta_description, word_count, status, provenance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)
  `).run(
    contentId,
    eventId,
    brief.id,
    parsed.title,
    parsed.chapeau,
    parsed.content,
    parsed.metaDescription,
    parsed.wordCount,
    provenance
  );

  return db.prepare('SELECT * FROM articles WHERE id = ?').get(result.lastInsertRowid) as Article;
}

/**
 * Génère un article puis exécute immédiatement le contrôle numérique
 * (`verifyArticleAgainstBrief`) et l'enregistre — auparavant dupliqué entre
 * `POST /api/generate` et le chantier de génération automatique du matin.
 * Une seule fonction, un seul chemin, réutilisée par les deux (§chantier 3
 * du plan écosystème 2026-08-27).
 */
export async function generateAndVerifyArticle(
  eventId: number,
  provenance: string = 'assisté',
): Promise<{ article: Article; verification: VerificationResult } | null> {
  const article = await generateArticle(eventId, provenance);
  if (!article) return null;

  const brief = getBrief(eventId);
  if (!brief) return { article, verification: { numbersVerified: [], numbersMissing: [], numbersAdded: [], confidenceScore: 0, issues: [] } };

  const verification = verifyArticleAgainstBrief(brief, article.content, article.title);
  const db = getDb();
  db.prepare(`UPDATE articles SET verification_score = ?, verification_issues = ? WHERE id = ?`)
    .run(verification.confidenceScore, JSON.stringify(verification.issues), article.id);

  return {
    article: { ...article, verification_score: verification.confidenceScore, verification_issues: JSON.stringify(verification.issues) },
    verification,
  };
}

/**
 * Mode Dégradé (Étape 3.3) : création manuelle d'un article vide à partir du
 * brief, sans appel LLM. Le rédacteur rédige directement dans l'interface de
 * revue à partir des faits validés de la colonne Brief.
 */
export function createManualArticle(eventId: number): Article | null {
  const db = getDb();
  const brief = getBrief(eventId);
  if (!brief) return null;

  const contentId = `LMA-ART-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const result = db.prepare(`
    INSERT INTO articles (content_id, event_id, brief_id, title, chapeau, content, meta_description, word_count, status, provenance)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'humain')
  `).run(
    contentId,
    eventId,
    brief.id,
    brief.headline,
    brief.lede || null,
    '',
    null,
    0
  );

  return db.prepare('SELECT * FROM articles WHERE id = ?').get(result.lastInsertRowid) as Article;
}

function parseGeneratedArticle(content: string): {
  title: string;
  chapeau: string | null;
  content: string;
  metaDescription: string | null;
  wordCount: number;
} {
  const lines = content.split('\n').filter(l => l.trim());
  
  let title = '';
  let chapeau: string | null = null;
  const bodyLines: string[] = [];
  let metaDescription: string | null = null;

  // Clean markdown formatting and label prefixes
  const cleanLine = (line: string): string => {
    return line
      .replace(/\*\*/g, '')           // Remove **bold** markers
      .replace(/^#+\s*/, '')          // Remove ### headers
      .replace(/^Titre\s*:\s*/i, '')  // Remove "Titre:" prefix
      .replace(/^Chapô\s*:\s*/i, '')  // Remove "Chapô:" prefix
      .replace(/^Chapeau\s*:\s*/i, '')// Remove "Chapeau:" prefix
      .trim();
  };
  
  // Extract title (first non-empty line)
  for (const line of lines) {
    const cleaned = cleanLine(line);
    if (cleaned && !title) {
      title = cleaned;
      continue;
    }
    if (title && !chapeau && cleaned.length > 20 && cleaned.length < 300) {
      chapeau = cleaned;
      continue;
    }
    if (title) {
      bodyLines.push(line);
    }
  }
  
  // If no title was extracted, try first line as title regardless
  if (!title && lines.length > 0) {
    title = cleanLine(lines[0]);
    // Put remaining lines as body
    for (let i = 1; i < lines.length; i++) {
      bodyLines.push(lines[i]);
    }
  }
  
  // Generate meta description from first paragraph
  if (chapeau) {
    metaDescription = chapeau.substring(0, 155) + (chapeau.length > 155 ? '...' : '');
  }
  
  const bodyContent = bodyLines.join('\n\n');
  const wordCount = bodyContent.split(/\s+/).filter(w => w.length > 0).length;
  
  return {
    title: title || 'Titre non généré',
    chapeau,
    content: bodyContent,
    metaDescription,
    wordCount,
  };
}

export function getArticles(eventId?: number): Article[] {
  const db = getDb();
  
  if (eventId) {
    return db.prepare('SELECT * FROM articles WHERE event_id = ? ORDER BY generated_at DESC').all(eventId) as Article[];
  }
  
  return db.prepare('SELECT * FROM articles ORDER BY generated_at DESC').all() as Article[];
}

export function getArticle(id: number): Article | null {
  const db = getDb();
  return db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as Article | null;
}

export function updateArticleStatus(id: number, status: string): void {
  const db = getDb();

  if (status === 'validated') {
    // Un article "assisté" (généré par LLM) devient "généré-relu" une fois
    // validé par un humain — traçabilité de provenance exigée par CLAUDE.md §6.
    db.prepare(`
      UPDATE articles
      SET status = ?, validated_at = datetime('now'),
          provenance = CASE WHEN provenance = 'assisté' THEN 'généré-relu' ELSE provenance END
      WHERE id = ?
    `).run(status, id);
  } else {
    db.prepare('UPDATE articles SET status = ? WHERE id = ?').run(status, id);
  }
}
