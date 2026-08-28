/**
 * Moteur d'intention de l'assistant — pur TS, zéro dépendance, zéro coût.
 * Comprend l'intention d'une question en français par similarité cosinus
 * TF-IDF (unigrammes + bigrammes, correction de vocabulaire pour les fautes
 * de frappe) sur une base de fiches fermée, en < 1 ms. Aucun LLM, pas
 * d'appel réseau : rien ne pèse sur le serveur ni sur le chargement des pages.
 *
 * Pourquoi TF-IDF plutôt qu'un modèle d'embedding neuronal (2026-08-28,
 * revu après l'implémentation initiale au token-matching pur) : la base de
 * connaissance est un petit corpus fermé (~20-30 fiches par app, jamais du
 * texte ouvert). RADAR a déjà un modèle d'embedding local
 * (`@xenova/transformers`, multilingual-e5-small quantisé — réutilisé pour
 * le clustering d'events dans `lib/embeddings.ts`), mais STUDIO ne l'a pas :
 * l'ajouter là-bas dupliquerait un téléchargement/modèle de ~113 Mo sur la
 * VM Oracle ARM déjà contrainte (2 cœurs, sans GPU, qui fait déjà tourner
 * Playwright + un modèle de détourage de 176 Mo — studio/CLAUDE.md §1.1/§3.3),
 * en violation du principe "ne jamais changer un choix de stack sans le
 * signaler" (studio/CLAUDE.md §3/§6). Pour un corpus de cette taille, la
 * pondération TF-IDF (les mots rares et distinctifs comptent plus que les
 * mots génériques) + les bigrammes (sensibilité à l'ordre des mots, capture
 * des expressions sans les pré-lister à la main) + une correction de
 * vocabulaire par préfixe/distance de Levenshtein capturent l'essentiel de
 * ce qu'apporterait un embedding ici, sans aucun poids ni dépendance
 * supplémentaire, et restent strictement symétriques entre RADAR et STUDIO.
 */

export type AssistantLink = {
  label: string;
  href: string;
  external?: boolean;
  hint?: string;
};

export interface AssistantFiche {
  id: string;
  title: string;
  keywords: string[];
  phrases: string[];
  description: string;
  steps?: string[];
  tips?: string[];
  link?: AssistantLink;
  related?: string[];
}

export interface RelatedRef {
  id: string;
  title: string;
}

export interface AssistantReply {
  match: AssistantFiche | null;
  /** `match.related` (ids bruts) résolu en {id, title} — évite d'afficher un id technique dans l'UI. */
  matchRelated: RelatedRef[];
  suggestions: AssistantFiche[];
  directory: string[];
  confidence: number;
}

const STOPWORDS = new Set([
  "a", "au", "aux", "avec", "ce", "ces", "cest", "comme", "comment", "d",
  "dans", "de", "des", "du", "elle", "est", "et", "il", "je", "la", "le",
  "les", "l", "mais", "me", "mon", "n", "ne", "on", "ou", "pour", "que",
  "quel", "quelle", "quelles", "quoi", "qui", "sa", "se", "ses", "sur",
  "te", "toi", "tu", "un", "une", "vais", "veux", "veut", "voulez", "vous",
  "tres", "trop", "tout", "tous", "plus", "pas", "sans", "par", "vers",
  "sous", "etre", "avoir", "faire", "obtenir", "moyen", "maniere", "facon",
  "etape", "dabord", "voir", "savoir", "deja", "encore", "meme", "aussi",
]);

export function normalizeFR(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2019\u2018\x27]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenizeFR(input: string): string[] {
  return normalizeFR(input).split(" ").filter(Boolean);
}

function significantTokens(input: string): string[] {
  return tokenizeFR(input).filter((t) => !STOPWORDS.has(t) && t.length >= 3);
}

function bigrams(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length - 1; i++) out.push(`${tokens[i]}_${tokens[i + 1]}`);
  return out;
}

