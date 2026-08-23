'use client';

import { useState } from 'react';

interface ShortcutHint {
  key: string;
  description: string;
  ctrl?: boolean;
}

interface KeyboardHintProps {
  shortcuts: ShortcutHint[];
  className?: string;
}

export function KeyboardHint({ shortcuts, className = '' }: KeyboardHintProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="flex items-center gap-1 text-xs text-[var(--text-faint)] hover:text-[var(--text-secondary)] transition-colors"
      >
        <kbd className="font-data rounded border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">?</kbd>
        <span>Raccourcis</span>
      </button>

      {isVisible && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsVisible(false)}
          />
          <div className="chrome-glass absolute bottom-full right-0 z-50 mb-2 w-64 rounded-[var(--radius-lg)] border p-3">
            <div className="t-eyebrow mb-2.5">Raccourcis clavier</div>
            <div className="space-y-1.5">
              {shortcuts.map((shortcut) => (
                <div key={shortcut.key} className="flex items-center justify-between">
                  <span className="t-caption text-[var(--text-secondary)]">{shortcut.description}</span>
                  <kbd className="font-data rounded border border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[10px] text-[var(--text-primary)]">
                    {shortcut.ctrl && 'Ctrl+'}
                    {shortcut.key.toUpperCase()}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
