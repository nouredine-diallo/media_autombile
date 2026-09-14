import { getDb } from './db';
import { updateArticleStatus } from './articles';
import { recordDecision } from './killswitch';
import { generateArticleDeadlines } from './calendar';
import { getBestImageForEvent } from './visualSearch';
import { triggerAutoGenerate } from './studioAutoGenerate';

/**
 * Tout ce qui doit se produire quand un article passe à 'validated' —
 * extrait de `PATCH /api/generate` (2026-08-29) pour être réutilisable par
 * l'auto-validation du matin (`autoGenerate.ts`) sans dupliquer la séquence
 * déjà écrite pour le clic humain "Valider". Les deux appelants ne diffèrent
 * que par `method` — tout le reste (créneau, déclenchement du visuel STUDIO)
 * est rigoureusement identique, pour que l'écran de confirmation se comporte
 * pareil quel que soit qui a validé.
 *
 * Retourne `true` si cet appel a réellement effectué la validation, `false`
 * si l'article était déjà validé (finding D5, audit 2026-09-07) — dans ce
 * cas tous les effets de bord ci-dessous (décision, créneau, déclenchement
 * STUDIO) sont sautés : les avoir déjà exécutés une première fois suffit,
 * les rejouer produirait un second export Drive du même article.
 */
export function finalizeArticleValidation(
  articleId: number,
  method: 'humain' | 'auto_score',
): boolean {
  const db = getDb();

  const applied = updateArticleStatus(articleId, 'validated');
  if (!applied) {
    return false;
  }
  recordDecision(articleId, 'validated', method);
  db.prepare(`UPDATE articles SET validated_by = ? WHERE id = ?`).run(method, articleId);

  // Anticipe le besoin : dès la validation, une échéance de publication
  // apparaît au calendrier — idempotent (ne crée rien si déjà fait).
  generateArticleDeadlines();

  // Parcours "un seul geste de décision" : préparer automatiquement le
  // visuel STUDIO. Fire-and-forget — ne doit jamais retarder l'appelant.
  // Sauté sans bruit si l'article n'a ni content_id ni visuel source (cas
  // déjà géré par le bouton manuel "Créer un post" existant sur /ready).
  const article = db.prepare(
    `SELECT content_id, event_id, title FROM articles WHERE id = ?`
  ).get(articleId) as { content_id: string | null; event_id: number; title: string } | undefined;
  if (article?.content_id) {
    const imageUrl = getBestImageForEvent(article.event_id);
    if (imageUrl) {
      triggerAutoGenerate(articleId, article.content_id, article.title, imageUrl).catch((err) => {
        console.error('[validation] triggerAutoGenerate a levé une exception:', err);
      });
    }
  }

  return true;
}
