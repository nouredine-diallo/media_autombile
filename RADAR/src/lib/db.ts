import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'radar.db');

let db: any = null;

export function getDb(): any {
  if (!db) {
    const Database = require('better-sqlite3');
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    // Sans ça, deux écritures concurrentes (2 utilisateurs qui valident un
    // article à la même milliseconde) déclenchent SQLITE_BUSY immédiatement
    // — une erreur visible pour l'un des deux — plutôt que d'attendre
    // quelques millisecondes que l'autre écriture libère le verrou. WAL
    // autorise déjà plusieurs lecteurs pendant une écriture ; ce réglage
    // couvre le seul cas qui restait : deux écritures qui se chevauchent
    // (§ étape 2 "robustesse à 5 utilisateurs", 2026-08-27).
    db.pragma('busy_timeout = 5000');
    initializeDb(db);
  }
  return db;
}

function initializeDb(db: any) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS feeds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      priority INTEGER DEFAULT 1,
      requires_scraping INTEGER DEFAULT 0,
      enabled INTEGER DEFAULT 1,
      last_fetched_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT,
      content TEXT,
      summary TEXT,
      published_at TEXT,
      fetched_at TEXT DEFAULT (datetime('now')),
      is_duplicate INTEGER DEFAULT 0,
      embedding TEXT,
      FOREIGN KEY (feed_id) REFERENCES feeds(id),
      UNIQUE(title)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id TEXT UNIQUE,
      title TEXT NOT NULL,
      summary TEXT,
      source_count INTEGER DEFAULT 1,
      score REAL DEFAULT 0,
      first_seen_at TEXT DEFAULT (datetime('now')),
      last_updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS event_items (
      event_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      PRIMARY KEY (event_id, item_id),
      FOREIGN KEY (event_id) REFERENCES events(id),
      FOREIGN KEY (item_id) REFERENCES items(id)
    );

    CREATE TABLE IF NOT EXISTS briefs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL UNIQUE,
      headline TEXT NOT NULL,
      lede TEXT,
      body TEXT,
      facts TEXT,
      angle_suggestion TEXT,
      generated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id)
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id TEXT UNIQUE,
      event_id INTEGER NOT NULL,
      brief_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      chapeau TEXT,
      content TEXT NOT NULL,
      meta_description TEXT,
      word_count INTEGER,
      status TEXT DEFAULT 'draft',
      verification_score INTEGER,
      verification_issues TEXT,
      generated_at TEXT DEFAULT (datetime('now')),
      validated_at TEXT,
      published_at TEXT,
      FOREIGN KEY (event_id) REFERENCES events(id),
      FOREIGN KEY (brief_id) REFERENCES briefs(id)
    );

    CREATE TABLE IF NOT EXISTS corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL,
      generated_text TEXT NOT NULL,
      corrected_text TEXT NOT NULL,
      correction_type TEXT,
      pattern_observed TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (article_id) REFERENCES articles(id)
    );

    CREATE TABLE IF NOT EXISTS stats_imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id TEXT,
      filename TEXT NOT NULL,
      imported_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      brand TEXT,
      campaign_start TEXT,
      campaign_end TEXT,
      deliverables TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS partner_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      partner_id INTEGER NOT NULL,
      content_id TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (partner_id) REFERENCES partners(id)
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      event_type TEXT NOT NULL CHECK(event_type IN ('deadline_article', 'publication_instagram', 'envoi_rapport', 'campagne_partenaire', 'autre')),
      start_date TEXT NOT NULL,
      end_date TEXT,
      all_day INTEGER DEFAULT 1,
      content_id TEXT,
      partner_id INTEGER,
      article_id INTEGER,
      color TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (partner_id) REFERENCES partners(id),
      FOREIGN KEY (article_id) REFERENCES articles(id)
    );

    CREATE INDEX IF NOT EXISTS idx_calendar_events_start ON calendar_events(start_date);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_end ON calendar_events(end_date);
    CREATE INDEX IF NOT EXISTS idx_calendar_events_partner ON calendar_events(partner_id);

    CREATE TABLE IF NOT EXISTS event_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
      UNIQUE(event_id, tag)
    );

    CREATE INDEX IF NOT EXISTS idx_event_tags_event ON event_tags(event_id);
    CREATE INDEX IF NOT EXISTS idx_event_tags_tag ON event_tags(tag);

    CREATE TABLE IF NOT EXISTS style_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      banned TEXT NOT NULL,
      expected TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      usage_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      last_used_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_style_rules_active ON style_rules(is_active);

    CREATE TABLE IF NOT EXISTS article_decisions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL,
      decision TEXT NOT NULL CHECK(decision IN ('validated', 'rejected')),
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (article_id) REFERENCES articles(id)
    );

    CREATE INDEX IF NOT EXISTS idx_article_decisions_created ON article_decisions(created_at);

    CREATE TABLE IF NOT EXISTS google_tokens (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      access_token TEXT NOT NULL,
      refresh_token TEXT NOT NULL,
      expiry_date INTEGER NOT NULL,
      email TEXT,
      connected_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS drive_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drive_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT,
      size INTEGER DEFAULT 0,
      modified_at TEXT,
      created_at TEXT,
      parent_id TEXT,
      is_folder INTEGER DEFAULT 0,
      thumbnail_url TEXT,
      web_view_link TEXT,
      is_cloud INTEGER DEFAULT 0,
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_drive_files_name ON drive_files(name);
    CREATE INDEX IF NOT EXISTS idx_drive_files_parent ON drive_files(parent_id);
  `);

  // Migration: add enabled to feeds if missing
  const feedColumns = db.prepare("PRAGMA table_info(feeds)").all() as { name: string }[];
  if (!feedColumns.some(col => col.name === 'enabled')) {
    db.exec("ALTER TABLE feeds ADD COLUMN enabled INTEGER DEFAULT 1");
  }

  // Migration: add is_cloud to drive_files if missing
  const driveColumns = db.prepare("PRAGMA table_info(drive_files)").all() as { name: string }[];
  if (!driveColumns.some(col => col.name === 'is_cloud')) {
    db.exec("ALTER TABLE drive_files ADD COLUMN is_cloud INTEGER DEFAULT 0");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_drive_files_cloud ON drive_files(is_cloud)");

  // Migration: add content_id to existing tables if missing
  const eventColumns = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  if (!eventColumns.some(col => col.name === 'content_id')) {
    db.exec("ALTER TABLE events ADD COLUMN content_id TEXT UNIQUE");
    // Generate content_id for existing events
    const existingEvents = db.prepare("SELECT id FROM events WHERE content_id IS NULL").all() as { id: number }[];
    for (const event of existingEvents) {
      const contentId = `LMA-EVT-${String(event.id).padStart(4, '0')}`;
      db.prepare("UPDATE events SET content_id = ? WHERE id = ?").run(contentId, event.id);
    }
  }

  const articleColumns = db.prepare("PRAGMA table_info(articles)").all() as { name: string }[];
  if (!articleColumns.some(col => col.name === 'content_id')) {
    db.exec("ALTER TABLE articles ADD COLUMN content_id TEXT UNIQUE");
    // Generate content_id for existing articles
    const existingArticles = db.prepare("SELECT id FROM articles WHERE content_id IS NULL").all() as { id: number }[];
    for (const article of existingArticles) {
      const contentId = `LMA-ART-${String(article.id).padStart(4, '0')}`;
      db.prepare("UPDATE articles SET content_id = ? WHERE id = ?").run(contentId, article.id);
    }
  }

  // Migration: add assigned_to to events if missing
  const eventsColumns2 = db.prepare("PRAGMA table_info(events)").all() as { name: string }[];
  if (!eventsColumns2.some(col => col.name === 'urgent_until')) {
    db.exec("ALTER TABLE events ADD COLUMN urgent_until TEXT");
  }
  if (!eventsColumns2.some(col => col.name === 'assigned_to')) {
    db.exec("ALTER TABLE events ADD COLUMN assigned_to TEXT");
  }
  if (!eventsColumns2.some(col => col.name === 'title_fr')) {
    db.exec("ALTER TABLE events ADD COLUMN title_fr TEXT");
  }
  if (!eventsColumns2.some(col => col.name === 'summary_fr')) {
    db.exec("ALTER TABLE events ADD COLUMN summary_fr TEXT");
  }

  // Migration: add lock columns to articles if missing
  const articlesColumns = db.prepare("PRAGMA table_info(articles)").all() as { name: string }[];
  if (!articlesColumns.some(col => col.name === 'locked_by')) {
    db.exec("ALTER TABLE articles ADD COLUMN locked_by TEXT");
  }
  if (!articlesColumns.some(col => col.name === 'locked_at')) {
    db.exec("ALTER TABLE articles ADD COLUMN locked_at TEXT");
  }

  // Migration: add provenance to articles if missing (CLAUDE.md §6 — traçabilité obligatoire)
  const articleColumns2 = db.prepare("PRAGMA table_info(articles)").all() as { name: string }[];
  if (!articleColumns2.some(col => col.name === 'provenance')) {
    db.exec("ALTER TABLE articles ADD COLUMN provenance TEXT DEFAULT 'assisté'");
  }

  // Migration: add exported_at + drive_url to articles (callback STUDIO→RADAR)
  if (!articleColumns2.some(col => col.name === 'exported_at')) {
    db.exec("ALTER TABLE articles ADD COLUMN exported_at TEXT");
  }
  if (!articleColumns2.some(col => col.name === 'drive_url')) {
    db.exec("ALTER TABLE articles ADD COLUMN drive_url TEXT");
  }

  // Migration: cible structurée pour les partenaires (§chantier 5 du plan
  // écosystème) — vient à côté de `deliverables` (texte libre conservé pour
  // le contexte), pas à sa place. `target_format` reprend les deux formats
  // déjà en usage ("slide unique" confirmé par l'utilisateur, "carrousel").
  const partnerColumns = db.prepare("PRAGMA table_info(partners)").all() as { name: string }[];
  if (!partnerColumns.some(col => col.name === 'target_count')) {
    db.exec("ALTER TABLE partners ADD COLUMN target_count INTEGER");
  }
  if (!partnerColumns.some(col => col.name === 'target_format')) {
    db.exec("ALTER TABLE partners ADD COLUMN target_format TEXT CHECK(target_format IN ('slide_unique', 'carrousel') OR target_format IS NULL)");
  }

  // Migration: carousel_slides — trace du texte final d'un export carrousel
  // (JSON, un texte par slide dans l'ordre), pour le retrouver sans dépendre
  // de Drive (§2.7 du plan écosystème). NULL pour un export single-image.
  if (!articleColumns2.some(col => col.name === 'carousel_slides')) {
    db.exec("ALTER TABLE articles ADD COLUMN carousel_slides TEXT");
  }

  // Migration: add image_url to items for Mission 2 (visual search pipeline)
  const itemColumns = db.prepare("PRAGMA table_info(items)").all() as { name: string }[];
  if (!itemColumns.some(col => col.name === 'image_url')) {
    db.exec("ALTER TABLE items ADD COLUMN image_url TEXT");
  }
  if (!itemColumns.some(col => col.name === 'image_source')) {
    db.exec("ALTER TABLE items ADD COLUMN image_source TEXT");
  }
  if (!itemColumns.some(col => col.name === 'image_rejected')) {
    db.exec("ALTER TABLE items ADD COLUMN image_rejected INTEGER DEFAULT 0");
  }
  if (!itemColumns.some(col => col.name === 'rejection_reason')) {
    db.exec("ALTER TABLE items ADD COLUMN rejection_reason TEXT");
  }

  // Migration: pipeline status table for Mission 4 (cron automation)
  db.exec(`
    CREATE TABLE IF NOT EXISTS pipeline_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_type TEXT NOT NULL CHECK(run_type IN ('ingest', 'process', 'visual_search', 'full')),
      status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed')),
      items_ingested INTEGER DEFAULT 0,
      events_created INTEGER DEFAULT 0,
      images_found INTEGER DEFAULT 0,
      error TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_type ON pipeline_runs(run_type);
    CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON pipeline_runs(started_at);
  `);

  // Migration: add image_preflight to items (preflight STUDIO — gabarit compatibility verdict)
  if (!itemColumns.some(col => col.name === 'image_preflight')) {
    db.exec("ALTER TABLE items ADD COLUMN image_preflight TEXT");
  }

  // Migration: carousel_text sur briefs — texte court généré par LLM pour les
  // slides de développement du carrousel (1 à 3 paragraphes), mis en cache
  // pour ne jamais re-payer un appel LLM à chaque lecture de la même actu
  // (voir lib/brief.ts, getCarouselSlides/generateCarouselText).
  const briefColumns = db.prepare("PRAGMA table_info(briefs)").all() as { name: string }[];
  if (!briefColumns.some(col => col.name === 'carousel_text')) {
    db.exec("ALTER TABLE briefs ADD COLUMN carousel_text TEXT");
  }

  // Migration: compteurs de la génération automatique du matin (chantier 3),
  // pour rendre visible côté dashboard ce qui tourne déjà en arrière-plan
  // sans trace lisible ailleurs qu'en console.log (§ session 2026-08-27,
  // priorité P1 : "rendre visible ce qui tourne déjà").
  const pipelineRunColumns = db.prepare("PRAGMA table_info(pipeline_runs)").all() as { name: string }[];
  if (!pipelineRunColumns.some(col => col.name === 'auto_gen_attempted')) {
    db.exec("ALTER TABLE pipeline_runs ADD COLUMN auto_gen_attempted INTEGER DEFAULT 0");
  }
  if (!pipelineRunColumns.some(col => col.name === 'auto_gen_passed')) {
    db.exec("ALTER TABLE pipeline_runs ADD COLUMN auto_gen_passed INTEGER DEFAULT 0");
  }

  // Migration: item_images — toutes les images candidates trouvées par scrapeArticleImages(),
  // pas seulement la meilleure. Additif : items.image_url/image_source restent alimentés en
  // parallèle (rang 0) pour ne rien changer au chemin de lecture actuel (chantier carrousel,
  // voir docs/superpowers/plans/2026-08-26-ecosystem-editorial-v2.md §6, étape A).
  db.exec(`
    CREATE TABLE IF NOT EXISTS item_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      url TEXT NOT NULL,
      source TEXT,
      rank INTEGER NOT NULL DEFAULT 0,
      width INTEGER,
      height INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_item_images_item ON item_images(item_id, rank);
  `);
}

export interface Feed {
  id: number;
  name: string;
  url: string;
  priority: number;
  requires_scraping: number;
  enabled: number;
  last_fetched_at: string | null;
  created_at: string;
}

export interface Item {
  id: number;
  feed_id: number;
  title: string;
  url: string | null;
  content: string | null;
  summary: string | null;
  published_at: string | null;
  fetched_at: string;
  is_duplicate: number;
  embedding?: string;
  feed_name?: string;
  image_url?: string | null;
  image_source?: string | null;
  image_preflight?: string | null;
}

export interface PipelineRun {
  id: number;
  run_type: string;
  status: string;
  items_ingested: number;
  events_created: number;
  images_found: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface Event {
  id: number;
  content_id: string | null;
  title: string;
  title_fr: string | null;
  summary: string | null;
  summary_fr: string | null;
  source_count: number;
  score: number;
  first_seen_at: string;
  last_updated_at: string;
  urgent_until: string | null;
  assigned_to: string | null;
}

export function getStats() {
  const db = getDb();
  const totalEvents = db.prepare("SELECT COUNT(*) as count FROM events").get() as { count: number };
  const totalArticles = db.prepare("SELECT COUNT(*) as count FROM articles").get() as { count: number };
  const totalCorrections = db.prepare("SELECT COUNT(*) as count FROM corrections").get() as { count: number };
  
  return {
    totalEvents: totalEvents.count,
    totalArticles: totalArticles.count,
    totalCorrections: totalCorrections.count,
  };
}

export function startPipelineRun(runType: string): number {
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO pipeline_runs (run_type, status) VALUES (?, 'running')"
  ).run(runType);
  return result.lastInsertRowid as number;
}

export function completePipelineRun(
  runId: number,
  status: 'completed' | 'failed',
  stats: { items_ingested?: number; events_created?: number; images_found?: number; error?: string }
): void {
  const db = getDb();
  db.prepare(`
    UPDATE pipeline_runs
    SET status = ?, items_ingested = ?, events_created = ?, images_found = ?, error = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(
    status,
    stats.items_ingested ?? 0,
    stats.events_created ?? 0,
    stats.images_found ?? 0,
    stats.error ?? null,
    runId
  );
}

