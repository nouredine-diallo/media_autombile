import { getVerificationScoreCalibrationReport } from '../src/lib/verification';

/**
 * Rapport de calibration du seuil MIN_VERIFICATION_SCORE (autoGenerate.ts).
 * Exécuter avec : npx tsx scripts/verification-score-calibration-report.ts
 *
 * Lit `verification_shadow_log`, alimentée en continu depuis le 2026-09-17
 * (voir migration dans db.ts + phase 2 du plan écosystème). Cible avant de
 * tirer une conclusion : 40-60 articles réels au total — même méthode que
 * celle qui a produit DEV_SLIDE_PERTINENCE_THRESHOLD = 40 (brief.ts).
 *
 * Rappel important (RADAR/CLAUDE.md §2) : ce rapport ne peut PAS dire si le
 * seuil actuel (70) est trop strict, seulement s'il pourrait être monté —
 * les articles rejetés par le contrôle qualité ne sont jamais montrés à un
 * humain, donc aucune décision humaine n'existe pour eux.
 */
function printReport() {
  const buckets = getVerificationScoreCalibrationReport();
  const totalEvaluated = buckets.reduce((sum, b) => sum + b.evaluated, 0);

  if (totalEvaluated === 0) {
    console.log('Aucune donnée encore — le logging démarre au prochain cycle cron.');
    return;
  }

  console.log(`📊 Calibration MIN_VERIFICATION_SCORE — ${totalEvaluated} article(s) évalué(s)\n`);
  console.log('Tranche  | Évalués | Passé la porte | Validés (humain) | Rejetés (humain)');
  console.log('---------|---------|----------------|-------------------|------------------');
  for (const b of buckets) {
    console.log(
      `${b.scoreRange.padEnd(8)} | ${String(b.evaluated).padEnd(7)} | ${String(b.passedGate).padEnd(14)} | ${String(b.humanValidated).padEnd(17)} | ${b.humanRejected}`
    );
  }

  if (totalEvaluated < 40) {
    console.log(`\n⚠️  ${totalEvaluated}/40 articles minimum — encore trop peu de données pour recalculer le seuil.`);
  } else {
    console.log(`\n✅ ${totalEvaluated} articles accumulés — assez de volume pour une analyse éditoriale du seuil.`);
  }
}

printReport();
