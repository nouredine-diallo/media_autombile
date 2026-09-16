/**
 * Process PM2 dédié au pipeline RADAR (ingestion RSS, embeddings,
 * traduction locale, clustering, scoring, auto-génération) — séparé du
 * serveur web `radar` (finding TODO.md §3.3, résolu le 16 sept. 2026).
 *
 * Cause racine du bug corrigé ici : `startCron()`/`runPipeline()` tournaient
 * dans le même process Node que `next start` — le calcul intensif
 * (embeddings + traduction locale, ONNX synchrone) bloquait le seul thread
 * JS du serveur HTTP, rendant le site totalement inaccessible (pas lent,
 * aucune réponse) pendant tout un cycle (30-50 min, mesuré en prod réelle
 * le 14 sept. 2026). Vérifié empiriquement que Node ne peut pas interrompre
 * un calcul natif bloquant en cours, quel que soit le wrapper JS autour
 * (`Promise.race`/`setTimeout` jamais déclenché en test réel) — la seule
 * solution fiable est l'isolation au niveau du process, pas un correctif
 * dans le même process.
 *
 * Script Node autonome, PAS une route Next.js. Compilé séparément en
 * CommonJS via `tsconfig.worker.json` (`tsc`, déjà une devDependency —
 * zéro outil ajouté, RADAR/CLAUDE.md §3) puis exécuté avec `node` normal —
 * tenté d'abord avec `node --experimental-strip-types` directement sur ce
 * fichier .ts, mais Node 22 exige alors une extension explicite sur CHAQUE
 * import relatif de toute la chaîne `lib/*` (cron.ts → rss.ts, db.ts,
 * scoring.ts, etc.), aucun flag équivalent à l'ancien
 * `--experimental-specifier-resolution=node` n'existe plus pour lever cette
 * contrainte (vérifié : absent de `node --help`). Compiler en CommonJS
 * évite le problème à la racine — `require()` résout les chemins sans
 * extension nativement, comme le reste de ce projet l'attend déjà.
 * N'importe que des modules `lib/*` déjà indépendants de Next.js (aucun
 * `next/server`, `next/headers`, `server-only` — vérifié avant d'écrire ce
 * fichier).
 *
 * Deux points d'entrée HTTP internes (`127.0.0.1` uniquement, jamais
 * exposés par nginx) :
 * - `POST /run` — déclenchement manuel (bouton "Lancer maintenant" du
 *   dashboard, proxié depuis `api/cron/route.ts`).
 * - `POST /reload-config` — relit la config cron après un changement
 *   d'horaire (écrite en base par le process web, ce process n'en est
 *   informé qu'en rechargeant explicitement — `saveCronConfig()` n'agit
 *   plus toute seule, voir cron.ts).
 */
import { createServer } from 'node:http';
import { startCron, stopCron, runPipeline, getCronStatus } from './lib/cron';
import { closeDb } from './lib/db';

const PORT = Number(process.env.PIPELINE_WORKER_PORT || 3010);
const HOST = '127.0.0.1';

console.log('[PIPELINE-WORKER] Démarrage...');
startCron();

const server = createServer((req, res) => {
  // Réseau interne uniquement — pas d'auth nécessaire, même principe déjà
  // appliqué à STUDIO_IMPORT_URL et /api/facts-lookup (RADAR/CLAUDE.md §9b) :
  // jamais atteignable depuis l'extérieur, nginx ne route rien vers ce port.
  if (req.method === 'POST' && req.url === '/run') {
    if (getCronStatus().running) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Pipeline déjà en cours d\'exécution' }));
      return;
    }
    runPipeline().catch((err) => console.error('[PIPELINE-WORKER] Échec du run manuel:', err));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Pipeline déclenché' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/reload-config') {
    stopCron();
    startCron();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`[PIPELINE-WORKER] Écoute sur http://${HOST}:${PORT}`);
});

/**
 * Arrêt propre — même principe que l'ancien handler de `startup.ts` (finding
 * E6, audit 2026-09-07), déplacé ici puisque c'est ce process, désormais,
 * qui peut être en plein cycle d'ingestion au moment d'un redéploiement.
 * Borné à MAX_SHUTDOWN_WAIT_MS : mieux vaut couper un cycle en cours
 * (chaque écriture SQLite reste atomique, better-sqlite3 est synchrone) que
 * de laisser PM2 attendre indéfiniment.
 */
const MAX_SHUTDOWN_WAIT_MS = 8000;
const SHUTDOWN_POLL_INTERVAL_MS = 250;
let shuttingDown = false;

function registerGracefulShutdown(): void {
  const handle = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[PIPELINE-WORKER] ${signal} reçu — arrêt propre en cours...`);

    stopCron();
    server.close();

    const deadline = Date.now() + MAX_SHUTDOWN_WAIT_MS;
    const waitLoop = () => {
      if (!getCronStatus().running || Date.now() >= deadline) {
        if (getCronStatus().running) {
          console.log('[PIPELINE-WORKER] Cycle en cours non terminé après le délai — arrêt quand même');
        }
        closeDb();
        console.log('[PIPELINE-WORKER] Arrêt propre terminé');
        process.exit(0);
        return;
      }
      setTimeout(waitLoop, SHUTDOWN_POLL_INTERVAL_MS);
    };
    waitLoop();
  };

  process.on('SIGTERM', () => handle('SIGTERM'));
  process.on('SIGINT', () => handle('SIGINT'));
}

registerGracefulShutdown();
