import { getDb, Event, Item } from './db';
import { Brief, Fact } from './brief';

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

/**
 * Nombres français écrits en toutes lettres (2 à 20) — trouvé en creusant un
 * échec réel de vérification (analyse "post garanti", 2026-09-09) : un
 * article correct disait « trois sources confirment » (convention
 * journalistique française usuelle pour les petits nombres), le brief
 * disait « 3 sources » en chiffre — deux formes du même fait, jamais
 * rapprochées par cette fonction, qui ne cherchait que des chiffres.
 * "un/une" et "neuf" volontairement exclus : le premier est l'article
 * indéfini le plus fréquent du français (faux positifs constants, "un SUV",
 * "une voiture"...), le second est l'adjectif "neuf/neuve" (véhicule neuf)
 * bien plus fréquent dans ce contexte automobile que le nombre neuf — deux
 * homographes trop risqués pour ce qu'ils apporteraient.
 */
const FRENCH_NUMBER_WORDS: Record<string, number> = {
  deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
  'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19, vingt: 20,
};

export function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  const patterns = [
    /\d+[\.,]?\d*/g,  // Basic numbers (e.g., 123, 12.5, 12,5)
    /\d+\s*%/g,       // Percentages
    /\d+\s*kWh/g,     // Battery capacity
    /\d+\s*km/g,      // Distance
    /\d+\s*ch(?:evaux)?/g,  // Horsepower
    /\d+\s*€/g,       // Prices in euros
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const numStr = match[0].replace(/[^\d.,]/g, '').replace(',', '.');
      const num = parseFloat(numStr);
      if (!isNaN(num)) {
        numbers.push(num);
      }
    }
  }

  const lower = text.toLowerCase();
  for (const [word, value] of Object.entries(FRENCH_NUMBER_WORDS)) {
    const wordPattern = new RegExp(`\\b${word}\\b`, 'g');
    if (wordPattern.test(lower)) {
      numbers.push(value);
    }
  }

  return [...new Set(numbers)];
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
