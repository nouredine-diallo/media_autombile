'use client';

import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui';
import { PlanifierButton } from '@/components/PlanifierButton';
import { AssociatePartnerButton } from '@/components/AssociatePartnerButton';
import { PostPreviewOverlay } from '@/components/PostPreviewOverlay';
import { buildStudioLink } from '@/lib/studio-prefill';
import { IconCheck, IconDownload, IconStudio } from '@/components/icons';

interface Props {
  articleId: number;
  contentId: string | null;
  title: string;
  chapeau: string | null;
  content: string;
  eventTitle: string | null;
  imageUrl: string | null;
  exportedAt: string | null;
  driveUrl: string | null;
  isScheduled: boolean;
  autoPreviewStatus: 'pending' | 'ready' | 'failed' | null;
  autoPreviewMode: 'single' | 'carousel' | null;
}

/**
 * Colonne d'actions de la carte "article validé" (`/ready`) — extraite de
 * `page.tsx` le 23 sept. 2026 : c'est la seule partie de cette carte qui a
 * besoin du rendu auto-généré (`auto_preview_data_url(s)`, des PNG en
 * base64). Mesuré en prod : ~22 Mo pour 8 articles quand ces champs étaient
 * embarqués directement par le Server Component — désormais chargés
 * paresseusement ici, après le premier rendu de la page, sur la même route
 * déjà utilisée par `PostConfirmCard` pour son polling
 * (`/api/articles/[id]/auto-preview`). Résolution INCHANGÉE : cette route
 * renvoie le PNG déjà généré en pleine résolution (le même que l'export
 * final, CLAUDE.md STUDIO §1) — aucune compression n'est appliquée ici,
 * seul le MOMENT du chargement change (après le HTML initial, pas dedans).
 */
export function ReadyExportedActions({
  articleId,
  contentId,
  title,
  chapeau,
  content,
  eventTitle,
  imageUrl,
  exportedAt,
  driveUrl,
  isScheduled,
  autoPreviewStatus,
  autoPreviewMode,
}: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [dataUrls, setDataUrls] = useState<string[] | null>(null);

  useEffect(() => {
    if (autoPreviewStatus !== 'ready') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/articles/${articleId}/auto-preview`);
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setDataUrl(data.dataUrl ?? null);
        setDataUrls(data.dataUrls ?? null);
      } catch {
        // Repli : les boutons de téléchargement restent absents, la
        // "Créer un post"/"Exporté (local)" ci-dessous reste correcte —
        // jamais de lien mort proposé.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [articleId, autoPreviewStatus]);

  return (
    <div className="flex shrink-0 items-start gap-2">
      <PostPreviewOverlay
        data={{
          title,
          chapeau,
          content,
          eventTitle,
          images: dataUrls ? dataUrls : dataUrl ? [dataUrl] : imageUrl ? [imageUrl] : [],
          imagesAreRendered: !!(dataUrl || dataUrls),
        }}
      />
      {contentId && <AssociatePartnerButton contentId={contentId} />}
      <PlanifierButton articleId={articleId} alreadyScheduled={isScheduled} />
      {exportedAt && driveUrl ? (
        <ButtonLink href={driveUrl} external variant="secondary" size="md">
          <IconCheck size={14} strokeWidth={1.75} />
          Ouvrir dans Drive
        </ButtonLink>
      ) : exportedAt && autoPreviewStatus === 'ready' && autoPreviewMode === 'carousel' && dataUrls ? (
        // Phase 5 du plan écosystème (2026-09-17) : le carrousel auto-généré
        // n'est jamais passé par un clic navigateur (RADAR a confirmé
        // serveur-à-serveur) — rien n'a donc jamais été téléchargé
        // automatiquement, contrairement au flux manuel ci-dessous. Le rendu
        // existe déjà : `auto_preview_data_urls` porte les mêmes PNG que
        // l'export final (CLAUDE.md §1, zéro écart aperçu/export), pas besoin
        // de rappeler STUDIO ni de dépendre de Drive.
        <div className="flex items-center gap-1">
          {dataUrls.map((url, i) => (
            <a
              key={i}
              href={url}
              download={`slide-${i + 1}.png`}
              title={`Télécharger la slide ${i + 1}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)]"
            >
              <IconDownload size={14} strokeWidth={1.75} />
            </a>
          ))}
        </div>
      ) : exportedAt && autoPreviewStatus === 'ready' && dataUrl ? (
        // Même raisonnement que ci-dessus, mode single-image.
        <a
          href={dataUrl}
          download="post.png"
          className="t-caption inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2 text-[var(--text-secondary)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)]"
        >
          <IconDownload size={14} strokeWidth={1.75} />
          Télécharger le visuel
        </a>
      ) : exportedAt ? (
        // Exporté sans Drive configuré (2026-08-28), flux MANUEL (pas
        // d'auto-preview) : le fichier a été téléchargé en ZIP/PNG depuis
        // STUDIO au moment du clic export, il ne vit plus nulle part côté
        // serveur à ce stade (le job STUDIO est éphémère, cf.
        // GUIDE-UTILISATEUR.md §18) — proposer un lien ici serait un lien
        // mort. On dit la vérité plutôt que de laisser croire que rien n'a
        // été exporté (bug corrigé : avant ce correctif, ce cas retombait
        // silencieusement sur "Créer un post").
        <span
          className="t-caption inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-subtle)] px-3 py-2 text-[var(--text-secondary)]"
          title="Exporté depuis STUDIO en local (Drive non configuré) — le fichier a déjà été téléchargé pendant l'export."
        >
          <IconCheck size={14} strokeWidth={1.75} className="text-[var(--success)]" />
          Exporté (local)
        </span>
      ) : (
        <ButtonLink
          href={buildStudioLink({
            title,
            source: (eventTitle || 'RADAR').slice(0, 50),
            imageUrl,
            contentId: contentId || '',
            briefHeadline: chapeau?.slice(0, 200) || title.slice(0, 200),
          })}
          external
          variant="studio"
          size="md"
        >
          <IconStudio size={14} strokeWidth={1.75} />
          Créer un post
        </ButtonLink>
      )}
    </div>
  );
}
