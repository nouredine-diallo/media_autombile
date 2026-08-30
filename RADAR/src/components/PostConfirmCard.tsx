'use client';

import { useEffect, useRef, useState } from 'react';
import { useActionState } from 'react';
import { confirmAutoPost, retryAutoGenerate, rejectAutoPost } from '@/app/actions/autoGenerate';
import { Badge, ButtonLink } from '@/components/ui';
import { Mascot } from '@/components/assistant/Mascot';
import { PlanifierButton } from '@/components/PlanifierButton';
import { AssociatePartnerButton } from '@/components/AssociatePartnerButton';
import { IconAlert, IconCheck, IconClose, IconGenerate, IconRefresh, IconStudio } from '@/components/icons';

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 20; // ~80s — au-delà, on arrête de spammer et on laisse "Actualiser" manuel

interface Props {
  articleId: number;
  contentId: string | null;
  title: string;
  chapeau: string | null;
  eventTitle: string | null;
  status: 'pending' | 'ready' | 'failed' | null;
  dataUrl: string | null;
  error: string | null;
  alreadyScheduled: boolean;
  studioModifyHref: string;
  /** 'auto_score' = personne n'a relu le texte, seul un seuil de confiance l'a laissé passer. */
  validatedBy: 'humain' | 'auto_score' | null;
  verificationScore: number | null;
}

/**
 * Carte "un seul geste de décision" (plan écosystème 2026-08-29) : article +
 * visuel auto-généré ensemble, avec Confirmer (exporte vers Drive, le
 * créneau est déjà réservé par `generateArticleDeadlines()`) ou Modifier
 * (bascule vers l'éditeur STUDIO complet, comportement inchangé). Le clic
 * "Confirmer" est la seule chose que ce composant déclenche réellement —
 * tout le reste n'est que l'affichage d'un état déjà préparé en arrière-plan.
 */
