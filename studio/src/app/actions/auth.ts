"use server";

import { redirect } from "next/navigation";
import { createSession, deleteSession } from "@/lib/session";

export async function login(_prevState: string | undefined, formData: FormData) {
  const password = formData.get("password") as string;

  if (password !== process.env.AUTH_PASSWORD) {
    return "Mot de passe incorrect";
  }

  await createSession("user");
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
