"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSession, deleteSession } from "@/lib/session";

/**
 * Rate limiting du login — finding A3 (audit 2026-09-07, même correctif que
 * RADAR/src/app/actions/auth.ts). Compteur en mémoire process : un seul
 * process sert STUDIO (PM2 sans cluster, deploy/start-studio.sh).
 */
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; windowStart: number }>();

function getClientIp(headersList: Headers): string {
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headersList.get("x-real-ip") || "unknown";
}

function pruneExpiredAttempts(now: number) {
  for (const [ip, record] of loginAttempts) {
    if (now - record.windowStart >= LOGIN_WINDOW_MS) {
      loginAttempts.delete(ip);
    }
  }
}

export async function login(_prevState: string | undefined, formData: FormData) {
  const headersList = await headers();
  const ip = getClientIp(headersList);
  const now = Date.now();
  pruneExpiredAttempts(now);

  const existing = loginAttempts.get(ip);
  if (existing && now - existing.windowStart < LOGIN_WINDOW_MS && existing.count >= MAX_LOGIN_ATTEMPTS) {
    const remainingMin = Math.ceil((LOGIN_WINDOW_MS - (now - existing.windowStart)) / 60000);
    return `Trop de tentatives — réessaie dans ${remainingMin} min`;
  }

  const password = formData.get("password") as string;

  if (password !== process.env.AUTH_PASSWORD) {
    const record = existing && now - existing.windowStart < LOGIN_WINDOW_MS
      ? existing
      : { count: 0, windowStart: now };
    record.count++;
    loginAttempts.set(ip, record);
    return "Mot de passe incorrect";
  }

  loginAttempts.delete(ip);
  await createSession("user");
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
