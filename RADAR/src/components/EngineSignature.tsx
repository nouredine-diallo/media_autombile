import { ENGINE, ENGINE_LABEL } from '@/lib/engine';

/**
 * Pied de page discret présent sur toutes les pages.
 *
 * Volontairement effacé : taille 10 px, encre `--text-faint`, pas de bordure,
 * pas de lien. Il doit se lire si on le cherche et disparaître sinon —
 * l'utilisateur travaille, il ne doit pas être distrait par une signature.
 */
export function EngineSignature({ className = '' }: { className?: string }) {
  return (
    <footer
      className={`px-6 pb-5 pt-8 text-center text-[10px] leading-4 tracking-[0.02em] text-[var(--text-faint)] select-none ${className}`}
    >
      <span>
        Powered by{' '}
        <span className="font-medium text-[var(--text-muted)]">
          {ENGINE.brand} {ENGINE.product}
        </span>{' '}
        — v{ENGINE.version}
      </span>
      <span className="sr-only"> ({ENGINE_LABEL})</span>
    </footer>
  );
}
