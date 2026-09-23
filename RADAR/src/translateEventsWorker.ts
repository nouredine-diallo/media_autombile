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
 * Process PERSISTANT (ne s'arrête jamais de lui-même) : le modèle de
 * traduction (~300 Mo, ONNX) ne se recharge qu'une fois par démarrage de ce
 * sous-process, réutilisé pour tous les cycles pipeline suivants tant qu'il
 * reste en vie — mesuré en test réel (serveur ARM64 de prod, 23 sept. 2026) :
 * le seul chargement du modèle domine largement le temps de traduction elle-
 * même. Rechargé à chaque lot (comme la toute première version de ce fichier
 * le faisait) aurait annulé le bénéfice de l'isolation par une lenteur
 * inacceptable. `translateEventsIsolated.ts` relance un nouveau sous-process
 * seulement après un crash réel.
 *
 * Traduit par lots de 5 en parallèle — même stratégie que `translateEvents`
 * (translate.ts), pour ne pas perdre le débit qu'avait la version non
 * isolée.
 *
 * Script autonome, PAS une route Next.js — compilé séparément en CommonJS
 * via `tsconfig.worker.json` (même mécanisme que `pipeline-worker.ts`) puis
 * lancé par `child_process.fork()` au runtime. N'importe que `translate.ts`,
 * déjà indépendant de Next.js.
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

const send = process.send.bind(process);

process.on('message', async (msg: Job) => {
  for (let i = 0; i < msg.events.length; i += 5) {
    const batch = msg.events.slice(i, i + 5);
    await Promise.all(
      batch.map(async (event) => {
        try {
          const { titleFr, summaryFr } = await translateToFrench(event.title, event.summary);
          send({ type: 'result', id: event.id, titleFr, summaryFr } satisfies ResultMsg);
        } catch {
          // Une traduction individuelle ratée ne doit jamais arrêter le lot —
          // l'événement reste `title_fr IS NULL`, retenté au prochain cycle
          // (contrat déjà en place côté translateEvents/scoring.ts).
        }
      })
    );
  }
  send({ type: 'done' } satisfies ResultMsg);
  // Volontairement PAS de process.exit() ici : ce sous-process reste vivant
  // pour traiter le prochain cycle sans recharger le modèle (voir doc
  // ci-dessus). Il ne se termine que sur crash natif ou arrêt du parent.
});
