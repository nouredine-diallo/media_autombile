'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { getHighlightSegments } from '@/lib/factHighlight';

interface FactHighlighterProps {
  content: string;
  /** Identifiant stable de l'article — réinitialise la checklist au changement d'article */
  articleKey: number;
  onContentChange: (newContent: string) => void;
  onChecklistChange?: (checkedCount: number, total: number) => void;
}

export function FactHighlighter({ content, articleKey, onContentChange, onChecklistChange }: FactHighlighterProps) {
  const segments = useMemo(() => getHighlightSegments(content), [content]);
  const sensitiveCount = useMemo(() => segments.filter(s => s.sensitive).length, [segments]);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const prevArticleKey = useRef(articleKey);
  const prevSensitiveCount = useRef(sensitiveCount);

  // Réinitialise la checklist quand on change d'article, ou quand une
  // correction fait apparaître/disparaître un nombre de repères sensibles
  // différent (le mapping index → segment n'est plus fiable).
  useEffect(() => {
    if (prevArticleKey.current !== articleKey || prevSensitiveCount.current !== sensitiveCount) {
      setChecked(new Set());
      prevArticleKey.current = articleKey;
      prevSensitiveCount.current = sensitiveCount;
    }
  }, [articleKey, sensitiveCount]);

  useEffect(() => {
    onChecklistChange?.(checked.size, sensitiveCount);
  }, [checked, sensitiveCount, onChecklistChange]);

  const toggleChecked = (idx: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  /** Macro-action : coche toutes les données sensibles en 1 clic. */
  const checkAll = () => {
    const allIndices = new Set<number>();
    for (let i = 0; i < sensitiveCount; i++) allIndices.add(i);
    setChecked(allIndices);
  };

  const handleCorrect = (idx: number, oldText: string, start: number, end: number) => {
    const corrected = window.prompt('Corriger cette valeur :', oldText);
    if (corrected === null || corrected === oldText) return;
    const newContent = content.slice(0, start) + corrected + content.slice(end);
    onContentChange(newContent);
    // La valeur vient d'être vérifiée par le rédacteur lui-même.
    setChecked(prev => new Set(prev).add(idx));
  };

  const hasUnchecked = sensitiveCount > 0 && checked.size < sensitiveCount;

  let sensitiveIndex = -1;

  return (
    <>
      {segments.map((seg, i) => {
        if (!seg.sensitive) {
          return <span key={i}>{seg.text}</span>;
        }
        sensitiveIndex++;
        const idx = sensitiveIndex;
        const isChecked = checked.has(idx);
        return (
          <mark
            key={i}
            onClick={() => toggleChecked(idx)}
            onDoubleClick={() => handleCorrect(idx, seg.text, seg.start, seg.end)}
            title={isChecked ? 'Vérifié — cliquer pour annuler' : 'Cliquer pour confirmer • double-clic pour corriger'}
            className={`cursor-pointer rounded px-0.5 font-medium transition-colors ${
              isChecked
                ? 'bg-[var(--success-soft)] text-[var(--success)] ring-1 ring-[var(--success-border)]'
                : 'bg-[var(--warn-soft)] text-[var(--warn)] ring-1 ring-[var(--warn-border)]'
            }`}
          >
            {seg.text}
          </mark>
        );
      })}
      {hasUnchecked && (
        <button
          type="button"
          onClick={checkAll}
          className="ml-2 inline-flex items-center gap-1 rounded border border-[var(--border-default)] bg-[var(--surface-hover)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          Tout confirmer ({sensitiveCount - checked.size})
        </button>
      )}
    </>
  );
}
