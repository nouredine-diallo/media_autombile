import { getDb } from './db';

// Seuil explicitement fixé par la rédaction en chef (Étape 3.3 du Garde-Fou) :
// 3 rejets consécutifs = suspicion de dégradation silencieuse du modèle LLM.
const CONSECUTIVE_REJECTIONS_THRESHOLD = 3;

// Fenêtre glissante pour le taux de confiance de l'auto-validation (B) —
// plan écosystème 2026-08-30. 30 jours : assez large pour lisser le bruit
// d'un seul mauvais matin, assez court pour rester pertinent si le seuil
// 85/85 est ajusté entre-temps.
const TRUST_WINDOW_DAYS = 30;

export type DecisionSourceMethod = 'humain' | 'auto_score';

export interface DecisionRecord {
  id: number;
  article_id: number;
  decision: 'validated' | 'rejected';
  source_method: DecisionSourceMethod | null;
  created_at: string;
}

export interface DegradedModeStatus {
  degraded: boolean;
  consecutiveRejections: number;
  threshold: number;
  lastDecisions: DecisionRecord[];
}

export interface AutoValidateTrust {
  total: number;
  rejected: number;
  confirmedRate: number;
  windowDays: number;
}

/**
 * `sourceMethod` capturé explicitement par l'appelant au moment de la
 * décision (pas dérivé après coup de `articles.validated_by`, qui reste un
 * champ métier réutilisable — un signal d'audit doit être écrit une fois,
 * à la source, pas recalculé depuis un champ qui peut changer de sens).
 */
export function recordDecision(
  articleId: number,
  decision: 'validated' | 'rejected',
  sourceMethod: DecisionSourceMethod,
): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO article_decisions (article_id, decision, source_method)
    VALUES (?, ?, ?)
  `).run(articleId, decision, sourceMethod);
}

/**
 * "85/85 est-il le bon seuil ?" — mesuré, pas estimé. `null` tant qu'aucune
 * auto-validation n'a encore eu de décision (rien à afficher plutôt qu'un
 * 0/0 trompeur).
 */
export function getAutoValidateTrust(): AutoValidateTrust | null {
  const db = getDb();
  // La fenêtre de 30j porte sur la date d'auto-validation (v), pas sur la
  // date du rejet — un rejet peut arriver après coup, et doit rester
  // rattaché à l'événement qu'il juge, pas compté/manqué selon sa propre
  // date à lui (sinon `rejected` peut dépasser `total` par construction).
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN EXISTS (
        SELECT 1 FROM article_decisions r
        WHERE r.article_id = v.article_id
          AND r.decision = 'rejected'
          AND r.source_method = 'auto_score'
      ) THEN 1 ELSE 0 END) as rejected
    FROM article_decisions v
    WHERE v.decision = 'validated'
      AND v.source_method = 'auto_score'
      AND v.created_at >= datetime('now', '-${TRUST_WINDOW_DAYS} days')
  `).get() as { total: number | null; rejected: number | null };

  const total = row.total ?? 0;
  if (total === 0) return null;

  const rejected = row.rejected ?? 0;
  return {
    total,
    rejected,
    confirmedRate: Math.round(((total - rejected) / total) * 100),
    windowDays: TRUST_WINDOW_DAYS,
  };
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
