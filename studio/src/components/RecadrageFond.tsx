"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Move, RotateCcw } from "lucide-react";
import { lireCadre } from "./gabarits/Bulle";

/**
 * Recadrage manuel de l'image de fond (gabarits 1A/1B/1C) — demande directe
 * de l'utilisateur (2026-09-14) : le moteur de rendu acceptait déjà un
 * cadrage manuel (`imageCadre`, lu par `lireCadre`/`Gabarit1A.tsx`), mais
 * aucune interface ne permettait de le renseigner nulle part dans l'appli
 * (trouvé en audit le même jour) — seul recours réel jusqu'ici : remplacer
 * la photo en entier.
 *
 * Volontairement distinct de `MontageDirect` (qui gère les bulles) : une
 * bulle a une géométrie de cercle qu'on déplace/redimensionne, l'image de
 * fond remplit toujours tout le cadre — seul son contenu interne (zoom,
 * position) bouge. Réutilise le même mécanisme d'interaction (molette,
 * pincement à deux doigts, glisser) et les mêmes bornes de zoom [0.6, 2.2]
 * que les bulles pour rester cohérent visuellement, sans forcer l'image de
 * fond dans un système pensé pour des cercles.
 *
 * Écrit dans le même champ (`imageCadre`) que lit le rendu final
 * (`Gabarit1A.tsx`, `transformFond`) — ce que l'opérateur voit ici est
 * exactement ce qui sortira à l'export (STUDIO/CLAUDE.md §1).
 */

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.2;
const PAN_BOUND = 60; // même borne que lireCadre() — écrire au-delà serait ignoré à la lecture

interface Props {
  /** Échelle d'affichage de l'aperçu (ex. previewScale). */
  echelle: number;
  /** Largeur de la zone image, en pixels du canevas réel (non mis à l'échelle). */
  largeur: number;
  /** Hauteur de la zone image, en pixels du canevas réel (non mis à l'échelle). */
  hauteur: number;
  valeur: string | undefined;
  onChange: (nouvelleValeur: string) => void;
}

type Cadre = { zoom: number; dx: number; dy: number };

function ecrire(c: Cadre): string {
  return `${c.zoom.toFixed(3)},${c.dx.toFixed(2)},${c.dy.toFixed(2)}`;
}

export function RecadrageFond({ echelle, largeur, hauteur, valeur, onChange }: Props) {
  const zone = useRef<HTMLDivElement>(null);
  const [survol, setSurvol] = useState(false);
  const [geste, setGeste] = useState<{ x0: number; y0: number; c0: Cadre } | null>(null);
  /** Pointeurs tactiles actifs — sert uniquement à détecter un pincement à 2 doigts. */
  const pointeursActifs = useRef<Map<number, { x: number; y: number }>>(new Map());
  const [pincement, setPincement] = useState<{ distance0: number; c0: Cadre } | null>(null);

  const cadre = lireCadre(valeur);

  const demarrer = useCallback(
    (e: React.PointerEvent) => {
      // Peut lever si aucun pointeur système actif avec cet id (bug connu de
      // PointerEvent synthétique, déjà rencontré et traité en dur sur les
      // bulles — finding B6, audit 2026-09-07). Défensif, jamais bloquant.
      try {
        zone.current?.setPointerCapture(e.pointerId);
      } catch {
        /* ignoré volontairement */
      }
      pointeursActifs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointeursActifs.current.size === 2) {
        const pts = [...pointeursActifs.current.values()];
        setPincement({ distance0: Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y), c0: cadre });
        setGeste(null);
        return;
      }
      setGeste({ x0: e.clientX, y0: e.clientY, c0: cadre });
    },
    [cadre],
  );

  const bouger = useCallback(
    (e: React.PointerEvent) => {
      if (pointeursActifs.current.has(e.pointerId)) {
        pointeursActifs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (pincement && pointeursActifs.current.size >= 2) {
        const pts = [...pointeursActifs.current.values()];
        const distance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
        const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, pincement.c0.zoom * (distance / pincement.distance0)));
        onChange(ecrire({ ...pincement.c0, zoom }));
        return;
      }

      if (!geste) return;
      // Décalage exprimé en % de la zone (largeur/hauteur), pas du canevas
      // entier — le geste garde la même amplitude perçue quelle que soit la
      // hauteur réelle de la zone photo (adaptative, 62-74% selon le visuel).
      const dx = geste.c0.dx + ((e.clientX - geste.x0) / echelle / largeur) * 100;
      const dy = geste.c0.dy + ((e.clientY - geste.y0) / echelle / hauteur) * 100;
      onChange(
        ecrire({
          zoom: geste.c0.zoom,
          dx: Math.min(PAN_BOUND, Math.max(-PAN_BOUND, dx)),
          dy: Math.min(PAN_BOUND, Math.max(-PAN_BOUND, dy)),
        }),
      );
    },
    [geste, pincement, echelle, largeur, hauteur, onChange],
  );

  const terminer = useCallback((e: React.PointerEvent) => {
    pointeursActifs.current.delete(e.pointerId);
    if (pointeursActifs.current.size < 2) setPincement(null);
    setGeste(null);
  }, []);

  /**
   * Attaché en natif (`addEventListener` + `{ passive: false }`), pas via
   * `onWheel` React : le `onWheel` synthétique ne déclenchait jamais le
   * handler dans ce contexte (bulle root non-passive absente/en conflit sur
   * cette page) — vérifié en dispatchant un `WheelEvent` natif directement
   * sur le nœud cible, `defaultPrevented` restait `false` sans qu'aucun code
   * du handler ne s'exécute. `addEventListener` natif est de toute façon la
   * seule façon fiable d'annuler le scroll de page pendant un zoom (React 18
   * enregistre son propre listener racine en passif).
   */
  useEffect(() => {
    const el = zone.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const c = lireCadre(valeur);
      const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, c.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
      onChange(ecrire({ ...c, zoom }));
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [valeur, onChange]);

  const modifie = cadre.zoom !== 1 || cadre.dx !== 0 || cadre.dy !== 0;
  const actif = survol || !!geste || !!pincement;

  return (
    <div
      ref={zone}
      onPointerEnter={() => setSurvol(true)}
      onPointerLeave={() => !geste && setSurvol(false)}
      onPointerDown={demarrer}
      onPointerMove={bouger}
      onPointerUp={terminer}
      onPointerCancel={terminer}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: largeur * echelle,
        height: hauteur * echelle,
        touchAction: "none",
        cursor: geste ? "grabbing" : "grab",
      }}
      title="Glisser pour déplacer, molette ou pincement pour zoomer"
    >
      <div
        className={`pointer-events-none absolute inset-0 ring-2 ring-inset transition-opacity duration-150 ${
          actif ? "opacity-100 ring-sky-400/80" : "opacity-0 ring-transparent"
        }`}
      />
      <div
        className={`pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-black/70 px-3 py-1.5 text-[11px] font-medium text-white transition-opacity duration-150 ${
          actif ? "opacity-100" : "opacity-0"
        }`}
      >
        <Move className="size-3" aria-hidden /> Glisser pour déplacer · molette/pincement pour zoomer
      </div>
      {modifie && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onChange("");
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className={`pointer-events-auto absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1.5 text-[11px] font-medium text-white transition-opacity duration-150 hover:bg-black/85 ${
            actif ? "opacity-100" : "opacity-0"
          }`}
        >
          <RotateCcw className="size-3" aria-hidden /> Réinitialiser
        </button>
      )}
    </div>
  );
}
