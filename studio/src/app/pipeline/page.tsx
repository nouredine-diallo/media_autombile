"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface UploadResult {
  id: string;
  originalUrl: string;
  croppedUrl: string;
}

export default function PipelinePage() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [upscaledUrl, setUpscaledUrl] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "loading" | "error">("idle");
  const [upscaleStatus, setUpscaleStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleUpload() {
    const file = fileInput.current?.files?.[0];
    if (!file) return;

    setUploadStatus("loading");
    setErrorMessage(null);
    setResult(null);
    setUpscaledUrl(null);

    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/images/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setResult(data);
      setUploadStatus("idle");
    } catch (err) {
      setUploadStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  async function handleUpscale() {
    if (!result) return;
    setUpscaleStatus("loading");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/images/${result.id}/upscale`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Erreur ${res.status}`);
      setUpscaledUrl(data.upscaledUrl);
      setUpscaleStatus("idle");
    } catch (err) {
      setUpscaleStatus("error");
      setErrorMessage(err instanceof Error ? err.message : "Erreur inconnue");
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <h1 className="text-lg font-semibold text-zinc-900">
          Pipeline image (Étape 2)
        </h1>
        <p className="text-sm text-zinc-500">
          Upload <ArrowRight className="inline size-4 align-[-2px]" aria-hidden /> recadrage automatique (4:5) <ArrowRight className="inline size-4 align-[-2px]" aria-hidden /> amélioration HD à la
          demande. Le détourage n&apos;est pas encore branché (bloqué par une
          licence AGPLv3 — voir CLAUDE.md).
        </p>
      </header>

      <main className="flex flex-1 flex-col gap-6 p-6">
        <div className="flex items-center gap-3">
          <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" />
          <button
            onClick={handleUpload}
            disabled={uploadStatus === "loading"}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {uploadStatus === "loading" ? "Import…" : "Importer"}
          </button>
        </div>

        {errorMessage && <p className="text-sm text-red-600">{errorMessage}</p>}

        {result && (
          <div className="flex flex-wrap items-start gap-8">
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-600">Original</p>
              {/* eslint-disable-next-line @next/next/no-img-element -- prévisualisation brute */}
              <img src={result.originalUrl} alt="Original" className="max-h-80 rounded-md border border-zinc-300" />
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-zinc-600">
                Recadrée (4:5, {`centrée`})
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element -- prévisualisation brute */}
              <img src={result.croppedUrl} alt="Recadrée" className="max-h-80 rounded-md border border-zinc-300" />
              <Link
                href={`/gabarits/1a?imageUrl=${encodeURIComponent(result.croppedUrl)}`}
                className="mt-2 block text-sm font-medium text-zinc-700 underline"
              >
                Utiliser dans le gabarit 1A <ArrowRight className="inline size-4 align-[-2px]" aria-hidden />
              </Link>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-zinc-600">
                Amélioration HD
              </p>
              <button
                onClick={handleUpscale}
                disabled={upscaleStatus === "loading"}
                className="mb-2 rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 disabled:opacity-50"
              >
                {upscaleStatus === "loading" ? "Amélioration…" : "Améliorer la qualité"}
              </button>
              {upscaledUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- prévisualisation brute
                <img src={upscaledUrl} alt="Améliorée" className="max-h-80 rounded-md border border-zinc-300" />
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
