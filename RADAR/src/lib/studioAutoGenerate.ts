import { getDb } from './db';
import { getBestImageForEvent, getSortedImagesForEvent, type SortedCarouselImage } from './visualSearch';
import { getCarouselSlides, DEV_SLIDE_PERTINENCE_THRESHOLD } from './brief';

const STUDIO_IMPORT_URL = process.env.STUDIO_IMPORT_URL || process.env.STUDIO_URL || 'http://127.0.0.1:3002';
const IMPORT_SECRET = process.env.IMPORT_SECRET || '';

/**
 * Déclenche la génération automatique du visuel STUDIO (gabarit 1A) dès
 * qu'un article est validé — plan écosystème 2026-08-29, "un seul geste de
 * décision". Fire-and-forget : ne bloque jamais la validation elle-même
 * (même principe que `preflightImage` dans visualSearch.ts). Marque le
 * statut 'pending' en DB avant l'appel réseau pour que /ready puisse
 * afficher "en préparation" sans attendre le callback.
 */
export async function triggerAutoGenerate(articleId: number, contentId: string, title: string, imageUrl: string): Promise<void> {
  const db = getDb();
  db.prepare(`UPDATE articles SET auto_preview_status = 'pending', auto_preview_error = NULL, auto_preview_mode = 'single' WHERE id = ?`).run(articleId);

  if (!IMPORT_SECRET) {
    console.log('[auto-generate] Déclenchement ignoré : IMPORT_SECRET absent');
    db.prepare(`UPDATE articles SET auto_preview_status = 'failed', auto_preview_error = ? WHERE id = ?`)
      .run('IMPORT_SECRET non configuré côté serveur', articleId);
    return;
  }

  try {
    const res = await fetch(`${STUDIO_IMPORT_URL}/api/auto-generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-import-secret': IMPORT_SECRET,
      },
      body: JSON.stringify({ mode: 'single', contentId, title, imageUrl }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`STUDIO a répondu ${res.status}${text ? ` : ${text}` : ''}`);
    }
  } catch (err) {
    console.error('[auto-generate] Déclenchement échoué:', err instanceof Error ? err.message : err);
    db.prepare(`UPDATE articles SET auto_preview_status = 'failed', auto_preview_error = ? WHERE id = ?`)
      .run(err instanceof Error ? err.message : 'Erreur inconnue', articleId);
  }
}

/**
 * Variante carrousel de `triggerAutoGenerate()` — même contrat (marque
 * 'pending' avant l'appel réseau, jamais bloquant, échec capturé en DB,
 * jamais silencieux), payload différent : `images`/`devSlides` au lieu
 * d'une seule `imageUrl` (phase 4 du plan écosystème, 2026-09-17).
 */
export async function triggerAutoGenerateCarousel(
  articleId: number,
  contentId: string,
  title: string,
  images: SortedCarouselImage[],
  devSlides: string[],
): Promise<void> {
  const db = getDb();
  db.prepare(`UPDATE articles SET auto_preview_status = 'pending', auto_preview_error = NULL, auto_preview_mode = 'carousel' WHERE id = ?`).run(articleId);

  if (!IMPORT_SECRET) {
    console.log('[auto-generate] Déclenchement carrousel ignoré : IMPORT_SECRET absent');
    db.prepare(`UPDATE articles SET auto_preview_status = 'failed', auto_preview_error = ? WHERE id = ?`)
      .run('IMPORT_SECRET non configuré côté serveur', articleId);
    return;
  }

  try {
    const res = await fetch(`${STUDIO_IMPORT_URL}/api/auto-generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-import-secret': IMPORT_SECRET,
      },
      body: JSON.stringify({ mode: 'carousel', contentId, title, images, devSlides }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`STUDIO a répondu ${res.status}${text ? ` : ${text}` : ''}`);
    }
  } catch (err) {
    console.error('[auto-generate] Déclenchement carrousel échoué:', err instanceof Error ? err.message : err);
    db.prepare(`UPDATE articles SET auto_preview_status = 'failed', auto_preview_error = ? WHERE id = ?`)
      .run(err instanceof Error ? err.message : 'Erreur inconnue', articleId);
  }
}

/**
 * Point d'entrée unique appelé à la validation d'un article (et par
 * "Réessayer") — décide du mode (single/carrousel) et déclenche le bon
 * chemin. Décision RADAR (phase 4, étape 1 du plan écosystème) : le seuil
 * déjà validé sur 565 events réels (`DEV_SLIDE_PERTINENCE_THRESHOLD`,
 * brief.ts) sert aussi de seuil de mode — un événement pertinent au point
 * de mériter des slides de développement mérite aussi le format carrousel.
 *
 * Repli explicite sur 'single' si le carrousel n'est pas viable (aucune
 * image candidate, ou `getCarouselSlides` retombe non pertinent après coup
 * — le score peut avoir changé entre deux cycles) : jamais un carrousel à
 * une seule slide envoyé à STUDIO, jamais un échec silencieux non plus.
 *
 * Retourne `{ triggered: false }` (jamais une exception) quand aucun visuel
 * source n'existe pour l'événement — cas normal (pas une erreur système),
 * mais l'appelant (le bouton "Réessayer") doit pouvoir le distinguer d'un
 * vrai déclenchement pour ne jamais afficher un faux succès.
 */
export async function triggerAutoGeneratePreview(
  articleId: number,
  contentId: string,
  eventId: number,
  title: string,
): Promise<{ triggered: boolean }> {
  const db = getDb();
  const event = db.prepare(`SELECT score FROM events WHERE id = ?`).get(eventId) as { score: number } | undefined;
  const wantsCarousel = (event?.score ?? 0) >= DEV_SLIDE_PERTINENCE_THRESHOLD;

  if (wantsCarousel) {
    const slides = await getCarouselSlides(eventId);
    const images = getSortedImagesForEvent(eventId, title);
    if (slides?.pertinent && images.length > 0) {
      await triggerAutoGenerateCarousel(articleId, contentId, title, images, slides.dev);
      return { triggered: true };
    }
    console.log(`[auto-generate] Événement ${eventId} : carrousel non viable (pertinent=${slides?.pertinent ?? false}, ${images.length} image(s)) — repli sur le mode single`);
  }

  const imageUrl = getBestImageForEvent(eventId);
  if (!imageUrl) {
    console.log(`[auto-generate] Événement ${eventId} : aucun visuel source — aucune génération auto déclenchée`);
    return { triggered: false };
  }
  await triggerAutoGenerate(articleId, contentId, title, imageUrl);
  return { triggered: true };
}
