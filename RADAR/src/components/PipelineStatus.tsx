'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui';
import {
  IconChevronDown,
  IconChevronUp,
  IconRefresh,
  IconRun,
  IconSpinner,
} from '@/components/icons';

interface PipelineStatus {
  cron: {
    running: boolean;
    enabled: boolean;
    interval: string;
  };
  pipeline: {
    lastRun: {
      id: number;
      run_type: string;
      status: string;
      items_ingested: number;
      events_created: number;
      images_found: number;
      error: string | null;
      started_at: string;
      completed_at: string | null;
    } | null;
    recentRuns: Array<{
      id: number;
      run_type: string;
      status: string;
      items_ingested: number;
      images_found: number;
      started_at: string;
    }>;
  };
}

function formatInterval(cronExpr: string): string {
  // Simple cron to human-readable
  if (cronExpr === '0 */4 * * *') return 'Toutes les 4 h';
  if (cronExpr === '0 */2 * * *') return 'Toutes les 2 h';
  if (cronExpr === '0 */6 * * *') return 'Toutes les 6 h';
  if (cronExpr === '0 */8 * * *') return 'Toutes les 8 h';
  if (cronExpr === '0 * * * *') return 'Toutes les heures';
  if (cronExpr === '*/30 * * * *') return 'Toutes les 30 min';
  return cronExpr;
}

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "à l'instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `il y a ${diffH} h`;
  return `il y a ${Math.floor(diffH / 24)} j`;
}

/** Une donnée chiffrée du pipeline. Pas de couleur décorative. */
function Metric({ value, label, tone }: { value: number; label: string; tone?: 'success' }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`font-data text-[15px] font-semibold leading-none ${
          tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--text-primary)]'
        }`}
      >
        {value}
      </span>
      <span className="t-caption text-[var(--text-muted)]">{label}</span>
    </div>
  );
}

export function PipelineStatusIndicator() {
  const [status, setStatus] = useState<PipelineStatus | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/cron');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const handleTrigger = async () => {
    setTriggering(true);
    try {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run' }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        // Pipeline déjà en cours ou erreur
        console.error('Erreur:', data.message);
      }
      
      // Attendre 2 secondes puis rafraîchir le statut
      setTimeout(fetchStatus, 2000);
    } finally {
      setTriggering(false);
    }
  };

  // État de chargement : un squelette de la même forme que la barre finale
  if (!status) {
    return <div className="skeleton h-[52px] rounded-[var(--radius-lg)]" aria-hidden />;
  }

  const lastRun = status.pipeline.lastRun;
  const isStale =
    lastRun &&
    !lastRun.completed_at &&
    Date.now() - new Date(lastRun.started_at).getTime() > 10 * 60 * 1000;

  const dotClass = status.cron.running
    ? 'bg-[var(--warn)] animate-pulse'
    : isStale
      ? 'bg-[var(--danger)]'
      : status.cron.enabled
        ? 'bg-[var(--success)]'
        : 'bg-[var(--text-faint)]';

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
      <div className="flex items-center gap-3 px-3.5 py-2.5">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <span className="t-label text-[var(--text-primary)]">Pipeline automatique</span>
          <span className="t-caption ml-2 text-[var(--text-muted)]">
            {status.cron.enabled
              ? `${formatInterval(status.cron.interval)} · ${
                  lastRun
                    ? `dernière exécution ${formatTimeAgo(lastRun.started_at)}`
                    : 'pas encore exécuté'
                }`
              : 'Désactivé'}
          </span>
        </div>

        <Button
          onClick={handleTrigger}
          disabled={triggering || status.cron.running}
          variant="ghost"
          title="Lancer une exécution maintenant"
        >
          {status.cron.running || triggering ? (
            <>
              <IconSpinner size={13} strokeWidth={2} className="animate-spin" />
              En cours
            </>
          ) : (
            <>
              <IconRun size={13} strokeWidth={2} />
              Lancer
            </>
          )}
        </Button>
        <Button
          onClick={() => setShowDetails(!showDetails)}
          variant="ghost"
          aria-expanded={showDetails}
          aria-label={showDetails ? 'Masquer le détail' : 'Afficher le détail'}
          className="!px-1.5"
        >
          {showDetails ? (
            <IconChevronUp size={14} strokeWidth={2} />
          ) : (
            <IconChevronDown size={14} strokeWidth={2} />
          )}
        </Button>
      </div>

      {showDetails && lastRun && (
        <div className="space-y-3 border-t border-[var(--border-subtle)] px-3.5 py-3">
          <div className="flex items-center gap-8">
            <Metric value={lastRun.items_ingested} label="Articles ingérés" />
            <Metric value={lastRun.events_created} label="Événements créés" />
            <Metric value={lastRun.images_found} label="Visuels trouvés" tone="success" />
          </div>
          {/* Jamais de dégradation silencieuse : l'erreur est visible telle quelle */}
          {lastRun.error && (
            <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2">
              <IconRefresh size={13} strokeWidth={2} className="mt-0.5 text-[var(--danger)]" />
              <p className="t-caption text-[var(--danger)]">{lastRun.error}</p>
            </div>
          )}
          {status.pipeline.recentRuns.length > 1 && (
            <p className="t-caption text-[var(--text-muted)]">
              {status.pipeline.recentRuns.length} exécutions récentes
            </p>
          )}
        </div>
      )}
    </div>
  );
}
