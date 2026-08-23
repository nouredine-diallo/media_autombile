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
 */
export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isPublic = PUBLIC_ROUTES.includes(pathname);

  return (
    <div className={`flex min-h-screen flex-col ${isPublic ? '' : 'pl-16'}`}>
      {children}
    </div>
  );
}
