'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ElementType } from 'react';
import { PUBLIC_ROUTES } from '@/components/AppFrame';
import {
  IconHome,
  IconVeille,
  IconReady,
  IconCorrections,
  IconGuide,
  IconStats,
  IconCalendar,
  IconPartners,
  IconDrive,
  IconStudio,
  IconPanelToggle,
  IconExternal,
} from '@/components/icons';

interface NavItem {
  href: string;
  icon: ElementType;
  label: string;
  shortcut?: string;
}

/** Groupe 1 : le travail quotidien. Groupe 2 : les outils annexes. */
const NAV_GROUPS: NavItem[][] = [
  [
    { href: '/', icon: IconHome, label: 'Accueil' },
    { href: '/events', icon: IconVeille, label: 'Veille', shortcut: 'V' },
    { href: '/ready', icon: IconReady, label: 'Prêts à publier', shortcut: 'R' },
    { href: '/corrections', icon: IconCorrections, label: 'Corrections', shortcut: 'C' },
  ],
  [
    { href: '/stats', icon: IconStats, label: 'Stats', shortcut: 'S' },
    { href: '/calendrier', icon: IconCalendar, label: 'Calendrier', shortcut: 'K' },
    { href: '/partenaires', icon: IconPartners, label: 'Partenaires', shortcut: 'P' },
    { href: '/drive', icon: IconDrive, label: 'Drive' },
    { href: '/style-guide', icon: IconGuide, label: 'Guide de style' },
  ],
];

const STUDIO_ITEM: NavItem = {
  href: 'http://localhost:3001',
  icon: IconStudio,
  label: 'STUDIO',
};

export function Sidebar() {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  const togglePin = useCallback(() => {
    setIsPinned((pinned) => {
      setIsExpanded(!pinned);
      return !pinned;
    });
  }, []);

  // Raccourci « [ » : épingler / rétracter
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return;
      if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        togglePin();
      }
      if (e.key === 'Escape' && isPinned) {
        setIsPinned(false);
        setIsExpanded(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPinned, togglePin]);

  // Écrans publics : aucune navigation avant identification.
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  const renderItem = (item: NavItem, external = false) => {
    const isActive = external
      ? false
      : item.href === '/'
        ? pathname === '/'
        : pathname.startsWith(item.href);
    const Icon = item.icon;

    const linkProps = external
      ? { href: item.href, target: '_blank', rel: 'noopener noreferrer' }
      : { href: item.href };

    return (
      <Link
        key={item.href}
        {...linkProps}
        title={isExpanded ? undefined : item.label}
        aria-current={isActive ? 'page' : undefined}
        className={`group relative flex h-9 items-center gap-3 px-2.5 transition-colors duration-[var(--dur-fast)] ${
          isActive
            ? 'text-white'
            : 'text-[var(--text-secondary)] hover:text-white'
        }`}
      >
        {/* Repère d'état actif : ligne rouge verticale à gauche */}
        {isActive && (
          <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[var(--accent)]" />
        )}
        <Icon
          size={18}
          strokeWidth={1.75}
          className={`shrink-0 ${isActive ? 'text-[var(--accent)]' : ''}`}
        />
        {isExpanded && (
          <>
            <span className="t-label truncate">{item.label}</span>
            {external && <IconExternal size={12} strokeWidth={2} className="opacity-50" />}
            {item.shortcut && !external && (
              <kbd className="font-data ml-auto rounded border border-white/10 px-1 text-[10px] leading-4 text-[var(--text-muted)]">
                {item.shortcut}
              </kbd>
            )}
          </>
        )}
      </Link>
    );
  };

  if (isPublic) return null;

  return (
    <aside
      onMouseEnter={() => !isPinned && setIsExpanded(true)}
      onMouseLeave={() => !isPinned && setIsExpanded(false)}
      className={`fixed left-0 top-0 z-40 flex h-full flex-col border-r border-white/8 bg-[var(--chrome-bg)] transition-[width] duration-[var(--dur)] ease-[var(--ease)] ${
        isExpanded ? 'w-60' : 'w-16'
      }`}
    >
      {/* Marque + bascule */}
      <div className="flex h-14 items-center gap-2 px-2.5">
        <button
          onClick={togglePin}
          aria-label={isPinned ? 'Rétracter la barre latérale' : 'Épingler la barre latérale'}
          title={isPinned ? 'Rétracter la barre  [' : 'Épingler la barre  ['}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors duration-[var(--dur-fast)] hover:bg-white/5 hover:text-white"
        >
          <IconPanelToggle size={18} strokeWidth={1.75} />
        </button>
        {isExpanded && (
          <span className="t-label truncate text-white">Le Média Automobile</span>
        )}
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2">
        {NAV_GROUPS.map((group, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            {i > 0 && <div className="my-2 h-px bg-[var(--border-subtle)]" />}
            {group.map((item) => renderItem(item))}
          </div>
        ))}

        {/* STUDIO : application externe, violet maintenu */}
        <div className="mt-auto flex flex-col gap-0.5 pt-2">
          <div className="mb-2 h-px bg-white/8" />
          <Link
            href={STUDIO_ITEM.href}
            target="_blank"
            rel="noopener noreferrer"
            title={isExpanded ? undefined : 'STUDIO'}
            className="flex h-9 items-center gap-3 px-2.5 text-[var(--studio)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--studio)]"
          >
            <IconStudio size={18} strokeWidth={1.75} className="shrink-0" />
            {isExpanded && (
              <>
                <span className="t-label truncate">STUDIO</span>
                <IconExternal size={12} strokeWidth={2} className="ml-auto opacity-60" />
              </>
            )}
          </Link>
          {isExpanded && (
            <p className="t-caption px-2.5 pt-2 text-[var(--text-muted)]">
              <kbd className="font-data rounded border border-white/10 px-1 text-[10px]">
                [
              </kbd>{' '}
              pour {isPinned ? 'rétracter' : 'épingler'}
            </p>
          )}
        </div>
      </nav>
    </aside>
  );
}
