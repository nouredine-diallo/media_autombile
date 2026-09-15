"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowRight, Loader2, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  GABARITS,
  GABARIT_HEIGHT,
  GABARIT_WIDTH,
} from "@/components/gabarits/registry";
import { apiFetch } from "@/lib/apiFetch";
import { BrandHomeLink } from "@/components/BrandHomeLink";
import { RecadrageFond } from "@/components/RecadrageFond";
import { lireHauteurPhoto, GABARIT_PHOTO_HEIGHT } from "@/components/gabarits/Gabarit1A";

// Plafond desktop — l'échelle réelle est recalculée sous ce plafond pour ne
// jamais dépasser la largeur de l'écran (finding B7, audit 2026-09-07 :
// avant, cette valeur était fixe et débordait sur mobile/tablette — même
// correctif déjà appliqué à titres/page.tsx le 2026-08-29).
const PREVIEW_SCALE_MAX = 0.4;

interface UploadedImage {
  id: string;
  croppedUrl: string;
  role: string;
  label: string;
}

export function GabaritPreviewClient({ gabaritId }: { gabaritId: string }) {
  const def = GABARITS[gabaritId];
  const router = useRouter();
  const params = useSearchParams();

  // L'écran d'ajustement est un **détour optionnel** depuis l'aperçu : il doit
  // reprendre le montage tel qu'il était, pas repartir des valeurs d'exemple.
  // Avant le 2026-08-21 il ignorait complètement l'URL — on perdait les photos
  // et le titre en cliquant « Ajuster le détail ».
  const [values, setValues] = useState<Record<string, string>>(() => {
    const depart: Record<string, string> = { ...def.defaults };
    for (const champ of def.fields) {
      const recu = params.get(champ.key);
      if (recu !== null) depart[champ.key] = recu;
    }
    return depart;
  });
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pickedField, setPickedField] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickerInput = useRef<HTMLInputElement>(null);

  // Images uploadées en session (stockées localement)
  const [uploadedImages, setUploadedImages] = useState<UploadedImage[]>([]);

  const [previewScale, setPreviewScale] = useState(PREVIEW_SCALE_MAX);
  useEffect(() => {
    function recalcScale() {
      const disponible = window.innerWidth - 32;
      setPreviewScale(Math.min(PREVIEW_SCALE_MAX, disponible / GABARIT_WIDTH));
    }
    recalcScale();
    window.addEventListener("resize", recalcScale);
    return () => window.removeEventListener("resize", recalcScale);
  }, []);

  const { Component } = def;

  /* ── Upload d'une image pour un champ ── */
  const handlePickFile = useCallback(
    async (fieldKey: string, file: File) => {
      setUploading(true);
      try {
        const form = new FormData();
        form.append("images", file);
        const res = await apiFetch("/api/images/upload-batch", {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(60_000),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        const img = data.images[0];
        setUploadedImages((prev) => [
          ...prev,
          {
            id: img.id,
            croppedUrl: img.croppedUrl,
            role: img.role,
            label: file.name,
          },
        ]);
        setValues((prev) => ({ ...prev, [fieldKey]: img.croppedUrl }));
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Erreur d'upload",
        );
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  /* ── Export ── */
  async function handleExport() {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const res = await apiFetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gabaritId, fieldValues: values }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Échec inconnu" }));
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      const { jobId } = await res.json();
      router.push(`/export/${jobId}`);
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Erreur inconnue",
      );
    }
  }

  /* ── Sélecteur d'image (pour champs kind=image) ── */
  function ImagePicker({
    fieldKey,
    value,
    label,
  }: {
    fieldKey: string;
    value: string;
    label: string;
  }) {
    return (
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-zinc-700">{label}</label>
        <button
          onClick={() => {
            setPickedField(fieldKey);
            pickerInput.current?.click();
          }}
          disabled={uploading}
          className="group relative flex aspect-[4/5] w-full max-w-[200px] items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 transition-all hover:border-zinc-400 hover:bg-zinc-100"
        >
          {value && value !== def.defaults[fieldKey] ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value}
                alt={label}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/30">
                <span className="rounded-lg bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-800 opacity-0 transition-opacity group-hover:opacity-100">
                  {uploading ? "Import…" : "Remplacer"}
                </span>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2 text-zinc-400">
              {uploading ? <Loader2 className="size-6 animate-spin" aria-hidden /> : <Plus className="size-6" aria-hidden />}
              <span className="text-xs font-medium">
                {uploading ? "Import…" : "Choisir une image"}
              </span>
            </div>
          )}
        </button>

        {/* Galerie rapide si des images ont été uploadées */}
        {uploadedImages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {uploadedImages.map((img) => (
              <button
                key={img.id}
                onClick={() =>
                  setValues((prev) => ({ ...prev, [fieldKey]: img.croppedUrl }))
                }
                className={`h-14 w-11 overflow-hidden rounded-lg border-2 transition-all ${
                  value === img.croppedUrl
                    ? "border-brand ring-2 ring-brand/20"
                    : "border-zinc-200 hover:border-zinc-400"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.croppedUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <BrandHomeLink />
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">
              {def.label}
            </h1>
            <p className="text-sm text-zinc-500">
              Aperçu en temps réel · Export PNG identique
            </p>
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-8 p-6 lg:flex-row">
        {/* ── Panneau gauche : champs ── */}
        <section className="flex w-full max-w-md flex-col gap-5">
          {def.fields.map((field) => {
            if (field.kind === "image") {
              return (
                <ImagePicker
                  key={field.key}
                  fieldKey={field.key}
                  value={values[field.key] ?? ""}
                  label={field.label}
                />
              );
            }
            if (field.kind === "textarea") {
              return (
                <div key={field.key}>
                  <label className="mb-1 block text-sm font-medium text-zinc-700">
                    {field.label}
                  </label>
                  <textarea
                    value={values[field.key] ?? ""}
                    onChange={(e) =>
                      setValues((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    rows={4}
                    className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm transition-colors focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              );
            }
            return (
              <div key={field.key}>
                <label className="mb-1 block text-sm font-medium text-zinc-700">
                  {field.label}
                </label>
                <input
                  value={values[field.key] ?? ""}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [field.key]: e.target.value,
                    }))
                  }
                  className="w-full rounded-xl border border-zinc-300 px-4 py-3 text-sm transition-colors focus:border-zinc-500 focus:outline-none"
                />
              </div>
            );
          })}

          {/* Erreur */}
          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {/* Bouton export */}
          <button
            onClick={handleExport}
            disabled={status === "loading"}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover active:bg-brand-pressed disabled:opacity-50"
          >
            {status === "loading" ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden /> Rendu en cours…
              </>
            ) : (
              <>
                Générer le PNG
                <span aria-hidden="true"><ArrowRight className="inline size-4 align-[-2px]" aria-hidden /></span>
              </>
            )}
          </button>
        </section>

        {/* ── Panneau droit : aperçu ── */}
        <section className="flex flex-1 flex-col items-start gap-4">
          <p className="text-sm font-medium text-zinc-600">
            Aperçu navigateur
          </p>
          <div
            style={{
              width: GABARIT_WIDTH * previewScale,
              height: GABARIT_HEIGHT * previewScale,
            }}
            className="relative overflow-hidden rounded-xl border border-zinc-200 shadow-md"
          >
            <div
              style={{
                width: GABARIT_WIDTH,
                height: GABARIT_HEIGHT,
                transform: `scale(${previewScale})`,
                transformOrigin: "top left",
              }}
            >
              <Component {...values} />
            </div>
            {/* Recadrage manuel de l'image de fond — même contrôle que sur
                /titres, disponible ici aussi (« peu importe le parcours »,
                demande du 2026-09-14). Gabarits famille 1 uniquement. */}
            {["1a", "1b", "1c"].includes(gabaritId) && values.imageUrl && (
              <RecadrageFond
                echelle={previewScale}
                largeur={GABARIT_WIDTH}
                hauteur={lireHauteurPhoto(values.photoHeight) || GABARIT_PHOTO_HEIGHT}
                valeur={values.imageCadre}
                onChange={(v) => setValues((p) => ({ ...p, imageCadre: v }))}
              />
            )}
          </div>
        </section>
      </main>

      {/* Input file caché pour le sélecteur */}
      <input
        ref={pickerInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && pickedField) handlePickFile(pickedField, file);
          e.target.value = "";
          setPickedField(null);
        }}
      />
    </div>
  );
}
