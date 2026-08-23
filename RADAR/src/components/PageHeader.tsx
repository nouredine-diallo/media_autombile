import type { ReactNode } from 'react';
import Link from 'next/link';
import { IconArrowLeft } from '@/components/icons';

/**
 * En-tête de page unique pour tout le Dashboard.
 *
 * La navigation vit dans la barre latérale — l'en-tête ne la duplique pas.
 * Il porte : où je suis, éventuellement d'où je viens, et l'action principale.
 *
 * C'est du chrome : le verre dépoli y est autorisé (contrairement au contenu).
 */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
}) {
  return (
    <header className="chrome-glass sticky top-0 z-30 border-b">
      <div className="flex h-14 items-center gap-4 px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {back && (
            <Link
              href={back.href}
              className="flex items-center gap-1.5 text-[var(--text-muted)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--text-primary)]"
            >
              <IconArrowLeft size={15} strokeWidth={1.75} />
              <span className="t-caption hidden sm:inline">{back.label}</span>
            </Link>
          )}
          {back && <div className="h-4 w-px bg-[var(--border-default)]" />}
          <h1 className="t-title truncate text-[var(--text-primary)]">{title}</h1>
          {subtitle && (
            <span className="t-caption hidden truncate text-[var(--text-muted)] md:inline">
              {subtitle}
            </span>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
