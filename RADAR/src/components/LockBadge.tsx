'use client';

import { useState, useEffect } from 'react';

interface LockBadgeProps {
  lockedBy: string | null;
  lockedAt: string | null;
  currentUser: string;
  onForceUnlock?: () => void;
}

export function LockBadge({ lockedBy, lockedAt, currentUser, onForceUnlock }: LockBadgeProps) {
  if (!lockedBy) return null;

  const isOwn = lockedBy === currentUser;
  const initials = lockedBy.slice(0, 2).toUpperCase();

  return (
    <div className={`
      inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium
      ${isOwn
        ? 'bg-[var(--accent-soft)] text-[var(--accent)] ring-1 ring-[var(--accent-border)]'
        : 'bg-[var(--surface-overlay)] text-[var(--text-secondary)] ring-1 ring-[var(--border-default)]'
      }
    `}>
      <span className="relative flex h-2 w-2">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isOwn ? 'bg-[var(--accent)]' : 'bg-[var(--surface-overlay)]'}`}></span>
        <span className={`relative inline-flex rounded-full h-2 w-2 ${isOwn ? 'bg-[var(--accent)]' : 'bg-[var(--surface-overlay)]'}`}></span>
      </span>
      <span className="font-data">{initials}</span>
      {isOwn ? (
        <span>vous</span>
      ) : (
        <span>{lockedBy}</span>
      )}
      {onForceUnlock && (
        <button
          onClick={(e) => { e.stopPropagation(); onForceUnlock(); }}
          className="ml-1 text-[var(--danger)] hover:text-[var(--danger)] font-bold"
          title="Forcer le déverrouillage"
        >
          ×
        </button>
      )}
    </div>
  );
}
