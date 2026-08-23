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
  const partnerPassphrase = formData.get("partnerPassphrase") as string;

  if (!name || name.trim().length === 0) {
    return "Veuillez sélectionner votre nom";
  }

  const partnerAccess = partnerPassphrase === process.env.PARTNER_PASSPHRASE;

  await createSession("user", name.trim(), partnerAccess);
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
    partnerAccess: session.partnerAccess || false,
  };
}

export async function getMyName(): Promise<string> {
  const session = await getSession();
  return session?.userName || "unknown";
}
