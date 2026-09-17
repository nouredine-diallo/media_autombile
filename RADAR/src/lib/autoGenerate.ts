import { getDb } from './db';
import { generateAndVerifyArticle } from './articles';
import { getBrief } from './brief';
import { generateVerificationReport } from './verification';
import { getBestImageForEvent } from './visualSearch';
import { getDegradedModeStatus } from './killswitch';
import { finalizeArticleValidation } from './validation';
import { getAutoValidateConfig } from './autoValidateConfig';
import { AlreadyGeneratingError } from './generationLock';

/**
 * TODO: seuil provisoire (RADAR/CLAUDE.md §4.3 — jamais un seuil métier
 * définitif sans données réelles) : score de confiance minimal 70 pour
 * laisser passer un brouillon auto-généré à la revue humaine — aucune
 * donnée réelle pour le calibrer encore, posé au-dessus de la moitié de
 * l'échelle 0-100 par prudence.
 *
 * Historique de la fenêtre horaire fixe (8h-12h), retirée le 2026-09-17 :
 * une première version bornait l'exécution à une plage d'heures fixe
 * ("le matin"). Preuve en base (`pipeline_runs` id 13, 10 sept. 2026) que
 * ça reste fragile même avec une fenêtre large : un cycle démarré à 10h00
 * (dans la fenêtre) a pris 2h52 (traduction + scoring), et l'heure système
 * au moment d'atteindre cette fonction était 12h52 — hors fenêtre, l'étape
 * a été sautée en silence malgré un cycle déclenché au bon moment. Une
 * plage horaire ne peut jamais absorber une durée de cycle imprévisible ;
 * le seul repère fiable est "est-ce le premier cycle du jour à arriver
 * jusqu'ici", pas une heure d'horloge murale — c'est exactement ce que
 * `alreadyRanToday` ci-dessous vérifie déjà, sans dépendre de l'heure.
 */
const MIN_VERIFICATION_SCORE = 70;

/**
 * TODO: valeur provisoire (RADAR/CLAUDE.md §4.3), décidée le 2026-09-17 :
 * élargi de 2 à 5 pour espérer 2-5 brouillons validés par cron (tous les
 * candidats évalués ne passent pas le contrôle qualité §7). Chaque
 * candidat en plus est un appel LLM réel (génération + vérification) —
 * actuellement gratuit (Groq), donc pas de contrainte de coût aujourd'hui,
 * mais LLM_PROVIDER=claude doit rester utilisable en prod sans faire
 * exploser la facture : 5 reste un nombre raisonnable même une fois Claude
 * activé. À ajuster une fois le volume réel de brouillons validés observé.
 */
const CANDIDATE_POOL_SIZE = 5;

