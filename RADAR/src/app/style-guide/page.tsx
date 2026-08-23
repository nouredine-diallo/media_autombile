'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';

interface StyleRule {
  id: number;
  banned: string;
  expected: string;
  is_active: number;
  usage_count: number;
  created_at: string;
  last_used_at: string | null;
}

export default function StyleGuidePage() {
  const [rules, setRules] = useState<StyleRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [banned, setBanned] = useState('');
  const [expected, setExpected] = useState('');
  const [submitting, setSubmitting] = useState(false);
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
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!banned.trim() || !expected.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/style-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned: banned.trim(), expected: expected.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setRules(prev => [data.rule, ...prev]);
        setBanned('');
        setExpected('');
        addToast({ type: 'success', title: 'Règle ajoutée', message: 'Elle sera injectée dans le prochain prompt de génération.' });
      }
    } catch {
      addToast({ type: 'error', title: 'Erreur', message: 'Impossible d\'ajouter la règle' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (rule: StyleRule) => {
    const nextActive = rule.is_active ? false : true;
    setRules(prev => prev.map(r => (r.id === rule.id ? { ...r, is_active: nextActive ? 1 : 0 } : r)));
    try {
      await fetch('/api/style-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, is_active: nextActive }),
      });
    } catch {
      addToast({ type: 'error', title: 'Erreur', message: 'La mise à jour n\'a pas été enregistrée' });
      fetchRules();
    }
  };

  const handleDelete = async (id: number) => {
    setRules(prev => prev.filter(r => r.id !== id));
    try {
      await fetch(`/api/style-rules?id=${id}`, { method: 'DELETE' });
    } catch {
      addToast({ type: 'error', title: 'Erreur', message: 'La suppression a échoué' });
      fetchRules();
    }
  };

  const activeRules = rules.filter(r => r.is_active);
  const rulesInPrompt = [...activeRules]
    .sort((a, b) => b.usage_count - a.usage_count || b.created_at.localeCompare(a.created_at))
    .slice(0, 15);
  const inPromptIds = new Set(rulesInPrompt.map(r => r.id));

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--surface-base)] p-8">
        <div className="max-w-4xl mx-auto text-center text-[var(--text-secondary)]">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-base)] p-8">
      <div className="max-w-4xl mx-auto">
        <Link href="/" className="text-[var(--accent)] hover:underline mb-4 inline-block text-sm">
          ← Retour au tableau de veille
        </Link>
        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Guide de style — Règles dynamiques</h1>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          &quot;Prompt as Data&quot; : chaque règle active est injectée dans le prompt système de génération.
          Seules les {Math.min(15, activeRules.length)} règles les plus utilisées (ou récentes) sont chargées
          à la fois, pour ne jamais dégrader le prompt principal.
        </p>

        {/* Add form */}
        <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-4 mb-6">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Ajouter une règle</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Terme banni</label>
              <input
                type="text"
                value={banned}
                onChange={(e) => setBanned(e.target.value)}
                placeholder='Ex: "voiture électrique"'
                className="w-full p-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] rounded text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--text-secondary)] mb-1">Terme attendu</label>
              <input
                type="text"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                placeholder='Ex: "véhicule zéro émission"'
                className="w-full p-2 border border-[var(--border-subtle)] bg-[var(--surface-base)] rounded text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={!banned.trim() || !expected.trim() || submitting}
            className="px-4 py-2 bg-[var(--brand)] text-white rounded hover:bg-[var(--accent-hover)] disabled:opacity-50 text-sm"
          >
            {submitting ? 'Ajout...' : 'Ajouter au guide de style'}
          </button>
        </div>

        {/* Rules table */}
        <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg">
          {rules.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-muted)] text-sm">
              Aucune règle. Le guide de style provisoire (fichier) reste la seule référence tant qu&apos;aucune
              règle dynamique n&apos;est ajoutée.
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-subtle)]">
              {rules.map((rule) => (
                <div key={rule.id} className="p-4 flex items-center gap-3">
                  <button
                    onClick={() => handleToggle(rule)}
                    title={rule.is_active ? 'Désactiver' : 'Activer'}
                    className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${
                      rule.is_active ? 'bg-[var(--success)]' : 'bg-[var(--surface-hover)]'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                        rule.is_active ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-[var(--danger-soft)] text-[var(--danger)] line-through">{rule.banned}</span>
                      <span className="text-[var(--text-muted)]">→</span>
                      <span className="px-2 py-0.5 rounded bg-[var(--success-soft)] text-[var(--success)]">{rule.expected}</span>
                      {rule.is_active === 1 && inPromptIds.has(rule.id) && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-[var(--studio-soft)] text-[var(--studio)]" title="Chargée dans le prochain prompt">
                          dans le prompt
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-1 font-data">
                      Utilisée {rule.usage_count}x · ajoutée le {new Date(rule.created_at).toLocaleDateString('fr-FR')}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--danger)] flex-shrink-0"
                  >
                    Supprimer
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
