import Parser from 'rss-parser';
import type Database from 'better-sqlite3';
import { getDb, Feed, Item } from './db';
import { isProductRoundup, isWebinarAnnouncement } from './textUtils';

export { isProductRoundup, isWebinarAnnouncement };

// Trouvé le 2026-09-17 en creusant les échecs "XML malformé" (InsideEVs,
// entre autres) : rss-parser appelle `https.get`/`http.get` en interne (lu
// dans node_modules/rss-parser/lib/parser.js), jamais `fetch` — il ne
// décompresse donc jamais un contenu `content-encoding: gzip`, même quand
// le serveur le renvoie sans que le client l'ait demandé (CDN qui force la
// compression, vu réellement sur insideevs.com malgré l'absence de
// `Accept-Encoding` dans nos en-têtes). Les octets gzip bruts (magic number
// `1f 8b`) atterrissaient directement dans le parseur XML — d'où l'erreur
// "Non-whitespace before first tag, Char: " (0x1f = premier octet
// gzip), confirmée en inspectant les octets réels de la réponse. `fetch`
// (undici, natif Node 18+) décompresse gzip/br/deflate automatiquement —
// on récupère le texte nous-mêmes via `fetch`, on ne délègue que le parsing
// XML à rss-parser (`parseString`, pas `parseURL`).
const FEED_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
};
const FEED_FETCH_TIMEOUT_MS = 15000;

const parser = new Parser({
  customFields: {
    item: [
      ['enclosure', 'enclosure'],
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['content:encoded', 'contentEncoded'],
    ],
  },
});

export interface ParsedItem {
  title: string;
  link?: string;
  content?: string;
  contentSnippet?: string;
  isoDate?: string;
  pubDate?: string;
  imageUrl?: string | null;
}

function extractImageUrl(item: Record<string, unknown>): string | null {
  // 1. enclosure with image type
  const enclosure = item.enclosure as { url?: string; type?: string } | undefined;
  if (enclosure?.url && enclosure.type?.startsWith('image/')) {
    return enclosure.url;
  }

  // 2. media:content with image type
  const mediaContent = item.mediaContent as { url?: string; medium?: string; type?: string } | undefined;
  if (mediaContent?.url && (mediaContent.medium === 'image' || mediaContent.type?.startsWith('image/'))) {
    return mediaContent.url;
  }

  // 3. media:thumbnail
  const mediaThumbnail = item.mediaThumbnail as { url?: string } | undefined;
  if (mediaThumbnail?.url) {
    return mediaThumbnail.url;
  }

  // 4. enclosure without type check (some feeds don't set type)
  if (enclosure?.url && /\.(jpe?g|png|gif|webp|avif)/i.test(enclosure.url)) {
    return enclosure.url;
  }

  // 5. Parse content/summary for <img> tags
  const htmlContent = (item.contentEncoded as string) || (item.content as string) || '';
  const imgMatch = htmlContent.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    return imgMatch[1];
  }

  // 6. Parse summary for <img> tags
  const summary = (item.contentSnippet as string) || '';
  const summaryImgMatch = summary.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (summaryImgMatch) {
    return summaryImgMatch[1];
  }

  return null;
}

/**
 * Finding D7 (audit 2026-09-07) : cette fonction avalait ses propres erreurs
 * réseau/parsing et retournait `[]` — indiscernable pour l'appelant d'un flux
 * sain sans nouveau contenu. Les deux appelants (`cron.ts`, `api/ingest`) ont
 * déjà leur propre `try/catch` autour de `fetchFeed()` : laisser l'erreur
 * remonter permet à `recordFeedFetchFailure` d'être appelé au lieu de
 * `recordFeedFetchSuccess`, sans changer l'architecture des deux appelants
 * (CLAUDE.md §6, "aucune dégradation silencieuse").
 */
