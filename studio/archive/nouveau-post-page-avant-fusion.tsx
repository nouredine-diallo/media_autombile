"use client";

import { useRef, useState, useCallback } from "react";
import Link from "next/link";
import { ArrowRight, ImagePlus, Loader2, X } from "lucide-react";

type ImageRole = "fond" | "bulle1" | "bulle2";

interface ImageItem {
  id: string;
  originalUrl: string;
  croppedUrl: string;
  role: ImageRole;
  reason: string;
}

const ROLE_META: Record<
  ImageRole,
  { label: string; sub: string; color: string; border: string }
> = {
  fond: {
    label: "Fond",
    sub: "Image principale",
    color: "bg-zinc-800",
    border: "border-zinc-400",
  },
  bulle1: {
    label: "Bulle 1",
    sub: "Gauche",
    color: "bg-blue-600",
    border: "border-blue-400",
  },
  bulle2: {
    label: "Bulle 2",
    sub: "Droite",
    color: "bg-purple-600",
    border: "border-purple-400",
  },
};

const ROLE_ORDER: ImageRole[] = ["fond", "bulle1", "bulle2"];

export default function NouveauPostPage() {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<ImageRole | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [targetRole, setTargetRole] = useState<ImageRole | null>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  /* ── Upload global (premier dépôt) ── */
  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length > 3) {
      setError("Maximum 3 images par post.");
      return;
    }
    setStatus("loading");
    setError(null);
    try {
      const form = new FormData();
      arr.forEach((f) => form.append("images", f));
      const res = await fetch("/api/images/upload-batch", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setImages(data.images);
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setStatus("idle");
    }
  }

  /* ── Upload dans un slot spécifique (remplacement) ── */
  async function uploadToRole(role: ImageRole, file: File) {
    setStatus("loading");
    setError(null);
    try {
      const form = new FormData();
      form.append("images", file);
      const res = await fetch("/api/images/upload-batch", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      const newItem = { ...data.images[0], role };

      setImages((prev) => {
        const exists = prev.findIndex((im) => im.role === role);
        if (exists !== -1) {
          const next = [...prev];
          next[exists] = newItem;
          return next;
        }
        return [...prev, newItem];
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setStatus("idle");
    }
  }

  /* ── Gestion du file input unique ── */
  function openFilePicker(role?: ImageRole) {
    setTargetRole(role ?? null);
    fileInput.current?.click();
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (targetRole) {
      uploadToRole(targetRole, file);
    } else {
      uploadFiles([file]);
    }
    e.target.value = "";
  }

  /* ── Drag & Drop handlers ── */
  const handleDragStart = useCallback((idx: number) => {
    setDraggingIdx(idx);
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent, role: ImageRole) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(role);
    },
    [],
  );

  const handleDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const handleDropOnSlot = useCallback(
    (e: React.DragEvent, target: ImageRole) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(null);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        uploadToRole(target, files[0]);
        return;
      }

      const srcIdx = draggingIdx;
      if (srcIdx === null) return;
      setImages((prev) => {
        const src = prev[srcIdx];
        const targetIdx = prev.findIndex((im) => im.role === target);
        if (targetIdx === -1 || targetIdx === srcIdx) return prev;
        const next = [...prev];
        const srcRole = src.role;
        next[srcIdx] = { ...next[srcIdx], role: target };
        next[targetIdx] = { ...next[targetIdx], role: srcRole };
        return next;
      });
      setDraggingIdx(null);
    },
    [draggingIdx],
  );

  const handleDropOnPage = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(null);
      const files = e.dataTransfer.files;
      if (files.length > 0 && images.length === 0) {
        uploadFiles(files);
      }
    },
    [images.length],
  );

  /* ── Supprimer une image d'un slot ── */
  function removeImage(role: ImageRole) {
    setImages((prev) => prev.filter((im) => im.role !== role));
  }

  const filledCount = images.length;
  const hasImages = filledCount > 0;

  return (
    <div
      className="flex min-h-screen flex-col bg-zinc-50"
      onDragOver={(e) => {
        e.preventDefault();
        if (!hasImages) e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={handleDropOnPage}
    >
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/75 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white">
            SA
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">
              Nouveau post
            </h1>
            <p className="text-sm text-zinc-500">
              Déposez vos images, assignez les rôles, continuez.
            </p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-8 p-6 lg:p-10">
        {/* ── Input file UNIQUE (toujours rendu, jamais dans un conditionnel) ── */}
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="hidden"
          onChange={onFileChange}
        />

        {/* ── Zone de dépôt initiale (si aucune image) ── */}
        {!hasImages && (
          <button
            type="button"
            onClick={() => openFilePicker()}
            className="group flex min-h-[280px] flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed border-zinc-300 bg-white transition-all hover:border-zinc-500 hover:bg-zinc-50"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500 transition-colors group-hover:bg-zinc-200">
              {status === "loading" ? (
                <Loader2 className="size-7 animate-spin" aria-hidden />
              ) : (
                <ImagePlus className="size-7" aria-hidden />
              )}
            </div>
            <div className="text-center">
              <p className="text-base font-medium text-zinc-700">
                {status === "loading"
                  ? "Import en cours…"
                  : "Déposez 1 à 3 images ici"}
              </p>
              <p className="mt-1 text-sm text-zinc-400">
                ou cliquez pour sélectionner
              </p>
            </div>
          </button>
        )}

        {/* ── Erreur ── */}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* ── Slots (si images chargées) ── */}
        {hasImages && (
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-800">
                  Vos images
                </h2>
                <p className="text-xs text-zinc-400">
                  Glissez entre les cadres pour réorganiser · Cliquez pour
                  remplacer
                </p>
              </div>
              <button
                type="button"
                onClick={() => openFilePicker()}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                + Ajouter
              </button>
            </div>

            {/* Grille de slots */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {ROLE_ORDER.map((role) => {
                const meta = ROLE_META[role];
                const img = images.find((im) => im.role === role);
                const isOver = dragOver === role;

                return (
                  <div key={role} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                      <span className="text-xs text-zinc-400">{meta.sub}</span>
                    </div>

                    <div
                      role="button"
                      tabIndex={0}
                      draggable={!!img}
                      onDragStart={() => {
                        if (img) handleDragStart(images.indexOf(img));
                      }}
                      onDragOver={(e) => handleDragOver(e, role)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDropOnSlot(e, role)}
                      onClick={() => openFilePicker(role)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openFilePicker(role);
                        }
                      }}
                      className={`relative flex aspect-[4/5] cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 transition-all ${
                        isOver
                          ? "border-blue-500 bg-blue-50 shadow-lg shadow-blue-100"
                          : img
                            ? `border-zinc-200 hover:border-zinc-400 ${meta.border}`
                            : "border-dashed border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50"
                      }`}
                    >
                      {img ? (
                        <>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.croppedUrl}
                            alt={meta.label}
                            className="h-full w-full object-cover"
                            draggable={false}
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors hover:bg-black/30">
                            <span className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-800 opacity-0 transition-opacity hover:opacity-100">
                              Remplacer
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeImage(role);
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.opacity = "1")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.opacity = "0")
                            }
                            className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-xs text-white opacity-0 transition-opacity hover:bg-black/70"
                          >
                            <X className="size-3.5" aria-hidden />
                          </button>
                        </>
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-zinc-400">
                          <span className="text-2xl">+</span>
                          <span className="text-xs font-medium">
                            Cliquez ou déposez
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {filledCount < 3 && (
              <button
                type="button"
                onClick={() => openFilePicker()}
                className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 py-4 text-sm text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-600"
              >
                + Ajouter une image
              </button>
            )}
          </div>
        )}

        {/* ── Actions ── */}
        {hasImages && (
          <div className="flex flex-col gap-3 border-t border-zinc-200 pt-6">
            <Link
              href="/titres"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-700"
            >
              Continuer vers le titre
              <ArrowRight className="size-4" aria-hidden />
            </Link>
            <p className="text-center text-xs text-zinc-400">
              {filledCount}/3 images assignées
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
