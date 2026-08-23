"use server";

import { redirect } from "next/navigation";
import { createSession, deleteSession, getSession } from "@/lib/session";

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
