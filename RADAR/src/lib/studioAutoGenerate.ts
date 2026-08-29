import { getDb } from './db';

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
  db.prepare(`UPDATE articles SET auto_preview_status = 'pending', auto_preview_error = NULL WHERE id = ?`).run(articleId);

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
      body: JSON.stringify({ contentId, title, imageUrl }),
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