export async function fetchFeed(feed: Feed): Promise<ParsedItem[]> {
  console.log(`Fetching feed: ${feed.name} from ${feed.url}`);
  const res = await fetch(feed.url, {
    headers: FEED_HEADERS,
    signal: AbortSignal.timeout(FEED_FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Flux "${feed.name}" a répondu ${res.status}`);
  }
  const xml = await res.text();
  const feedData = await parser.parseString(xml);
  console.log(`Feed ${feed.name} parsed, found ${(feedData.items || []).length} items`);

  return (feedData.items || []).map(item => {
    const raw = item as unknown as Record<string, unknown>;
    return {
      title: item.title || 'Untitled',
      link: item.link,
      content: item.content || item.contentSnippet,
      contentSnippet: item.contentSnippet,
      isoDate: item.isoDate,
      pubDate: item.pubDate,
      imageUrl: extractImageUrl(raw),
    };
  });
}

/**
 * Retire le pied de page WordPress standard (« The post X appeared first
 * on Y. ») du texte source — trouvé le 2026-09-09 en creusant pourquoi deux
 * articles générés échouaient systématiquement le contrôle qualité (score
 * 40 et 37, très sous le seuil de 70) : ce pied de page, présent dans le
 * flux Pebble Beach (WordPress), traversait intact jusqu'au brief où
 * `extractFacts()` (brief.ts) l'extrayait comme un "fait" à part entière —
 * jusqu'à 3 fois par item, quasi identiques d'un item à l'autre (seul le
 * titre change), sans apporter aucun contenu réel. Nettoyé ici, au point
 * d'ingestion unique, pour bénéficier aussi aux embeddings (`scoring.ts`)
 * et au clustering, pas seulement au brief — la même chaîne "The post ...
 * appeared first on ..." gonflait aussi la similarité calculée entre des
 * items par ailleurs sans rapport (même pied de page = texte quasi
 * identique). Motif générique WordPress, pas propre à Pebble Beach — tout
 * autre flux du même moteur en bénéficie automatiquement.
 */
export function stripWordpressBoilerplate(text: string | null | undefined): string | null {
  if (!text) return text ?? null;
  return text
    .replace(/\bThe post .+? appeared first on .+?\.?\s*$/i, '')
    .trim() || null;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeTitle(a).split(' ').filter(w => w.length > 2));
  const wordsB = new Set(normalizeTitle(b).split(' ').filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function isNearDuplicate(title: string, db: Database.Database): boolean {
  // Check last 500 items for similar titles (covers recent ingests)
  const recent = db.prepare(
    'SELECT title FROM items ORDER BY id DESC LIMIT 500'
  ).all() as { title: string }[];

  for (const item of recent) {
    if (titleSimilarity(title, item.title) >= 0.75) {
      return true;
    }
  }
  return false;
}

export function storeItems(feedId: number, items: ParsedItem[]): { stored: number; duplicates: number; nearDuplicates: number; offTopicRoundups: number } {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO items (feed_id, title, url, content, summary, published_at, image_url, image_source)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'rss')
  `);

  let stored = 0;
  let duplicates = 0;
  let nearDuplicates = 0;
  let offTopicRoundups = 0;

  const insertMany = db.transaction((items: ParsedItem[]) => {
    for (const item of items) {
      // Voir isProductRoundup()/isWebinarAnnouncement() (textUtils.ts) —
      // compilations "Green Deals" (Electrek) et annonces de webinaires
      // (Charged EVs), jamais des articles d'actualité auto. Comptées
      // ensemble sous le même compteur (même catégorie de bruit pour le
      // pipeline), jamais un rejet silencieux (RADAR/CLAUDE.md §6).
      if (isProductRoundup(item.title) || isWebinarAnnouncement(item.title)) {
        offTopicRoundups++;
        continue;
      }

      // Finding D3 (audit 2026-09-07) : isNearDuplicate() n'était appelée
      // qu'APRÈS l'échec de l'INSERT sur la contrainte UNIQUE(title) — donc
      // uniquement sur des items déjà identiques au caractère près à un
      // item existant, jamais sur les vrais quasi-doublons (même actu,
      // titre légèrement différent entre deux sources) qui, eux, passaient
      // l'INSERT sans jamais être comparés. Vérifié maintenant AVANT
      // l'insertion, sur chaque item entrant.
      if (isNearDuplicate(item.title, db)) {
        nearDuplicates++;
        continue;
      }

      const result = insert.run(
        feedId,
        item.title,
        item.link || null,
        stripWordpressBoilerplate(item.content),
        stripWordpressBoilerplate(item.contentSnippet),
        item.isoDate || item.pubDate || null,
        item.imageUrl || null
      );
      if (result.changes > 0) {
        stored++;
      } else {
        // Titre strictement identique à un item déjà en base (contrainte
        // UNIQUE) — republication légitime à l'identique ou vrai doublon,
        // indiscernable ici sans plus de contexte ; compté séparément des
        // quasi-doublons.
        duplicates++;
      }
    }
  });

  insertMany(items);
  return { stored, duplicates, nearDuplicates, offTopicRoundups };
}

export function getFeeds(): Feed[] {
  const db = getDb();
  return db.prepare('SELECT * FROM feeds WHERE enabled = 1 ORDER BY priority').all() as Feed[];
}

export function addFeed(name: string, url: string, priority: number = 1, requiresScraping: boolean = false): Feed {
  const db = getDb();
  const result = db.prepare(
    'INSERT INTO feeds (name, url, priority, requires_scraping) VALUES (?, ?, ?, ?)'
  ).run(name, url, priority, requiresScraping ? 1 : 0);
  
  return db.prepare('SELECT * FROM feeds WHERE id = ?').get(result.lastInsertRowid) as Feed;
}

// Finding D7 (audit 2026-09-07) : seuil provisoire (CLAUDE.md §4.3, à
// calibrer sur données réelles) — ~5 jours d'échec continu à raison de 6
// tentatives/jour (cycle 4h, `cron.ts`). Assez long pour ne pas désactiver un
// flux en panne temporaire, assez court pour arrêter de gaspiller un cycle
// d'ingestion sur un flux mort (timeout 12s × flux morts, répété indéfiniment).
const MAX_CONSECUTIVE_FAILURES = 30;

export function recordFeedFetchSuccess(feedId: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE feeds SET
      last_fetched_at = datetime('now'),
      last_fetch_status = 'ok',
      last_fetch_error = NULL,
      consecutive_failures = 0
    WHERE id = ?
  `).run(feedId);
}

export function recordFeedFetchFailure(feedId: number, errorMessage: string): void {
  const db = getDb();
  const feed = db.prepare('SELECT consecutive_failures, name FROM feeds WHERE id = ?').get(feedId) as { consecutive_failures: number; name: string } | undefined;
  const consecutiveFailures = (feed?.consecutive_failures ?? 0) + 1;
  const shouldDisable = consecutiveFailures >= MAX_CONSECUTIVE_FAILURES;

  db.prepare(`
    UPDATE feeds SET
      last_fetched_at = datetime('now'),
      last_fetch_status = 'error',
      last_fetch_error = ?,
      consecutive_failures = ?,
      enabled = CASE WHEN ? THEN 0 ELSE enabled END
    WHERE id = ?
  `).run(errorMessage.slice(0, 500), consecutiveFailures, shouldDisable ? 1 : 0, feedId);

  if (shouldDisable) {
    console.error(`[RSS] Flux "${feed?.name ?? feedId}" désactivé automatiquement après ${consecutiveFailures} échecs consécutifs. Dernière erreur : ${errorMessage}`);
  }
}

export function getItems(limit: number = 50): (Item & { feed_name: string })[] {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, f.name as feed_name 
    FROM items i 
    JOIN feeds f ON i.feed_id = f.id 
    WHERE i.is_duplicate = 0 
    ORDER BY i.fetched_at DESC 
    LIMIT ?
  `).all(limit) as (Item & { feed_name: string })[];
}

export function getItemsWithoutImages(): (Item & { feed_name: string })[] {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, f.name as feed_name
    FROM items i
    JOIN feeds f ON i.feed_id = f.id
    WHERE i.is_duplicate = 0
      AND i.image_url IS NULL
      AND (i.image_rejected IS NULL OR i.image_rejected = 0)
      AND i.url IS NOT NULL
    ORDER BY i.fetched_at DESC
    LIMIT 50
  `).all() as (Item & { feed_name: string })[];
}

export function getItemsWithRejectedImages(): (Item & { feed_name: string })[] {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, f.name as feed_name
    FROM items i
    JOIN feeds f ON i.feed_id = f.id
    WHERE i.image_rejected = 1
      AND i.url IS NOT NULL
    ORDER BY i.id DESC
  `).all() as (Item & { feed_name: string })[];
}

