"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Download, Loader2 } from "lucide-react";
import { decodePrefill } from "@/lib/prefill";
import { GABARITS, GABARIT_HEIGHT, GABARIT_WIDTH } from "@/components/gabarits/registry";

const PREVIEW_SCALE = 0.28;
/** 1 accroche + jusqu'à 3 slides de développement + 1 CTA — plafond mesuré sur
 * les 8 posts réels de studio/inspi/TEXTPOST.txt (jamais plus de 3 slides de
 * dev observées). Uploader plus que ça gaspillerait du recadrage pour rien :
 * un événement RADAR peut remonter des dizaines d'images candidates. */
const MAX_CAROUSEL_IMAGES = 5;

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
}

/** Une slide du carrousel en cours de composition — éditable avant export. */
interface Slide {
  gabaritId: string;
  /** Clé du champ texte principal du gabarit ("title" pour 1a, "paragraph" pour 1b, "message" pour cta). */
  textKey: string;
  fieldValues: Record<string, string>;
  imageIndex: number; // index dans `uploaded`, pour le sélecteur d'échange d'image
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
  const [exportJob, setExportJob] = useState<{ status: string; driveUrl?: string; jobId?: string } | null>(null);

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
      next[index] = {
        ...next[index],
        imageIndex,
        fieldValues: { ...next[index].fieldValues, imageUrl: img.backdropUrl || img.croppedUrl },
      };
      return next;
    });
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
      setExportJob({ status: "pending", jobId });
      pollExport(jobId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erreur inconnue");
      setExporting(false);
    }
  }

  function pollExport(jobId: string) {
    let cancelled = false;
    async function loop() {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/export/${jobId}`);
        if (!r.ok) return;
        const j = await r.json();
        setExportJob({ status: j.status, driveUrl: j.driveUrl, jobId });
        if (j.status !== "done" && j.status !== "error") {
          setTimeout(loop, 800);
        } else {
          setExporting(false);
        }
      } catch {
        // Erreur réseau — on arrête le polling silencieusement
      }
    }
    loop();
    return () => { cancelled = true; };
  }

  const totalSlides = slides.length;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/75 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white">
            SA
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">Carrousel</h1>
            <p className="text-sm text-zinc-500">
              {pkg ? `${pkg.title} — ${totalSlides} slides` : "Préparation du carrousel…"}
            </p>
          </div>
          <Link href="/titres" className="ml-auto text-xs font-medium text-zinc-500 hover:text-zinc-800">
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

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {slides.map((slide, i) => (
                <SlideCard
                  key={i}
                  index={i}
                  total={totalSlides}
                  slide={slide}
                  uploaded={uploaded}
                  onTextChange={(v) => updateSlideText(i, v)}
                  onImageChange={(idx) => updateSlideImage(i, idx)}
                />
              ))}
            </div>

            <div className="border-t border-zinc-200 pt-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleExport}
                  disabled={exporting}
                  className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-hover active:bg-brand-pressed disabled:opacity-50"
                >
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
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
                  <span className="text-sm text-red-600">Échec de l&apos;export — voir les logs serveur.</span>
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
  onTextChange,
  onImageChange,
}: {
  index: number;
  total: number;
  slide: Slide;
  uploaded: UploadedImage[];
  onTextChange: (value: string) => void;
  onImageChange: (imageIndex: number) => void;
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
          style={{ width: GABARIT_WIDTH * PREVIEW_SCALE, height: GABARIT_HEIGHT * PREVIEW_SCALE }}
          className="relative overflow-hidden rounded-lg border border-zinc-200"
        >
          <div
            style={{ width: GABARIT_WIDTH, height: GABARIT_HEIGHT, transform: `scale(${PREVIEW_SCALE})`, transformOrigin: "top left" }}
          >
            <Preview {...slide.fieldValues} />
          </div>
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

/** Assigne les images uploadées aux slides (§2.1 du plan écosystème) : la
 * meilleure va à l'accroche, une distincte à la fin (CTA) quand c'est
 * possible, celles du milieu au développement — jamais une slide 1B sans
 * image dédiée : le nombre de slides de dev réel est plafonné par le nombre
 * d'images restantes, pas seulement par le texte disponible. */
function assembleSlides(pkg: CarouselPackage, uploaded: UploadedImage[]): Slide[] {
  const imgUrl = (img: UploadedImage) => img.backdropUrl || img.croppedUrl;

  const heroIdx = 0;
  const ctaIdx = uploaded.length > 1 ? uploaded.length - 1 : 0;
  const devPool = uploaded.slice(1, Math.max(1, uploaded.length - 1));
  const devCount = Math.min(pkg.devSlides.length, devPool.length);

  const slides: Slide[] = [
    {
      gabaritId: "1a",
      textKey: "title",
      imageIndex: heroIdx,
      fieldValues: { imageUrl: imgUrl(uploaded[heroIdx]), title: pkg.title },
    },
  ];

  for (let i = 0; i < devCount; i++) {
    const imageIndex = 1 + i;
    slides.push({
      gabaritId: "1b",
      textKey: "paragraph",
      imageIndex,
      fieldValues: { imageUrl: imgUrl(uploaded[imageIndex]), paragraph: pkg.devSlides[i] },
    });
  }

  slides.push({
    gabaritId: "cta",
    textKey: "message",
    imageIndex: ctaIdx,
    fieldValues: { imageUrl: imgUrl(uploaded[ctaIdx]) },
  });

  return slides;
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
