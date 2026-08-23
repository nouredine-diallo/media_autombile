'use client';

import { useState, useEffect } from 'react';
import { useToast } from './Toast';

interface StyleRule {
  id: number;
  banned: string;
  expected: string;
  is_active: number;
  usage_count: number;
  created_at: string;
}

export function StyleRulesManager() {
  const [rules, setRules] = useState<StyleRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [newBanned, setNewBanned] = useState('');
  const [newExpected, setNewExpected] = useState('');
  const [adding, setAdding] = useState(false);
  const { addToast } = useToast();

  useEffect(() => {
    fetchRules();
  }, []);

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/style-rules');
      if (res.ok) {
        const data = await res.json();
        setRules(data.rules || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!newBanned.trim() || !newExpected.trim()) return;
    setAdding(true);
    try {
      const res = await fetch('/api/style-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned: newBanned.trim(), expected: newExpected.trim() }),
      });
      if (res.ok) {
        setNewBanned('');
        setNewExpected('');
        fetchRules();
        addToast({ type: 'success', title: 'Règle ajoutée', message: `"${newBanned}" → "${newExpected}"` });
      }
    } catch {} finally {
      setAdding(false);
    }
  };

  const handleToggle = async (rule: StyleRule) => {
    try {
      await fetch('/api/style-rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, is_active: rule.is_active ? 0 : 1 }),
      });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: r.is_active ? 0 : 1 } : r));
    } catch {}
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/style-rules?id=${id}`, { method: 'DELETE' });
      setRules(prev => prev.filter(r => r.id !== id));
      addToast({ type: 'info', title: 'Règle supprimée', message: '' });
    } catch {}
  };

  if (loading) {
    return <div className="text-[var(--text-muted)] text-sm">Chargement...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Add new rule */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newBanned}
          onChange={(e) => setNewBanned(e.target.value)}
          placeholder="Terme à bannir"
          className="flex-1 px-3 py-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] rounded text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--danger)] focus:outline-none"
        />
        <span className="self-center text-[var(--text-muted)]">→</span>
        <input
          type="text"
          value={newExpected}
          onChange={(e) => setNewExpected(e.target.value)}
          placeholder="Terme attendu"
          className="flex-1 px-3 py-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] rounded text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--success)] focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={!newBanned.trim() || !newExpected.trim() || adding}
          className="px-4 py-2 bg-[var(--brand)] text-white rounded text-sm hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {adding ? '...' : 'Ajouter'}
        </button>
      </div>

      {/* Rules list */}
      <div className="space-y-2">
        {rules.length === 0 && (
          <p className="text-[var(--text-muted)] text-sm text-center py-4">Aucune règle. Ajoutez-en une ci-dessus.</p>
        )}
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
              rule.is_active
                ? 'border-[var(--border-subtle)] bg-[var(--surface-raised)]'
                : 'border-[var(--border-subtle)] bg-[var(--surface-hover)] opacity-50'
            }`}
          >
            <button
              onClick={() => handleToggle(rule)}
              className={`w-8 h-4 rounded-full transition-all relative ${
                rule.is_active ? 'bg-[var(--success)]' : 'bg-[var(--surface-hover)]'
              }`}
            >
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${
                rule.is_active ? 'left-4' : 'left-0.5'
              }`} />
            </button>

            <div className="flex-1 flex items-center gap-2 text-sm">
              <span className="text-[var(--danger)] line-through">{rule.banned}</span>
              <span className="text-[var(--text-muted)]">→</span>
              <span className="text-[var(--success)]">{rule.expected}</span>
            </div>

            <span className="text-[10px] text-[var(--text-muted)] font-data">
              {rule.usage_count}× utilisé
            </span>

            <button
              onClick={() => handleDelete(rule.id)}
              className="text-[var(--text-muted)] hover:text-[var(--danger)] text-xs"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <p className="text-[10px] text-[var(--text-muted)]">
        Les 15 règles les plus utilisées ou récentes sont injectées dans le prompt LLM.
        Le Rédacteur en Chef peut programmer l&apos;IA sans écrire de code.
      </p>
    </div>
  );
}
