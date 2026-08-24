import type { ReactNode } from 'react';
import Link from 'next/link';
import { IconArrowLeft } from '@/components/icons';

/**
 * En-tête de page unique pour tout le Dashboard.
 *
 * Fond sombre unifié + bordure de séparation fine.
 * La navigation vit dans la barre latérale — l'en-tête ne la duplique pas.
 * Il porte : où je suis, éventuellement d'où je viens, et l'action principale.
 *
 * C'est du chrome : fond identique au contenu, séparé par une bordure.
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
    <header className="sticky top-0 z-30 border-b border-white/8 bg-[var(--chrome-bg)]">
      <div className="flex h-14 items-center gap-4 px-6">
        {/* Logo LMA — ancre la marque */}
        <Link href="/" className="flex shrink-0 items-center">
          <img
            src="/logo.png"
            alt="Le Média Automobile"
            className="brand-logo"
          />
        </Link>

        {/* Séparateur vertical */}
        <div className="h-5 w-px bg-white/10" />

        {/* Titre + navigation */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {back && (
            <Link
              href={back.href}
              className="flex items-center gap-1.5 text-[var(--text-secondary)] transition-colors duration-[var(--dur-fast)] hover:text-white"
            >
              <IconArrowLeft size={15} strokeWidth={1.75} />
              <span className="t-caption hidden sm:inline">{back.label}</span>
            </Link>
          )}
          {back && <div className="h-4 w-px bg-white/10" />}
          <h1 className="t-title truncate text-white">{title}</h1>
          {subtitle && (
            <span className="t-caption hidden truncate text-[var(--text-secondary)] md:inline">
              {subtitle}
            </span>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
