'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useToast } from '@/components/Toast';

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

import { IconCheck, IconWarning } from '@/components/icons';
export default function CorrectionsPage() {
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [analysis, setAnalysis] = useState<PatternAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'list' | 'analysis'>('list');
  const [addedRuleIds, setAddedRuleIds] = useState<Set<number>>(new Set());
  const [addingRuleId, setAddingRuleId] = useState<number | null>(null);
  const { addToast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

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
      }
    } catch (err) {
      addToast({ type: 'error', title: 'Erreur', message: 'Impossible d\'ajouter la règle' });
    } finally {
      setAddingRuleId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--surface-base)] p-8">
        <div className="max-w-6xl mx-auto">
          <div className="text-center text-[var(--text-secondary)]">Chargement...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-base)] p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <Link href="/" className="text-[var(--accent)] hover:underline mb-4 inline-block">
            ← Retour au tableau de veille
          </Link>
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-[var(--text-primary)]">Corrections</h1>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-[var(--success)] text-white rounded hover:bg-[var(--success)] text-sm"
            >
              Exporter CSV
            </button>
          </div>
        </div>

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
        </div>

        {activeTab === 'list' && (
          <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg">
            {corrections.length === 0 ? (
              <div className="p-8 text-center text-[var(--text-muted)]">
                Aucune correction enregistrée.
              </div>
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
                        className="px-2 py-1 bg-[var(--studio)] text-white rounded hover:bg-[var(--studio)] disabled:opacity-50 text-[10px] flex-shrink-0"
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
      </div>
    </div>
  );
}
