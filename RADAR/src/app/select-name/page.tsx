"use client";

import { useActionState } from "react";
import { selectName } from "@/app/actions/auth";

const TEAM_MEMBERS = [
  "Alexandre",
  "Baptiste",
  "Clément",
  "David",
  "Emmanuel",
  "François",
  "Gabriel",
  "Hugo",
  "Ioannis",
  "Julien",
];

export default function SelectNamePage() {
  const [error, action, pending] = useActionState(selectName, undefined);

  return (
    <div className="flex min-h-[calc(100vh-4.5rem)] items-center justify-center bg-[var(--surface-base)]">
      <div className="w-full max-w-sm rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-8">
        <h1 className="mb-2 text-center text-xl font-semibold text-[var(--text-primary)]">
          Qui êtes-vous ?
        </h1>
        <p className="mb-6 text-center text-sm text-[var(--text-secondary)]">
          Sélectionnez votre nom pour cette session
        </p>
        <form action={action} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="name"
              className="mb-1 block text-sm font-medium text-[var(--text-secondary)]"
            >
              Nom
            </label>
            <select
              id="name"
              name="name"
              required
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              autoFocus
            >
              <option value="">Sélectionner...</option>
              {TEAM_MEMBERS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="border-t border-[var(--border-subtle)] pt-4">
            <label
              htmlFor="partnerPassphrase"
              className="mb-1 block text-sm font-medium text-[var(--text-secondary)]"
            >
              Passphrase partenaires (optionnel)
            </label>
            <input
              id="partnerPassphrase"
              name="partnerPassphrase"
              type="password"
              className="w-full rounded-md border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              placeholder="Uniquement si accès partenaires"
            />
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Nécessaire pour accéder à la section Partenaires
            </p>
          </div>

          {error && (
            <p className="text-sm text-[var(--danger)]">{error}</p>
          )}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)] disabled:opacity-50 btn-glow-blue"
          >
            {pending ? "Connexion..." : "Continuer"}
          </button>
        </form>
      </div>
    </div>
  );
}
