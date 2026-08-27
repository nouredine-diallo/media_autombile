import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import dns from "node:dns/promises";
import net from "node:net";
import { getSession } from "@/lib/session";
import { cropToAspectSmart } from "@/lib/images/pipeline";
import { retirerBandes } from "@/lib/images/trimBandes";
import { UPLOADS_DIR } from "@/lib/images/store";
import {
  GABARIT_1A_HEIGHT,
  GABARIT_PHOTO_HEIGHT,
  GABARIT_1A_WIDTH,
} from "@/components/gabarits/Gabarit1A";

export const runtime = "nodejs";

const MAX_URLS = 5;
const MAX_SIZE_BYTES = 20 * 1024 * 1024;
const MIN_SIZE_BYTES = 1024;

/**
 * Plages privées/internes/loopback — un serveur qui accepte de "fetch" une
 * URL fournie par un client authentifié (mot de passe partagé, pas un secret
 * serveur-à-serveur — voir `studio/CLAUDE.md` §1.1) peut être détourné pour
 * atteindre le réseau interne de l'hébergeur (SSRF) : service de métadonnées
 * cloud (169.254.169.254), autres services sur le même VPC, etc. Trouvé par
 * revue de sécurité le 2026-08-27 — cette route n'avait aucune de ces
 * vérifications, contrairement à sa route sœur serveur-à-serveur
 * `api/images/import/route.ts` (protégée par un secret différent, pas
 * exposée à une simple session navigateur).
 */
function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    return (
      /^127\./.test(ip) ||
      /^10\./.test(ip) ||
      /^192\.168\./.test(ip) ||
      /^169\.254\./.test(ip) || // lien-local + métadonnées cloud (AWS/GCP/Azure/Oracle)
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
      /^0\./.test(ip)
    );
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower.startsWith("fe80:") || // lien-local
      lower.startsWith("fc") || lower.startsWith("fd") || // unique-local
      lower.startsWith("::ffff:127.")
    );
  }
  return true; // forme non reconnue : refuser plutôt que deviner
}

/**
 * Valide le schéma ET résout le nom d'hôte pour rejeter toute cible privée
 * AVANT le fetch — une validation d'URL seule (schéma http/https) ne dit
 * rien de l'adresse IP réelle derrière un nom de domaine.
 */
async function isUrlSafeToFetch(rawUrl: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (!["http:", "https:"].includes(parsed.protocol)) return false;

  try {
    const { address } = await dns.lookup(parsed.hostname);
    return !isPrivateAddress(address);
  } catch {
    return false; // résolution DNS échouée : on refuse plutôt que de laisser fetch() réessayer
  }
}

/**
 * POST /api/images/import-urls
 *
 * Variante serveur-à-serveur de `upload-batch` pour des URLs externes
 * (carrousel RADAR, `titres/carrousel/page.tsx`). Nécessaire — vérifié en
 * testant le carrousel avec de vraies URLs, pas supposé : un `fetch()` fait
 * par le NAVIGATEUR vers une image hébergée ailleurs est bloqué par CORS dès
 * que l'hébergeur ne renvoie pas `Access-Control-Allow-Origin` (le cas pour
 * plusieurs sources réelles testées). Un fetch serveur-à-serveur n'est pas
 * soumis à cette restriction.
 *
 * Réutilise les mêmes fonctions de pipeline que `upload-batch`
 * (`cropToAspectSmart`, `retirerBandes`) — aucune logique de recadrage
 * dupliquée. Ne réutilise PAS `suggestRoles` : cette fonction compare
 * plusieurs photos d'un même sujet pour deviner laquelle est le fond et
 * lesquelles sont les bulles — une question qui ne se pose pas ici, chaque
 * image de carrousel étant indépendante (une slide = une image dédiée).
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const urls = (body?.urls as string[] | undefined) ?? [];
  if (urls.length === 0) {
    return NextResponse.json({ error: "Aucune URL reçue (champ 'urls')" }, { status: 400 });
  }
  if (urls.length > MAX_URLS) {
    return NextResponse.json({ error: `Maximum ${MAX_URLS} URLs par appel` }, { status: 400 });
  }

  const results: Array<{ id: string; croppedUrl: string; backdropUrl: string }> = [];

  for (const url of urls) {
    try {
      if (!(await isUrlSafeToFetch(url))) continue;

      // `redirect: "manual"` — un hôte public peut rediriger vers une cible
      // privée après coup (contournement classique de la vérification
      // ci-dessus) ; on refuse de suivre plutôt que de re-résoudre chaque saut.
      const res = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "manual" });
      if (!res.ok) continue;

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.startsWith("image/")) continue;
      const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.byteLength < MIN_SIZE_BYTES || buffer.byteLength > MAX_SIZE_BYTES) continue;

      const id = randomUUID();
      const dir = path.join(UPLOADS_DIR, id);
      await mkdir(dir, { recursive: true });
      const originalPath = path.join(dir, `original.${ext}`);
      await writeFile(originalPath, buffer);

      const sourcePath = path.join(dir, "source.jpg");
      await retirerBandes(originalPath, sourcePath);

      const croppedPath = path.join(dir, "cropped.jpg");
      const backdropPath = path.join(dir, "backdrop.jpg");
      await cropToAspectSmart(
        sourcePath,
        croppedPath,
        backdropPath,
        { width: GABARIT_1A_WIDTH, height: GABARIT_1A_HEIGHT },
        { width: GABARIT_1A_WIDTH, height: GABARIT_PHOTO_HEIGHT },
      );

      results.push({
        id,
        croppedUrl: `/api/images/${id}?variant=cropped`,
        backdropUrl: `/api/images/${id}?variant=backdrop`,
      });
    } catch {
      // URL source inaccessible ou traitement échoué — on continue avec les suivantes,
      // pas de dégradation silencieuse côté résultat final : le tableau `images`
      // renvoyé est simplement plus court, jamais rempli d'une entrée invalide.
    }
  }

  return NextResponse.json({ images: results });
}
