import { isGoogleConfigured, getStoredTokens } from '@/lib/google-auth';
import Link from 'next/link';

export function DriveStatusBadge() {
  const configured = isGoogleConfigured();
  const tokens = getStoredTokens();

  return (
    <Link
      href="/drive"
      className="inline-flex h-[52px] shrink-0 items-center gap-2 rounded-[var(--radius-lg)] border bg-[var(--surface-raised)] px-3.5 text-[12px] font-medium transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-hover)]"
      style={{
        borderColor: tokens
          ? 'var(--success-border)'
          : configured
            ? 'var(--warn-border)'
            : 'var(--border-subtle)',
        color: tokens
          ? 'var(--success)'
          : configured
            ? 'var(--warn)'
            : 'var(--text-muted)',
      }}
    >
      {tokens ? (
        <>
          <span className="w-1.5 h-1.5 bg-[var(--success)] rounded-full" />
          Drive connecté
        </>
      ) : configured ? (
        <>
          <span className="w-1.5 h-1.5 bg-[var(--warn)] rounded-full" />
          Drive à connecter
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 bg-[var(--text-faint)] rounded-full" />
          Drive local
        </>
      )}
    </Link>
  );
}
