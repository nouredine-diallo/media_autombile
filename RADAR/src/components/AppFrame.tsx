'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/** Routes publiques : pas de barre latérale, donc pas de décalage à gauche. */
export const PUBLIC_ROUTES = ['/login', '/select-name'];

/**
 * Cadre de l'application : gère le décalage laissé à la barre latérale.
 * Sur les écrans publics (connexion, choix du nom), la navigation n'a pas
 * lieu d'être affichée — on ne montre pas les rubriques de l'outil à
 * quelqu'un qui n'est pas encore identifié.
 *
 * La classe `dashboard-enter` ajoute un fade-in de 200ms pour une transition
 * harmonieuse entre le login (fond #982124) et le dashboard (fond dark).
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  return (
    // Finding B5 (audit 2026-09-07) : la marge réservée à la barre latérale
    // ne s'applique plus qu'à partir de `sm` (640px) — la barre elle-même
    // est masquée par défaut en dessous de ce point de rupture (Sidebar.tsx,
    // tiroir mobile), réserver l'espace sur mobile n'aurait servi à rien.
    <div className={`flex min-h-screen flex-col ${isPublic ? '' : 'sm:pl-16 dashboard-enter'}`}>
      {children}
    </div>
  );
}
