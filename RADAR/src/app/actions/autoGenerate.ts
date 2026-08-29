"use server";

import { getDb } from "@/lib/db";
import { getBestImageForEvent } from "@/lib/visualSearch";
import { triggerAutoGenerate } from "@/lib/studioAutoGenerate";

const STUDIO_IMPORT_URL = process.env.STUDIO_IMPORT_URL || process.env.STUDIO_URL || "http://127.0.0.1:3002";
const IMPORT_SECRET = process.env.IMPORT_SECRET || "";

/**
 * Le clic "Confirmer" du parcours à un seul geste (plan écosystème
 * 2026-08-29) : demande à STUDIO de rejouer le rendu du visuel déjà aperçu
 * et de l'exporter vers Drive — la seule action de ce module qui a un effet
 * externe visible (studio/CLAUDE.md §2, confirmation humaine explicite).
 * STUDIO rappellera `/api/events/[contentId]/exported` une fois fait ; cette
 * action ne fait qu'attendre l'acceptation du job, pas son issue.
 */
export async function confirmAutoPost(
  articleId: number,
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();
  const article = db
    .prepare(
      `SELECT content_id, auto_preview_status FROM articles WHERE id = ? AND status = 'validated'`,
    )
    .get(articleId) as { content_id: string | null; auto_preview_status: string | null } | undefined;

  if (!article?.content_id) {
    return { success: false, error: "Article non trouvé ou non validé." };
  }
  if (article.auto_preview_status !== "ready") {
    return { success: false, error: "Aperçu pas encore prêt." };
  }
  if (!IMPORT_SECRET) {
    return { success: false, error: "IMPORT_SECRET non configuré côté serveur." };
  }

  try {
    const res = await fetch(`${STUDIO_IMPORT_URL}/api/auto-generate/confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-import-secret": IMPORT_SECRET,
      },
      body: JSON.stringify({ contentId: article.content_id }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { success: false, error: `STUDIO a répondu ${res.status}${text ? ` : ${text}` : ""}` };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Erreur réseau" };
  }
}

/**
 * Relance la génération d'aperçu — utilisé si elle a échoué (STUDIO down,
 * image introuvable ce jour-là) ou si elle est restée bloquée en 'pending'
 * trop longtemps. Ne redécouvre pas la logique : réutilise exactement le
 * même déclenchement que la validation initiale.
 */
export async function retryAutoGenerate(
  articleId: number,
): Promise<{ success: boolean; error?: string }> {
  const db = getDb();
  const article = db
    .prepare(`SELECT content_id, event_id, title FROM articles WHERE id = ? AND status = 'validated'`)
    .get(articleId) as { content_id: string | null; event_id: number; title: string } | undefined;

  if (!article?.content_id) {
    return { success: false, error: "Article non trouvé ou non validé." };
  }
  const imageUrl = getBestImageForEvent(article.event_id);
  if (!imageUrl) {
    return { success: false, error: "Aucun visuel source disponible pour cet événement." };
  }

  await triggerAutoGenerate(articleId, article.content_id, article.title, imageUrl);
  return { success: true };
}
