'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Partner {
  id: number;
  name: string;
  brand: string | null;
  campaign_start: string | null;
  campaign_end: string | null;
  deliverables: string | null;
  notes: string | null;
  target_count: number | null;
  target_format: 'slide_unique' | 'carrousel' | null;
  created_at: string;
  post_count?: number;
}

interface Article {
  id: number;
  content_id: string;
  title: string;
}

import { PageHeader } from '@/components/PageHeader';
import { Button, EmptyState, SkeletonRows } from '@/components/ui';
import { ConfirmButton } from '@/components/ConfirmButton';
import { IconPartners, IconPlus } from '@/components/icons';
export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    brand: '',
    campaign_start: '',
    campaign_end: '',
    deliverables: '',
    notes: '',
    target_count: '',
    target_format: '' as '' | 'slide_unique' | 'carrousel',
  });
  const [availableArticles, setAvailableArticles] = useState<Article[]>([]);
  const [selectedPartner, setSelectedPartner] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPartners();
    fetchAvailableArticles();
  }, []);

  const fetchPartners = async () => {
    try {
      const response = await fetch('/api/partners');
      const data = await response.json();
      if (data.success) {
        setPartners(data.partners);
      }
    } catch (err) {
      setError('Erreur lors du chargement des partenaires');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableArticles = async () => {
    try {
      const response = await fetch('/api/partners?available=true');
      const data = await response.json();
      if (data.success) {
        setAvailableArticles(data.articles);
      }
    } catch (err) {
      console.error('Error fetching articles:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const url = editingId ? `/api/partners?id=${editingId}` : '/api/partners';
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          target_count: formData.target_count ? parseInt(formData.target_count, 10) : null,
          target_format: formData.target_format || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setShowForm(false);
      setEditingId(null);
      setFormData({ name: '', brand: '', campaign_start: '', campaign_end: '', deliverables: '', notes: '', target_count: '', target_format: '' });
      fetchPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  const handleEdit = (partner: Partner) => {
    setFormData({
      name: partner.name,
      brand: partner.brand || '',
      campaign_start: partner.campaign_start || '',
      campaign_end: partner.campaign_end || '',
      deliverables: partner.deliverables || '',
      notes: partner.notes || '',
      target_count: partner.target_count != null ? String(partner.target_count) : '',
      target_format: partner.target_format || '',
    });
    setEditingId(partner.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/partners?id=${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      fetchPartners();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  const handleAssociate = async (partnerId: number, contentId: string) => {
    try {
      const response = await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'associate', partnerId, contentId }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      fetchPartners();
      fetchAvailableArticles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  const handleDissociate = async (partnerId: number, contentId: string) => {
    try {
      const response = await fetch('/api/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dissociate', partnerId, contentId }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      fetchPartners();
      fetchAvailableArticles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  const handleExportPDF = (partnerId: number) => {
    window.open(`/api/partners/report?id=${partnerId}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Partenaires" back={{ href: '/', label: 'Accueil' }} />
        <div className="mx-auto max-w-4xl px-6 py-6">
          <SkeletonRows rows={3} height={72} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Partenaires"
        back={{ href: '/', label: 'Accueil' }}
        actions={
          <Button
            variant="primary"
            onClick={() => { setShowForm(true); setEditingId(null); setFormData({ name: '', brand: '', campaign_start: '', campaign_end: '', deliverables: '', notes: '', target_count: '', target_format: '' }); }}
          >
            <IconPlus size={13} strokeWidth={2.5} />
            Ajouter
          </Button>
        }
      />
      <div className="mx-auto max-w-4xl px-6 py-6">

        {error && (
          <div className="mb-6 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-[var(--danger)] text-sm">
            {error}
          </div>
        )}

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-6 w-full max-w-md">
              <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">
                {editingId ? 'Modifier le partenaire' : 'Nouveau partenaire'}
              </h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Nom *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Marque</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Début campagne</label>
                    <input
                      type="date"
                      value={formData.campaign_start}
                      onChange={(e) => setFormData({ ...formData, campaign_start: e.target.value })}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Fin campagne</label>
                    <input
                      type="date"
                      value={formData.campaign_end}
                      onChange={(e) => setFormData({ ...formData, campaign_end: e.target.value })}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Cible (nombre de publications)</label>
                    <input
                      type="number"
                      min={0}
                      value={formData.target_count}
                      onChange={(e) => setFormData({ ...formData, target_count: e.target.value })}
                      placeholder="Ex: 4"
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Format</label>
                    <select
                      value={formData.target_format}
                      onChange={(e) => setFormData({ ...formData, target_format: e.target.value as typeof formData.target_format })}
                      className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    >
                      <option value="">Non défini</option>
                      <option value="slide_unique">Slide unique</option>
                      <option value="carrousel">Carrousel</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Livrables (contexte libre)</label>
                  <textarea
                    value={formData.deliverables}
                    onChange={(e) => setFormData({ ...formData, deliverables: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    rows={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    rows={2}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
                  >
                    {editingId ? 'Enregistrer' : 'Créer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowForm(false); setEditingId(null); }}
                    className="flex-1 rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-base)]"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Empty State */}
        {partners.length === 0 && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
            <EmptyState
              icon={IconPartners}
              title="Aucun partenaire enregistré"
              hint="Ajoutez un partenaire pour commencer à suivre les publications associées."
            />
          </div>
        )}

        {/* Partners List */}
        <div className="space-y-4">
          {partners.map((partner) => (
            <div key={partner.id} className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-[var(--text-primary)]">{partner.name}</h3>
                  {partner.brand && <p className="text-sm text-[var(--text-muted)]">{partner.brand}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleEdit(partner)}
                    className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-base)]"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => handleExportPDF(partner.id)}
                    className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-base)]"
                  >
                    PDF
                  </button>
                  <ConfirmButton
                    onConfirm={() => handleDelete(partner.id)}
                    confirmLabel="Supprimer ?"
                    className="rounded-lg border border-[var(--danger-border)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                  >
                    Supprimer
                  </ConfirmButton>
                </div>
              </div>

              {/* Campaign Period */}
              {(partner.campaign_start || partner.campaign_end) && (
                <div className="mb-4 text-sm text-[var(--text-secondary)]">
                  Campagne : {partner.campaign_start ? new Date(partner.campaign_start).toLocaleDateString('fr-FR') : '—'}
                  {' → '}
                  {partner.campaign_end ? new Date(partner.campaign_end).toLocaleDateString('fr-FR') : '—'}
                </div>
              )}

              {/* Deliverables */}
              {partner.deliverables && (
                <div className="mb-4 text-sm text-[var(--text-secondary)]">
                  <span className="font-medium">Livrables :</span> {partner.deliverables}
                </div>
              )}

              {/* Cible structurée + progression */}
              {partner.target_count != null && partner.target_count > 0 && (
                <div className="mb-4">
                  <div className="flex items-center justify-between text-sm text-[var(--text-secondary)] mb-1">
                    <span>
                      {partner.post_count || 0} / {partner.target_count} publications
                      {partner.target_format && (
                        <span className="ml-2 rounded bg-[var(--surface-hover)] px-1.5 py-0.5 text-xs text-[var(--text-muted)]">
                          {partner.target_format === 'slide_unique' ? 'slide unique' : 'carrousel'}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[var(--surface-hover)]">
                    <div
                      className="h-2 rounded-full bg-[var(--accent)]"
                      style={{ width: `${Math.min(100, ((partner.post_count || 0) / partner.target_count) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Associated Posts */}
              <div className="border-t border-[var(--border-subtle)] pt-4 mt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-[var(--text-secondary)]">
                    Publications associées ({partner.post_count || 0})
                  </span>
                  <button
                    onClick={() => setSelectedPartner(selectedPartner === partner.id ? null : partner.id)}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    {selectedPartner === partner.id ? 'Fermer' : 'Associer un article'}
                  </button>
                </div>

                {/* Article Selector */}
                {selectedPartner === partner.id && (
                  <div className="mb-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] p-3">
                    {availableArticles.length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">Aucun article validé disponible</p>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {availableArticles.map((article) => (
                          <div key={article.content_id} className="flex items-center justify-between">
                            <span className="text-sm text-[var(--text-secondary)] line-clamp-1">{article.title}</span>
                            <button
                              onClick={() => handleAssociate(partner.id, article.content_id)}
                              className="text-xs text-[var(--accent)] font-medium hover:underline"
                            >
                              + Associer
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
