"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconArrowLeft, IconArrowRight, IconClose, IconEye } from "@/components/icons";

const HOVER_OPEN_DELAY_MS = 180;

export interface PostPreviewData {
  title: string;
  chapeau?: string | null;
  /** Texte complet de l'article — jusqu'ici récupéré en base mais jamais
   * affiché nulle part après validation (trou confirmé dans le code,
   * 17 sept. 2026). C'est le seul champ non négociable de cet overlay :
   * sans lui, l'humain confirme un article qu'il n'a jamais lu. */
  content: string;
  eventTitle?: string | null;
  /** Images à afficher, dans l'ordre. Vide = aucun visuel disponible. */
  images: string[];
  /** true = rendu réel du post (auto_preview_data_url(s), le même PNG que
   * l'export final — CLAUDE.md STUDIO §1). false = simple photo source,
   * le visuel final n'existe pas encore — l'overlay le dit explicitement,
   * jamais présenté comme le rendu final (aucune dégradation silencieuse). */
  imagesAreRendered: boolean;
  badges?: ReactNode;
}

/**
 * Aperçu au survol/tap — spec du 17 sept. 2026 (restructuration UI). Rendu
 * en portail (`createPortal`) pour ne jamais être coupé par l'`overflow`
 * du conteneur de liste qui l'entoure. Un seul composant, réutilisé sur le
 * Dashboard (Zone 1/2) et sur `/ready` — jamais une seconde vue de rendu.
 */
export function PostPreviewOverlay({
  data,
  actions,
  children,
}: {
  data: PostPreviewData;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const clearOpenTimer = () => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  };

  // Remet toujours l'index de slide à 0 au moment de l'ouverture (pas dans
  // un effet gardé sur `open` — déclencherait un rendu en cascade évitable,
  // react-hooks/set-state-in-effect) : chaque appelant qui ouvre passe par
  // ce seul point.
  const openOverlay = () => {
    setSlideIndex(0);
    setOpen(true);
  };

  const toggleOverlay = () => {
    if (open) {
      setOpen(false);
    } else {
      openOverlay();
    }
  };

  const scheduleOpen = () => {
    clearOpenTimer();
    openTimer.current = setTimeout(openOverlay, HOVER_OPEN_DELAY_MS);
  };

  const close = () => {
    clearOpenTimer();
    setOpen(false);
  };

  useEffect(() => clearOpenTimer, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const images = data.images;
  const currentImage = images.length > 0 ? images[Math.min(slideIndex, images.length - 1)] : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Aperçu — ${data.title}`}
        onMouseEnter={scheduleOpen}
        onMouseLeave={clearOpenTimer}
        onClick={toggleOverlay}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors duration-[var(--dur-fast)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
      >
        <IconEye size={14} strokeWidth={1.75} />
      </button>
      {children}

      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onMouseLeave={close}
            onClick={(e) => {
              if (e.target === e.currentTarget) close();
            }}
          >
            <div
              className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl"
              role="dialog"
              aria-label={`Aperçu — ${data.title}`}
            >
              <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-3">
                <div className="min-w-0 flex-1">
                  {data.eventTitle && (
                    <span className="t-caption block truncate text-[var(--text-muted)]">
                      Événement : {data.eventTitle}
                    </span>
                  )}
                </div>
                {data.badges}
                <button
                  type="button"
                  aria-label="Fermer l'aperçu"
                  onClick={close}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-secondary)] transition-colors duration-[var(--dur-fast)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]"
                >
                  <IconClose size={15} strokeWidth={1.75} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {currentImage ? (
                  <div className="relative bg-[var(--surface-sunken)]">
                    {!data.imagesAreRendered && (
                      <span className="absolute left-2 top-2 z-10 rounded-[var(--radius-full)] bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                        Photo source — visuel final pas encore créé
                      </span>
                    )}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentImage}
                      alt={`Aperçu ${slideIndex + 1}/${images.length} de "${data.title}"`}
                      className="mx-auto max-h-[45vh] w-auto object-contain"
                    />
                    {images.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => setSlideIndex((i) => (i - 1 + images.length) % images.length)}
                          aria-label="Slide précédente"
                          className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                        >
                          <IconArrowLeft size={14} strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSlideIndex((i) => (i + 1) % images.length)}
                          aria-label="Slide suivante"
                          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                        >
                          <IconArrowRight size={14} strokeWidth={2} />
                        </button>
                        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
                          {images.map((_, i) => (
                            <span
                              key={i}
                              className={`h-1.5 w-1.5 rounded-full ${i === slideIndex ? "bg-white" : "bg-white/40"}`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="px-4 py-6 text-center">
                    <span className="t-caption text-[var(--text-muted)]">Aucun visuel disponible</span>
                  </div>
                )}

                <div className="px-4 py-4">
                  <h2 className="t-title text-[var(--text-primary)]">{data.title}</h2>
                  {data.chapeau && (
                    <p className="t-body mt-1.5 italic text-[var(--text-secondary)]">{data.chapeau}</p>
                  )}
                  <div className="t-body mt-3 whitespace-pre-wrap text-[var(--text-primary)]">
                    {data.content}
                  </div>
                </div>
              </div>

              {actions && (
                <div className="flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-4 py-3">
                  {actions}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