/** Unigrammes + bigrammes d'un texte, mots vides et mots courts retirés. */
function terms(input: string): string[] {
  const toks = significantTokens(input);
  return [...toks, ...bigrams(toks)];
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array<number>(n + 1);
  const prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(prev[j] + 1, dp[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = dp[j];
  }
  return prev[n];
}

function isContiguousSubsequence(phrase: string[], tokens: string[]): boolean {
  const len = phrase.length;
  if (len === 0 || len > tokens.length) return false;
  outer: for (let i = 0; i <= tokens.length - len; i++) {
    for (let j = 0; j < len; j++) {
      if (phrase[j] !== tokens[i + j]) continue outer;
    }
    return true;
  }
  return false;
}

/**
 * Poids relatif de chaque champ dans le "document" d'une fiche — titre et
 * mots-clés/phrases (curatés à la main) comptent plus que la prose libre
 * (description/steps/tips), qui contient plus de bruit lexical.
 */
const FIELD_WEIGHT = { title: 4, keyword: 3, phrase: 2, prose: 1 } as const;

interface FicheVector {
  fiche: AssistantFiche;
  /** term -> poids TF-IDF cumulé (non normalisé) */
  weights: Map<string, number>;
  norm: number;
  phraseTokenSets: string[][];
}

interface CorpusIndex {
  vectors: FicheVector[];
  idf: Map<string, number>;
  vocabulary: Set<string>;
}

function accumulate(bag: Map<string, number>, text: string, weight: number) {
  for (const t of terms(text)) bag.set(t, (bag.get(t) ?? 0) + weight);
}

function buildCorpusIndex(knowledge: AssistantFiche[]): CorpusIndex {
  const rawBags = knowledge.map((fiche) => {
    const bag = new Map<string, number>();
    accumulate(bag, fiche.title, FIELD_WEIGHT.title);
    for (const k of fiche.keywords) accumulate(bag, k, FIELD_WEIGHT.keyword);
    for (const p of fiche.phrases) accumulate(bag, p, FIELD_WEIGHT.phrase);
    accumulate(bag, fiche.description, FIELD_WEIGHT.prose);
    for (const s of fiche.steps ?? []) accumulate(bag, s, FIELD_WEIGHT.prose);
    for (const t of fiche.tips ?? []) accumulate(bag, t, FIELD_WEIGHT.prose);
    return bag;
  });

  // Document frequency (nombre de fiches où le terme apparaît au moins une fois).
  const df = new Map<string, number>();
  for (const bag of rawBags) {
    for (const term of bag.keys()) df.set(term, (df.get(term) ?? 0) + 1);
  }

  const N = knowledge.length;
  const idf = new Map<string, number>();
  for (const [term, count] of df) idf.set(term, Math.log((N + 1) / (count + 1)) + 1);

  const vectors: FicheVector[] = knowledge.map((fiche, i) => {
    const weights = new Map<string, number>();
    let normSq = 0;
    for (const [term, tf] of rawBags[i]) {
      const w = tf * (idf.get(term) ?? 1);
      weights.set(term, w);
      normSq += w * w;
    }
    return {
      fiche,
      weights,
      norm: Math.sqrt(normSq) || 1,
      phraseTokenSets: fiche.phrases.map((p) => tokenizeFR(p)).filter((p) => p.length > 0),
    };
  });

  const vocabulary = new Set<string>();
  for (const bag of rawBags) for (const term of bag.keys()) vocabulary.add(term);

  return { vectors, idf, vocabulary };
}

/**
 * Corrige les fautes de frappe d'un token de requête en le rapprochant du
 * terme du vocabulaire le plus proche (préfixe partagé ou distance de
 * Levenshtein ≤ 1) — généralise l'ancienne tolérance par fiche à tout le
 * corpus, une seule fois par mot de la requête.
 */
function correctToken(token: string, vocabulary: Set<string>): string {
  if (vocabulary.has(token)) return token;
  if (token.length < 4) return token;
  let best: string | null = null;
  let bestRank = 0;
  for (const v of vocabulary) {
    if (v.includes("_")) continue; // ne corrige que contre des unigrammes
    if (Math.abs(v.length - token.length) > 1) continue;
    if (v.length >= 4 && v.slice(0, 4) === token.slice(0, 4) && v.length >= token.length) {
      if (2 > bestRank) { bestRank = 2; best = v; }
      continue;
    }
    if (token.length >= 5 && levenshtein(token, v) <= 1) {
      if (1 > bestRank) { bestRank = 1; best = v; }
    }
  }
  return best ?? token;
}

function cosineAgainstFiche(queryTerms: string[], idf: Map<string, number>, vec: FicheVector): number {
  const qWeights = new Map<string, number>();
  for (const t of queryTerms) {
    const idfW = idf.get(t) ?? 1;
    qWeights.set(t, (qWeights.get(t) ?? 0) + idfW);
  }
  let dot = 0;
  let qNormSq = 0;
  for (const [t, w] of qWeights) {
    qNormSq += w * w;
    const fw = vec.weights.get(t);
    if (fw) dot += w * fw;
  }
  const qNorm = Math.sqrt(qNormSq) || 1;
  return dot / (qNorm * vec.norm);
}

function phraseBonus(queryTokens: string[], vec: FicheVector): number {
  let bonus = 0;
  for (const phrase of vec.phraseTokenSets) {
    if (isContiguousSubsequence(phrase, queryTokens)) bonus += phrase.length * 0.35;
  }
  return bonus;
}

export function answerQuery(
  query: string,
  knowledge: AssistantFiche[],
  options?: { minScore?: number; limit?: number },
): AssistantReply {
  const minScore = options?.minScore ?? 0.16;
  const limit = options?.limit ?? 3;
  const index = buildCorpusIndex(knowledge);
  const byId = new Map(knowledge.map((f) => [f.id, f]));

  const rawTokens = significantTokens(query);
  const correctedTokens = rawTokens.map((t) => correctToken(t, index.vocabulary));
  const queryTerms = [...correctedTokens, ...bigrams(correctedTokens)];

  if (queryTerms.length === 0) {
    return {
      match: null,
      matchRelated: [],
      suggestions: knowledge.slice(0, limit),
      directory: knowledge.map((k) => k.title),
      confidence: 0,
    };
  }

  const scored = index.vectors
    .map((vec) => ({
      fiche: vec.fiche,
      score: cosineAgainstFiche(queryTerms, index.idf, vec) + phraseBonus(correctedTokens, vec),
    }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const match = best && best.score >= minScore ? best.fiche : null;
  const matchRelated: RelatedRef[] = match
    ? (match.related ?? [])
        .map((id) => byId.get(id))
        .filter((f): f is AssistantFiche => Boolean(f))
        .map((f) => ({ id: f.id, title: f.title }))
    : [];
  const suggestions = scored
    .map((s) => s.fiche)
    .filter((f) => f.id !== match?.id)
    .slice(0, limit);

  return {
    match,
    matchRelated,
    suggestions,
    directory: knowledge.map((k) => k.title),
    confidence: best ? best.score : 0,
  };
}

export function starterChips(knowledge: AssistantFiche[], ids: string[]): AssistantFiche[] {
  const byId = new Map(knowledge.map((k) => [k.id, k]));
  return ids.map((id) => byId.get(id)).filter((f): f is AssistantFiche => Boolean(f));
}

/** Résolution déterministe par id — utilisée pour les chips (starters, fiches liées) : jamais de nouvelle recherche floue pour un choix déjà connu. */
export function getFicheById(knowledge: AssistantFiche[], id: string): AssistantFiche | null {
  return knowledge.find((f) => f.id === id) ?? null;
}
