/**
 * Traduction anglais → français locale, sans appel LLM (2026-08-29).
 *
 * Décision : la traduction est une tâche de traduction pure, pas de
 * rédaction — un modèle dédié (MarianMT) la fait mieux, sans risque de
 * dérive/résumé inventé, plus vite, et surtout sans consommer le quota LLM
 * partagé (Groq) qui a déjà été épuisé une fois pendant cette session. Même
 * bibliothèque que `embeddings.ts` (@xenova/transformers, déjà dépendance
 * de RADAR, déjà éprouvée sur cette VM pour le clustering) — aucune
 * nouvelle dépendance à valider (RADAR/CLAUDE.md §3).
 *
 * Modèle : Xenova/opus-mt-en-fr (MarianMT, ~300 Mo, ONNX quantisé),
 * téléchargé et mis en cache au premier appel comme le modèle d'embedding.
 */

let translatorPromise: Promise<any> | null = null;
let translatorFailed = false;

/**
 * Charge le pipeline une seule fois, même sous appels concurrents.
 * Bug trouvé le 2026-08-29 en testant réellement sur un event à 11 sources :
 * generateBrief() lance les traductions de tous les items en parallèle
 * (Promise.all) — la version précédente ne mémoïsait que la valeur déjà
 * résolue, pas la promesse en cours. Chaque appel concurrent arrivant avant
 * la fin du tout premier chargement voyait `translator` encore `null` et
 * relançait sa propre copie du modèle (~300 Mo) — jusqu'à plusieurs dizaines
 * de fois en parallèle sur un seul brief, un vrai risque de saturation
 * mémoire. Mémoïser la PROMESSE elle-même règle ça : tous les appels
 * concurrents attendent le même chargement.
 */
function getTranslator(): Promise<any> {
  if (translatorFailed) return Promise.resolve(null);
  if (translatorPromise) return translatorPromise;

  translatorPromise = (async () => {
    try {
      const transformersMod = await import('@xenova/transformers');
      transformersMod.env.allowLocalModels = true;
      transformersMod.env.useBrowserCache = false;
      console.log('Loading translation model (first run downloads ~300MB)...');
      const t = await transformersMod.pipeline('translation', 'Xenova/opus-mt-en-fr');
      console.log('Translation model loaded.');
      return t;
    } catch (error) {
      translatorFailed = true;
      translatorPromise = null;
      console.error('[TRANSLATE-LOCAL] Modèle indisponible, traduction locale ignorée:', error instanceof Error ? error.message : error);
      return null;
    }
  })();

  return translatorPromise;
}

/**
 * MarianMT tronque au-delà d'environ 512 tokens — un résumé RSS de quelques
 * phrases reste largement en dessous, mais un `content` complet peut le
 * dépasser. Découpage par phrase plutôt que par caractères bruts : évite de
 * couper un mot en deux au milieu d'un lot, chaque phrase reste traduite
 * dans son propre contexte.
 *
 * Trouvé le 14 sept. 2026 (event 171948, Bring a Trailer) : un `content`
 * scrapé qui est en fait une liste de titres d'annonces concaténés ("1951
 * Aston Martin DB2 Vantage 1971 Mercedes-Benz 280SE 3.5 Cabriolet...") n'a
 * presque aucune ponctuation — le regex de phrase produit alors des
 * "phrases" de 700-1000+ caractères d'un coup, largement au-dessus du
 * `maxCharsPerChunk` visé, parce que le découpage précédent ne coupait
 * QU'ENTRE deux phrases, jamais à l'intérieur d'une seule. Un texte hors
 * distribution de cette taille en une seule passe peut faire dégénérer la
 * génération du modèle de traduction (répétitions, temps de calcul
 * anormalement long) — confirmé par un test isolé réel sur cet item exact.
 * Découpe forcée à la taille max si une "phrase" seule dépasse déjà la
 * limite, plutôt que de compter uniquement sur les limites de phrase.
 */
function splitIntoChunks(text: string, maxCharsPerChunk = 400): string[] {
  const rawSentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  const sentences: string[] = [];
  for (const s of rawSentences) {
    if (s.length <= maxCharsPerChunk) {
      sentences.push(s);
    } else {
      for (let i = 0; i < s.length; i += maxCharsPerChunk) {
        sentences.push(s.slice(i, i + maxCharsPerChunk));
      }
    }
  }
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current.length + sentence.length > maxCharsPerChunk && current.length > 0) {
      chunks.push(current.trim());
      current = '';
    }
    current += sentence;
  }
  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Traduction d'un bloc au-delà de ${ms}ms`)), ms)),
  ]);
}

/**
 * Traduit un texte anglais en français. Retourne `null` (jamais une chaîne
 * vide ou le texte anglais tel quel) si le modèle est indisponible — jamais
 * une dégradation silencieuse (RADAR/CLAUDE.md §6) : l'appelant doit savoir
 * distinguer "traduit" de "pas encore traduit" pour ne jamais confondre les
 * deux en base (colonnes `*_fr` NULL tant que non traduit).
 *
 * `max_new_tokens` et le timeout par bloc, trouvés le 14 sept. 2026 (event
 * 171948, Bring a Trailer) : un chunk de 400 caractères SANS structure de
 * phrase réelle (liste de noms de voitures concaténés, `1951 Aston Martin
 * DB2 Vantage 1971 Mercedes-Benz...`) a mesuré 59.7s de génération pour ce
 * seul bloc — entrée hors distribution du modèle, la génération dégénère
 * sans jamais atteindre l'EOS naturellement. Sans plafond, aucun nombre de
 * blocs "sûrs" ne protège contre un seul bloc pathologique : `max_new_tokens`
 * borne la génération elle-même (un français ~30% plus long que l'anglais
 * en moyenne, marge large), le timeout est la deuxième ligne de défense si
 * malgré tout un bloc traîne. Une traduction ratée renvoie `null` (jamais
 * un résultat partiel silencieusement tronqué) — cohérent avec le reste de
 * cette fonction.
 */
export async function translateTextLocal(text: string): Promise<string | null> {
  const trimmed = text?.trim();
  if (!trimmed) return null;

  const t = await getTranslator();
  if (!t) return null;

  try {
    const chunks = splitIntoChunks(trimmed);
    const translated: string[] = [];
    for (const chunk of chunks) {
      const output = await withTimeout<any>(t(chunk, { max_new_tokens: 256 }), 15_000);
      const text = Array.isArray(output) ? output[0]?.translation_text : output?.translation_text;
      if (typeof text !== 'string') return null;
      translated.push(text);
    }
    return translated.join(' ');
  } catch (error) {
    console.error('[TRANSLATE-LOCAL] Échec de traduction:', error instanceof Error ? error.message : error);
    return null;
  }
}