/**
 * Génération complète du matin pour les CANDIDATE_POOL_SIZE actualités les
 * plus pertinentes (chantier 3 du plan écosystème,
 * docs/superpowers/plans/2026-08-26-ecosystem-editorial-v2.md §6).
 * Ne tourne qu'une fois par jour, quel que soit le nombre de cycles cron
 * exécutés — c'est le premier cycle du jour à atteindre cette fonction qui
 * fait le travail, pas une plage horaire fixe (voir historique ci-dessus).
 *
 * Interdit absolu RADAR/CLAUDE.md §2 : « ne jamais laisser un article généré
 * passer à la revue humaine si le contrôle automatique détecte une anomalie ».
 * Si le contrôle échoue pour un des événements, son brouillon est retiré —
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
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const alreadyRanToday = db
    .prepare(`SELECT COUNT(*) as c FROM pipeline_runs WHERE date(started_at) = ? AND auto_gen_attempted > 0`)
    .get(today) as { c: number };
  if (alreadyRanToday.c > 0) return;

  const topEvents = db.prepare(`SELECT id FROM events ORDER BY score DESC LIMIT ?`).all(CANDIDATE_POOL_SIZE) as { id: number }[];
  let attempted = 0;
  let passed = 0;
  let autoValidated = 0;

  for (const event of topEvents) {
    attempted++;
    try {
      const result = await generateAndVerifyArticle(event.id, 'généré');
      if (!result) continue;

      const { article, verification } = result;
      const passesGate = verification.issues.length === 0 && verification.confidenceScore >= MIN_VERIFICATION_SCORE;

      // Shadow logging (phase 2 du plan écosystème, 2026-09-17) : trace le
      // score et l'issue du contrôle qualité avant toute suppression
      // éventuelle ci-dessous, pour pouvoir un jour recalculer
      // MIN_VERIFICATION_SCORE sur des données réelles — voir migration
      // `verification_shadow_log` dans db.ts pour le détail du raisonnement.
      db.prepare(
        `INSERT INTO verification_shadow_log (article_id, event_id, verification_score, issues_count, passed_gate) VALUES (?, ?, ?, ?, ?)`
      ).run(article.id, event.id, verification.confidenceScore, verification.issues.length, passesGate ? 1 : 0);

      if (!passesGate) {
        // Exception explicitement autorisée par le créateur du projet le
        // 2026-09-17 à l'interdit absolu RADAR/CLAUDE.md §2 — voir §2bis pour
        // la portée exacte et la raison : sans jamais montrer les brouillons
        // sous le seuil à un humain, aucune vraie donnée de calibration
        // n'est possible (biais de survie total). Le brouillon N'EST PLUS
        // supprimé : il reste en `draft`, visible sur la page événement avec
        // son score bien en évidence (`getScoreColor`, rouge/orange sous
        // 80 %), jamais auto-validé sans revue (le seuil 85 de
        // `tryAutoValidate` reste hors de portée ici, cf. le `else`
        // ci-dessous qui seul y donne accès) — la décision humaine réelle
        // qui en résultera alimente `article_decisions`, jointe au score
        // dans `verification_shadow_log` pour la calibration.
        console.log(`[AUTO-GEN] Événement ${event.id} : contrôle qualité échoué (score ${verification.confidenceScore}, ${verification.issues.length} anomalie(s)) — conservé en brouillon pour revue humaine (calibration explicite, RADAR/CLAUDE.md §2bis)`);
      } else {
        passed++;
        console.log(`[AUTO-GEN] Événement ${event.id} : brouillon généré et vérifié (score ${verification.confidenceScore})`);
        autoValidated += await tryAutoValidate(event.id, article.id, verification.confidenceScore);
      }
    } catch (err) {
      // Trouvé le 15 sept. 2026 : si un rédacteur génère déjà manuellement
      // cet événement (route /api/generate) au moment où le cron l'atteint
      // aussi, generateAndVerifyArticle() refuse le doublon plutôt que de
      // lancer un second appel LLM en parallèle (generationLock.ts) — ce
      // n'est pas un échec du pipeline, juste une collision bénigne à
      // sauter, pas à compter comme un `[AUTO-GEN] Échec`.
      if (err instanceof AlreadyGeneratingError) {
        console.log(`[AUTO-GEN] Événement ${event.id} : déjà en cours de génération manuelle, ignoré ce cycle`);
        attempted--;
        continue;
      }
      console.error(`[AUTO-GEN] Échec pour l'événement ${event.id}:`, err);
    }
  }

  db.prepare(
    `UPDATE pipeline_runs SET auto_gen_attempted = ?, auto_gen_passed = ?, auto_gen_auto_validated = ? WHERE id = ?`
  ).run(attempted, passed, autoValidated, runId);
}

/**
 * Saute la revue humaine du contenu (pas seulement le contrôle qualité
 * ci-dessus) quand la confiance mesurée dépasse le seuil configuré ET qu'un
 * visuel source existe — sans visuel, un article "validé" resterait bloqué
 * sur /ready sans jamais atteindre l'écran de confirmation, ce qui irait à
 * l'encontre du but ("réveille-toi, confirme"). Retombe silencieusement sur
 * le comportement actuel (reste en `draft`, à valider à la main) dans tous
 * les autres cas — rien ne régresse pour ce qui n'atteint pas le seuil.
 * Le mode dégradé coupe l'automatisation ici comme ailleurs dans le
 * pipeline (killswitch.ts) : un signal existant de "quelque chose ne va
 * pas", pas une nouvelle notion à construire.
 */
async function tryAutoValidate(
  eventId: number,
  articleId: number,
  confidenceScore: number,
): Promise<number> {
  const config = getAutoValidateConfig();
  if (!config.enabled) return 0;
  if (confidenceScore < config.minConfidenceScore) return 0;
  if (getDegradedModeStatus().degraded) return 0;

  const db = getDb();
  const article = db.prepare(`SELECT title, content FROM articles WHERE id = ?`).get(articleId) as
    | { title: string; content: string }
    | undefined;
  const brief = getBrief(eventId);
  if (!article || !brief) return 0;

  const items = db
    .prepare('SELECT i.* FROM items i JOIN event_items ei ON i.id = ei.item_id WHERE ei.event_id = ?')
    .all(eventId) as { title: string; content: string | null }[];
  const report = generateVerificationReport(brief, article, items);

  if (report.verification.issues.length > 0 || report.overallScore < config.minOverallScore) {
    console.log(
      `[AUTO-GEN] Événement ${eventId} : score global ${report.overallScore} sous le seuil ${config.minOverallScore} ou anomalies détectées — reste en brouillon, à valider à la main.`
    );
    return 0;
  }

  const imageUrl = getBestImageForEvent(eventId);
  if (!imageUrl) {
    console.log(`[AUTO-GEN] Événement ${eventId} : score suffisant mais aucun visuel source — reste en brouillon.`);
    return 0;
  }

  finalizeArticleValidation(articleId, 'auto_score');
  console.log(`[AUTO-GEN] Événement ${eventId} : auto-validé (confiance ${confidenceScore}, score global ${report.overallScore}).`);
  return 1;
}
