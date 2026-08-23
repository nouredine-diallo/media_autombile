"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, undefined);

  return (
    <div className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center bg-[var(--surface-base)]">
      <div className="w-full max-w-sm rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-8">
        <h1 className="mb-6 text-center text-xl font-semibold text-[var(--text-primary)]">
          Le Média Automobile
        </h1>
        <p className="mb-6 text-center text-sm text-[var(--text-secondary)]">
          Centre de contrôle
        </p>
        <form action={action} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-sm font-medium text-[var(--text-secondary)]"
            >
              Mot de passe
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              placeholder="Entrez le mot de passe"
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50 btn-glow-blue"
          >
            {pending ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