export function updateItemImage(itemId: number, imageUrl: string, source: string): void {
  const db = getDb();
  db.prepare('UPDATE items SET image_url = ?, image_source = ? WHERE id = ?').run(imageUrl, source, itemId);
}

/**
 * Enregistre toutes les images candidates trouvées pour un item (pas
 * seulement la meilleure, déjà posée sur `items.image_url` par
 * `updateItemImage`) — nécessaire pour composer un carrousel à plusieurs
 * visuels. Additif : remplace le contenu précédent de `item_images` pour cet
 * item (une nouvelle recherche invalide l'ancien classement), ne touche pas
 * `items.image_url`.
 */
export function storeItemImages(
  itemId: number,
  images: Array<{ url: string; source: string; width?: number; height?: number }>
): void {
  const db = getDb();
  const del = db.prepare('DELETE FROM item_images WHERE item_id = ?');
  const insert = db.prepare(
    'INSERT INTO item_images (item_id, url, source, rank, width, height) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction((imgs: typeof images) => {
    del.run(itemId);
    imgs.forEach((img, rank) => {
      insert.run(itemId, img.url, img.source, rank, img.width ?? null, img.height ?? null);
    });
  });
  tx(images);
}

export function getItemImages(itemId: number): Array<{ url: string; source: string; rank: number; width: number | null; height: number | null }> {
  const db = getDb();
  return db.prepare(
    'SELECT url, source, rank, width, height FROM item_images WHERE item_id = ? ORDER BY rank ASC'
  ).all(itemId) as Array<{ url: string; source: string; rank: number; width: number | null; height: number | null }>;
}

export function updateItemImagePreflight(itemId: number, verdict: string): void {
  const db = getDb();
  db.prepare('UPDATE items SET image_preflight = ? WHERE id = ?').run(verdict, itemId);
}

export function getItemById(itemId: number): (Item & { feed_name: string }) | null {
  const db = getDb();
  return db.prepare(`
    SELECT i.*, f.name as feed_name
    FROM items i
    JOIN feeds f ON i.feed_id = f.id
    WHERE i.id = ?
  `).get(itemId) as (Item & { feed_name: string }) | null;
}
