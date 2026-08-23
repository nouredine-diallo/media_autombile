import "server-only";
import { NextResponse } from "next/server";
import path from "node:path";
import { getSession } from "@/lib/session";
import { UPLOADS_DIR, resolveVariantPath } from "@/lib/images/store";
import { upscale, UpscaleUnavailableError } from "@/lib/images/pipeline";

export const runtime = "nodejs";

/**
 * Amélioration HD à la demande, sur l'image déjà recadrée (pas l'original) :
 * on améliore ce qui sera réellement utilisé dans le gabarit, jamais la
 * photo brute non cadrée.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await params;
  const croppedPath = await resolveVariantPath(id, "cropped");
  if (!croppedPath) {
    return NextResponse.json(
      { error: "Image introuvable — importez-la d'abord" },
      { status: 404 },
    );
  }

  const outputPath = path.join(UPLOADS_DIR, id, "upscaled.png");
  try {
    await upscale(croppedPath, outputPath);
  } catch (err) {
    if (err instanceof UpscaleUnavailableError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    throw err;
  }

  return NextResponse.json({ upscaledUrl: `/api/images/${id}?variant=upscaled` });
}
