import { getDb } from './db';
import { generateAndVerifyArticle } from './articles';

/**
 * TODO: seuils provisoires (RADAR/CLAUDE.md §4.3 — jamais un seuil métier
 * définitif sans données réelles) :
 * - Heure fixée arbitrairement à 8h ("le matin", demande utilisateur) —
 *   à ajuster une fois un rythme de revue réel observé.
 * - Score de confiance minimal 70 pour laisser passer un brouillon
 *   auto-généré à la revue humaine — aucune donnée réelle pour le calibrer
 *   encore, posé au-dessus de la moitié de l'échelle 0-100 par prudence.
 */
const AUTO_GEN_HOUR = 8;
const MIN_VERIFICATION_SCORE = 70;

/**
 * Génération complète du matin pour les 2 actualités les plus pertinentes
 * (chantier 3 du plan écosystème, docs/superpowers/plans/2026-08-26-ecosystem-editorial-v2.md §6).
 * Ne fait rien en dehors de la fenêtre du matin, et ne tourne qu'une fois
 * par jour même si le cron tourne plusieurs fois pendant cette heure.
 *
 * Interdit absolu RADAR/CLAUDE.md §2 : « ne jamais laisser un article généré
 * passer à la revue humaine si le contrôle automatique détecte une anomalie ».
 * Si le contrôle échoue pour un des 2 événements, son brouillon est retiré —
 * jamais présenté avec un avertissement, jamais laissé pour examen. L'article
 * reste au statut 'draft' même quand tout passe : la validation humaine dans
 * RADAR (bouton "Valider") reste une étape à part entière, cohérent avec le
 * reste du pipeline — seule la rédaction est automatisée, pas la validation.
 */
/**
 * @param runId — id de la ligne `pipeline_runs` du cycle cron en cours.
 * Les compteurs `auto_gen_attempted`/`auto_gen_passed` y sont écrits pour que
 * le dashboard puisse afficher "X/Y ont passé le contrôle qualité" sans rien
 * deviner — l'ancienne version ne laissait aucune trace lisible côté UI,
 * seulement des `console.log` (§ session 2026-08-27, priorité P1).
 */
export async function runMorningAutoGeneration(runId: number): Promise<void> {
  const now = new Date();
  if (now.getHours() !== AUTO_GEN_HOUR) return;

  const db = getDb();
  const today = now.toISOString().slice(0, 10);
  const alreadyRanToday = db
    .prepare(`SELECT COUNT(*) as c FROM pipeline_runs WHERE date(started_at) = ? AND auto_gen_attempted > 0`)
    .get(today) as { c: number };
  if (alreadyRanToday.c > 0) return;

  const topEvents = db.prepare(`SELECT id FROM events ORDER BY score DESC LIMIT 2`).all() as { id: number }[];
  let attempted = 0;
  let passed = 0;

  for (const event of topEvents) {
    attempted++;
    try {
      const result = await generateAndVerifyArticle(event.id, 'généré');
      if (!result) continue;

      const { article, verification } = result;
      const passesGate = verification.issues.length === 0 && verification.confidenceScore >= MIN_VERIFICATION_SCORE;

      if (!passesGate) {
        db.prepare(`DELETE FROM articles WHERE id = ?`).run(article.id);
        console.log(`[AUTO-GEN] Événement ${event.id} : contrôle qualité échoué (score ${verification.confidenceScore}, ${verification.issues.length} anomalie(s)), brouillon retiré`);
      } else {
        passed++;
        console.log(`[AUTO-GEN] Événement ${event.id} : brouillon généré et vérifié (score ${verification.confidenceScore})`);
      }
    } catch (err) {
      console.error(`[AUTO-GEN] Échec pour l'événement ${event.id}:`, err);
    }
  }

  db.prepare(`UPDATE pipeline_runs SET auto_gen_attempted = ?, auto_gen_passed = ? WHERE id = ?`).run(attempted, passed, runId);
}
