"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Mascot } from "./Mascot";
import "./assistant.css";

const AssistantWidget = dynamic(
  () => import("./AssistantWidget").then((m) => m.AssistantWidget),
  { ssr: false },
);

const HIDDEN_PATHS = new Set(["/login", "/select-name", "/login/"]);

export function AssistantLauncher() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  if (HIDDEN_PATHS.has(pathname)) return null;

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
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Fermer l'assistante" : "Ouvrir l'assistante"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Mascot state={open ? "happy" : "idle"} interactive />
      </button>
    </>
  );
}