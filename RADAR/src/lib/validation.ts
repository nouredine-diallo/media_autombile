import { getDb } from './db';
import { updateArticleStatus } from './articles';
import { recordDecision } from './killswitch';
import { generateArticleDeadlines } from './calendar';
import { triggerAutoGeneratePreview } from './studioAutoGenerate';

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

  // Trouvé le 24 sept. 2026 (audit robustesse) : ces trois écritures
  // tournaient hors transaction — un crash entre la première et les
  // suivantes pouvait laisser un article `status='validated'` sans la ligne
  // `article_decisions` correspondante (fausse le calibrage §2bis) ou sans
  // `validated_by` renseigné (le seul champ qui distingue une validation
  // humaine d'une validation auto pour cette même exception). Une seule
  // transaction : soit les trois réussissent, soit aucune n'est appliquée.
  const applied = db.transaction(() => {
    if (!updateArticleStatus(articleId, 'validated')) return false;
    recordDecision(articleId, 'validated', method);
    db.prepare(`UPDATE articles SET validated_by = ? WHERE id = ?`).run(method, articleId);
    return true;
  })();
  if (!applied) {
    return false;
  }

  // Anticipe le besoin : dès la validation, une échéance de publication
  // apparaît au calendrier — idempotent (ne crée rien si déjà fait).
  generateArticleDeadlines();

  // Parcours "un seul geste de décision" : préparer automatiquement le
  // visuel STUDIO (single ou carrousel — décidé par triggerAutoGeneratePreview,
  // phase 4 du plan écosystème). Fire-and-forget — ne doit jamais retarder
  // l'appelant. Sauté sans bruit si l'article n'a pas de content_id (cas
  // déjà géré par le bouton manuel "Créer un post" existant sur /ready) ;
  // l'absence de visuel source est, elle, gérée à l'intérieur de
  // triggerAutoGeneratePreview, pas ici.
  const article = db.prepare(
    `SELECT content_id, event_id, title FROM articles WHERE id = ?`
  ).get(articleId) as { content_id: string | null; event_id: number; title: string } | undefined;
  if (article?.content_id) {
    triggerAutoGeneratePreview(articleId, article.content_id, article.event_id, article.title).catch((err) => {
      console.error('[validation] triggerAutoGeneratePreview a levé une exception:', err);
    });
  }

  return true;
}
