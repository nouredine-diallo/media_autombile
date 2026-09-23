/**
 * Sous-process dédié à la traduction batch des événements (pipeline cron) —
 * voir `src/lib/translateEventsIsolated.ts` pour le pourquoi.
 *
 * Différence volontaire avec `translateWorker.ts` (worker_thread, traduction
 * à la demande depuis brief.ts) : ici on isole au niveau PROCESS OS
 * (`child_process.fork`), pas thread. Un `worker_thread` partage le même
 * process que son parent — un abort() natif (`terminate called after
 * throwing an instance of 'Napi::Error'`, observé en prod le 23 sept. 2026
 * dans radar-pipeline pendant `pipeline('translation', ...)`) tue TOUT le
 * process, threads compris. Un process forké est la seule isolation qui
 * survit à ce type de crash : radar-pipeline (le parent) continue de
 * tourner même si ce sous-process meurt en plein calcul.
 *
 * Script autonome, PAS une route Next.js — compilé séparément en CommonJS
 * via `tsconfig.worker.json` (même mécanisme que `pipeline-worker.ts` et
 * `translateWorker.ts`) puis lancé par `child_process.fork()` au runtime.
 * N'importe que `translate.ts`, déjà indépendant de Next.js.
 */
import { translateToFrench } from './lib/translate';

interface Job {
  events: { id: number; title: string; summary: string | null }[];
}

type ResultMsg =
  | { type: 'result'; id: number; titleFr: string; summaryFr: string }
  | { type: 'done' };

if (!process.send) {
  throw new Error('translateEventsWorker.ts doit être lancé via child_process.fork(), pas exécuté directement.');
}

process.on('message', async (msg: Job) => {
  for (const event of msg.events) {
    try {
      const { titleFr, summaryFr } = await translateToFrench(event.title, event.summary);
      process.send!({ type: 'result', id: event.id, titleFr, summaryFr } satisfies ResultMsg);
    } catch {
      // Une traduction individuelle ratée ne doit jamais arrêter le lot —
      // l'événement reste `title_fr IS NULL`, retenté au prochain cycle
      // (contrat déjà en place côté translateEvents/scoring.ts).
    }
  }
  process.send!({ type: 'done' } satisfies ResultMsg);
  process.exit(0);
});
