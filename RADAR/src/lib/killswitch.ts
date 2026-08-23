import { getDb } from './db';

// Seuil explicitement fixé par la rédaction en chef (Étape 3.3 du Garde-Fou) :
// 3 rejets consécutifs = suspicion de dégradation silencieuse du modèle LLM.
const CONSECUTIVE_REJECTIONS_THRESHOLD = 3;

export interface DecisionRecord {
  id: number;
  article_id: number;
  decision: 'validated' | 'rejected';
  created_at: string;
}

export interface DegradedModeStatus {
  degraded: boolean;
  consecutiveRejections: number;
  threshold: number;
  lastDecisions: DecisionRecord[];
}

export function recordDecision(articleId: number, decision: 'validated' | 'rejected'): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO article_decisions (article_id, decision)
    VALUES (?, ?)
  `).run(articleId, decision);
}

export function getDegradedModeStatus(): DegradedModeStatus {
  const db = getDb();
  const lastDecisions = db.prepare(`
    SELECT * FROM article_decisions ORDER BY created_at DESC, id DESC LIMIT ?
  `).all(CONSECUTIVE_REJECTIONS_THRESHOLD) as DecisionRecord[];

  // lastDecisions est trié du plus récent au plus ancien : on compte la série
  // de rejets consécutifs en partant du plus récent.
  let consecutiveRejections = 0;
  for (const d of lastDecisions) {
    if (d.decision !== 'rejected') break;
    consecutiveRejections++;
  }

  return {
    degraded: consecutiveRejections >= CONSECUTIVE_REJECTIONS_THRESHOLD,
    consecutiveRejections,
    threshold: CONSECUTIVE_REJECTIONS_THRESHOLD,
    lastDecisions,
  };
}
