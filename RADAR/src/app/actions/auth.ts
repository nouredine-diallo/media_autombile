"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSession, deleteSession, getSession } from "@/lib/session";
import { TEAM_MEMBERS } from "@/lib/team";
import { getClientIp, passwordMatches } from "@/lib/loginSecurity";

/**
 * Rate limiting du login — finding A3 (audit 2026-09-07) : aucune limite de
 * tentatives, combiné à l'absence de HTTPS (A1, en cours de correction),
 * rendait un bruteforce du mot de passe d'équipe sans aucune friction.
 * Compteur en mémoire process (même principe que le verrou D5 côté STUDIO —
 * un seul process sert RADAR, PM2 sans cluster). Purge opportuniste des
 * entrées expirées à chaque appel, pas de tâche planifiée en plus pour ça.
 *
 * `getClientIp`/`passwordMatches` extraits dans lib/loginSecurity.ts
 * (15 sept. 2026, findings 1.2/1.5, AUDIT-PRODUCTION-READINESS) — testés
 * par un vrai test unitaire (scripts/unit-tests/loginSecurity.test.ts),
 * impossible à faire proprement pour du code vivant dans un fichier
 * "use server".
 */
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map<string, { count: number; windowStart: number }>();

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

  if (!passwordMatches(password || "", process.env.AUTH_PASSWORD || "")) {
    const record = existing && now - existing.windowStart < LOGIN_WINDOW_MS
      ? existing
      : { count: 0, windowStart: now };
    record.count++;
    loginAttempts.set(ip, record);
    return "Mot de passe incorrect";
  }

  loginAttempts.delete(ip);
  await createSession("user");
  redirect("/select-name");
}

export async function selectName(_prevState: string | undefined, formData: FormData) {
  const name = formData.get("name") as string;

  if (!name || name.trim().length === 0) {
    return "Veuillez sélectionner votre nom";
  }

  // Validation serveur — avant ce correctif (2026-08-27), n'importe quelle
  // chaîne était acceptée en session, la liste TEAM_MEMBERS n'était qu'un
  // pré-remplissage côté UI, pas une restriction réelle.
  if (!(TEAM_MEMBERS as readonly string[]).includes(name.trim())) {
    return "Nom non reconnu — sélectionnez un membre de l'équipe dans la liste";
  }

  await createSession("user", name.trim());
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  return {
    userId: session.userId,
    userName: session.userName || "Utilisateur",
  };
}

export async function getMyName(): Promise<string> {
  const session = await getSession();
  return session?.userName || "unknown";
}
