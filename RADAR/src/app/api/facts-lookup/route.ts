import { NextResponse } from 'next/server';
import { getDb, Item } from '@/lib/db';
import { extractFacts, stripHtml } from '@/lib/brief';

/**
 * Endpoint interne lecture seule pour STUDIO (chantier "P3", 15 sept. 2026) :
 * quand un rédacteur tape un thème dans STUDIO (mode 2, aucun brief RADAR),
 * le LLM n'a que ce thème comme ancrage factuel — configuration qui le
 * pousse à inventer des chiffres techniques (voir router.ts). Cet endpoint
 * cherche si RADAR a déjà ingéré une actualité qui recoupe ce thème et, si
 * oui, renvoie de VRAIS faits déjà repérés par `extractFacts()` — la même
 * fonction que `generateBrief()` utilise, réutilisée telle quelle, pas
 * dupliquée.
 *
 * Volontairement léger, pour rester sans impact perçu sur l'UX STUDIO :
 * - Aucune traduction (`ensureItemTranslated` n'est PAS appelée) — le seul
 *   calcul coûteux du pipeline RADAR (traduction ONNX) est le calcul qu'on
 *   évite ici. `extractFacts()` sait déjà retomber sur le texte anglais brut
 *   quand `*_fr` est absent (repli déjà en place, pas ajouté pour l'occasion).
 * - Aucun appel LLM côté RADAR.
 * - Une seule requête SQL simple (table `events`, déjà indexée par id) +
 *   du texte pur — quelques millisecondes attendues, jamais un budget
 *   perceptible pour l'utilisateur STUDIO.
 *
 * Précision plutôt que rappel, volontairement : matcher sur TOUS les mots
 * significatifs du thème (ET, pas OU) plutôt que sur un seul. Un mot seul
 * en commun ("Mercedes") donnerait des faux positifs fréquents (mauvais
 * modèle, mauvaise année) — un mauvais fait présenté comme vrai est pire
 * que l'absence de fait (voir l'échange avec l'utilisateur, session du
 * 15 sept. 2026). Sans match exact sur tous les mots, aucun fait n'est
 * renvoyé plutôt que d'en renvoyer un peu pertinent.
 *
 * Pas d'authentification requise : appel serveur-à-serveur sur le réseau
 * interne partagé, même principe déjà appliqué au callback
 * `/api/events/[contentId]/exported` (RADAR/CLAUDE.md §9b) — jamais un
 * prérequis silencieux pour STUDIO (§1 studio/CLAUDE.md) : toute panne ou
 * absence de résultat ici doit se traduire par `matched: false`, jamais une
 * erreur qui bloquerait la génération de titres.
 */

const STOPWORDS_MIN = new Set(['les', 'des', 'une', 'the', 'and', 'pour', 'avec', 'dans']);

function significantWords(theme: string): string[] {
  return theme
    .toLowerCase()
    .split(/[^a-zàâäéèêëïîôöùûüç0-9]+/)
    .filter((w) => w.length >= 3 && !STOPWORDS_MIN.has(w));
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const theme = searchParams.get('theme');

    if (!theme || theme.trim().length === 0) {
      return NextResponse.json({ error: 'theme query parameter is required' }, { status: 400 });
    }

    const words = significantWords(theme);
    if (words.length === 0) {
      return NextResponse.json({ matched: false, facts: [] });
    }

    const db = getDb();

    // Toutes les conditions doivent matcher (précision > rappel, voir plus haut).
    const conditions = words.map(() => '(LOWER(title) LIKE ? OR LOWER(title_fr) LIKE ?)').join(' AND ');
    const params = words.flatMap((w) => [`%${w}%`, `%${w}%`]);

    const event = db
      .prepare(`SELECT id FROM events WHERE ${conditions} ORDER BY score DESC LIMIT 1`)
      .get(...params) as { id: number } | undefined;

    if (!event) {
      return NextResponse.json({ matched: false, facts: [] });
    }

    const rawItems = db
      .prepare(
        'SELECT i.* FROM items i JOIN event_items ei ON i.id = ei.item_id WHERE ei.event_id = ? ORDER BY i.published_at DESC LIMIT 5'
      )
      .all(event.id) as Item[];

    if (rawItems.length === 0) {
      return NextResponse.json({ matched: false, facts: [] });
    }

    // Pas de traduction ici (voir commentaire de tête) — nettoyage HTML
    // seulement, sur les champs bruts.
    const items = rawItems.map((item) => ({
      ...item,
      title: stripHtml(item.title),
      summary: item.summary ? stripHtml(item.summary) : item.summary,
      content: item.content ? stripHtml(item.content) : item.content,
    }));

    const facts = extractFacts(items).slice(0, 6).map((f) => ({
      text: f.text,
      source_title: f.source_title,
    }));

    return NextResponse.json({ matched: facts.length > 0, facts });
  } catch (error) {
    console.error('Error in facts-lookup:', error);
    // Jamais une 500 qui casserait l'appelant STUDIO — un échec ici doit se
    // comporter exactement comme « aucun fait trouvé », pas comme une panne.
    return NextResponse.json({ matched: false, facts: [] });
  }
}
