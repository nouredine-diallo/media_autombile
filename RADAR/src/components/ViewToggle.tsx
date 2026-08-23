'use client';

import { useState, useEffect } from 'react';

export function ViewToggle() {
  const [view, setView] = useState<'mine' | 'all'>('all');

  useEffect(() => {
    const stored = localStorage.getItem('lma-view-mode') as 'mine' | 'all' | null;
    if (stored) setView(stored);
  }, []);

  const toggle = () => {
    const next = view === 'all' ? 'mine' : 'all';
    setView(next);
    localStorage.setItem('lma-view-mode', next);
    window.dispatchEvent(new CustomEvent('lma-view-change', { detail: { mode: next } }));
  };

  return (
    <button
      onClick={toggle}
      className="flex h-7 items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-default)] px-2.5 text-[12px] font-medium text-[var(--text-secondary)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--accent-border)] hover:text-[var(--accent)]"
      title={view === 'all' ? 'Vue Globale (tous les flux)' : 'Ma Vue (mes assignations)'}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {view === 'all' ? 'Vue Globale' : 'Ma Vue'}
    </button>
  );
}
