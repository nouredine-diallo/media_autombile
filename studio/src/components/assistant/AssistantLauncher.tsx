"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Mascot } from "./Mascot";
import "./assistant.css";

const AssistantWidget = dynamic(
  () => import("./AssistantWidget").then((m) => m.AssistantWidget),
  { ssr: false },
);

const HIDDEN_PATHS = new Set(["/login", "/select-name", "/login/"]);

// Trouvé le 15 sept. 2026 (retour utilisateur, usage mobile) : le bouton
// était fixé en dur en bas à droite (assistant.css), sans aucune règle
// mobile — sur un petit écran, il peut recouvrir un bouton d'action selon
// la page, sans moyen de le déplacer. Reprend l'idée déjà proposée pour ce
// problème (bouton flottant repositionnable) plutôt qu'une position fixe
// alternative, qui aurait juste déplacé le risque de collision ailleurs
// sans le résoudre pour toutes les pages. Glisser-déposer minimal, sans
// dépendance : Pointer Events natifs, position mémorisée par appareil
// (localStorage), un simple tap garde son comportement (ouvrir/fermer) —
// distingué d'un glissement par un seuil de 6px de déplacement.
const LAUNCHER_SIZE = 68;
const STORAGE_KEY = "lma-launcher-pos";
const DRAG_THRESHOLD = 6;

function clampPosition(x: number, y: number) {
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - LAUNCHER_SIZE - margin);
  const maxY = Math.max(margin, window.innerHeight - LAUNCHER_SIZE - margin);
  return { x: Math.min(Math.max(x, margin), maxX), y: Math.min(Math.max(y, margin), maxY) };
}

function useDraggableLauncher() {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const latestPosRef = useRef<{ x: number; y: number } | null>(null);
  const startRef = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { x: number; y: number };
        if (typeof saved.x === "number" && typeof saved.y === "number") {
          setPos(clampPosition(saved.x, saved.y));
        }
      }
    } catch {
      // localStorage indisponible (navigation privée, etc.) — reste en position par défaut.
    }

    const onResize = () => setPos((p) => (p ? clampPosition(p.x, p.y) : p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    draggingRef.current = true;
    movedRef.current = false;
    startRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (!draggingRef.current) return;
    const dx = e.clientX - startRef.current.pointerX;
    const dy = e.clientY - startRef.current.pointerY;
    if (!movedRef.current && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    movedRef.current = true;
    const next = clampPosition(e.clientX - startRef.current.offsetX, e.clientY - startRef.current.offsetY);
    latestPosRef.current = next;
    setPos(next);
  }

  function endDrag() {
    draggingRef.current = false;
    if (movedRef.current && latestPosRef.current) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(latestPosRef.current));
      } catch {
        // Pas grave : la position tient pour cette session, juste pas mémorisée.
      }
    }
  }

  return {
    style: pos ? ({ left: pos.x, top: pos.y, right: "auto", bottom: "auto" } as const) : undefined,
    wasDragged: () => movedRef.current,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}

export function AssistantLauncher() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const drag = useDraggableLauncher();

  // `/render/*` : pages dédiées à la capture Playwright de l'export (1080 ×
  // 1350, le composant gabarit doit remplir tout le viewport) — trouvé le
  // 16 sept. 2026 (retour utilisateur, export réel sur mobile) : le bouton
  // fixe (bottom:22px, right:22px) tombe dans ce même viewport et se
  // retrouve donc DANS le PNG exporté, sur le logo. Vérifié : `element
  // .screenshot()` capture tout ce qui est visuellement à cet endroit, pas
  // seulement le sous-arbre DOM du gabarit — masquer l'élément est la seule
  // correction possible côté page de capture (le composant lui-même ne peut
  // pas "voir" ce qui est monté à la racine du layout).
  if (HIDDEN_PATHS.has(pathname) || pathname.startsWith("/render/")) return null;

  return (
    <>
      {open && (
        <AssistantWidget
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
      <button
        className="lma-launcher"
        style={drag.style}
        onClick={() => {
          // Un glissement ne doit jamais aussi ouvrir/fermer le widget.
          if (drag.wasDragged()) return;
          setOpen((o) => !o);
        }}
        aria-label={open ? "Fermer l'assistante" : "Ouvrir l'assistante (glisser pour déplacer)"}
        aria-expanded={open}
        aria-haspopup="dialog"
        {...drag.handlers}
      >
        <Mascot state={open ? "happy" : "idle"} interactive />
      </button>
    </>
  );
}
