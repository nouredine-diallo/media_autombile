import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/session";

const publicRoutes = ["/login"];

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isPublicRoute = publicRoutes.includes(path);

  const sessionCookie = request.cookies.get("session")?.value;
  const session = await decrypt(sessionCookie);

  if (!isPublicRoute && !session) {
    // Signalé le 14 sept. 2026 : arriver depuis RADAR (lien "Carrousel"/
    // "Slide unique") sans session STUDIO existante perdait la destination
    // pré-remplie — après connexion, l'opérateur atterrissait sur l'accueil
    // générique au lieu de l'écran carrousel avec le contenu RADAR déjà
    // chargé. Une fois la session posée, les clics suivants passaient
    // directement (cette branche ne se déclenche plus), ce qui masquait le
    // bug après la première connexion de la session.
    const loginUrl = new URL("/login", request.nextUrl);
    loginUrl.searchParams.set("next", path + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  if (isPublicRoute && session) {
    return NextResponse.redirect(new URL("/", request.nextUrl));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
