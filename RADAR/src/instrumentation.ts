export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Le pipeline (cron, ingestion, embeddings) tourne désormais dans son
    // propre process PM2 (radar-pipeline) — voir src/pipeline-worker.ts et
    // TODO.md §3.3. Ce process web n'enregistre plus qu'un arrêt propre
    // pour sa connexion SQLite.
    console.log("Initializing web app shutdown handler via instrumentation...");
    const { initWebApp } = await import("./lib/startup");
    initWebApp();
  }
}