export function PostConfirmCard({
  articleId,
  contentId,
  title,
  chapeau,
  eventTitle,
  status: initialStatus,
  dataUrl: initialDataUrl,
  error: initialError,
  alreadyScheduled,
  studioModifyHref,
  validatedBy,
  verificationScore,
}: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [dataUrl, setDataUrl] = useState(initialDataUrl);
  const [error, setError] = useState(initialError);
  // Le poll peut s'arrêter sans jamais avoir vu de statut final (STUDIO
  // tombé en plein rendu, ni succès ni callback d'échec) — sans ce drapeau,
  // la carte resterait bloquée sur "en préparation" indéfiniment, sans
  // recours pour l'utilisateur (dégradation silencieuse interdite par les
  // deux CLAUDE.md).
  const [stalled, setStalled] = useState(false);
  const pollCount = useRef(0);

  useEffect(() => {
    if (status !== 'pending') return;
    pollCount.current = 0;
    const interval = setInterval(async () => {
      pollCount.current += 1;
      try {
        const res = await fetch(`/api/articles/${articleId}/auto-preview`);
        if (res.ok) {
          const data = await res.json();
          if (data.status && data.status !== 'pending') {
            setStatus(data.status);
            setDataUrl(data.dataUrl ?? null);
            setError(data.error ?? null);
          }
        }
      } catch {
        // Tentative suivante — pas de blocage sur un échec réseau isolé
      }
      if (pollCount.current >= MAX_POLLS) {
        clearInterval(interval);
        setStalled(true);
      }
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [status, articleId]);

  const [confirmState, confirmAction, confirming] = useActionState(
    async () => confirmAutoPost(articleId),
    undefined,
  );

  const [, retryAction, retrying] = useActionState(async () => {
    setStatus('pending');
    setError(null);
    setStalled(false);
    return retryAutoGenerate(articleId);
  }, undefined);

  const [rejectState, rejectAction, rejecting] = useActionState(
    async () => rejectAutoPost(articleId),
    undefined,
  );

  const confirmed = confirmState?.success === true;
  const rejected = rejectState?.success === true;

  return (
    <article className="flex gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition-colors duration-[var(--dur)] hover:border-[var(--border-default)]">
      <div
        className="shrink-0 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-subtle)] bg-[var(--surface-sunken)]"
        style={{ width: 84, height: 105 }}
      >
        {status === 'ready' && dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={dataUrl} alt={`Visuel généré pour ${title}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Mascot state={status === 'failed' ? 'perplexed' : 'thinking'} variant="face" style={{ width: 44, height: 44 }} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          {status === 'ready' && (
            <Badge tone="studio" icon={IconGenerate}>
              Visuel généré par l&apos;IA
            </Badge>
          )}
          {status === 'pending' && <Badge tone="info">Visuel en préparation…</Badge>}
          {status === 'failed' && <Badge tone="warn">Aperçu automatique indisponible</Badge>}
          {validatedBy === 'auto_score' && (
            <Badge
              tone="warn"
              icon={IconAlert}
              className="cursor-help"
            >
              {verificationScore !== null
                ? `Contenu auto-validé — score ${verificationScore}%`
                : 'Contenu auto-validé'}
            </Badge>
          )}
        </div>
        {validatedBy === 'auto_score' && (
          <p className="t-caption -mt-0.5 mb-1.5 text-[var(--text-muted)]">
            Aucun humain n&apos;a relu ce texte — la confiance mesurée a dépassé le seuil configuré.
          </p>
        )}

        <h2 className="t-title truncate text-[var(--text-primary)]">{title}</h2>
        {chapeau && <p className="t-body mt-1 line-clamp-2 text-[var(--text-secondary)]">{chapeau}</p>}
        <p className="t-caption mt-2 truncate text-[var(--text-muted)]">
          Événement : {eventTitle || 'archivé'}
        </p>
        {status === 'failed' && error && (
          <p className="t-caption mt-1 text-[var(--warn)]">{error}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-2">
        {contentId && <AssociatePartnerButton contentId={contentId} />}
        <PlanifierButton articleId={articleId} alreadyScheduled={alreadyScheduled} />

        {status === 'ready' && !confirmed && !rejected && (
          <div className="flex gap-2">
            <ButtonLink href={studioModifyHref} external variant="secondary" size="md">
              Modifier
            </ButtonLink>
            {validatedBy === 'auto_score' && (
              <form action={rejectAction}>
                <button
                  type="submit"
                  disabled={rejecting}
                  title="Aucun humain n'a relu ce texte — refuser si le contenu ne convient pas"
                  className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3.5 text-[13px] font-medium text-[var(--danger)] transition-colors duration-[var(--dur-fast)] hover:opacity-90 disabled:opacity-45"
                >
                  <IconClose size={14} strokeWidth={1.75} />
                  {rejecting ? '…' : 'Rejeter'}
                </button>
              </form>
            )}
            <form action={confirmAction}>
              <button
                type="submit"
                disabled={confirming}
                className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-transparent bg-[var(--success)] px-3.5 text-[13px] font-medium text-white transition-colors duration-[var(--dur-fast)] hover:opacity-90 disabled:opacity-45"
              >
                <IconCheck size={14} strokeWidth={1.75} />
                {confirming ? 'Confirmation…' : 'Confirmer'}
              </button>
            </form>
          </div>
        )}

        {status === 'ready' && confirmed && (
          <span className="t-caption inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2 text-[var(--success)]">
            <IconCheck size={14} strokeWidth={1.75} />
            Confirmé — export vers Drive en cours
          </span>
        )}

        {status === 'ready' && rejected && (
          <span className="t-caption inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2 text-[var(--text-secondary)]">
            <IconClose size={14} strokeWidth={1.75} />
            Rejeté
          </span>
        )}

        {status === 'ready' && confirmState?.success === false && confirmState.error && (
          <p className="t-caption text-[var(--danger)]">{confirmState.error}</p>
        )}
        {status === 'ready' && rejectState?.success === false && rejectState.error && (
          <p className="t-caption text-[var(--danger)]">{rejectState.error}</p>
        )}

        {status === 'pending' && !stalled && (
          <ButtonLink href={studioModifyHref} external variant="studio" size="md">
            <IconStudio size={14} strokeWidth={1.75} />
            Créer un post
          </ButtonLink>
        )}

        {status === 'pending' && stalled && (
          <div className="flex flex-col items-end gap-1.5">
            <p className="t-caption text-[var(--text-muted)]">Toujours en préparation — la génération a peut-être échoué sans le signaler</p>
            <div className="flex gap-2">
              <ButtonLink href={studioModifyHref} external variant="studio" size="md">
                <IconStudio size={14} strokeWidth={1.75} />
                Créer un post
              </ButtonLink>
              <form action={retryAction}>
                <button
                  type="submit"
                  disabled={retrying}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-hover)] px-3.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)] disabled:opacity-45"
                >
                  <IconRefresh size={14} strokeWidth={1.75} />
                  {retrying ? '…' : 'Réessayer'}
                </button>
              </form>
            </div>
          </div>
        )}

        {status === 'failed' && (
          <div className="flex gap-2">
            <ButtonLink href={studioModifyHref} external variant="studio" size="md">
              <IconStudio size={14} strokeWidth={1.75} />
              Créer un post
            </ButtonLink>
            <form action={retryAction}>
              <button
                type="submit"
                disabled={retrying}
                className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--surface-hover)] px-3.5 text-[13px] font-medium text-[var(--text-primary)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)] disabled:opacity-45"
              >
                <IconRefresh size={14} strokeWidth={1.75} />
                {retrying ? '…' : 'Réessayer'}
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}
