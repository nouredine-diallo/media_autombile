'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Confirmation en ligne — remplace `confirm()` natif du navigateur (bloquant,
 * incohérent avec le reste de l'interface qui n'utilise jamais de dialogue
 * système). Un premier clic affiche "Confirmer / Annuler" à la place du
 * bouton, un second clic déclenche l'action.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Confirmer',
  className = '',
  confirmClassName = '',
}: {
  onConfirm: () => void;
  children: ReactNode;
  confirmLabel?: string;
  className?: string;
  confirmClassName?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            onConfirm();
          }}
          className={
            confirmClassName ||
            'rounded-lg border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]'
          }
        >
          {confirmLabel}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-base)]"
        >
          Annuler
        </button>
      </span>
    );
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className={className}>
      {children}
    </button>
  );
}
