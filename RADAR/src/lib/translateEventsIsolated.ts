import type { ChildProcess } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { translateEvents as translateEventsDirect } from './translate';

/**
 * Même contournement que `translateIsolated.ts` (voir son commentaire pour
 * le détail complet) : `fork(...)` est, comme `new Worker(...)`, l'un des
 * motifs que Turbopack résout et bundle statiquement au build — `dist-worker/`
 * n'existe pas encore à ce stade (`build_worker()` dans deploy.sh tourne
 * après `build_app()` pour RADAR), donc `next build` échoue sinon
 * ("Module not found"). `require()` chargé via `eval` reste opaque à
 * l'analyse statique de n'importe quel bundler — `node:child_process` est un
 * module intégré à Node, toujours présent, WORKER_PATH est résolu au
 * RUNTIME sur le filesystem du serveur.
 */
// eslint-disable-next-line no-eval
const dynamicRequire = eval('require') as NodeRequire;
const { fork } = dynamicRequire('node:child_process') as typeof import('node:child_process');

/**
 * Équivalent isolé (process séparé) de `translateEvents` (translate.ts) —
 * mêmes garanties de retour (une Map partielle si tout échoue, jamais une
 * exception qui remonte), mais un crash natif pendant la traduction ne tue
 * plus `radar-pipeline` — voir `src/translateEventsWorker.ts` pour le détail
 * du crash observé et pourquoi un worker_thread ne suffit pas ici.
 *
 * Sous-process PERSISTANT (comme `translateIsolated.ts` pour le
 * worker_thread) : un seul fork, réutilisé pour tous les cycles pipeline
 * suivants — le modèle (~300 Mo) ne se recharge qu'une fois par démarrage
 * de `radar-pipeline`, pas à chaque cycle. Un crash le remplace au prochain
 * appel seulement (coût de rechargement payé uniquement après un vrai
 * crash, pas systématiquement).
 *
 * Résultats reçus événement par événement (pas un seul message final) : si
 * le sous-process meurt en cours de lot, les traductions déjà reçues avant
 * le crash sont conservées plutôt que perdues avec tout le lot — le reste
 * retente au prochain cycle (même contrat que l'appelant, scoring.ts,
 * applique déjà pour un lot entier absent).
 *
 * Repli en traduction directe (comportement d'avant, non isolée) si le
 * worker compilé est absent — même stratégie que `translateTextLocalIsolated`
 * (translateIsolated.ts) : normal en dev local sans `npx tsc -p
 * tsconfig.worker.json`, jamais silencieux (averti explicitement), et ne
 * doit jamais arriver en prod (deploy.sh le compile et bloque sinon).
 */

const WORKER_PATH = path.join(process.cwd(), 'dist-worker', 'translateEventsWorker.js');
// Budget large : un lot de 100 événements, chunké et borné à 15s/bloc côté
// translateTextLocal (translateLocal.ts) — 10 min laisse largement la marge
// pour un lot entier sans jamais bloquer indéfiniment un cycle pipeline en
// cas de sous-process bloqué sans crasher ni terminer.
const HARD_TIMEOUT_MS = 10 * 60 * 1000;

type WorkerMsg =
  | { type: 'result'; id: number; titleFr: string; summaryFr: string }
  | { type: 'done' };

let child: ChildProcess | null = null;

function getChild(): ChildProcess {
  if (child) return child;
  const c = fork(WORKER_PATH, { silent: false });
  c.on('exit', (code, signal) => {
    if (code !== 0 && code !== null) {
      console.error(
        `[TRANSLATE-EVENTS-ISOLATED] Sous-process de traduction interrompu (code=${code}, signal=${signal}) — ` +
        `un nouveau sera relancé (et le modèle rechargé) au prochain lot.`
      );
    }
    if (child === c) child = null;
  });
  c.on('error', (err) => {
    console.error('[TRANSLATE-EVENTS-ISOLATED] Erreur du sous-process:', err.message);
    if (child === c) child = null;
  });
  child = c;
  return c;
}

function runBatch(
  events: { id: number; title: string; summary: string | null }[]
): Promise<Map<number, { titleFr: string; summaryFr: string }>> {
  return new Promise((resolve) => {
    const results = new Map<number, { titleFr: string; summaryFr: string }>();
    const c = getChild();

    const timer = setTimeout(() => {
      console.error(
        `[TRANSLATE-EVENTS-ISOLATED] Sous-process au-delà de ${HARD_TIMEOUT_MS}ms — arrêt forcé, ` +
        `${results.size}/${events.length} traductions conservées.`
      );
      c.kill('SIGKILL');
    }, HARD_TIMEOUT_MS);

    const cleanup = () => {
      clearTimeout(timer);
      c.off('message', onMessage);
      c.off('exit', onExit);
      c.off('error', onError);
    };

    const onMessage = (msg: WorkerMsg) => {
      if (msg.type === 'result') {
        results.set(msg.id, { titleFr: msg.titleFr, summaryFr: msg.summaryFr });
      } else if (msg.type === 'done') {
        cleanup();
        resolve(results);
      }
    };
    // Un crash natif (voir translateEventsWorker.ts) sort par 'exit', jamais
    // par 'done' — jamais une dégradation silencieuse (RADAR/CLAUDE.md §6) :
    // signalé explicitement (via le handler `getChild()`), mais le lot déjà
    // reçu ici est conservé plutôt que perdu.
    const onExit = () => {
      cleanup();
      resolve(results);
    };
    const onError = () => {
      cleanup();
      resolve(results);
    };

    c.on('message', onMessage);
    c.once('exit', onExit);
    c.once('error', onError);
    c.send({ events });
  });
}

// Sérialise les lots (un seul en vol à la fois vers le sous-process
// persistant) — même pattern que `translateIsolated.ts`. En pratique un
// seul appel par cycle pipeline (scoring.ts), jamais de vraie concurrence,
// mais évite tout croisement de messages si jamais deux appels se
// chevauchaient.
let queue: Promise<void> = Promise.resolve();

/**
 * Arrêt explicite du sous-process persistant — appelé par l'arrêt propre de
 * `pipeline-worker.ts` (SIGTERM/SIGINT PM2, à chaque redéploiement).
 * Nécessaire précisément parce que ce sous-process est persistant (voir
 * doc ci-dessus) : `child_process.fork()` ne tue jamais automatiquement
 * l'enfant quand le parent s'arrête — sans cet appel explicite, chaque
 * redéploiement laisserait un `translateEventsWorker.js` orphelin tourner
 * indéfiniment (exactement le bug d'orphelins constaté en prod le 23 sept.
 * 2026 sur `radar`/`studio`, cette fois-ci pour de vrai à chaque
 * redémarrage plutôt qu'un accident isolé).
 */
export function shutdownTranslateEventsWorker(): void {
  if (child) {
    child.kill('SIGTERM');
    child = null;
  }
}

export async function translateEventsIsolated(
  events: { id: number; title: string; summary: string | null }[]
): Promise<Map<number, { titleFr: string; summaryFr: string }>> {
  if (events.length === 0) return new Map();

  if (!existsSync(WORKER_PATH)) {
    console.warn(
      '[TRANSLATE-EVENTS-ISOLATED] dist-worker/translateEventsWorker.js absent — traduction en direct (non isolée). ' +
      'Normal en développement local sans `npx tsc -p tsconfig.worker.json` ; ne doit jamais arriver en prod (deploy.sh le compile).',
    );
    return translateEventsDirect(events);
  }

  const task = queue.then(() => runBatch(events));
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}
