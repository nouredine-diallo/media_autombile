'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToast } from '@/components/Toast';
import { PageHeader } from '@/components/PageHeader';
import { Button, EmptyState, SkeletonRows } from '@/components/ui';

interface StyleRule {
  id: number;
  banned: string;
  expected: string;
  is_active: number;
  usage_count: number;
  created_at: string;
  last_used_at: string | null;
}

interface Correction {
  id: number;
  article_id: number;
  generated_text: string;
  corrected_text: string;
  correction_type: string | null;
  pattern_observed: string | null;
  notes: string | null;
  created_at: string;
}

interface PatternAnalysis {
  total_corrections: number;
  patterns: Array<{
    pattern: string;
    count: number;
    examples: Array<{
      generated: string;
      corrected: string;
    }>;
  }>;
  type_distribution: Array<{
    type: string;
    count: number;
  }>;
}

import { IconCheck, IconInbox, IconWarning } from '@/components/icons';

export default function CorrectionsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen">
        <PageHeader title="Corrections" back={{ href: '/', label: 'Accueil' }} />
        <div className="mx-auto max-w-6xl px-6 py-6"><SkeletonRows rows={3} height={72} /></div>
      </div>
    }>
      <CorrectionsContent />
    </Suspense>
  );
}

function CorrectionsContent() {
  const searchParams = useSearchParams();
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [analysis, setAnalysis] = useState<PatternAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'analysis' | 'rules'>(
    searchParams.get('tab') === 'rules' ? 'rules' : 'list'
  );
  const [addedRuleIds, setAddedRuleIds] = useState<Set<number>>(new Set());
  const [addingRuleId, setAddingRuleId] = useState<number | null>(null);
  const { addToast } = useToast();

  // Règles actives — fusionné depuis l'ancienne page /style-guide (2026-08-27) :
  // "Corrections" et "Guide de style" affichaient déjà la même table
  // `style_rules` sous deux formes différentes, une seule fonctionnalité sur
  // deux pages plutôt que deux fonctionnalités liées.
  const [rules, setRules] = useState<StyleRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [banned, setBanned] = useState('');
  const [expected, setExpected] = useState('');
  const [submittingRule, setSubmittingRule] = useState(false);

  useEffect(() => {
    fetchData();
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
      // silencieux — la liste reste vide, pas de blocage de la page
    } finally {
      setRulesLoading(false);
    }
  };

  const handleAddRule = async () => {
    if (!banned.trim() || !expected.trim() || submittingRule) return;
    setSubmittingRule(true);
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
      addToast({ type: 'error', title: 'Erreur', message: "Impossible d'ajouter la règle" });
    } finally {
      setSubmittingRule(false);
    }
  };

  const handleToggleRule = async (rule: StyleRule) => {
    const nextActive = !rule.is_active;
    setRules(prev => prev.map(r => (r.id === rule.id ? { ...r, is_active: nextActive ? 1 : 0 } : r)));
    try {
      await fetch('/api/style-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rule.id, is_active: nextActive }),
      });
    } catch {
      addToast({ type: 'error', title: 'Erreur', message: "La mise à jour n'a pas été enregistrée" });
      fetchRules();
    }
  };

  const handleDeleteRule = async (id: number) => {
    setRules(prev => prev.filter(r => r.id !== id));
    try {
      await fetch(`/api/style-rules?id=${id}`, { method: 'DELETE' });
    } catch {
      addToast({ type: 'error', title: 'Erreur', message: 'La suppression a échoué' });
      fetchRules();
    }
  };

  const fetchData = async () => {
    try {
      const [correctionsRes, analysisRes] = await Promise.all([
        fetch('/api/corrections'),
        fetch('/api/corrections?action=analyze'),
      ]);

      if (correctionsRes.ok) {
        const data = await correctionsRes.json();
        setCorrections(data.corrections || []);
      }

      if (analysisRes.ok) {
        const data = await analysisRes.json();
        setAnalysis(data.analysis);
      }
    } catch (err) {
      console.error('Error fetching data');
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    const response = await fetch('/api/corrections?action=export');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'corrections.csv';
    a.click();
  };

  const handleAddToStyleGuide = async (correction: Correction) => {
    if (addingRuleId) return;
    setAddingRuleId(correction.id);
    try {
      const response = await fetch('/api/style-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banned: correction.generated_text, expected: correction.corrected_text }),
      });
      if (response.ok) {
        setAddedRuleIds(prev => new Set(prev).add(correction.id));
        addToast({ type: 'success', title: 'Guide de style mis à jour', message: 'La règle sera appliquée aux prochaines générations.' });
        fetchRules(); // garde le compteur "Règles actives" à jour sans changer d'onglet
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Erreur', message: 'Impossible d\'ajouter la règle' });
    } finally {
      setAddingRuleId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Corrections" back={{ href: '/', label: 'Accueil' }} />
        <div className="mx-auto max-w-6xl px-6 py-6">
          <SkeletonRows rows={3} height={72} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Corrections"
        back={{ href: '/', label: 'Accueil' }}
        actions={
          <Button onClick={handleExport} variant="secondary">
            Exporter CSV
          </Button>
        }
      />
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded text-sm ${
              activeTab === 'list' ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
            }`}
          >
            Liste ({corrections.length})
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-4 py-2 rounded text-sm ${
              activeTab === 'analysis' ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
            }`}
          >
            Analyse des patterns
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`px-4 py-2 rounded text-sm ${
              activeTab === 'rules' ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border-subtle)]'
            }`}
          >
            Règles actives ({rules.filter(r => r.is_active).length})
          </button>
        </div>

        {activeTab === 'list' && (
          <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg">
            {corrections.length === 0 ? (
              <EmptyState
                icon={IconInbox}
                title="Aucune correction enregistrée"
                hint="Une correction s'ajoute ici dès qu'un article est édité manuellement pendant la revue."
              />
            ) : (
              <div className="divide-y divide-[var(--border-subtle)]">
                {corrections.map((correction) => (
                  <div key={correction.id} className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs text-[var(--text-muted)] font-data">
                        #{correction.id}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] font-data">
                        Article #{correction.article_id}
                      </span>
                      {correction.correction_type && (
                        <span className="px-2 py-0.5 rounded text-xs bg-[var(--accent-soft)] text-[var(--accent)]">
                          {correction.correction_type}
                        </span>
                      )}
                      <span className="text-xs text-[var(--text-muted)] ml-auto font-data">
                        {new Date(correction.created_at).toLocaleString('fr-FR')}
                      </span>
                      <button
                        onClick={() => handleAddToStyleGuide(correction)}
                        disabled={addingRuleId === correction.id || addedRuleIds.has(correction.id)}
                        className="px-2 py-1 bg-[var(--brand)] text-white rounded hover:bg-[var(--brand-hover)] disabled:opacity-50 text-[10px] flex-shrink-0"
                      >
                        {addedRuleIds.has(correction.id) ? (
                          <span className="inline-flex items-center gap-1"><IconCheck size={11} strokeWidth={2.5} />Ajoutée</span>
                        ) : addingRuleId === correction.id ? '…' : 'Ajouter au Guide de Style'}
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <div className="font-medium text-[var(--text-secondary)] mb-1">Généré:</div>
                        <div className="p-2 bg-[var(--danger-soft)] rounded text-[var(--text-secondary)]">
                          {correction.generated_text}
                        </div>
                      </div>
                      <div>
                        <div className="font-medium text-[var(--text-secondary)] mb-1">Corrigé:</div>
                        <div className="p-2 bg-[var(--success-soft)] rounded text-[var(--text-secondary)]">
                          {correction.corrected_text}
                        </div>
                      </div>
                    </div>
                    
                    {correction.pattern_observed && (
                      <div className="mt-2 text-xs text-[var(--text-secondary)]">
                        <span className="font-medium">Pattern:</span> {correction.pattern_observed}
                      </div>
                    )}
                    
                    {correction.notes && (
                      <div className="mt-1 text-xs text-[var(--text-muted)]">
                        <span className="font-medium">Notes:</span> {correction.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'analysis' && analysis && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Résumé</h2>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-[var(--accent)] font-data">
                    {analysis.total_corrections}
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">Corrections totales</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[var(--success)] font-data">
                    {analysis.patterns.length}
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">Patterns identifiés</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-[var(--studio)] font-data">
                    {analysis.type_distribution.length}
                  </div>
                  <div className="text-sm text-[var(--text-secondary)]">Types de corrections</div>
                </div>
              </div>
            </div>

            {/* Type distribution */}
            <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Distribution par type</h2>
              <div className="space-y-3">
                {analysis.type_distribution.map((item) => (
                  <div key={item.type} className="flex items-center gap-3">
                    <div className="w-32 text-sm text-[var(--text-secondary)]">{item.type}</div>
                    <div className="flex-1 bg-[var(--surface-hover)] rounded-full h-4">
                      <div
                        className="bg-[var(--accent)] h-4 rounded-full"
                        style={{
                          width: `${(item.count / analysis.total_corrections) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="w-12 text-sm text-[var(--text-secondary)] text-right font-data">
                      {item.count}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Patterns */}
            <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Patterns observés</h2>
              {analysis.patterns.length === 0 ? (
                <div className="text-center text-[var(--text-muted)] py-4">
                  Pas encore assez de corrections pour analyser les patterns.
                </div>
              ) : (
                <div className="space-y-4">
                  {analysis.patterns.map((pattern) => (
                    <div key={pattern.pattern} className="border border-[var(--border-subtle)] rounded p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-[var(--text-primary)]">{pattern.pattern}</h3>
                        <span className="px-2 py-0.5 rounded text-xs bg-[var(--surface-hover)] text-[var(--text-secondary)] font-data">
                          {pattern.count} occurrence{pattern.count > 1 ? 's' : ''}
                        </span>
                      </div>
                      
                      <div className="space-y-2">
                        {pattern.examples.map((example, i) => (
                          <div key={i} className="grid grid-cols-2 gap-2 text-xs">
                            <div className="p-2 bg-[var(--danger-soft)] rounded">
                              <span className="font-medium text-[var(--danger)]">Généré: </span>
                              <span className="text-[var(--text-secondary)]">{example.generated}</span>
                            </div>
                            <div className="p-2 bg-[var(--success-soft)] rounded">
                              <span className="font-medium text-[var(--success)]">Corrigé: </span>
                              <span className="text-[var(--text-secondary)]">{example.corrected}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recommendation for guide v2 */}
            {analysis.total_corrections >= 30 && (
              <div className="bg-[var(--warn-soft)] border border-[var(--warn-border)] rounded-lg p-6">
                <h2 className="t-title mb-2 flex items-center gap-2 text-[var(--warn)]">
                  <IconWarning size={16} strokeWidth={2} />
                  Seuil atteint
                </h2>
                <p className="text-sm text-[var(--text-secondary)]">
                  30 corrections enregistrées. Il est temps de produire une révision du guide de style (v2) basée sur les patterns observés.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'rules' && (
          <div className="space-y-6">
            <p className="text-sm text-[var(--text-secondary)]">
              &quot;Prompt as Data&quot; : chaque règle active est injectée dans le prompt système de génération.
              Seules les {Math.min(15, rules.filter(r => r.is_active).length)} règles les plus utilisées (ou
              récentes) sont chargées à la fois, pour ne jamais dégrader le prompt principal.
            </p>

            <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg p-4">
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
                onClick={handleAddRule}
                disabled={!banned.trim() || !expected.trim() || submittingRule}
                className="px-4 py-2 bg-[var(--brand)] text-white rounded hover:bg-[var(--accent-hover)] disabled:opacity-50 text-sm"
              >
                {submittingRule ? 'Ajout...' : 'Ajouter au guide de style'}
              </button>
            </div>

            <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg">
              {rulesLoading ? (
                <SkeletonRows rows={3} height={56} />
              ) : rules.length === 0 ? (
                <EmptyState
                  icon={IconInbox}
                  title="Aucune règle"
                  hint="Le guide de style provisoire (fichier) reste la seule référence tant qu'aucune règle dynamique n'est ajoutée."
                />
              ) : (
                <div className="divide-y divide-[var(--border-subtle)]">
                  {rules.map((rule) => (
                    <div key={rule.id} className="p-4 flex items-center gap-3">
                      <button
                        onClick={() => handleToggleRule(rule)}
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
                        </div>
                        <div className="text-xs text-[var(--text-muted)] mt-1 font-data">
                          Utilisée {rule.usage_count}x · ajoutée le {new Date(rule.created_at).toLocaleDateString('fr-FR')}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDeleteRule(rule.id)}
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
        )}
      </div>
    </div>
  );
}