/**
 * Marque comme échoué tout run resté bloqué à `running` — jamais atteint ni
 * par le chemin succès ni par le chemin échec de `runPipeline()`, signe que
 * le process Node est mort en plein cycle (crash, redémarrage) plutôt qu'une
 * exception proprement remontée. Découvert le 2026-08-27 : 6 runs consécutifs
 * bloqués ainsi sur 3 jours dans cet environnement, expliquant `events.score`
 * resté à 0 partout (le cycle qui calcule les scores n'était jamais atteint).
 * Seuil de 30 min : un cycle normal dure des secondes à quelques minutes
 * (RADAR/CLAUDE.md §11), largement en dessous — TODO seuil provisoire si un
 * jour un cycle légitime dure plus longtemps (gros volume de flux).
 */
export function cleanupStaleRuns(): number {
  const db = getDb();
  const result = db.prepare(`
    UPDATE pipeline_runs
    SET status = 'failed',
        error = 'Processus interrompu avant la fin (crash ou redémarrage serveur) — jamais atteint le chemin succès ni échec',
        completed_at = datetime('now')
    WHERE status = 'running' AND started_at < datetime('now', '-30 minutes')
  `).run();
  return result.changes;
}

export function getPipelineStatus(): { lastRun: PipelineRun | null; recentRuns: PipelineRun[] } {
  const db = getDb();
  const lastRun = db.prepare(
    "SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 1"
  ).get() as PipelineRun | undefined;
  const recentRuns = db.prepare(
    "SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 10"
  ).all() as PipelineRun[];
  return { lastRun: lastRun ?? null, recentRuns };
}

