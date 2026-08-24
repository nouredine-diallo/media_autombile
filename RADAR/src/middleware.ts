import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const secretKey = process.env.SESSION_SECRET || "fallback-very-long-secret-key-that-is-32-bytes-at-least-123456789";
const paddedKey = secretKey.padEnd(32, "0");
const encodedKey = new TextEncoder().encode(paddedKey);

const publicRoutes = ["/login", "/select-name"];
const apiRoutes = ["/api"];

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

  // Allow API routes
  if (apiRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Allow public routes
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Check session
  const sessionCookie = request.cookies.get("session")?.value;
  const session = sessionCookie ? await verifySession(sessionCookie) : null;

  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
