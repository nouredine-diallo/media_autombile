"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Download, Loader2, X } from "lucide-react";
import { decodePrefill } from "@/lib/prefill";
import { useExportJobPolling } from "@/lib/export/useExportJobPolling";
import { apiFetch } from "@/lib/apiFetch";
import { GABARITS, GABARIT_HEIGHT, GABARIT_WIDTH } from "@/components/gabarits/registry";
import { BrandHomeLink } from "@/components/BrandHomeLink";
import { RecadrageFond } from "@/components/RecadrageFond";
import {
  lireHauteurPhoto,
  GABARIT_PHOTO_HEIGHT,
  GABARITS_RECADRAGE_ORIGINAL,
  champsImagePourGabarit,
} from "@/components/gabarits/Gabarit1A";
import { BLOCK_TOP_PERCENT, BLOCK_SPAN } from "@/components/gabarits/TitleFooter";
import { CTA_TEXT_ZONE_HEIGHT } from "@/components/gabarits/GabaritCTA";
import { assembleSlides, MAX_CAROUSEL_IMAGES, type Slide } from "@/lib/carousel/assemble";

// Plafond desktop, jamais dépassé — voir la note équivalente dans
// titres/page.tsx (2026-08-29) : rendu à résolution réelle puis réduit par
// CSS, sans effet sur l'export (route séparée à pleine résolution).
const PREVIEW_SCALE_MAX = 0.28;

interface CarouselPackage {
  contentId: string;
  title: string;
  images: Array<{ url: string; source: string | null }>;
  devSlides: string[];
  pertinent: boolean;
  score: number;
  briefHeadline: string | null;
}

interface UploadedImage {
  id: string;
  croppedUrl: string;
  backdropUrl: string;
  /** Champs ajoutés le 19 sept. 2026 pour le recadrage depuis l'originale —
   * voir `champsImagePourGabarit` (Gabarit1A.tsx). Déjà renvoyés par les deux
   * routes d'upload (`import-urls`, `upload-batch`) ; seule cette interface
   * les ignorait jusqu'ici. */
  previewUrl?: string;
  cadreFond?: string;
  usedBackdrop?: boolean;
  photoHeight?: number;
}

type LoadStatus = "idle" | "loading-package" | "uploading" | "ready" | "error";

/**
 * Écran carrousel — distinct de `/titres` (single-image) pour ne prendre
 * aucun risque sur ce dernier, déjà éprouvé (voir studio-prefill.ts,
 * buildCarouselStudioLink). Parcours : décoder le prefill → récupérer le
 * paquet carrousel depuis RADAR (relais serveur, jamais d'appel direct
 * navigateur→RADAR) → uploader les images candidates dans le pipeline de
 * recadrage existant → assembler une proposition de slides (§2.1 du plan
 * écosystème) → l'opérateur ajuste texte/image par slide → export.
 */
