import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const secretKey = process.env.SESSION_SECRET || "fallback-very-long-secret-key-that-is-32-bytes-at-least-123456789";
// Ensure key is always padded to at least 32 bytes to prevent jose HS256 crash
const paddedKey = secretKey.padEnd(32, "0");
const encodedKey = new TextEncoder().encode(paddedKey);

export interface SessionPayload {
  userId: string;
  userName?: string;
  expiresAt: Date;
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT({
    userId: payload.userId,
    userName: payload.userName || null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(encodedKey);
}

export async function decrypt(session: string | undefined = "") {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
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

export async function createSession(
  userId: string,
  userName?: string,
) {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const session = await encrypt({ userId, userName, expiresAt });
  const cookieStore = await cookies();

  cookieStore.set("session", session, {
    httpOnly: true,
    // Audit du 2026-09-07 (finding A1/A2) : sans ces deux réglages sortis en
    // variables d'env, le cookie était host-only (jamais transmis entre
    // 89.168.53.133.nip.io et studio.89.168.53.133.nip.io, contrairement à ce
    // qu'affirme ECOSYSTEM.md) et toujours envoyé en clair. Par défaut
    // (variables absentes) le comportement actuel est préservé à l'identique
    // pour ne rien casser en dev local — activer les deux dès que le HTTPS
    // (setup-ssl.sh) est en place en prod.
    secure: process.env.SESSION_COOKIE_SECURE === "true",
    domain: process.env.SESSION_COOKIE_DOMAIN || undefined,
    expires: expiresAt,
    sameSite: "lax",
    path: "/",
  });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

export async function getSession() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  return decrypt(sessionCookie);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    return null;
  }
  return session;
}
