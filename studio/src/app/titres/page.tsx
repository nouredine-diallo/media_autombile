"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  Loader2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { decodePrefill } from "@/lib/prefill";
import { GABARITS, GABARIT_HEIGHT, GABARIT_WIDTH } from "@/components/gabarits/registry";
import { MontageDirect, type BulleCible } from "@/components/MontageDirect";
import { GABARIT_2A_BULLE } from "@/components/gabarits/Gabarit2A";
import { GABARIT_2B_BULLE } from "@/components/gabarits/Gabarit2B";
import { GABARIT_3A_BULLE1, GABARIT_3A_BULLE2 } from "@/components/gabarits/Gabarit3A";
import { GABARIT_3B_BULLE1, GABARIT_3B_BULLE2 } from "@/components/gabarits/Gabarit3B";
import { geometrieBulleUnique, geometrieBulleDouble, type BulleGeometry } from "@/components/gabarits/Bulle";

/** Géométrie de référence de chaque bulle, par gabarit. */
const BULLES_PAR_GABARIT: Record<string, { cle: string; geom: BulleGeometry; libelle: string }[]> = {
  "2a": [{ cle: "bulle", geom: GABARIT_2A_BULLE, libelle: "Bulle" }],
  "2b": [{ cle: "bulle", geom: GABARIT_2B_BULLE, libelle: "Bulle" }],
  "3a": [
    { cle: "bulle1", geom: GABARIT_3A_BULLE1, libelle: "Bulle gauche" },
    { cle: "bulle2", geom: GABARIT_3A_BULLE2, libelle: "Bulle droite" },
  ],
  "3b": [
    { cle: "bulle1", geom: GABARIT_3B_BULLE1, libelle: "Bulle gauche" },
    { cle: "bulle2", geom: GABARIT_3B_BULLE2, libelle: "Bulle droite" },
  ],
};

const MIN_LEN = 30;
const MAX_LEN = 95;
// 0.35 = le rendu desktop actuel (378px de large pour un gabarit 1080px) —
// conservé comme plafond, jamais dépassé. Sur un écran plus étroit que ça
// (téléphone), l'aperçu débordait du viewport de quelques pixels (trouvé le
// 2026-08-29, jamais vérifié sur un vrai petit écran avant). Le calque
// intérieur reste rendu à la résolution RÉELLE du gabarit puis réduit par
// `transform: scale()` — un CSS d'affichage pur, sans effet sur l'export
// (qui screenshotte la résolution réelle via une route séparée) : changer
// l'échelle ici ne touche jamais à la fidélité "zéro écart aperçu/rendu".
const PREVIEW_SCALE_MAX = 0.35;

/**
 * Compte les photos que l'utilisateur doit réellement fournir : les champs
 * image du gabarit, **moins** les découpes que l'outil calcule tout seul
 * (`sujetUrl`, `bulle1SujetUrl`, …). Sans ce filtre l'interface annonçait
 * « 5 images » pour un 3A qui n'en demande que 3 — l'opérateur croyait devoir
 * en fournir deux de plus.
 */
const photosRequises = (g: { fields: { kind: string; key: string }[] }) =>
  g.fields.filter(
    (f) => f.kind === "image" && !f.key.toLowerCase().includes("sujeturl"),
  ).length;

const GABARIT_OPTIONS = Object.values(GABARITS).map((g) => ({
  id: g.id,
  label: g.label,
  imageCount: photosRequises(g),
}));

interface UploadedImage {
  id: string;
  croppedUrl: string;
  /** Photo composée pour la zone haute du montage — c'est elle qui sert de fond. */
  backdropUrl: string;
  /** Recadrage paysage dédié aux bulles (marge pour l'effet de débordement). */
  bulleUrl: string;
  role: string;
  /** Découpe du sujet du fond (3e couche) et de l'image de bulle, une fois calculées. */
  sujetUrl?: string;
  bulleSujetUrl?: string;
  /** L'outil a mesuré que le débordement de cette bulle est pertinent. */
  debordementConseille?: boolean;
  /** Hauteur de la zone photo pour cette image — varie selon la source. */
  photoHeight?: number;
  /** Cadrage conseillé du contenu de la bulle (`"zoom,dx,dy"`), calculé au détourage. */
  cadreBulle?: string;
  /** Position du sujet dans le fond composé, en % du canevas. */
  sujetHaut?: number;
  sujetCentreX?: number;
}

