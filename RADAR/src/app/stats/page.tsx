'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { EngagementTrend } from '@/components/charts/EngagementTrend';
import { FormatDistribution } from '@/components/charts/FormatDistribution';
import { TopPosts } from '@/components/charts/TopPosts';
import { MetricsComparison } from '@/components/charts/MetricsComparison';
import { PerformanceScatter } from '@/components/charts/PerformanceScatter';
import SmartDropzone from '@/components/SmartDropzone';

interface InstagramPost {
  id: string;
  content_id?: string;
  post_url: string;
  caption: string;
  timestamp: string;
  format: string;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  impressions: number;
  engagement_rate: number;
  save_rate: number;
  share_rate: number;
}

interface StatsSummary {
  total_posts: number;
  avg_engagement_rate: number;
  avg_save_rate: number;
  avg_share_rate: number;
  best_post: InstagramPost | null;
  worst_post: InstagramPost | null;
  by_format: {
    format: string;
    count: number;
    avg_engagement: number;
    avg_saves: number;
  }[];
  trends: string[];
}

import { PageHeader } from '@/components/PageHeader';
import { SkeletonRows } from '@/components/ui';
import { EmptyState } from '@/components/ui';
import { IconTrend, IconUpload } from '@/components/icons';
export default function StatsPage() {
  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showSaves, setShowSaves] = useState(false);
  const [showShares, setShowShares] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/stats');
      const data = await response.json();
      if (data.success) {
        setSummary(data.summary);
        setPosts(data.posts);
      }
    } catch (err) {
      setError('Erreur lors du chargement des statistiques');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/stats', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Erreur lors de l\'import');
      }

      setSuccess(`${data.imported} publications importées avec succès`);
      setSummary(data.summary);
      fetchStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await handleUpload(file);
  };

  if (loading) {
    return (
      <SmartDropzone onFileAccepted={handleUpload}>
        <div className="min-h-screen">
          <PageHeader title="Statistiques" back={{ href: '/', label: 'Accueil' }} />
          <div className="mx-auto max-w-6xl px-6 py-6">
            <SkeletonRows rows={3} height={72} />
          </div>
        </div>
      </SmartDropzone>
    );
  }

  return (
    <SmartDropzone onFileAccepted={handleUpload}>
      <div className="min-h-screen">
        <PageHeader
          title="Statistiques"
          subtitle="Export Instagram — chiffres calculés, jamais générés"
          back={{ href: '/', label: 'Accueil' }}
        />
        <div className="mx-auto max-w-6xl px-6 py-6">

          {/* Upload Zone */}
          <div className="mb-8 rounded-xl border-2 border-dashed border-[var(--border-subtle)] bg-[var(--surface-raised)] p-8 text-center hover:border-[var(--border-default)] transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-[var(--radius-full)] bg-[var(--surface-hover)]">
                <IconUpload size={18} strokeWidth={1.75} className="text-[var(--text-muted)]" />
              </span>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                {uploading ? 'Import en cours...' : 'Déposez votre export CSV Instagram'}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                Glissez un CSV n&apos;importe où sur cette page, ou cliquez pour sélectionner
              </p>
            </label>
          </div>

          {error && (
            <div className="mb-6 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-[var(--danger)] text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-6 rounded-lg border border-[var(--success-border)] bg-[var(--success-soft)] p-4 text-[var(--success)] text-sm">
              {success}
            </div>
          )}

        {/* Empty State */}
        {!loading && posts.length === 0 && !error && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
            <EmptyState
              icon={IconTrend}
              title="Aucune donnée pour le moment"
              hint="Importez votre premier export CSV Instagram pour voir les tendances."
            />
          </div>
        )}

        {/* Dashboard */}
        {summary && summary.total_posts > 0 && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 gap-4 mb-8 sm:grid-cols-4">
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 text-center hover:shadow-md transition-shadow">
                <div className="text-3xl font-bold text-[var(--text-primary)]">{summary.total_posts}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">Publications</div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 text-center hover:shadow-md transition-shadow">
                <div className="text-3xl font-bold text-[var(--text-primary)]">{summary.avg_engagement_rate.toFixed(1)}%</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">Engagement moyen</div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 text-center hover:shadow-md transition-shadow">
                <div className="text-3xl font-bold text-[var(--accent)]">{summary.avg_save_rate.toFixed(1)}%</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">Taux de sauvegarde</div>
              </div>
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 text-center hover:shadow-md transition-shadow">
                <div className="text-3xl font-bold text-[var(--success)]">{summary.avg_share_rate.toFixed(1)}%</div>
                <div className="text-xs text-[var(--text-muted)] mt-1">Taux de partage</div>
              </div>
            </div>

            {/* Trends */}
            {summary.trends.length > 0 && (
              <div className="mb-8 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
                <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Tendances observées</h2>
                <ul className="space-y-2">
                  {summary.trends.map((trend, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                      <span className="text-[var(--text-muted)]">→</span>
                      <span>{trend}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* Engagement Trend */}
              <div className="lg:col-span-2">
                <div className="flex items-center gap-4 mb-3">
                  <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={showSaves}
                      onChange={(e) => setShowSaves(e.target.checked)}
                      className="rounded border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--accent)] focus:ring-[var(--accent)]"
                    />
                    Afficher les saves
                  </label>
                  <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={showShares}
                      onChange={(e) => setShowShares(e.target.checked)}
                      className="rounded border-[var(--border-subtle)] bg-[var(--surface-base)] text-[var(--success)] focus:ring-[var(--success)]"
                    />
                    Afficher les shares
                  </label>
                </div>
                <EngagementTrend
                  posts={posts}
                  showSaves={showSaves}
                  showShares={showShares}
                />
              </div>

              {/* Format Distribution */}
              <FormatDistribution data={summary.by_format} />

              {/* Metrics Radar */}
              <MetricsComparison
                data={{
                  avg_engagement: summary.avg_engagement_rate,
                  avg_save_rate: summary.avg_save_rate,
                  avg_share_rate: summary.avg_share_rate,
                  total_posts: summary.total_posts,
                  best_engagement: summary.best_post?.engagement_rate || 0,
                  worst_engagement: summary.worst_post?.engagement_rate || 0,
                }}
              />

              {/* Top Posts by Engagement */}
              <TopPosts posts={posts} limit={5} metric="engagement_rate" />

              {/* Top Posts by Reach */}
              <TopPosts posts={posts} limit={5} metric="reach" />

              {/* Performance Scatter */}
              <div className="lg:col-span-2">
                <PerformanceScatter posts={posts} />
              </div>
            </div>

            {/* All Posts Table */}
            <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-6">
              <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
                Toutes les publications ({posts.length})
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-left text-xs text-[var(--text-muted)]">
                      <th className="pb-2 font-medium">Publication</th>
                      <th className="pb-2 font-medium text-right">Format</th>
                      <th className="pb-2 font-medium text-right">Reach</th>
                      <th className="pb-2 font-medium text-right">Engagement</th>
                      <th className="pb-2 font-medium text-right">Saves</th>
                      <th className="pb-2 font-medium text-right">Shares</th>
                    </tr>
                  </thead>
                  <tbody>
                    {posts.map((post) => (
                      <tr key={post.id} className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--surface-base)]">
                        <td className="py-3">
                          <div className="font-medium text-[var(--text-primary)] line-clamp-1">
                            {post.caption || 'Sans légende'}
                          </div>
                          <div className="text-xs text-[var(--text-muted)]">
                            {new Date(post.timestamp).toLocaleDateString('fr-FR')}
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <span className="rounded bg-[var(--surface-base)] px-2 py-0.5 text-xs text-[var(--text-secondary)] capitalize">
                            {post.format}
                          </span>
                        </td>
                        <td className="py-3 text-right font-medium text-[var(--text-primary)]">
                          {post.reach.toLocaleString('fr-FR')}
                        </td>
                        <td className="py-3 text-right">
                          <span className={`font-medium ${post.engagement_rate >= summary.avg_engagement_rate ? 'text-[var(--success)]' : 'text-[var(--text-secondary)]'}`}>
                            {post.engagement_rate.toFixed(1)}%
                          </span>
                        </td>
                        <td className="py-3 text-right font-medium text-[var(--text-primary)]">
                          {post.save_rate.toFixed(1)}%
                        </td>
                        <td className="py-3 text-right font-medium text-[var(--text-primary)]">
                          {post.share_rate.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
        </div>
      </div>
    </SmartDropzone>
  );
}
