import { getDb } from './db';
import Papa from 'papaparse';

export interface InstagramPost {
  id: string;
  content_id?: string;
  post_url: string;
  caption: string;
  timestamp: string;
  format: 'image' | 'video' | 'carousel' | 'unknown';
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  impressions: number;
  engagement_rate: number;
  save_rate: number;
  share_rate: number;
}

export interface StatsSummary {
  total_posts: number;
  avg_engagement_rate: number;
  avg_save_rate: number;
  avg_share_rate: number;
  best_post: InstagramPost | null;
  worst_post: InstagramPost | null;
  by_format: {
    format: string;
    count: number;
    avg_engagement: number;
    avg_saves: number;
  }[];
  trends: string[];
}

// Instagram CSV column mapping
const COLUMN_MAP: Record<string, keyof InstagramPost> = {
  'Post ID': 'id',
  'post id': 'id',
  'Post URL': 'post_url',
  'post url': 'post_url',
  'Caption': 'caption',
  'caption': 'caption',
  'Timestamp': 'timestamp',
  'timestamp': 'timestamp',
  'Date': 'timestamp',
  'date': 'timestamp',
  'Type': 'format',
  'type': 'format',
  'Format': 'format',
  'format': 'format',
  'Media Type': 'format',
  'Likes': 'likes',
  'likes': 'likes',
  'Comments': 'comments',
  'comments': 'comments',
  'Shares': 'shares',
  'shares': 'shares',
  'Saves': 'saves',
  'saves': 'saves',
  'Reach': 'reach',
  'reach': 'reach',
  'Impressions': 'impressions',
  'impressions': 'impressions',
};

function mapFormat(raw: string): InstagramPost['format'] {
  const lower = raw.toLowerCase();
  if (lower.includes('image') || lower.includes('photo')) return 'image';
  if (lower.includes('video') || lower.includes('reel')) return 'video';
  if (lower.includes('carrousel') || lower.includes('carousel')) return 'carousel';
  return 'unknown';
}

