import { getDb, Event, Item } from './db';
import { Brief, Fact } from './brief';
import { extractNumbers } from './textUtils';

export { extractNumbers };

export interface VerificationResult {
  numbersVerified: number[];
  numbersMissing: number[];
  numbersAdded: number[];
  confidenceScore: number;
  issues: string[];
}

export interface ArticleCheck {
  eventId: number;
  articleId: number;
  titleMatch: boolean;
  factsFound: string[];
  factsMissing: string[];
  numbersInBrief: number[];
  numbersInArticle: number[];
  verificationResult: VerificationResult;
}

export function verifyArticleAgainstBrief(
  brief: Brief,
  articleContent: string,
  articleTitle: string
): VerificationResult {
  const issues: string[] = [];

  // Extract numbers from brief
  const briefNumbers = [
    ...extractNumbers(brief.headline),
    ...extractNumbers(brief.lede),
    ...extractNumbers(brief.body),
    ...brief.facts.flatMap(f => extractNumbers(f.text)),
  ];

  // Extract numbers from article
  const articleNumbers = [
    ...extractNumbers(articleTitle),
    ...extractNumbers(articleContent),
  ];

  // Find numbers that are in the article but not in the brief (potential additions)
  const numbersAdded = articleNumbers.filter(n => !briefNumbers.includes(n));

  // Find numbers that are in the brief but not in the article (potential omissions)
  const numbersMissing = briefNumbers.filter(n => !articleNumbers.includes(n));

  // Find numbers that appear in both (verified)
  const numbersVerified = briefNumbers.filter(n => articleNumbers.includes(n));

  // Check for issues
  if (numbersAdded.length > 0) {
    issues.push(`Chiffres ajoutés non présents dans le brief: ${numbersAdded.join(', ')}`);
  }

  if (numbersMissing.length > 0) {
    issues.push(`Chiffres du brief absents de l'article: ${numbersMissing.join(', ')}`);
  }

  // Calculate confidence score
  const totalBriefNumbers = new Set(briefNumbers).size;
  const verifiedCount = new Set(numbersVerified).size;
  const confidenceScore = totalBriefNumbers > 0
    ? Math.round((verifiedCount / totalBriefNumbers) * 100)
    : 100;

  return {
    numbersVerified,
    numbersMissing,
    numbersAdded,
    confidenceScore,
    issues,
  };
}

export function checkArticlePlagiarism(
  articleContent: string,
  sourceContents: string[]
): { score: number; similarities: string[] } {
  const similarities: string[] = [];

  // Simple plagiarism detection using common phrases
  const articleSentences = articleContent.split(/[.!?]+/).filter(s => s.trim().length > 15);

  for (const source of sourceContents) {
    const sourceSentences = source.split(/[.!?]+/).filter(s => s.trim().length > 15);

    for (const articleSentence of articleSentences) {
      const trimmedArticle = articleSentence.trim().toLowerCase();

      for (const sourceSentence of sourceSentences) {
        const trimmedSource = sourceSentence.trim().toLowerCase();

        // Check for exact matches or very similar sentences
        if (trimmedArticle === trimmedSource ||
            trimmedArticle.includes(trimmedSource) ||
            trimmedSource.includes(trimmedArticle)) {
          similarities.push(articleSentence.trim());
          break;
        }
      }
    }
  }

  // Calculate plagiarism score (0-100, lower is better)
  const score = articleSentences.length > 0
    ? Math.round((similarities.length / articleSentences.length) * 100)
    : 0;

  return { score, similarities };
}

export interface VerificationScoreCalibrationBucket {
  scoreRange: string;
  evaluated: number;
  passedGate: number;
  humanValidated: number;
  humanRejected: number;
}

/**
 * Rapport de calibration du seuil MIN_VERIFICATION_SCORE (phase 2 du plan
 * écosystème, 2026-09-17) — lit `verification_shadow_log` (voir migration
 * dans db.ts) plutôt que de recalculer quoi que ce soit : chaque score y est
 * déjà celui réellement observé au moment de la décision. Regroupé par
 * tranche de 10 points pour rendre la distribution lisible d'un coup d'œil.
 *
 * `humanValidated`/`humanRejected` ne comptent que les articles qui ont
 * réellement atteint un humain (jointure sur `article_decisions`) — jamais
 * les articles rejetés par le contrôle qualité, qui ne sont jamais montrés
 * à personne (RADAR/CLAUDE.md §2). Ce rapport ne peut donc mesurer si le
 * seuil actuel est trop strict pour les scores qu'il rejette déjà — utile
 * seulement pour juger, sur ce qui passe la porte, si le seuil pourrait
 * monter (accord humain fort même à des scores proches de 70) ou doit
 * rester en l'état.
 */
export function getVerificationScoreCalibrationReport(): VerificationScoreCalibrationBucket[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT
      (verification_score / 10) * 10 as bucket_start,
      COUNT(*) as evaluated,
      SUM(passed_gate) as passed_gate,
      SUM(CASE WHEN d.decision = 'validated' THEN 1 ELSE 0 END) as human_validated,
      SUM(CASE WHEN d.decision = 'rejected' THEN 1 ELSE 0 END) as human_rejected
    FROM verification_shadow_log s
    LEFT JOIN article_decisions d ON d.article_id = s.article_id AND d.source_method = 'humain'
    GROUP BY bucket_start
    ORDER BY bucket_start ASC
  `).all() as { bucket_start: number; evaluated: number; passed_gate: number; human_validated: number; human_rejected: number }[];

  return rows.map(r => ({
    scoreRange: `${r.bucket_start}-${r.bucket_start + 9}`,
    evaluated: r.evaluated,
    passedGate: r.passed_gate,
    humanValidated: r.human_validated,
    humanRejected: r.human_rejected,
  }));
}

export function generateVerificationReport(
  brief: Brief,
  article: { title: string; content: string },
  sources: { title: string; content: string | null }[]
): {
  verification: VerificationResult;
  plagiarism: { score: number; similarities: string[] };
  overallScore: number;
  recommendations: string[];
} {
  // Verify numbers
  const verification = verifyArticleAgainstBrief(brief, article.content, article.title);

  // Check plagiarism
  const sourceContents = sources
    .filter(s => s.content)
    .map(s => s.content!);
  const plagiarism = checkArticlePlagiarism(article.content, sourceContents);

  // Calculate overall score
  const overallScore = Math.round(
    (verification.confidenceScore * 0.7) + ((100 - plagiarism.score) * 0.3)
  );

  // Generate recommendations
  const recommendations: string[] = [];

  if (verification.issues.length > 0) {
    recommendations.push('Vérifier les chiffres mentionnés dans l\'article');
  }

  if (plagiarism.score > 30) {
    recommendations.push('Taux de similarité élevé avec les sources - reformuler');
  }

  if (verification.numbersAdded.length > 0) {
    recommendations.push('Certains chiffres ne proviennent pas du brief - vérifier l\'exactitude');
  }

  if (verification.numbersMissing.length > 0) {
    recommendations.push('Certains chiffres du brief ne sont pas mentionnés');
  }

  return {
    verification,
    plagiarism,
    overallScore,
    recommendations,
  };
}
