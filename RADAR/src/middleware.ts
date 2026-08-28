import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const secretKey = process.env.SESSION_SECRET || "fallback-very-long-secret-key-that-is-32-bytes-at-least-123456789";
const paddedKey = secretKey.padEnd(32, "0");
const encodedKey = new TextEncoder().encode(paddedKey);

const publicRoutes = ["/login", "/select-name"];

/**
 * R5 (audit /tmp/opencode/RAPPORT_QA.md, 2026-08-28) — les 30 routes /api/*
 * étaient TOUTES accessibles sans session, y compris génération d'article,
 * cron, corrections, partenaires. Confirmé par grep (`getSession`/`verifySession`
 * absent des 30 fichiers `route.ts`) et par curl direct en prod. Corrigé ici,
 * au point d'entrée unique, plutôt que d'ajouter 30 vérifications dupliquées
 * dans chaque route (RADAR/CLAUDE.md — cohérence, pas de duplication).
 *
 * Deux routes restent volontairement ouvertes : ce sont les seuls appels
 * serveur-à-serveur STUDIO→RADAR du projet (voir RADAR/CLAUDE.md §9b et
 * studio/CLAUDE.md §6b) — STUDIO n'a pas de session RADAR, un cookie ne
 * peut jamais y être présent. `/exported` est déjà documenté sans auth
 * ("réseau interne partagé"). `/carousel-package` est le même cas : relais
 * lu par `studio/src/app/api/carousel-package/[contentId]/route.ts`, qui
 * lui-même exige déjà une session STUDIO avant d'appeler RADAR — l'exposer
 * ne fait que lire des données déjà publiques via le lien de prefill.
 *
 * `/api/system/status` s'y ajoute pour une raison différente : trouvé par
 * test réel en navigateur (Playwright, 2026-08-28) — `DegradedModeBanner`
 * est monté dans `layout.tsx` racine, donc rendu même sur `/login` et
 * `/select-name` (routes publiques, avant toute session). Sans exception,
 * le bandeau échouait silencieusement sur ces deux pages (le composant
 * gère déjà l'échec avec un `.catch()` muet — jamais de crash — mais
 * l'information de mode dégradé disparaissait là où elle doit justement
 * apparaître le plus tôt). Endpoint en lecture seule, non sensible (statut
 * killswitch/mode dégradé, `src/lib/killswitch.ts`) — aucune donnée utilisateur.
 */
const publicApiPatterns = [
  /^\/api\/events\/[^/]+\/exported$/,
  /^\/api\/events\/[^/]+\/carousel-package$/,
  /^\/api\/system\/status$/,
];

async function verifySession(token: string) {
  try {
    const { payload } = await jwtVerify(token, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload as {
      userId: string;
      userName?: string;
    };
  } catch {
    return null;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Routes API serveur-à-serveur explicitement documentées sans session (voir ci-dessus)
  if (publicApiPatterns.some((pattern) => pattern.test(pathname))) {
    return NextResponse.next();
  }

  // Allow public routes
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Check session (pages ET reste de l'API — voir R5 ci-dessus)
  const sessionCookie = request.cookies.get("session")?.value;
  const session = sessionCookie ? await verifySession(sessionCookie) : null;

  if (!session) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