function mapColumns(row: Record<string, string>): InstagramPost {
  const mapped: Record<string, string> = {};
  for (const [key, value] of Object.entries(row)) {
    const mappedKey = COLUMN_MAP[key] || key;
    mapped[mappedKey] = value;
  }

  const likes = parseInt(mapped.likes || '0') || 0;
  const comments = parseInt(mapped.comments || '0') || 0;
  const shares = parseInt(mapped.shares || '0') || 0;
  const saves = parseInt(mapped.saves || '0') || 0;
  const reach = parseInt(mapped.reach || '0') || 0;
  const impressions = parseInt(mapped.impressions || '0') || 0;

  // Calcul des ratios (formules documentées, jamais devinées)
  const totalInteractions = likes + comments + shares + saves;
  const engagement_rate = reach > 0 ? (totalInteractions / reach) * 100 : 0;
  const save_rate = reach > 0 ? (saves / reach) * 100 : 0;
  const share_rate = reach > 0 ? (shares / reach) * 100 : 0;

  return {
    id: mapped.id || `import-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    content_id: mapped.content_id || undefined,
    post_url: mapped.post_url || '',
    caption: mapped.caption || '',
    timestamp: mapped.timestamp || new Date().toISOString(),
    format: mapFormat(mapped.format || 'unknown'),
    likes,
    comments,
    shares,
    saves,
    reach,
    impressions,
    engagement_rate: Math.round(engagement_rate * 100) / 100,
    save_rate: Math.round(save_rate * 100) / 100,
    share_rate: Math.round(share_rate * 100) / 100,
  };
}

export function parseInstagramCSV(csvContent: string): InstagramPost[] {
  const result = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header: string) => header.trim(),
  });

  if (result.errors.length > 0) {
    console.warn('CSV parsing warnings:', result.errors);
  }

  return (result.data as Record<string, string>[]).map(mapColumns);
}

export function storeStats(posts: InstagramPost[], filename: string): number {
  const db = getDb();
  
  // Create stats table if not exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS stats (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      post_url TEXT,
      caption TEXT,
      timestamp TEXT,
      format TEXT,
      likes INTEGER,
      comments INTEGER,
      shares INTEGER,
      saves INTEGER,
      reach INTEGER,
      impressions INTEGER,
      engagement_rate REAL,
      save_rate REAL,
      share_rate REAL,
      imported_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const insert = db.prepare(`
    INSERT OR REPLACE INTO stats 
    (id, content_id, post_url, caption, timestamp, format, likes, comments, shares, saves, reach, impressions, engagement_rate, save_rate, share_rate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((posts: InstagramPost[]) => {
    for (const post of posts) {
      insert.run(
        post.id, post.content_id, post.post_url, post.caption, post.timestamp,
        post.format, post.likes, post.comments, post.shares, post.saves,
        post.reach, post.impressions, post.engagement_rate, post.save_rate, post.share_rate
      );
    }
  });

  insertMany(posts);
  return posts.length;
}

export function getStatsSummary(): StatsSummary {
  const db = getDb();
  
  // Ensure stats table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS stats (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      post_url TEXT,
      caption TEXT,
      timestamp TEXT,
      format TEXT,
      likes INTEGER,
      comments INTEGER,
      shares INTEGER,
      saves INTEGER,
      reach INTEGER,
      impressions INTEGER,
      engagement_rate REAL,
      save_rate REAL,
      share_rate REAL,
      imported_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const posts = db.prepare('SELECT * FROM stats ORDER BY timestamp DESC').all() as InstagramPost[];
  
  if (posts.length === 0) {
    return {
      total_posts: 0,
      avg_engagement_rate: 0,
      avg_save_rate: 0,
      avg_share_rate: 0,
      best_post: null,
      worst_post: null,
      by_format: [],
      trends: [],
    };
  }

  // Calculate averages
  const avg_engagement = posts.reduce((sum, p) => sum + p.engagement_rate, 0) / posts.length;
  const avg_save = posts.reduce((sum, p) => sum + p.save_rate, 0) / posts.length;
  const avg_share = posts.reduce((sum, p) => sum + p.share_rate, 0) / posts.length;

  // Best and worst by engagement
  const sorted = [...posts].sort((a, b) => b.engagement_rate - a.engagement_rate);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  // By format
  const formatGroups = new Map<string, InstagramPost[]>();
  for (const post of posts) {
    const format = post.format || 'unknown';
    if (!formatGroups.has(format)) formatGroups.set(format, []);
    formatGroups.get(format)!.push(post);
  }

  const by_format = Array.from(formatGroups.entries()).map(([format, group]) => ({
    format,
    count: group.length,
    avg_engagement: group.reduce((sum, p) => sum + p.engagement_rate, 0) / group.length,
    avg_saves: group.reduce((sum, p) => sum + p.save_rate, 0) / group.length,
  }));

  // Generate trends using templates (jamais LLM)
  const trends: string[] = [];
  
  if (by_format.length >= 2) {
    const bestFormat = by_format.reduce((a, b) => a.avg_engagement > b.avg_engagement ? a : b);
    const worstFormat = by_format.reduce((a, b) => a.avg_engagement < b.avg_engagement ? a : b);
    const diff = bestFormat.avg_engagement - worstFormat.avg_engagement;
    if (diff > 0.5) {
      trends.push(`Les posts au format ${bestFormat.format} font en moyenne ${diff.toFixed(1)}% d'engagement de plus que les posts au format ${worstFormat.format}.`);
    }
  }

  if (best && best.engagement_rate > avg_engagement * 1.5) {
    trends.push(`Votre meilleur post (${best.engagement_rate.toFixed(1)}% d'engagement) surpasse la moyenne de ${(best.engagement_rate - avg_engagement).toFixed(1)} points.`);
  }

  if (posts.length >= 7) {
    const recent = posts.slice(0, Math.ceil(posts.length / 2));
    const older = posts.slice(Math.ceil(posts.length / 2));
    const recentAvg = recent.reduce((sum, p) => sum + p.engagement_rate, 0) / recent.length;
    const olderAvg = older.reduce((sum, p) => sum + p.engagement_rate, 0) / older.length;
    const diff = recentAvg - olderAvg;
    if (Math.abs(diff) > 0.5) {
      const direction = diff > 0 ? 'augmenté' : 'diminué';
      trends.push(`L'engagement a ${direction} de ${Math.abs(diff).toFixed(1)}% entre la première et la seconde moitié de la période.`);
    }
  }

  return {
    total_posts: posts.length,
    avg_engagement_rate: Math.round(avg_engagement * 100) / 100,
    avg_save_rate: Math.round(avg_save * 100) / 100,
    avg_share_rate: Math.round(avg_share * 100) / 100,
    best_post: best,
    worst_post: worst,
    by_format,
    trends,
  };
}

export function getAllStats(): InstagramPost[] {
  const db = getDb();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS stats (
      id TEXT PRIMARY KEY,
      content_id TEXT,
      post_url TEXT,
      caption TEXT,
      timestamp TEXT,
      format TEXT,
      likes INTEGER,
      comments INTEGER,
      shares INTEGER,
      saves INTEGER,
      reach INTEGER,
      impressions INTEGER,
      engagement_rate REAL,
      save_rate REAL,
      share_rate REAL,
      imported_at TEXT DEFAULT (datetime('now'))
    )
  `);

  return db.prepare('SELECT * FROM stats ORDER BY timestamp DESC').all() as InstagramPost[];
}
