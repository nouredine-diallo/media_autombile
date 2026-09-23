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
 * Résultats reçus événement par événement (pas un seul message final) :
 * si le sous-process meurt en cours de lot (le même crash peut se
 * reproduire), les traductions déjà reçues avant le crash sont quand même
 * conservées plutôt que perdues avec tout le lot — le reste retente au
 * prochain cycle (même contrat que l'appelant, scoring.ts, applique déjà
 * pour un lot entier absent).
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

  const results = new Map<number, { titleFr: string; summaryFr: string }>();

  await new Promise<void>((resolve) => {
    let child: ChildProcess | null = fork(WORKER_PATH, { silent: false });
    const timer = setTimeout(() => {
      console.error(
        `[TRANSLATE-EVENTS-ISOLATED] Sous-process au-delà de ${HARD_TIMEOUT_MS}ms — arrêt forcé, ` +
        `${results.size}/${events.length} traductions conservées.`
      );
      child?.kill('SIGKILL');
    }, HARD_TIMEOUT_MS);

    const finish = () => {
      clearTimeout(timer);
      if (child) {
        child.removeAllListeners();
        child = null;
      }
      resolve();
    };

    child.on('message', (msg: WorkerMsg) => {
      if (msg.type === 'result') {
        results.set(msg.id, { titleFr: msg.titleFr, summaryFr: msg.summaryFr });
      } else if (msg.type === 'done') {
        finish();
      }
    });

    // Un crash natif (voir translateEventsWorker.ts) sort par 'exit' avec un
    // signal, jamais par 'done' — jamais une dégradation silencieuse
    // (RADAR/CLAUDE.md §6) : signalé explicitement, mais le lot déjà reçu
    // est conservé plutôt que perdu.
    child.on('exit', (code, signal) => {
      if (code !== 0) {
        console.error(
          `[TRANSLATE-EVENTS-ISOLATED] Sous-process de traduction interrompu (code=${code}, signal=${signal}) — ` +
          `${results.size}/${events.length} traductions conservées, le reste retente au prochain cycle.`
        );
      }
      finish();
    });

    child.on('error', (err) => {
      console.error('[TRANSLATE-EVENTS-ISOLATED] Échec de lancement du sous-process:', err.message);
      finish();
    });

    child.send({ events });
  });

  return results;
}
