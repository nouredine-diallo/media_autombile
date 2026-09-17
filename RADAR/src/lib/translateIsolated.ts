import { Worker } from 'node:worker_threads';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { translateTextLocal } from './translateLocal';

/**
 * Traduction locale isolée dans un worker_thread dédié (16 sept. 2026).
 *
 * Pourquoi : `generateBrief()` (brief.ts) appelle `translateTextLocal()`
 * pour chaque source d'un event jamais ouvert — inférence ONNX synchrone,
 * documentée dans translateLocal.ts comme pouvant dégénérer (40-60s pour un
 * seul bloc hors distribution, un titre/résumé scrapé sans structure de
 * phrase réelle). Vérifié réellement le 17 sept. 2026 (event 178259) :
 * l'utilisateur a vu le site entier devenir inaccessible ~46s puis un faux
 * timeout — parce que radar sert le HTTP et cette traduction dans le MÊME
 * thread JS, et qu'aucun timeout côté JS (`Promise.race`/`AbortSignal`) ne
 * peut interrompre un calcul natif bloquant déjà en cours (même limite que
 * celle qui a motivé la séparation du pipeline en process dédié, TODO.md
 * §3.3 — documentée ici comme "prouvée viable" pour ce cas précis dans
 * SESSION-START.md, jamais implémentée jusqu'ici).
 *
 * Un `worker_thread` tourne sur un thread OS séparé : le process web reste
 * libre de servir toute autre requête pendant la traduction, et surtout
 * `worker.terminate()` arrête RÉELLEMENT le thread bloqué (contrairement à
 * un timeout dans le même contexte d'exécution) — vérifié par test réel
 * avant mise en prod (voir le script de vérification de cette session).
 *
 * Un seul worker persistant (pas un pool) : le modèle (~300 Mo) ne se
 * charge qu'une fois par démarrage du process "radar", exactement comme le
 * faisait `getTranslator()` dans le thread principal — on déplace l'état,
 * on ne change pas la stratégie de cache. Les appels concurrents sont mis
 * en file (FIFO) plutôt qu'envoyés en parallèle au même worker : l'inférence
 * y est de toute façon déjà séquentielle en pratique (un seul thread JS
 * dans le worker aussi), aucune parallélisation n'est perdue.
 */

const WORKER_PATH = path.join(process.cwd(), 'dist-worker', 'translateWorker.js');
const HARD_TIMEOUT_MS = 20_000;

let worker: Worker | null = null;
let nextId = 0;
const pending = new Map<number, { resolve: (v: string | null) => void; timer: NodeJS.Timeout }>();
// Sérialise les envois vers le worker (voir doc ci-dessus) — un seul en vol
// à la fois, les suivants attendent leur tour.
let queue: Promise<void> = Promise.resolve();

function settlePending(id: number, result: string | null) {
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(id);
  p.resolve(result);
}

function failAllPending() {
  for (const [id, p] of pending) {
    clearTimeout(p.timer);
    p.resolve(null);
  }
  pending.clear();
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(WORKER_PATH);
  w.on('message', (msg: { id: number; result: string | null }) => settlePending(msg.id, msg.result));
  // Un worker qui plante (ex. modèle indisponible) ne doit jamais inventer
  // un résultat — les appels en attente retombent sur `null`, déjà le
  // contrat existant de `translateTextLocal` pour "pas traduit".
  w.on('error', () => {
    failAllPending();
    worker = null;
  });
  w.on('exit', () => {
    worker = null;
  });
  worker = w;
  return w;
}

function translateInWorker(text: string): Promise<string | null> {
  return new Promise((resolve) => {
    const w = getWorker();
    const id = nextId++;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(null);
      // Le seul moyen fiable d'arrêter une inférence ONNX pathologique en
      // cours (voir doc du fichier) : tuer le thread. Un nouveau worker est
      // recréé paresseusement au prochain appel.
      w.terminate();
      if (worker === w) worker = null;
    }, HARD_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    w.postMessage({ id, text });
  });
}

/**
 * Équivalent isolé de `translateTextLocal` — mêmes garanties de retour
 * (`null` si non traduit, jamais une dégradation silencieuse), mais ne
 * bloque jamais le thread JS appelant. Bornée à 20s : au-delà, le worker
 * est tué et cette traduction précise renvoie `null` (repli déjà géré par
 * tous les appelants existants), plutôt que de laisser une page attendre
 * indéfiniment ou geler le site pour tout le monde.
 *
 * Repli en traduction directe (comportement d'avant, non isolée) si le
 * worker compilé est absent — `dist-worker/` n'est produit que par
 * `deploy.sh` (voir tsconfig.worker.json) ; en développement local sans
 * cette compilation, la traduction continue de fonctionner, juste sans
 * l'isolation. Averti explicitement, jamais silencieux.
 */
export async function translateTextLocalIsolated(text: string): Promise<string | null> {
  if (!existsSync(WORKER_PATH)) {
    console.warn(
      '[TRANSLATE-ISOLATED] dist-worker/translateWorker.js absent — traduction en direct (non isolée). ' +
      'Normal en développement local sans `npx tsc -p tsconfig.worker.json` ; ne doit jamais arriver en prod (deploy.sh le compile).',
    );
    return translateTextLocal(text);
  }
  const task = queue.then(() => translateInWorker(text));
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
