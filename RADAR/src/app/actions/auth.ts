"use server";

import { redirect } from "next/navigation";
import { createSession, deleteSession, getSession } from "@/lib/session";
import { TEAM_MEMBERS } from "@/lib/team";

export async function login(_prevState: string | undefined, formData: FormData) {
  const password = formData.get("password") as string;

  if (password !== process.env.AUTH_PASSWORD) {
    return "Mot de passe incorrect";
  }

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