export function getDashboardAgenda() {
  const db = getDb();
  const IN_PROGRESS_LIMIT = 5;

  // 🔴 Urgent : articles en draft > 48h
  const urgent = db.prepare(`
    SELECT a.id, a.title, a.generated_at,
      CAST((julianday('now') - julianday(a.generated_at)) * 24 AS INTEGER) as hours_waiting
    FROM articles a
    WHERE a.status = 'draft'
      AND a.generated_at < datetime('now', '-2 days')
    ORDER BY a.generated_at ASC
  `).all() as { id: number; title: string; generated_at: string; hours_waiting: number }[];

  // 🟠 En production : événements sans article (limités, avec count total)
  const allInProgress = db.prepare(`
    SELECT e.id, e.title, e.title_fr, e.content_id, e.score, e.assigned_to
    FROM events e
    WHERE NOT EXISTS (SELECT 1 FROM articles a WHERE a.event_id = e.id)
    ORDER BY e.score DESC
  `).all() as { id: number; title: string; title_fr: string | null; content_id: string | null; score: number; assigned_to: string | null }[];

  const inProgress = allInProgress.slice(0, IN_PROGRESS_LIMIT);
  const hiddenInProgressCount = Math.max(0, allInProgress.length - IN_PROGRESS_LIMIT);

  // 🟢 Prêt : articles validés, prêts pour STUDIO
  const ready = db.prepare(`
    SELECT a.id, a.title, a.content_id, a.validated_at, a.chapeau,
      a.exported_at, a.drive_url,
      (SELECT i.image_url FROM items i
       JOIN event_items ei ON ei.item_id = i.id
       WHERE ei.event_id = a.event_id AND i.image_url IS NOT NULL
       ORDER BY
         CASE
           WHEN i.image_source = 'og:image' THEN 1
           WHEN i.image_source = 'twitter:image' THEN 2
           WHEN i.image_source = 'page' THEN 3
           WHEN i.image_source = 'rss' THEN 4
           ELSE 5
         END
       LIMIT 1) as image_url
    FROM articles a
    WHERE a.status = 'validated'
    ORDER BY a.validated_at DESC
  `).all() as { id: number; title: string; content_id: string | null; validated_at: string | null; chapeau: string | null; image_url: string | null; exported_at: string | null; drive_url: string | null }[];

  // 🤝 Partenaires : rapports à envoyer
  const partnerTasks = db.prepare(`
    SELECT p.id, p.name, p.brand, p.campaign_end
    FROM partners p
    WHERE p.campaign_end IS NULL OR p.campaign_end >= date('now')
    ORDER BY p.campaign_end ASC
  `).all() as { id: number; name: string; brand: string | null; campaign_end: string | null }[];

  // 📅 Échéances calendrier : les 7 prochains jours (deadlines, publications, campagnes)
  const calendarUpcoming = db.prepare(`
    SELECT id, title, event_type, start_date, color
    FROM calendar_events
    WHERE start_date >= date('now') AND start_date <= date('now', '+7 days')
    ORDER BY start_date ASC
    LIMIT 5
  `).all() as { id: number; title: string; event_type: string; start_date: string; color: string }[];

  // 🤖 Génération automatique du matin (chantier 3) — rendre visible ce qui
  // tourne déjà en arrière-plan (§ session 2026-08-27, priorité P1). Les
  // brouillons qui passent le contrôle qualité n'apparaissent nulle part
  // ailleurs sur ce dashboard : "En production" n'affiche que les événements
  // SANS article, "Articles validés" exige status='validated' — un brouillon
  // 'draft' généré ce matin serait invisible sans cette section dédiée.
  const today = new Date().toISOString().slice(0, 10);
  const autoGenRun = db.prepare(
    `SELECT auto_gen_attempted, auto_gen_passed FROM pipeline_runs WHERE date(started_at) = ? AND auto_gen_attempted > 0 ORDER BY id DESC LIMIT 1`
  ).get(today) as { auto_gen_attempted: number; auto_gen_passed: number } | undefined;
  const morningDrafts = autoGenRun ? db.prepare(
    `SELECT id, event_id, title, content_id FROM articles WHERE provenance = 'généré' AND date(generated_at) = ? ORDER BY generated_at DESC`
  ).all(today) as { id: number; event_id: number; title: string; content_id: string | null }[] : [];

  // ✍️ Corrections : même seuil que /corrections (§ analyse des patterns) — pas dupliqué, juste relu ici
  const CORRECTIONS_GUIDE_THRESHOLD = 30;
  const totalCorrections = db.prepare("SELECT COUNT(*) as count FROM corrections").get() as { count: number };

  // Compteurs
  const totalDrafts = db.prepare("SELECT COUNT(*) as count FROM articles WHERE status = 'draft'").get() as { count: number };
  const totalValidated = db.prepare("SELECT COUNT(*) as count FROM articles WHERE status = 'validated'").get() as { count: number };
  const totalEventsCount = db.prepare("SELECT COUNT(*) as count FROM events").get() as { count: number };
  const eventsWithoutArticle = db.prepare(`
    SELECT COUNT(*) as count FROM events e
    WHERE NOT EXISTS (SELECT 1 FROM articles a WHERE a.event_id = e.id)
  `).get() as { count: number };

  return {
    urgent,
    inProgress,
    hiddenInProgressCount,
    ready,
    partnerTasks,
    calendarUpcoming,
    morningAutoGen: autoGenRun ? {
      attempted: autoGenRun.auto_gen_attempted,
      passed: autoGenRun.auto_gen_passed,
      drafts: morningDrafts,
    } : null,
    correctionsCount: totalCorrections.count,
    correctionsThreshold: CORRECTIONS_GUIDE_THRESHOLD,
    counters: {
      drafts: totalDrafts.count,
      validated: totalValidated.count,
      totalEvents: totalEventsCount.count,
      eventsWithoutArticle: eventsWithoutArticle.count,
      urgentCount: urgent.length,
      readyCount: ready.length,
      partnerCount: partnerTasks.length,
    },
  };
}

// C3: Image rejection — lets users flag auto-found visuals as unsuitable
export function rejectItemImage(itemId: number, reason?: string): void {
  const d = getDb();
  d.prepare("UPDATE items SET image_rejected = 1, rejection_reason = ? WHERE id = ?").run(reason || null, itemId);
}

export function unrejectItemImage(itemId: number): void {
  const d = getDb();
  d.prepare("UPDATE items SET image_rejected = 0, rejection_reason = NULL WHERE id = ?").run(itemId);
}

export function getRejectedImages(): { item_id: number; title: string; rejection_reason: string | null; url: string | null }[] {
  const d = getDb();
  return d.prepare(`
    SELECT i.id as item_id, i.title, i.rejection_reason, i.url
    FROM items i
    WHERE i.image_rejected = 1
    ORDER BY i.id DESC
  `).all() as { item_id: number; title: string; rejection_reason: string | null; url: string | null }[];
}
