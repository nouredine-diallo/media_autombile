"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Gabarit1A, {
  GABARIT_1A_HEIGHT,
  GABARIT_1A_WIDTH,
} from "@/components/gabarits/Gabarit1A";

const DEFAULT_IMAGE = "/test/placeholder-photo.jpg";
const PREVIEW_SCALE = 0.4;

export default function Gabarit1APreviewPage() {
  return (
    <Suspense>
      <Gabarit1APreviewContent />
    </Suspense>
  );
}

function Gabarit1APreviewContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [title, setTitle] = useState(
    searchParams.get("title") ??
      "Hiroshi Okuda, l'ancien président de Toyota et pionnier de la Prius, est décédé à l'âge de 93 ans",
  );
  const [imageUrl, setImageUrl] = useState(
    searchParams.get("imageUrl") ?? DEFAULT_IMAGE,
  );
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleExport() {
    setStatus("loading");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gabaritId: "1a",
          fieldValues: { title, imageUrl },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Échec inconnu" }));
        throw new Error(data.error ?? `Erreur ${res.status}`);
      }
      const { jobId } = await res.json();
      router.push(`/export/${jobId}`);
    } catch (err) {
      setStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">
          Gabarit 1A — image + titre (Étape 1)
        </h1>
        <p className="text-sm text-zinc-500">
          Aperçu navigateur à gauche, export Playwright à droite. Les deux
          doivent être visuellement identiques — c&apos;est le critère de fin
          de l&apos;Étape 1.
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-8 p-6 lg:flex-row">
        <section className="flex w-full max-w-md flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              URL de l&apos;image
            </label>
            <input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Titre
            </label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={handleExport}
            disabled={status === "loading"}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {status === "loading" ? "Rendu en cours…" : "Générer le PNG"}
          </button>
          {errorMessage && (
            <p className="text-sm text-red-600">{errorMessage}</p>
          )}
        </section>

        <section className="flex flex-1 flex-wrap items-start gap-8">
          <div>
            <p className="mb-2 text-sm font-medium text-zinc-600">
              Aperçu navigateur (React, direct)
            </p>
            <div
              style={{
                width: GABARIT_1A_WIDTH * PREVIEW_SCALE,
                height: GABARIT_1A_HEIGHT * PREVIEW_SCALE,
              }}
              className="overflow-hidden rounded-md border border-zinc-300 shadow-sm"
            >
              <div
                style={{
                  width: GABARIT_1A_WIDTH,
                  height: GABARIT_1A_HEIGHT,
                  transform: `scale(${PREVIEW_SCALE})`,
                  transformOrigin: "top left",
                }}
              >
                <Gabarit1A imageUrl={imageUrl} title={title} />
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
