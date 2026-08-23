"use client";

import { useCallback, useRef, useState } from "react";
import { Crop, Move, Repeat2, RotateCcw, Sparkles } from "lucide-react";
import { GABARIT_HEIGHT, GABARIT_WIDTH } from "@/components/gabarits/registry";
import { lireCadre, lireGeometrie, type BulleGeometry } from "@/components/gabarits/Bulle";

/**
 * Manipulation directe sur l'aperçu — on agit sur le montage lui-même, pas
 * dans un panneau de réglages à côté.
 *
 * Périmètre volontairement fermé à **quatre corrections**, celles des défauts
 * réellement rencontrés pendant la mise au point (voir CLAUDE.md) :
 *   1. déplacer une bulle (glisser) — quand elle tombe mal sur le sujet ;
 *   2. la redimensionner (glisser la poignée) ;
 *   3. activer/couper son effet de débordement ;
 *   4. échanger la photo d'une bulle avec une autre du lot.
 * Rien d'autre. Ce n'est pas un éditeur généraliste : chaque geste corrige un
 * défaut précis, et tout est annulable d'un bouton.
 *
 * Toutes les valeurs produites repartent dans les **mêmes champs** que le
 * rendu final (`bulleXGeom`, `bulleXSujetUrl`, `bulleXUrl`) : ce que
 * l'opérateur voit ici est exactement ce qui sortira (CLAUDE.md §1).
 */

export interface BulleCible {
  /** Champ de géométrie, ex. `bulle1Geom`. */
  cleGeom: string;
  /** Champ d'image, ex. `bulle1Url`. */
  cleImage: string;
  /** Champ de débordement, ex. `bulle1SujetUrl`. */
  cleDebordement: string;
  /** Champ de cadrage du contenu, ex. `bulle1Cadre`. */
  cleCadre: string;
  /** Géométrie de référence, si l'opérateur n'a rien déplacé. */
  defaut: BulleGeometry;
  /** Découpe disponible pour cette bulle (vide = effet indisponible). */
  debordementDispo: string;
  libelle: string;
}

interface Props {
  echelle: number;
  cibles: BulleCible[];
  valeurs: Record<string, string>;
  onChange: (maj: Record<string, string>) => void;
  /** Photos du lot, pour l'échange d'image d'une bulle. */
  photos: { bulleUrl: string; sujetBulleUrl?: string }[];
}

type Geste =
  | { cible: BulleCible; mode: "deplacer" | "redimensionner"; x0: number; y0: number; g0: BulleGeometry }
  | { cible: BulleCible; mode: "cadrer"; x0: number; y0: number; c0: { zoom: number; dx: number; dy: number } };