export default function CarrouselPage() {
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pkg, setPkg] = useState<CarouselPackage | null>(null);
  const [uploaded, setUploaded] = useState<UploadedImage[]>([]);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [legend, setLegend] = useState("");
  const [exporting, setExporting] = useState(false);
  const { job: exportJob, start: startExportPolling, retry: retryExportPolling } = useExportJobPolling();

  /* ── Le bouton "Exporter" reste désactivé tant que le job n'a pas atteint
     un état terminal — même garde qu'avant le fix C1, pour ne pas ouvrir de
     fenêtre de double-clic pendant le rendu/upload (cf. audit finding D5).
     Dérivé directement au rendu plutôt que synchronisé par un effet (évite
     un aller-retour de rendu inutile — react-hooks/set-state-in-effect). ── */
  const exportBusy = exporting || (!!exportJob && exportJob.status !== "done" && exportJob.status !== "error");
  const [previewScale, setPreviewScale] = useState(PREVIEW_SCALE_MAX);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingOwn, setUploadingOwn] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  /* ── Aperçu responsive : ne dépasse jamais la largeur de l'écran (même
     correctif que titres/page.tsx, 2026-08-29) ── */
  useEffect(() => {
    function recalcScale() {
      const disponible = window.innerWidth - 32;
      setPreviewScale(Math.min(PREVIEW_SCALE_MAX, disponible / GABARIT_WIDTH));
    }
    recalcScale();
    window.addEventListener("resize", recalcScale);
    return () => window.removeEventListener("resize", recalcScale);
  }, []);

  useEffect(() => {
    let annule = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const encoded = params.get("prefill");
      const prefill = encoded ? decodePrefill(encoded) : null;
      if (!prefill || !prefill.c) {
        setStatus("error");
        setErrorMessage("Lien invalide — contentId manquant. Reviens depuis RADAR.");
        return;
      }

      setStatus("loading-package");
      try {
        const res = await fetch(`/api/carousel-package/${encodeURIComponent(prefill.c)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
        if (annule) return;
        setPkg(data);
        setLegend(data.briefHeadline || data.title || "");

        const urls = (data.images as CarouselPackage["images"]).slice(0, MAX_CAROUSEL_IMAGES).map((i) => i.url);
        if (urls.length === 0) {
          setStatus("error");
          setErrorMessage("Aucune image trouvée pour cette actualité — utilise plutôt le flux slide unique.");
          return;
        }

        setStatus("uploading");
        const images = await uploadImagesInChunks(urls);
        if (annule) return;
        if (images.length === 0) {
          setStatus("error");
          setErrorMessage("Aucune image n'a pu être importée — les URLs sources sont peut-être inaccessibles.");
          return;
        }
        setUploaded(images);
        setSlides(assembleSlides(data, images));
        setStatus("ready");
      } catch (err) {
        if (annule) return;
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Erreur inconnue");
      }
    })();

    return () => { annule = true; };
  }, []);

  function updateSlideText(index: number, value: string) {
    setSlides((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], fieldValues: { ...next[index].fieldValues, [next[index].textKey]: value } };
      return next;
    });
  }

  function updateSlideImage(index: number, imageIndex: number) {
    setSlides((prev) => {
      const next = [...prev];
      const img = uploaded[imageIndex];
      const gabaritId = next[index].gabaritId;
      next[index] = {
        ...next[index],
        imageIndex,
        // Repart des champs par défaut de la nouvelle image (originale +
        // cadrage suggéré si disponible pour ce gabarit) plutôt que de ne
        // remplacer que `imageUrl` — sinon un ancien `imageCadre`/`photoHeight`
        // resterait collé à une image qui n'est plus celle affichée.
        fieldValues: { ...next[index].fieldValues, ...champsImagePourGabarit(img, gabaritId) },
      };
      return next;
    });
  }

  /** Recadrage manuel du fond d'une slide (gabarits famille 1) — même
   * mécanisme que /titres et l'éditeur détaillé, demande du 2026-09-14. */
  /**
   * Un seul champ de cadrage à la fois (image, titre ou CTA — tous des
   * chaînes `"zoom,dx,dy"` au même format, voir `RecadrageFond.tsx`) :
   * généralisé le 23 sept. 2026 pour ajouter le recadrage du titre sans
   * dupliquer cette fonction une deuxième fois.
   */
  function updateSlideCadre(index: number, champ: "imageCadre" | "titreCadre" | "ctaCadre", valeur: string) {
    setSlides((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], fieldValues: { ...next[index].fieldValues, [champ]: valeur } };
      return next;
    });
  }

  /**
   * Ajoute des visuels personnels au pool partagé du carrousel (15 sept.
   * 2026, demande explicite) — même endpoint et même limite par appel que
   * `/titres` (`upload-batch`, timeout généreux : recadrage serveur
   * ~1.5-2s/image). Contrairement à `/titres`, ce pool est partagé par
   * toutes les slides via le sélecteur "Image N" déjà existant — pas besoin
   * de UI par slide, juste plus de choix dans le même menu.
   */
  async function uploadOwnFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (uploaded.length + arr.length > MAX_CAROUSEL_IMAGES) {
      setUploadError(`Maximum ${MAX_CAROUSEL_IMAGES} images au total pour un carrousel.`);
      return;
    }
    setUploadingOwn(true);
    setUploadError(null);
    try {
      const form = new FormData();
      arr.forEach((f) => form.append("images", f));
      const res = await apiFetch("/api/images/upload-batch", {
        method: "POST",
        body: form,
        signal: AbortSignal.timeout(60_000),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setUploaded((prev) => [...prev, ...(data.images as UploadedImage[])]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Import impossible");
    } finally {
      setUploadingOwn(false);
    }
  }

  /**
   * Retire un visuel du pool. Les slides qui le référençaient retombent sur
   * la première image restante plutôt que de rester sur un index qui ne
   * pointerait plus vers rien — jamais de fond cassé après suppression.
   */
  function removeUploadedImage(idx: number) {
    if (uploaded.length <= 1) return; // au moins 1 image doit toujours rester
    const nextUploaded = uploaded.filter((_, i) => i !== idx);
    setUploaded(nextUploaded);
    setSlides((prev) =>
      prev.map((s) => {
        // L'image référencée par cette slide a été retirée : elle retombe
        // sur la première restante et doit reprendre SES champs par défaut
        // (originale + cadrage propres à cette image). Si la slide pointait
        // vers une autre image qui a juste changé d'indice (décalage après
        // suppression), c'est toujours la même photo : ne pas toucher à un
        // cadrage que l'opérateur a peut-être déjà ajusté à la main.
        const imageSupprimee = s.imageIndex === idx;
        const newIndex = Math.min(imageSupprimee ? 0 : s.imageIndex > idx ? s.imageIndex - 1 : s.imageIndex, nextUploaded.length - 1);
        const img = nextUploaded[newIndex];
        if (!img) return s;
        return {
          ...s,
          imageIndex: newIndex,
          fieldValues: imageSupprimee
            ? { ...s.fieldValues, ...champsImagePourGabarit(img, s.gabaritId) }
            : s.fieldValues,
        };
      }),
    );
  }

  async function handleExport() {
    if (!pkg) return;
    setExporting(true);
    setErrorMessage(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slides: slides.map((s) => ({ gabaritId: s.gabaritId, fieldValues: s.fieldValues })),
          contentId: pkg.contentId,
          fieldValues: { caption: legend },
        }),
      });
      const data = await res.json().catch(() => ({ error: "Échec inconnu" }));
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      const jobId = data.jobId as string;
      startExportPolling(jobId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erreur inconnue");
      setExporting(false);
    }
  }

  const totalSlides = slides.length;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/75 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <BrandHomeLink />
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Carrousel</h1>
            <p className="text-sm text-zinc-500">
              {pkg ? `${pkg.title} — ${totalSlides} slides` : "Préparation du carrousel…"}
            </p>
          </div>
          <Link
            href={
              pkg
                ? `/titres?pool=${uploaded.map((u) => u.id).join(",")}&title=${encodeURIComponent(pkg.title)}&contentId=${encodeURIComponent(pkg.contentId)}&gabarit=1a`
                : "/titres"
            }
            className="ml-auto text-xs font-medium text-zinc-500 hover:text-zinc-800"
          >
            Basculer sur slide unique →
          </Link>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-6">
        {(status === "loading-package" || status === "uploading") && (
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            {status === "loading-package" ? "Récupération de l'actualité depuis RADAR…" : "Import et recadrage des images…"}
          </div>
        )}

        {status === "error" && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              {errorMessage}
              {errorMessage?.includes("authentifié") && (
                <>
                  {" "}
                  <Link href="/login" className="underline">Se connecter</Link>
                </>
              )}
            </div>
          </div>
        )}

        {status === "ready" && pkg && (
          <>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-600">Légende du post (déposée avec le carrousel)</label>
              <textarea
                value={legend}
                onChange={(e) => setLegend(e.target.value)}
                rows={2}
                placeholder="La légende qui accompagne les visuels du post…"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs font-medium text-zinc-600">
                Visuels disponibles (choisis dans le sélecteur "Image N" de chaque slide)
              </label>
              <div className="flex flex-wrap gap-3">
                {uploaded.map((img, i) => (
                  <div key={img.id} className="relative h-20 w-16 overflow-hidden rounded-lg border border-zinc-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.croppedUrl} alt="" className="h-full w-full object-cover" />
                    <span className="absolute bottom-0 left-0 rounded-tr bg-black/60 px-1 text-[10px] text-white">
                      {i + 1}
                    </span>
                    {uploaded.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeUploadedImage(i)}
                        className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl bg-black/60 text-white hover:bg-black/80"
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    )}
                  </div>
                ))}
                {uploaded.length < MAX_CAROUSEL_IMAGES && (
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    disabled={uploadingOwn}
                    className="flex h-20 w-16 items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 text-lg text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-600 disabled:opacity-50"
                  >
                    {uploadingOwn ? <Loader2 className="size-4 animate-spin" aria-hidden /> : "+"}
                  </button>
                )}
              </div>
              {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) uploadOwnFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {slides.map((slide, i) => (
                <SlideCard
                  key={i}
                  index={i}
                  total={totalSlides}
                  slide={slide}
                  uploaded={uploaded}
                  previewScale={previewScale}
                  onTextChange={(v) => updateSlideText(i, v)}
                  onImageChange={(idx) => updateSlideImage(i, idx)}
                  onCadreChange={(v) => updateSlideCadre(i, "imageCadre", v)}
                  onTitreCadreChange={(v) => updateSlideCadre(i, "titreCadre", v)}
                  onCtaCadreChange={(v) => updateSlideCadre(i, "ctaCadre", v)}
                />
              ))}
            </div>

            <div className="border-t border-zinc-200 pt-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExport}
                  disabled={exportBusy}
                  className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover active:bg-brand-pressed disabled:opacity-50"
                >
                  {exportBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                  Exporter ce carrousel
                </button>
                {exportJob?.status === "done" && exportJob.driveUrl && (
                  <a
                    href={exportJob.driveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-sm font-medium text-brand"
                  >
                    <CheckCircle2 className="h-4 w-4" /> Ouvrir le dossier Drive →
                  </a>
                )}
                {/* Repli local — Drive non configuré ou échoué : les slides restent
                    récupérables via un dossier ZIP téléchargé directement. */}
                {exportJob?.status === "done" && !exportJob.driveUrl && exportJob.jobId && (
                  <a
                    href={`/api/export/${exportJob.jobId}/download-zip`}
                    className="flex items-center gap-1.5 text-sm font-medium text-brand"
                  >
                    <Download className="h-4 w-4" /> Télécharger le dossier (ZIP) →
                  </a>
                )}
                {exportJob?.status === "error" && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600">
                      {exportJob.error ?? "Échec de l'export — voir les logs serveur."}
                    </span>
                    <button
                      type="button"
                      onClick={() => retryExportPolling()}
                      className="text-sm font-medium text-brand hover:underline"
                    >
                      Réessayer
                    </button>
                  </div>
                )}
                {exportJob && exportJob.status !== "done" && exportJob.status !== "error" && (
                  <span className="text-sm text-zinc-500">{exportJob.status}…</span>
                )}
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                Chaque slide part telle quelle dans son PNG. L&apos;export dépose un dossier Drive avec les visuels et la légende.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function SlideCard({
  index,
  total,
  slide,
  uploaded,
  previewScale,
  onTextChange,
  onImageChange,
  onCadreChange,
  onTitreCadreChange,
  onCtaCadreChange,
}: {
  index: number;
  total: number;
  slide: Slide;
  uploaded: UploadedImage[];
  previewScale: number;
  onTextChange: (value: string) => void;
  onImageChange: (imageIndex: number) => void;
  onCadreChange: (imageCadre: string) => void;
  onTitreCadreChange: (titreCadre: string) => void;
  onCtaCadreChange: (ctaCadre: string) => void;
}) {
  const def = GABARITS[slide.gabaritId];
  const Preview = def?.Component;
  const role = index === 0 ? "Accroche" : index === total - 1 ? "Fin (CTA)" : "Développement";

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Slide {index + 1}/{total} · {role}
        </span>
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">{def?.label}</span>
      </div>

      {Preview && (
        <div
          style={{ width: GABARIT_WIDTH * previewScale, height: GABARIT_HEIGHT * previewScale }}
          className="relative overflow-hidden rounded-lg border border-zinc-200"
        >
          <div
            style={{ width: GABARIT_WIDTH, height: GABARIT_HEIGHT, transform: `scale(${previewScale})`, transformOrigin: "top left" }}
          >
            <Preview {...slide.fieldValues} />
          </div>
          {/* Recadrage manuel du fond depuis l'originale — mêmes gabarits et
              même contrôle que /titres (GABARITS_RECADRAGE_ORIGINAL,
              Gabarit1A.tsx). "cta" occupe tout le cadre (pas de zone photo
              réduite, voir GabaritCTA.tsx), d'où la hauteur conditionnelle. */}
          {GABARITS_RECADRAGE_ORIGINAL.has(slide.gabaritId) && (
            <RecadrageFond
              echelle={previewScale}
              largeur={GABARIT_WIDTH}
              hauteur={
                slide.gabaritId === "cta"
                  ? GABARIT_HEIGHT
                  : lireHauteurPhoto(slide.fieldValues.photoHeight) || GABARIT_PHOTO_HEIGHT
              }
              valeur={slide.fieldValues.imageCadre}
              onChange={onCadreChange}
            />
          )}
          {/* Recadrage manuel du titre — ajouté le 23 sept. 2026 (retour
              utilisateur réel : présent sur /titres depuis le 15 sept.,
              jamais porté ici). Même mécanisme, même zone (BLOCK_TOP_PERCENT/
              BLOCK_SPAN, TitleFooter.tsx) que l'écran image unique, gabarit
              par gabarit puisque chaque slide peut avoir le sien. */}
          {!["1b", "cta"].includes(slide.gabaritId) && (
            <div style={{ position: "absolute", left: 0, top: GABARIT_HEIGHT * (BLOCK_TOP_PERCENT / 100) * previewScale }}>
              <RecadrageFond
                echelle={previewScale}
                largeur={GABARIT_WIDTH}
                hauteur={GABARIT_HEIGHT * (BLOCK_SPAN / 100)}
                valeur={slide.fieldValues.titreCadre}
                onChange={onTitreCadreChange}
              />
            </div>
          )}
          {/* Même principe pour le texte du CTA (slide de fin uniquement). */}
          {slide.gabaritId === "cta" && (
            <div style={{ position: "absolute", left: 0, top: GABARIT_HEIGHT * 0.08 * previewScale }}>
              <RecadrageFond
                echelle={previewScale}
                largeur={GABARIT_WIDTH}
                hauteur={CTA_TEXT_ZONE_HEIGHT}
                valeur={slide.fieldValues.ctaCadre}
                onChange={onCtaCadreChange}
              />
            </div>
          )}
        </div>
      )}

      {slide.textKey && (
        <textarea
          value={slide.fieldValues[slide.textKey] ?? ""}
          onChange={(e) => onTextChange(e.target.value)}
          rows={slide.gabaritId === "1b" ? 3 : 2}
          className="w-full rounded-lg border border-zinc-300 px-2 py-1.5 text-sm"
          placeholder={
            slide.gabaritId === "cta"
              ? "Message par défaut (laisser vide = texte standard)"
              : role === "Accroche"
                ? "Titre d&apos;accroche — court, il donne envie de défiler"
                : "Une idée par slide, 25 à 60 mots — mots-clés en gras (**texte**)"
          }
        />
      )}

      {uploaded.length > 1 && (
        <select
          value={slide.imageIndex}
          onChange={(e) => onImageChange(Number(e.target.value))}
          className="rounded-lg border border-zinc-300 px-2 py-1 text-xs text-zinc-600"
        >
          {uploaded.map((img, i) => (
            <option key={img.id} value={i}>
              Image {i + 1}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

/**
 * Importe les images candidates via `/api/images/import-urls` — un fetch
 * SERVEUR-à-serveur, pas un `fetch()` du navigateur (le premier essai avec
 * un fetch client, comme le fait le flux single-image existant pour son
 * image unique, échouait en pratique : bloqué par CORS dès qu'un hébergeur
 * source ne renvoie pas `Access-Control-Allow-Origin`, vérifié avec de
 * vraies URLs). Un seul appel, jusqu'à `MAX_CAROUSEL_IMAGES` URLs.
 */
async function uploadImagesInChunks(urls: string[]): Promise<UploadedImage[]> {
  try {
    const res = await fetch("/api/images/import-urls", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    const data = await res.json();
    if (!res.ok || !Array.isArray(data.images)) return [];
    return data.images as UploadedImage[];
  } catch {
    return [];
  }
}
