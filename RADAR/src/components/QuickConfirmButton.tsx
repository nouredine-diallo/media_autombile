"use client";

import { useActionState } from "react";
import { confirmAutoPost } from "@/app/actions/autoGenerate";
import { IconCheck } from "@/components/icons";

/**
 * Bouton "Confirmer" autonome pour la Zone 1 du Dashboard (restructuration
 * UI, 17 sept. 2026) — même action serveur que `PostConfirmCard` sur
 * `/ready` (`confirmAutoPost`), sans le suivi de statut/poll complet : ces
 * cartes n'apparaissent que quand `auto_preview_status === 'ready'`, il n'y
 * a donc rien à attendre ici. Après confirmation, l'export se poursuit en
 * tâche de fond — visible sur `/ready` si besoin de vérifier le résultat.
 */
export function QuickConfirmButton({ articleId }: { articleId: number }) {
  const [state, action, pending] = useActionState(
    async () => confirmAutoPost(articleId),
    undefined,
  );

  if (state?.success) {
    return (
      <span className="t-caption inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2 text-[var(--success)]">
        <IconCheck size={14} strokeWidth={1.75} />
        Confirmé
      </span>
    );
  }

  return (
    <form action={action}>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-transparent bg-[var(--success)] px-3.5 text-[13px] font-medium text-white transition-colors duration-[var(--dur-fast)] hover:opacity-90 disabled:opacity-45"
      >
        <IconCheck size={14} strokeWidth={1.75} />
        {pending ? "Confirmation…" : "Confirmer"}
      </button>
      {state?.success === false && state.error && (
        <p className="t-caption mt-1 text-[var(--danger)]">{state.error}</p>
      )}
    </form>
  );
}