export function MontageDirect({ echelle, cibles, valeurs, onChange, photos }: Props) {
  const zone = useRef<HTMLDivElement>(null);
  const [survol, setSurvol] = useState<string | null>(null);
  const [geste, setGeste] = useState<Geste | null>(null);
  /**
   * Deux façons de glisser, une seule à la fois : déplacer la bulle dans le
   * montage, ou recadrer la photo à l'intérieur. Un basculeur plutôt qu'une
   * touche modificatrice — rien à deviner.
   */
  const [modeCadrage, setModeCadrage] = useState(false);

  const geomDe = useCallback(
    (c: BulleCible) => lireGeometrie(valeurs[c.cleGeom], c.defaut),
    [valeurs],
  );

  /* ── Glisser : déplacement et redimensionnement ── */
  function demarrer(e: React.PointerEvent, cible: BulleCible, mode: "deplacer" | "redimensionner" | "cadrer") {
    e.preventDefault();
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    if (mode === "cadrer") {
      setGeste({ cible, mode, x0: e.clientX, y0: e.clientY, c0: lireCadre(valeurs[cible.cleCadre]) });
      return;
    }
    setGeste({ cible, mode, x0: e.clientX, y0: e.clientY, g0: geomDe(cible) });
  }

  /** Molette sur une bulle : zoom du contenu. C'est ce zoom qui rend le
   *  débordement lisible quand le sujet est trop petit dans son cercle. */
  function molette(e: React.WheelEvent, cible: BulleCible) {
    e.preventDefault();
    const c = lireCadre(valeurs[cible.cleCadre]);
    const zoom = Math.min(2.2, Math.max(0.6, c.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
    onChange({ [cible.cleCadre]: `${zoom.toFixed(3)},${c.dx.toFixed(2)},${c.dy.toFixed(2)}` });
  }

  function bouger(e: React.PointerEvent) {
    if (!geste) return;
    if (geste.mode === "cadrer") {
      // Décalage exprimé en % du DIAMÈTRE de la bulle : le geste garde la même
      // amplitude perçue quelle que soit la taille du cercle.
      const g = geomDe(geste.cible);
      const d = (g.sizePercent / 100) * GABARIT_WIDTH * echelle;
      const dxp = ((e.clientX - geste.x0) / d) * 100;
      const dyp = ((e.clientY - geste.y0) / d) * 100;
      const c = geste.c0;
      onChange({
        [geste.cible.cleCadre]: `${c.zoom.toFixed(3)},${Math.min(60, Math.max(-60, c.dx + dxp)).toFixed(2)},${Math.min(60, Math.max(-60, c.dy + dyp)).toFixed(2)}`,
      });
      return;
    }
    const dx = ((e.clientX - geste.x0) / echelle / GABARIT_WIDTH) * 100;
    const dy = ((e.clientY - geste.y0) / echelle / GABARIT_HEIGHT) * 100;
    const g = geste.g0;
    const suivant: BulleGeometry =
      geste.mode === "deplacer"
        ? {
            // Bornes larges : la bulle peut mordre le bord, comme sur les
            // références, mais ne peut pas sortir complètement du cadre.
            leftPercent: Math.min(115, Math.max(-15, g.leftPercent + dx)),
            topPercent: Math.min(90, Math.max(-10, g.topPercent + dy)),
            sizePercent: g.sizePercent,
          }
        : {
            ...g,
            // Le diamètre suit la diagonale tirée ; plancher et plafond calés
            // sur l'amplitude observée dans `inspi/` (38 % à 52 %), élargis.
            sizePercent: Math.min(70, Math.max(20, g.sizePercent + (dx + dy))),
          };
    onChange({ [geste.cible.cleGeom]: `${suivant.leftPercent.toFixed(2)},${suivant.topPercent.toFixed(2)},${suivant.sizePercent.toFixed(2)}` });
  }

  const arreter = () => setGeste(null);

  /* ── Actions ponctuelles ── */
  function basculerDebordement(c: BulleCible) {
    onChange({ [c.cleDebordement]: valeurs[c.cleDebordement] ? "" : c.debordementDispo });
  }

  function photoSuivante(c: BulleCible) {
    if (photos.length < 2) return;
    const actuelle = valeurs[c.cleImage];
    const i = photos.findIndex((p) => p.bulleUrl === actuelle);
    const suivante = photos[(i + 1) % photos.length];
    const maj: Record<string, string> = { [c.cleImage]: suivante.bulleUrl };
    // Le débordement appartient à la photo : le suivre, sinon on afficherait
    // la découpe d'une image sur une autre.
    if (valeurs[c.cleDebordement]) maj[c.cleDebordement] = suivante.sujetBulleUrl ?? "";
    onChange(maj);
  }

  const modifie = cibles.some((c) => valeurs[c.cleGeom] || valeurs[c.cleCadre]);

  return (
    <div
      ref={zone}
      className="absolute inset-0"
      onPointerMove={bouger}
      onPointerUp={arreter}
      onPointerLeave={arreter}
    >
      {cibles.map((c) => {
        const g = geomDe(c);
        const d = (g.sizePercent / 100) * GABARIT_WIDTH * echelle;
        const cx = (g.leftPercent / 100) * GABARIT_WIDTH * echelle;
        const cy = (g.topPercent / 100) * GABARIT_HEIGHT * echelle;
        const actif = survol === c.cleGeom || geste?.cible.cleGeom === c.cleGeom;

        return (
          <div key={c.cleGeom}>
            {/* Zone sensible : le cercle lui-même. Aucun cadre permanent —
                l'habillage n'apparaît qu'au survol, le montage reste lisible. */}
            <div
              onPointerEnter={() => setSurvol(c.cleGeom)}
              onPointerLeave={() => !geste && setSurvol(null)}
              onPointerDown={(e) => demarrer(e, c, modeCadrage ? "cadrer" : "deplacer")}
              onWheel={(e) => molette(e, c)}
              className={`absolute rounded-full transition-[box-shadow,background-color] duration-150 ${
                actif
                  ? `bg-white/5 ring-2 ${modeCadrage ? "cursor-move ring-amber-400/90" : "cursor-grabbing ring-sky-400/90"}`
                  : "cursor-grab"
              }`}
              style={{ width: d, height: d, left: cx - d / 2, top: cy - d / 2 }}
              title={`${c.libelle} — ${modeCadrage ? "glisser pour recadrer la photo" : "glisser pour déplacer la bulle"} · molette pour zoomer`}
            />

            {actif && (
              <>
                {/* Poignée de taille, en bas à droite du cercle */}
                <div
                  onPointerDown={(e) => demarrer(e, c, "redimensionner")}
                  className="absolute size-4 cursor-nwse-resize rounded-full border-2 border-white bg-sky-500 shadow"
                  style={{ left: cx + d * 0.354 - 8, top: cy + d * 0.354 - 8 }}
                  title="Glisser pour agrandir ou réduire"
                />

                {/* Barre d'actions, ancrée sous le cercle */}
                <div
                  className="absolute flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-zinc-200/80 bg-white/90 p-0.5 shadow-lg backdrop-blur-md"
                  style={{ left: cx, top: cy + d / 2 + 10 }}
                  onPointerDown={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setModeCadrage((v) => !v)}
                    className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                      modeCadrage ? "bg-amber-500 text-white" : "text-zinc-600 hover:bg-zinc-100"
                    }`}
                    title="Glisser recadre la photo dans la bulle au lieu de déplacer la bulle"
                  >
                    {modeCadrage ? <Crop className="size-3.5" aria-hidden /> : <Move className="size-3.5" aria-hidden />}
                    {modeCadrage ? "Cadrer" : "Déplacer"}
                  </button>
                  {c.debordementDispo && (
                    <button
                      type="button"
                      onClick={() => basculerDebordement(c)}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        valeurs[c.cleDebordement]
                          ? "bg-sky-600 text-white"
                          : "text-zinc-600 hover:bg-zinc-100"
                      }`}
                      title="Laisser le sujet dépasser du cercle"
                    >
                      <Sparkles className="size-3.5" aria-hidden />
                      Débordement
                    </button>
                  )}
                  {photos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => photoSuivante(c)}
                      className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100"
                      title="Mettre une autre photo du lot dans cette bulle"
                    >
                      <Repeat2 className="size-3.5" aria-hidden />
                      Photo
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })}

      {modifie && (
        <button
          type="button"
          onClick={() =>
            onChange(Object.fromEntries(cibles.flatMap((c) => [[c.cleGeom, ""], [c.cleCadre, ""]])))
          }
          className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-full border border-zinc-200/80 bg-white/90 px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-lg backdrop-blur-md transition-colors hover:bg-white"
        >
          <RotateCcw className="size-3.5" aria-hidden />
          Replacer comme la référence
        </button>
      )}

      {cibles.length === 2 && (
        <div 
          className="absolute top-3 left-3 flex flex-col gap-1 rounded-xl border border-zinc-200/80 bg-white/90 p-2 shadow-lg backdrop-blur-md"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <label className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider px-1">Ratio Tailles</label>
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs text-zinc-600 font-medium whitespace-nowrap">{(Number.parseFloat(valeurs.bulleRatio ?? "0.5") * 100).toFixed(0)}%</span>
            <input 
              type="range" 
              min="0.3" 
              max="0.7" 
              step="0.05"
              value={valeurs.bulleRatio ?? "0.5"} 
              onChange={(e) => {
                onChange({ bulleRatio: e.target.value });
              }}
              className="w-24 accent-sky-500"
              title="Répartir la taille entre la bulle gauche et la bulle droite"
            />
            <span className="text-xs text-zinc-600 font-medium whitespace-nowrap">{((1 - Number.parseFloat(valeurs.bulleRatio ?? "0.5")) * 100).toFixed(0)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
