import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

/**
 * GET /api/articles/[id]/auto-preview
 *
 * Poll léger utilisé par `PostConfirmCard` (côté /ready) tant que le visuel
 * auto-généré est en préparation ('pending') — évite d'exiger un
 * rechargement manuel de page pour voir apparaître l'aperçu. Protégé par le
 * middleware de session standard (règle R5), comme toute API RADAR.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const articleId = parseInt(id, 10);
  if (Number.isNaN(articleId)) {
    return NextResponse.json({ error: "id invalide" }, { status: 400 });
  }

  const db = getDb();
  const article = db
    .prepare(
      `SELECT auto_preview_status, auto_preview_data_url, auto_preview_error
       FROM articles WHERE id = ?`,
    )
    .get(articleId) as
    | { auto_preview_status: string | null; auto_preview_data_url: string | null; auto_preview_error: string | null }
    | undefined;

  if (!article) {
    return NextResponse.json({ error: "Article introuvable" }, { status: 404 });
  }

  return NextResponse.json({
    status: article.auto_preview_status,
    dataUrl: article.auto_preview_data_url,
    error: article.auto_preview_error,
  });
}