interface Verdict {
  /** Gabarit auquel ce verdict se rapporte — évite d'afficher un avis périmé. */
  gabarit: string;
  ok: boolean;
  message: string;
  suggestion?: string;
}

export default function TitresPage() {
  const [theme, setTheme] = useState("");
  const [titles, setTitles] = useState<string[]>([]);
  const [surtitres, setSurtitres] = useState<string[]>([]);
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedSurtitre, setSelectedSurtitre] = useState<string | null>(null);
  const [selectedParagraph, setSelectedParagraph] = useState<number | null>(null);
  const [selectedGabarit, setSelectedGabarit] = useState("3a");
  /** Vrai tant que l'opérateur n'a pas choisi lui-même : l'outil peut décider. */
  const [gabaritAuto, setGabaritAuto] = useState(true);
  const [noteAuto, setNoteAuto] = useState<string | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  /**
   * Réglages produits par la manipulation directe sur l'aperçu. Superposés aux
   * valeurs calculées : l'automatique reste la base, le geste de l'opérateur
   * a le dernier mot. Repartent tels quels au rendu et à l'export.
   */
  const [reglages, setReglages] = useState<Record<string, string>>({});
  const [exporting, setExporting] = useState(false);
  /** content_id passé depuis RADAR via le prefill — requis pour le callback après export. */
  const [contentId, setContentId] = useState<string | null>(null);
  /** Contexte source depuis le prefill RADAR : nom du flux + chapeau de l'article. */
  const [sourceContext, setSourceContext] = useState<{ source: string; headline: string } | null>(null);
  /** État de l'export inline — évite la navigation vers /export/{jobId}. */
  const [exportJob, setExportJob] = useState<{ jobId: string; status: string; driveUrl?: string; hasDownload?: boolean } | null>(null);
  /** Échelle réelle de l'aperçu — voir PREVIEW_SCALE_MAX. */
  const [previewScale, setPreviewScale] = useState(PREVIEW_SCALE_MAX);

  const fileInput = useRef<HTMLInputElement>(null);

  /* ── Aperçu responsive : ne dépasse jamais la largeur de l'écran ── */
  useEffect(() => {
    function recalcScale() {
      // 32px de marge de sécurité (padding de page) — évite un aperçu qui
      // touche pile les bords, plus fragile au moindre écart d'arrondi.
      const disponible = window.innerWidth - 32;
      const echelle = Math.min(PREVIEW_SCALE_MAX, disponible / GABARIT_WIDTH);
      setPreviewScale(echelle);
    }
    recalcScale();
    window.addEventListener("resize", recalcScale);
    return () => window.removeEventListener("resize", recalcScale);
  }, []);

  /* ── Prefill depuis RADAR : auto-remplit le thème, uploade l'image, génère les titres ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("prefill");
    if (!raw) return;
    const data = decodePrefill(raw);
    if (!data) return;

    // Remplir le thème avec le titre
    if (data.t) setTheme(data.t);

    // Retenir le content_id pour le callback RADAR après export
    if (data.c) setContentId(data.c);

    // Afficher le contexte source (nom du flux + chapeau)
    if (data.s || data.b) {
      setSourceContext({ source: data.s, headline: data.b });
    }

    // Si une image est fournie, l'importer automatiquement (côté serveur —
    // voir importFromUrl, corrige le blocage CORS documenté ci-dessous).
    if (data.i && data.i !== "empty") {
      void importFromUrl(data.i);
    }

    // Auto-générer les titres si on a un thème (élimine 1 clic)
    if (data.t && data.t.trim().length > 0) {
      setStatus("loading");
      fetch("/api/titles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme: data.t }),
      })
        .then((r) => r.json())
        .then((gen) => {
          if (gen.titles) {
            setTitles(gen.titles);
            setSurtitres(gen.surtitres ?? []);
            setParagraphs(gen.paragraphs ?? []);
            setProvider(gen.provider);
            setSelectedIndex(gen.titles.length > 0 ? 0 : null);
            if (gen.paragraphs && gen.paragraphs.length > 0) {
              setSelectedParagraph(0);
            }
            const firstSurtitre = (gen.surtitres ?? []).find((s: string) => s.length > 0);
            if (firstSurtitre) setSelectedSurtitre(firstSurtitre);
          }
          setStatus("idle");
        })
        .catch(() => {
          // L'utilisateur peut réessayer manuellement via le bouton
          setStatus("idle");
        });
    }

    // Nettoyer l'URL pour ne pas re-déclencher au refresh
    window.history.replaceState({}, "", "/titres");
  }, []);

  /* ── Découpes (3e couche + débordement) ── */
  async function detourer(cibles: UploadedImage[]) {
    for (const img of cibles) {
      const [fond, bulle] = await Promise.all([
        fetch(`/api/images/${img.id}/segment`, { method: "POST" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
        fetch(`/api/images/${img.id}/segment?variant=bulle`, { method: "POST" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null),
      ]);
      setImages((prev) =>
        prev.map((p) =>
          p.id === img.id
            ? {
                ...p,
                sujetUrl: fond?.sujetUrl,
                bulleSujetUrl: bulle?.sujetUrl,
                debordementConseille: bulle?.debordement?.conseille ?? false,
                cadreBulle: bulle?.debordement?.cadre,
                sujetHaut: fond?.sujet?.haut,
                sujetCentreX: fond?.sujet?.centreX,
              }
            : p,
        ),
      );
    }
  }

  /**
   * Choisit le gabarit d'après le nombre de photos — appelé là où ce nombre
   * change, jamais dans un effet (un `setState` synchrone dans un effet
   * déclenche des rendus en cascade, signalé par le lint React).
   *
   * Un post à 1 photo n'a pas à faire choisir « image seule » à la main ; à
   * 3 photos, la disposition symétrique est celle de la référence. Dès que
   * l'opérateur clique un gabarit, cet automatisme se retire définitivement.
   */
  function appliquerGabaritAuto(nbPhotos: number, auto: boolean) {
    if (!auto) return;
    setSelectedGabarit(nbPhotos >= 3 ? "3a" : nbPhotos === 2 ? "2a" : nbPhotos === 1 ? "1a" : "3a");
  }

  /* ── Upload images ── */
  async function uploadFiles(files: FileList | File[]) {
    const arr = Array.from(files);
    if (arr.length > 3) {
      setErrorMessage("Maximum 3 images par post.");
      return;
    }
    setStatus("loading");
    setErrorMessage(null);
    try {
      const form = new FormData();
      arr.forEach((f) => form.append("images", f));
      const res = await fetch("/api/images/upload-batch", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      const nouvelles: UploadedImage[] = data.images.map((img: UploadedImage) => ({
        id: img.id,
        croppedUrl: img.croppedUrl,
        backdropUrl: img.backdropUrl,
        bulleUrl: img.bulleUrl,
        photoHeight: img.photoHeight,
        role: img.role,
      }));
      setImages((prev) => {
        const suite = [...prev, ...nouvelles];
        appliquerGabaritAuto(suite.length, gabaritAuto);
        return suite;
      });
      // Le montage doit être bon SANS retouche : on calcule tout de suite les
      // découpes qui portent l'effet de profondeur (sujet du fond par-dessus
      // les bulles, débordement du sujet d'une bulle). Sans ça, l'aperçu que
      // voit l'utilisateur n'est pas le montage que l'outil sait produire.
      void detourer(nouvelles);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setStatus("idle");
    }
  }

  /**
   * Importe une image externe (prefill RADAR) via `/api/images/import-urls` —
   * un fetch SERVEUR-à-serveur, pas un `fetch()` du navigateur. Bug trouvé
   * le 2026-08-28 : l'ancienne version faisait `fetch(data.i)` directement
   * depuis le navigateur, ce qui échoue dès que la source ne renvoie pas
   * `Access-Control-Allow-Origin` (confirmé avec une vraie URL Hagerty —
   * échec systématique, pas un cas isolé). Le carrousel avait déjà ce
   * correctif (`titres/carrousel/page.tsx`, `uploadImagesInChunks`), jamais
   * reporté ici. Une seule image (pas de rôle à deviner, cf. commentaire de
   * `import-urls/route.ts`) : `role` fixé à "fond", `bulleUrl` construit sur
   * le même format que `upload-batch`.
   */
  async function importFromUrl(url: string) {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/images/import-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [url] }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.images) || data.images.length === 0) {
        throw new Error(data.error ?? "Image indisponible");
      }
      const nouvelles: UploadedImage[] = data.images.map((img: { id: string; croppedUrl: string; backdropUrl: string }) => ({
        id: img.id,
        croppedUrl: img.croppedUrl,
        backdropUrl: img.backdropUrl,
        bulleUrl: `/api/images/${img.id}?variant=bulle`,
        role: "fond",
      }));
      setImages((prev) => {
        const suite = [...prev, ...nouvelles];
        appliquerGabaritAuto(suite.length, gabaritAuto);
        return suite;
      });
      void detourer(nouvelles);
    } catch {
      setErrorMessage("Impossible de télécharger l'image depuis RADAR.");
    } finally {
      setStatus("idle");
    }
  }

  /* ── Génération titre ── */
  async function handleGenerate() {
    if (theme.trim().length === 0) return;
    setStatus("loading");
    setErrorMessage(null);
    setSelectedIndex(null);
    setSelectedSurtitre(null);
    setSelectedParagraph(null);
    try {
      const res = await fetch("/api/titles/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setTitles(data.titles);
      setSurtitres(data.surtitres ?? []);
      setParagraphs(data.paragraphs ?? []);
      setProvider(data.provider);
      // Auto-sélectionner le premier surtitre valide pour gabarit 1B
      const firstSurtitre = (data.surtitres as string[] | undefined ?? []).find((s: string) => s.length > 0);
      if (firstSurtitre) setSelectedSurtitre(firstSurtitre);
      // Auto-sélectionner le premier paragraphe pour gabarit 1B
      if (data.paragraphs && data.paragraphs.length > 0) {
        setSelectedParagraph(0);
      }
      // Pré-sélection du premier titre : l'export devient disponible tout de
      // suite. Changer de titre reste un clic, pas une obligation.
      setSelectedIndex(data.titles.length > 0 ? 0 : null);
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  function updateTitle(index: number, value: string) {
    setTitles((prev) => prev.map((t, i) => (i === index ? value : t)));
  }

  /* ── Construire les fieldValues pour l'aperçu ── */
  function buildPreviewValues(): Record<string, string> {
    const def = GABARITS[selectedGabarit];
    if (!def) return {};

    const values: Record<string, string> = { ...def.defaults };

    // Chaque champ reçoit LA variante prévue pour lui : le fond est composé
    // pour la zone haute du montage (`backdrop`), les bulles ont leur propre
    // recadrage paysage (`bulle`). Assigner partout `cropped` — ce que faisait
    // cette page jusqu'au 2026-08-21 — donnait un aperçu qui n'était pas le
    // montage que le pipeline sait produire.
    const fond = images[0];
    const bullesDispo = images.slice(1);
    if (fond) {
      values.imageUrl = fond.backdropUrl;
      if (fond.sujetUrl) values.sujetUrl = fond.sujetUrl;
      // Sans cette ligne, l'aperçu composerait la photo sur 74 % pendant que
      // le rendu utiliserait la hauteur réelle : aperçu ≠ export.
      if (fond.photoHeight) values.photoHeight = String(fond.photoHeight);
    }
    const champsBulle = def.fields.filter(
      (f) => f.kind === "image" && f.key.startsWith("bulle") && !f.key.endsWith("SujetUrl"),
    );
    // Famille « 1 image + 1 bulle » : la bulle est placée d'après le sujet du
    // fond — au-dessus de lui pour créer le contact, et du côté qu'il laisse
    // libre. Les trois références montrent une bulle grande et haute, centrée
    // quand le sujet l'est, décalée quand il ne l'est pas.
    if (fond?.sujetHaut !== undefined && fond.sujetCentreX !== undefined && champsBulle.length === 1) {
      const g = geometrieBulleUnique(
        fond.sujetHaut,
        fond.sujetCentreX,
        GABARIT_WIDTH,
        GABARIT_HEIGHT,
        selectedGabarit === "2a",
      );
      values.bulleGeom = `${g.leftPercent.toFixed(2)},${g.topPercent.toFixed(2)},${g.sizePercent.toFixed(2)}`;
    } else if (fond?.sujetHaut !== undefined && fond.sujetCentreX !== undefined && champsBulle.length === 2) {
      // Famille « 1 image + 2 bulles » : les bulles sont centrées sur le sujet.
      const ratio = Number.parseFloat(reglages.bulleRatio ?? "0.5");
      const [g1, g2] = geometrieBulleDouble(
        fond.sujetHaut,
        fond.sujetCentreX,
        GABARIT_WIDTH,
        GABARIT_HEIGHT,
        ratio,
      );
      values.bulle1Geom = `${g1.leftPercent.toFixed(2)},${g1.topPercent.toFixed(2)},${g1.sizePercent.toFixed(2)}`;
      values.bulle2Geom = `${g2.leftPercent.toFixed(2)},${g2.topPercent.toFixed(2)},${g2.sizePercent.toFixed(2)}`;
    }

    champsBulle.forEach((champ, i) => {
      const img = bullesDispo[i];
      if (!img) return;
      values[champ.key] = img.bulleUrl;
      // Cadrage conseillé, calculé au détourage : le sujet est posé au centre
      // du cercle et dimensionné pour le franchir légèrement — sans ça il
      // affleurait le bord et le débordement ne se lisait pas.
      if (img.cadreBulle) values[`${champ.key.replace(/Url$/, "")}Cadre`] = img.cadreBulle;
      // Le débordement est activé d'emblée quand la mesure le juge pertinent
      // (arc franchi court) — « bon du premier coup ». L'opérateur le coupe
      // d'un clic sur l'aperçu si son œil n'est pas d'accord.
      if (img.debordementConseille && img.bulleSujetUrl) {
        values[`${champ.key.replace(/Url$/, "")}SujetUrl`] = img.bulleSujetUrl;
      }
    });

    // Titre sélectionné
    if (selectedIndex !== null && titles[selectedIndex]) {
      const titleField = def.fields.find((f) => f.key === "title");
      if (titleField) values.title = titles[selectedIndex];
    }

    // Paragraphe sélectionné (gabarit 1B)
    if (selectedParagraph !== null && paragraphs[selectedParagraph]) {
      const paragraphField = def.fields.find((f) => f.key === "paragraph");
      if (paragraphField) values.paragraph = paragraphs[selectedParagraph];
    }

    // Surtitre sélectionné (ancien gabarit 1B, gardé pour compatibilité)
    if (selectedSurtitre) {
      const eyebrowField = def.fields.find((f) => f.key === "eyebrow");
      if (eyebrowField) values.eyebrow = selectedSurtitre;
    }

    // Les réglages manuels passent en dernier : une valeur vide efface la
    // surcharge et rend la main à l'automatique.
    for (const [k, v] of Object.entries(reglages)) {
      if (v) values[k] = v;
      else delete values[k];
    }

    return values;
  }

  /* ── Contrôle qualité : ce fond va-t-il avec ce gabarit ? ── */
  const fondId = images[0]?.id;
  const fondPret = Boolean(images[0]?.sujetUrl);
  useEffect(() => {
    if (!fondId || !fondPret) return;
    let annule = false;
    const pour = selectedGabarit;
    fetch(`/api/images/${fondId}/gabarit-fit?gabarit=${pour}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (annule || !j) return;
        setVerdict({ gabarit: pour, ok: j.ok, message: j.message, suggestion: j.suggestion });
        // Tant que l'opérateur n'a pas choisi lui-même, l'outil applique le
        // repli qu'il a vérifié au lieu de lui demander de cliquer : « le post
        // doit être bon du premier coup ». La bascule est annoncée, jamais
        // silencieuse.
        if (gabaritAuto && !j.ok && j.suggestion && j.suggestion !== pour) {
          setNoteAuto(
            `Gabarit ajusté automatiquement en ${j.suggestion.toUpperCase()} : ${j.message}`,
          );
          setSelectedGabarit(j.suggestion);
        } else if (j.ok) {
          setNoteAuto(null);
        }
      })
      .catch(() => {});
    return () => { annule = true; };
  }, [fondId, fondPret, selectedGabarit, gabaritAuto]);

  /* ── Export direct avec polling inline (pas de navigation) ── */
  async function handleExport() {
    setExporting(true);
    setErrorMessage(null);
    setExportJob(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gabaritId: selectedGabarit,
          fieldValues: buildPreviewValues(),
          contentId,
        }),
      });
      const data = await res.json().catch(() => ({ error: "Échec inconnu" }));
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      // Polling inline au lieu de naviguer vers /export/{jobId}
      const jobId = data.jobId as string;
      setExportJob({ jobId, status: "pending" });
      setExporting(false);
      pollExport(jobId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Erreur inconnue");
      setExporting(false);
    }
  }

  /* ── Polling de l'export — même logique que ExportConfirmationClient ── */
  function pollExport(jobId: string) {
    let cancelled = false;
    async function loop() {
      if (cancelled) return;
      try {
        const r = await fetch(`/api/export/${jobId}`);
        if (!r.ok) return;
        const j = await r.json();
        setExportJob({ jobId, status: j.status, driveUrl: j.driveUrl, hasDownload: j.hasDownload });
        if (j.status !== "done" && j.status !== "error") {
          setTimeout(loop, 800);
        }
      } catch {
        // Erreur réseau — on arrête le polling silencieusement
      }
    }
    loop();
    return () => { cancelled = true; };
  }

  const previewValues = buildPreviewValues();

  /** Bulles manipulables du gabarit courant, avec leur découpe si elle existe. */
  const ciblesBulles: BulleCible[] = (BULLES_PAR_GABARIT[selectedGabarit] ?? []).map((b, i) => ({
    cleGeom: `${b.cle}Geom`,
    cleImage: `${b.cle}Url`,
    cleDebordement: `${b.cle}SujetUrl`,
    cleCadre: `${b.cle}Cadre`,
    defaut: b.geom,
    debordementDispo: images[i + 1]?.bulleSujetUrl ?? "",
    libelle: b.libelle,
  }));
  const gabaritDef = GABARITS[selectedGabarit];
  const PreviewComponent = gabaritDef?.Component;
  const isGabarit1B = selectedGabarit === "1b";
  const selectedTitle = isGabarit1B
    ? (selectedParagraph !== null ? paragraphs[selectedParagraph] : null)
    : (selectedIndex !== null ? titles[selectedIndex] : null);

  // Nombre d'images requises pour le gabarit sélectionné
  const requiredImages = gabaritDef
    ? photosRequises(gabaritDef)
    : 0;

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      {/* Header */}
      {/* Chrome de navigation : c'est le SEUL endroit où un effet de verre est
          admis. Les surfaces de contenu (listes d'images, titres, verdict)
          restent opaques — le flou fait chuter le contraste et pose un vrai
          problème d'accessibilité sur du contenu dense (WCAG). */}
      <header className="sticky top-0 z-20 border-b border-zinc-200/70 bg-white/75 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-900 text-sm font-bold text-white">
            SA
          </div>
          <div>
            <h1 className="text-lg font-semibold text-zinc-900">
              Titre + Gabarit
            </h1>
            <p className="text-sm text-zinc-500">
              Uploadez vos images, choisissez un gabarit, générez le titre.
            </p>
            {sourceContext && (sourceContext.source || sourceContext.headline) && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">
                {sourceContext.source && (
                  <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600">
                    {sourceContext.source}
                  </span>
                )}
                {sourceContext.headline && (
                  <span className="truncate max-w-xs">
                    {sourceContext.headline}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-8 p-6 lg:flex-row">
        {/* ── Panneau gauche : contrôles ── */}
        <section className="flex w-full max-w-md flex-col gap-6">

          {/* Images */}
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-zinc-800">Images</h2>
            <div className="flex flex-wrap gap-3">
              {images.map((img) => (
                <div key={img.id} className="relative h-20 w-16 overflow-hidden rounded-lg border border-zinc-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.croppedUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() =>
                      setImages((prev) => {
                        const suite = prev.filter((i) => i.id !== img.id);
                        appliquerGabaritAuto(suite.length, gabaritAuto);
                        return suite;
                      })
                    }
                    className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl bg-black/60 text-[10px] text-white hover:bg-black/80"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex h-20 w-16 items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 text-lg text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-600"
              >
                +
              </button>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) uploadFiles(e.target.files);
                e.target.value = "";
              }}
            />
            {images.length > 0 ? (
              <p className="text-xs text-zinc-400">
                {images.length}/{requiredImages} images pour {gabaritDef?.label}
              </p>
            ) : (
              <p className="text-xs text-zinc-400">
                De 1 à 3 photos. La première devient le fond, les suivantes remplissent les bulles.
              </p>
            )}
          </div>

          {/* Sélecteur de gabarit */}
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-zinc-800">Gabarit</h2>
            <div className="grid grid-cols-2 gap-2">
              {GABARIT_OPTIONS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => { setGabaritAuto(false); setNoteAuto(null); setReglages({}); setSelectedGabarit(g.id); }}
                  className={`rounded-lg border px-3 py-2 text-left text-xs font-medium transition-all ${
                    selectedGabarit === g.id
                      ? "border-brand bg-brand text-white"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
                  }`}
                >
                  {g.label}
                  <span className="ml-1 text-[10px] opacity-60">
                    ({g.imageCount} img)
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Thème */}
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-zinc-800">Thème</h2>
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              placeholder="Le sujet de votre actualité — ex. Renault 5 E-Tech, Formule 1, rappel Tesla…"
              className="w-full rounded-xl border-2 border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-600 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleGenerate}
              disabled={status === "loading" || theme.trim().length === 0}
              className="rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover active:bg-brand-pressed disabled:opacity-50"
            >
              {status === "loading" ? "Génération…" : "Générer 3 titres"}
            </button>
            <p className="text-xs text-zinc-400">
              Génère titres, surtitres et paragraphes dans le ton du Média.
              Choisissez-en un, modifiez-le si besoin, puis exportez.
            </p>
          </div>

          {errorMessage && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          )}

          {/* Titres générés */}
          {titles.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-800">
                  {isGabarit1B ? "Paragraphes" : "Titres"}
                </h2>
                {provider && (
                  <span className="text-[10px] text-zinc-400">via {provider}</span>
                )}
              </div>

              {/* Mode gabarit 1B : afficher les paragraphes */}
              {isGabarit1B ? (
                paragraphs.map((p, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedParagraph(i)}
                    className={`w-full rounded-xl border-2 p-3 text-left transition-all ${
                      selectedParagraph === i
                        ? "border-brand bg-brand text-white"
                        : "border-zinc-200 bg-white hover:border-zinc-400"
                    }`}
                  >
                    <p
                      className={`whitespace-pre-wrap text-sm ${
                        selectedParagraph === i ? "text-white" : "text-zinc-900"
                      }`}
                    >
                      {p}
                    </p>
                    <p
                      className={`mt-1 text-[10px] ${
                        selectedParagraph === i ? "text-zinc-400" : "text-zinc-400"
                      }`}
                    >
                      {p.replace(/\*\*/g, "").length} car. · 25-60 mots recommandés
                    </p>
                  </button>
                ))
              ) : (
                /* Mode gabarits autres : afficher les titres + surtitres */
                <>
                  {titles.map((t, i) => {
                    const len = t.length;
                    const outOfRange = len < MIN_LEN || len > MAX_LEN;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setSelectedIndex(i)}
                        className={`w-full rounded-xl border-2 p-3 text-left transition-all ${
                          selectedIndex === i
                            ? "border-brand bg-brand text-white"
                            : "border-zinc-200 bg-white hover:border-zinc-400"
                        }`}
                      >
                        <textarea
                          value={t}
                          onChange={(e) => {
                            e.stopPropagation();
                            updateTitle(i, e.target.value);
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedIndex(i);
                          }}
                          rows={2}
                          className={`w-full resize-none bg-transparent text-sm outline-none ${
                            selectedIndex === i ? "text-white" : "text-zinc-900"
                          }`}
                        />
                        <p
                          className={`mt-1 text-[10px] ${
                            outOfRange
                              ? "text-red-400"
                              : selectedIndex === i
                                ? "text-zinc-400"
                                : "text-zinc-400"
                          }`}
                        >
                          {len} car.{" "}
                          {outOfRange && `(recommandé ${MIN_LEN}–${MAX_LEN})`}
                        </p>
                      </button>
                    );
                  })}

                  {/* Surtitres générés */}
                  {surtitres.some((s) => s.length > 0) && (
                    <div className="flex flex-col gap-2">
                      <h2 className="text-sm font-semibold text-zinc-800">
                        Surtitre
                        <span className="ml-1 text-[10px] font-normal text-zinc-400">
                          (optionnel)
                        </span>
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        {surtitres.map((s, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedSurtitre(selectedSurtitre === s ? null : s)}
                            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                              selectedSurtitre === s
                                ? "border-brand bg-brand text-white"
                                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {noteAuto && (
            <div className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
              <SlidersHorizontal className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p>{noteAuto}</p>
            </div>
          )}

          {/* ── Contrôle qualité du couple fond / gabarit ── */}
          {verdict && verdict.gabarit === selectedGabarit && (
            <div
              className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm ${
                verdict.ok
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-amber-200 bg-amber-50 text-amber-900"
              }`}
            >
              {verdict.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              )}
              <div className="flex flex-col gap-2">
                <p>{verdict.message}</p>
                {verdict.suggestion && verdict.suggestion !== selectedGabarit && (
                  <button
                    type="button"
                    onClick={() => { setGabaritAuto(false); setReglages({}); setSelectedGabarit(verdict.suggestion!); }}
                    className="self-start rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-100"
                  >
                    Basculer sur {verdict.suggestion.toUpperCase()}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Sortie : export inline ── */}
          {selectedTitle && !exportJob && (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={handleExport}
                disabled={exporting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-hover active:bg-brand-pressed disabled:opacity-60"
              >
                {exporting ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="size-4" aria-hidden />
                )}
                {exporting ? "Export en cours…" : "Exporter ce post"}
              </button>
              <Link
                href={`/gabarits/${selectedGabarit}?${new URLSearchParams(buildPreviewValues()).toString()}`}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-6 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                <SlidersHorizontal className="size-4" aria-hidden />
                Ajuster le détail
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
              <p className="text-center text-xs text-zinc-400">
                L&apos;aperçu ci-contre est le rendu final. L&apos;ajustement est optionnel.
              </p>
            </div>
          )}

          {/* ── Export inline : statut + lien Drive ── */}
          {exportJob && (
            <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex items-center gap-2">
                {exportJob.status !== "done" && exportJob.status !== "error" && (
                  <Loader2 className="size-4 animate-spin text-zinc-400" aria-hidden />
                )}
                {exportJob.status === "done" && (
                  <CheckCircle2 className="size-4 text-brand" aria-hidden />
                )}
                {exportJob.status === "error" && (
                  <AlertTriangle className="size-4 text-red-500" aria-hidden />
                )}
                <span className="text-sm font-medium text-zinc-700">
                  {exportJob.status === "pending" && "Préparation…"}
                  {exportJob.status === "rendering" && "Rendu Playwright…"}
                  {exportJob.status === "uploading" && "Upload vers Drive…"}
                  {exportJob.status === "done" && "Terminé !"}
                  {exportJob.status === "error" && "Erreur d'export"}
                </span>
              </div>
              {exportJob.status === "done" && (
                <div className="flex flex-col gap-2">
                  {exportJob.driveUrl && (
                    <a
                      href={exportJob.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg bg-brand px-4 py-2 text-center text-sm font-medium text-white transition-colors hover:bg-brand-hover"
                    >
                      Ouvrir dans Google Drive
                    </a>
                  )}
                  {exportJob.hasDownload && (
                    <a
                      href={`/api/export/${exportJob.jobId}/download`}
                      className="rounded-lg border border-zinc-200 px-4 py-2 text-center text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                    >
                      Télécharger le PNG
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => setExportJob(null)}
                    className="text-xs text-zinc-400 hover:text-zinc-600"
                  >
                    Créer un autre post
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Panneau droit : aperçu ── */}
        <section className="flex flex-1 flex-col items-start gap-4">
          <p className="text-sm font-medium text-zinc-600">Aperçu</p>
          {PreviewComponent ? (
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
                <PreviewComponent {...previewValues} />
              </div>
              {/* Manipulation directe : le calque d'interaction est posé
                  par-dessus l'aperçu, à l'échelle réelle de l'affichage.
                  Rien n'est visible tant qu'on ne survole pas — le montage
                  reste jugé pour lui-même. */}
              {ciblesBulles.length > 0 && (
                <MontageDirect
                  echelle={previewScale}
                  cibles={ciblesBulles}
                  valeurs={previewValues}
                  onChange={(maj) => setReglages((p) => ({ ...p, ...maj }))}
                  photos={images.slice(1).map((i) => ({ bulleUrl: i.bulleUrl, sujetBulleUrl: i.bulleSujetUrl }))}
                />
              )}
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed border-zinc-300 text-sm text-zinc-400">
              Sélectionnez un gabarit
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
