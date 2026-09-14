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
  IconStats,
  IconCalendar,
  IconPartners,
  IconDrive,
  IconAnalytics,
  IconStudio,
  IconPanelToggle,
  IconExternal,
  IconMenu,
  IconClose,
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
    { href: '/ready', icon: IconReady, label: 'Articles validés', shortcut: 'R' },
    { href: '/corrections', icon: IconCorrections, label: 'Voix éditoriale', shortcut: 'C' },
  ],
  [
    { href: '/stats', icon: IconStats, label: 'Stats', shortcut: 'S' },
    { href: '/calendrier', icon: IconCalendar, label: 'Calendrier', shortcut: 'K' },
    { href: '/partenaires', icon: IconPartners, label: 'Partenaires', shortcut: 'P' },
    { href: '/drive', icon: IconDrive, label: 'Drive' },
    { href: '/analytics', icon: IconAnalytics, label: 'Usage de l\'outil' },
  ],
];

export function Sidebar({ studioUrl }: { studioUrl: string }) {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  // Finding B5 (audit 2026-09-07) : la barre latérale fixe (64px replié,
  // toujours visible) n'avait aucune adaptation mobile — sur un iPhone en
  // portrait (~375-390px), elle consommait ~18% de la largeur en
  // permanence. Repli en tiroir sous le point de rupture `sm` (640px) :
  // masquée par défaut, ouverte par le bouton hamburger, refermée au choix
  // d'une page ou à l'extérieur.
  const [mobileOpen, setMobileOpen] = useState(false);

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
      if (e.key === 'Escape') {
        if (isPinned) {
          setIsPinned(false);
          setIsExpanded(false);
        }
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isPinned, togglePin]);

  // Un changement de page referme le tiroir mobile — rester ouvert dessus
  // masquerait le contenu de la nouvelle page sans raison. Fermé depuis le
  // clic du lien lui-même (gestionnaire d'événement), pas depuis un effet
  // ou une lecture de ref pendant le rendu — les deux sont refusés par ce
  // projet (react-hooks/set-state-in-effect, react-hooks/refs).
  const closeMobileDrawer = useCallback(() => setMobileOpen(false), []);

  // Écrans publics : aucune navigation avant identification.
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  // Labels visibles soit au survol/épinglage desktop, soit dès que le
  // tiroir mobile est ouvert (pas de survol possible au doigt).
  const showLabels = isExpanded || mobileOpen;

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
        onClick={closeMobileDrawer}
        title={showLabels ? undefined : item.label}
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
        {showLabels && (
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
    <>
      {/* Bouton hamburger — mobile uniquement (sm:hidden), la barre fixe
          reprend le dessus dès 640px (voir <aside> ci-dessous). */}
      <button
        onClick={() => setMobileOpen((open) => !open)}
        aria-label={mobileOpen ? 'Fermer la navigation' : 'Ouvrir la navigation'}
        aria-expanded={mobileOpen}
        className="fixed left-2.5 top-2.5 z-50 flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-white/8 bg-[var(--chrome-bg)] text-white sm:hidden"
      >
        {mobileOpen ? <IconClose size={18} strokeWidth={1.75} /> : <IconMenu size={18} strokeWidth={1.75} />}
      </button>

      {/* Fond assombri derrière le tiroir ouvert — le tap referme, comme un
          menu mobile standard. */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          aria-hidden
          className="fixed inset-0 z-30 bg-black/50 sm:hidden"
        />
      )}

      <aside
        onMouseEnter={() => !isPinned && setIsExpanded(true)}
        onMouseLeave={() => !isPinned && setIsExpanded(false)}
        className={`fixed left-0 top-0 z-40 flex h-full flex-col border-r border-white/8 bg-[var(--chrome-bg)] transition-[width,transform] duration-[var(--dur)] ease-[var(--ease)] sm:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${showLabels ? 'w-60' : 'w-16'}`}
      >
        {/* Marque + bascule */}
        <div className="flex h-14 items-center gap-2 px-2.5">
          <button
            onClick={togglePin}
            aria-label={isPinned ? 'Rétracter la barre latérale' : 'Épingler la barre latérale'}
            title={isPinned ? 'Rétracter la barre  [' : 'Épingler la barre  ['}
            className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors duration-[var(--dur-fast)] hover:bg-white/5 hover:text-white sm:flex"
          >
            <IconPanelToggle size={18} strokeWidth={1.75} />
          </button>
          {showLabels && (
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
              href={studioUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={closeMobileDrawer}
              title={showLabels ? undefined : 'STUDIO'}
              className="flex h-9 items-center gap-3 px-2.5 text-[var(--studio)] transition-colors duration-[var(--dur-fast)] hover:text-[var(--studio)]"
            >
              <IconStudio size={18} strokeWidth={1.75} className="shrink-0" />
              {showLabels && (
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
    </>
  );
}
