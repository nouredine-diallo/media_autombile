import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { UPLOADS_DIR } from "@/lib/images/store";
import { cropToAspectSmart } from "@/lib/images/pipeline";
import { retirerBandes } from "@/lib/images/trimBandes";
import { segmentSubject, SegmentationUnavailableError } from "@/lib/images/segment";
import { checkGabaritFit } from "@/lib/images/gabaritFit";
import {
  GABARIT_1A_WIDTH,
  GABARIT_1A_HEIGHT,
  GABARIT_PHOTO_HEIGHT,
} from "@/components/gabarits/Gabarit1A";
import {
  GABARIT_2A_BULLE,
} from "@/components/gabarits/Gabarit2A";
import {
  GABARIT_2B_BULLE,
} from "@/components/gabarits/Gabarit2B";
import {
  GABARIT_3A_BULLE1,
  GABARIT_3A_BULLE2,
} from "@/components/gabarits/Gabarit3A";
import {
  GABARIT_3B_BULLE1,
  GABARIT_3B_BULLE2,
} from "@/components/gabarits/Gabarit3B";
import {
  GABARIT_BULLE_WIDTH,
  GABARIT_BULLE_HEIGHT,
  GABARIT_BULLE_OCCUPANCY,
} from "@/components/gabarits/Gabarit1A";

export const runtime = "nodejs";

const DOWNLOAD_TIMEOUT_MS = 15_000;
const ALLOWED_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const GABARIT_IDS = ["1a", "1b", "2a", "2b", "3a", "3b"] as const;

/**
 * POST /api/images/import
 *
 * Endpoint serveur-à-serveur : RADAR envoie une URL d'image, STUDIO la
 * télécharge, exécute le pipeline complet (retirerBandes → cropToAspectSmart
 * → segment → gabaritFit), et renvoie un diagnostic JSON indiquant quels
 * gabarits sont compatibles avec cette image.
 *
 * Protégé par un secret partagé (header `x-import-secret`) — pas de session
 * navigateur requise.
 *
 * Request:  { url: string, articleId?: string }
 * Response: { id, width, height, subjectWidth, fitsSubject, gabarits, verdict, bestGabarits }
 *
 * Les fichiers temporaires sont nettoyés après le diagnostic — l'image n'est
 * PAS conservée dans le dossier uploads de STUDIO (RADAR gère son propre
 * cache).
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-import-secret");
  if (!secret || secret !== process.env.IMPORT_SECRET) {
    return NextResponse.json({ error: "Secret invalide" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!body?.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "Champ 'url' requis" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(body.url);
    if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error();
  } catch {
    return NextResponse.json({ error: "URL invalide" }, { status: 400 });
  }

  const id = randomUUID();
  const dir = path.join(UPLOADS_DIR, id);

  try {
    await mkdir(dir, { recursive: true });

    // --- 1. Téléchargement ---
    const res = await fetch(parsedUrl.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Impossible de télécharger l'image (${res.status})` },
        { status: 502 },
      );
    }

    const contentType = res.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
      return NextResponse.json(
        { error: `Type non supporté : ${contentType ?? "inconnu"}` },
        { status: 422 },
      );
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 5000) {
      return NextResponse.json(
        { error: "Image trop petite (< 5 Ko)" },
        { status: 422 },
      );
    }

    const ext = ALLOWED_MIME[contentType.split(";")[0]] ?? "jpg";
    const originalPath = path.join(dir, `original.${ext}`);
    await writeFile(originalPath, buffer);

    // --- 2. Retirer les bandes éventuelles ---
    const sourcePath = path.join(dir, "source.jpg");
    await retirerBandes(originalPath, sourcePath);

    // --- 3. Recadrage smart (fond + bulle) ---
    const croppedPath = path.join(dir, "cropped.jpg");
    const backdropPath = path.join(dir, "backdrop.jpg");
    const bullePath = path.join(dir, "bulle.jpg");
    const cropOutcome = await cropToAspectSmart(
      sourcePath,
      croppedPath,
      backdropPath,
      { width: GABARIT_1A_WIDTH, height: GABARIT_1A_HEIGHT },
      { width: GABARIT_1A_WIDTH, height: GABARIT_PHOTO_HEIGHT },
      {
        path: bullePath,
        target: { width: GABARIT_BULLE_WIDTH, height: GABARIT_BULLE_HEIGHT },
        occupancy: GABARIT_BULLE_OCCUPANCY,
      },
    );

    // --- 4. Détourage du sujet (segmentation ONNX) ---
    let subjectPng: Buffer | null = null;
    let segmentationAvailable = true;
    try {
      subjectPng = await segmentSubject(backdropPath);
    } catch (err) {
      if (err instanceof SegmentationUnavailableError) {
        segmentationAvailable = false;
      } else {
        throw err;
      }
    }

    // --- 5. Gabarit-fit pour chaque gabarit ---
    const gabarits: Record<
      string,
      { ok: boolean; ratios: number[]; suggestion?: string; message: string }
    > = {};

    if (subjectPng) {
      for (const gid of GABARIT_IDS) {
        try {
          const report = await checkGabaritFit(subjectPng, gid);
          gabarits[gid] = {
            ok: report.ok,
            ratios: report.ratios,
            suggestion: report.suggestion,
            message: report.message,
          };
        } catch {
          gabarits[gid] = {
            ok: false,
            ratios: [],
            message: "Erreur lors du contrôle qualité",
          };
        }
      }
    }

    // --- 6. Verdict global ---
    const okGabarits = Object.entries(gabarits)
      .filter(([, v]) => v.ok)
      .map(([k]) => k);
    const bulleOk = okGabarits.filter((g) => g !== "1a" && g !== "1b");
    let verdict: "ok" | "marginal" | "bad";
    if (bulleOk.length > 0) {
      verdict = "ok";
    } else if (okGabarits.length > 0) {
      verdict = "marginal";
    } else {
      verdict = "bad";
    }

    // --- 7. Mesure du sujet (largeur dans le cadre) ---
    let subjectWidth = 0;
    if (subjectPng) {
      try {
        const sharp = (await import("sharp")).default;
        const { data, info } = await sharp(subjectPng)
          .resize(GABARIT_1A_WIDTH, cropOutcome.backdrop.height, { fit: "cover" })
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const { width: W, channels: C } = info;
        let minX = W,
          maxX = -1;
        for (let y = 0; y < cropOutcome.backdrop.height; y++) {
          for (let x = 0; x < W; x++) {
            if (data[(y * W + x) * C + 3] < 128) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
        }
        subjectWidth = maxX < minX ? 0 : (maxX - minX + 1) / W;
      } catch {
        // Mesure impossible — non bloquant
      }
    }

    return NextResponse.json({
      id,
      width: cropOutcome.backdrop.width,
      height: cropOutcome.backdrop.height,
      subjectWidth: Number(subjectWidth.toFixed(3)),
      fitsSubject: cropOutcome.backdrop.fitsSubject,
      fitsFully: cropOutcome.backdrop.fitsFully,
      segmentationAvailable,
      gabarits,
      verdict,
      bestGabarits: okGabarits,
    });
  } catch (err) {
    console.error("[import] Erreur pipeline:", err);
    return NextResponse.json(
      { error: `Erreur interne : ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  } finally {
    // Nettoyage : les fichiers temporaires ne sont pas conservés
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
