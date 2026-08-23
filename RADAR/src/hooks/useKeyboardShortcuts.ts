'use client';

import { useEffect, useCallback, useRef } from 'react';

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: () => void;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  const handler = useCallback((e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    for (const shortcut of shortcutsRef.current) {
      const ctrlMatch = shortcut.ctrl ? (e.ctrlKey || e.metaKey) : !(e.ctrlKey || e.metaKey);
      const shiftMatch = shortcut.shift ? e.shiftKey : !e.shiftKey;
      const altMatch = shortcut.alt ? e.altKey : !e.altKey;

      if (e.key === shortcut.key && ctrlMatch && shiftMatch && altMatch) {
        e.preventDefault();
        shortcut.action();
        return;
      }
    }
  }, []);

  useEffect(() => {
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handler]);
}

// Pre-defined shortcuts for the dashboard
export const COMMON_SHORTCUTS = {
  HOME: { key: 'h', description: 'Aller à l\'accueil' },
  VEILLE: { key: 'v', description: 'Aller à la veille' },
  STATS: { key: 's', description: 'Aller aux stats' },
  CALENDRIER: { key: 'c', description: 'Aller au calendrier' },
  PARTENAIRES: { key: 'p', description: 'Aller aux partenaires' },
  FOCUS: { key: 'f', description: 'Mode focus' },
  SIDEBAR: { key: '[', description: 'Rétracter la barre' },
  VALIDATE: { key: 'Enter', ctrl: true, description: 'Valider' },
  VALIDATE_NEXT: { key: 'Enter', ctrl: true, shift: true, description: 'Valider et suivant' },
  ESCAPE: { key: 'Escape', description: 'Quitter / Annuler' },
};
