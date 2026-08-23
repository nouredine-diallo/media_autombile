'use client';

import Link from 'next/link';
import { StyleRulesManager } from '@/components/StyleRulesManager';
import { KeyboardHint } from '@/components/KeyboardHint';

export default function GuideDeStylePage() {
  return (
    <div className="min-h-screen bg-[var(--surface-base)] p-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-[var(--accent)] hover:underline text-sm">
              ← Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Guide de Style</h1>
          </div>
          <KeyboardHint
            shortcuts={[
              { key: 'B', description: 'Retour au Dashboard' },
            ]}
          />
        </div>

        <div className="mb-6 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
          <p className="text-sm text-[var(--text-secondary)] mb-2">
            <strong className="text-[var(--text-primary)]">Prompt as Data</strong> — Le Rédacteur en Chef programme l&apos;IA sans écrire de code.
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            Chaque règle modifie dynamiquement le prompt système envoyé à Groq.
            Les 15 règles les plus utilisées ou récentes sont injectées automatiquement.
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
          <StyleRulesManager />
        </div>
      </div>
    </div>
  );
}
