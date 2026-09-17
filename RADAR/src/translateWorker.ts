/**
 * Worker thread dédié à la traduction locale à la demande — voir
 * `src/lib/translateIsolated.ts` pour le pourquoi (isoler l'inférence ONNX
 * bloquante du thread JS qui sert le HTTP du process "radar").
 *
 * Script autonome, PAS une route Next.js — compilé séparément en CommonJS
 * via `tsconfig.worker.json` (même mécanisme que `pipeline-worker.ts`) puis
 * chargé par `new Worker()` au runtime, jamais par le bundler Next/Turbopack.
 * N'importe que `translateLocal.ts`, déjà indépendant de Next.js (aucun
 * `next/server`, `next/headers`, `server-only`).
 */
import { parentPort } from 'node:worker_threads';
import { translateTextLocal } from './lib/translateLocal';

if (!parentPort) {
  throw new Error('translateWorker.ts doit être lancé comme worker_thread, pas exécuté directement.');
}

const port = parentPort;

port.on('message', (msg: { id: number; text: string }) => {
  translateTextLocal(msg.text)
    .then((result) => port.postMessage({ id: msg.id, result }))
    .catch(() => port.postMessage({ id: msg.id, result: null }));
});
