import { getDb } from './db';

export interface Partner {
  id: number;
  name: string;
  brand: string | null;
  campaign_start: string | null;
  campaign_end: string | null;
  deliverables: string | null;
  notes: string | null;
  created_at: string;
}

export interface PartnerPost {
  id: number;
  partner_id: number;
  content_id: string;
  created_at: string;
}

export interface PartnerWithStats extends Partner {
  post_count: number;
  articles: {
    id: number;
    content_id: string;
    title: string;
    chapeau: string | null;
    engagement_rate?: number;
  }[];
}

export interface PartnerReport {
  partner: Partner;
  period: { start: string; end: string };
  posts: {
    content_id: string;
    title: string;
    chapeau: string | null;
    published_at: string | null;
    engagement_rate?: number;
    reach?: number;
  }[];
  summary: {
    total_posts: number;
    avg_engagement: number;
  };
}

// CRUD Partners
export function createPartner(data: Omit<Partner, 'id' | 'created_at'>): Partner {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO partners (name, brand, campaign_start, campaign_end, deliverables, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(data.name, data.brand, data.campaign_start, data.campaign_end, data.deliverables, data.notes);
  
  return db.prepare('SELECT * FROM partners WHERE id = ?').get(result.lastInsertRowid) as Partner;
}

export function updatePartner(id: number, data: Partial<Omit<Partner, 'id' | 'created_at'>>): Partner | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM partners WHERE id = ?').get(id) as Partner | undefined;
  if (!existing) return null;

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.name !== undefined) { updates.push('name = ?'); values.push(data.name); }
  if (data.brand !== undefined) { updates.push('brand = ?'); values.push(data.brand); }
  if (data.campaign_start !== undefined) { updates.push('campaign_start = ?'); values.push(data.campaign_start); }
  if (data.campaign_end !== undefined) { updates.push('campaign_end = ?'); values.push(data.campaign_end); }
  if (data.deliverables !== undefined) { updates.push('deliverables = ?'); values.push(data.deliverables); }
  if (data.notes !== undefined) { updates.push('notes = ?'); values.push(data.notes); }

  if (updates.length === 0) return existing;

  values.push(id);
  db.prepare(`UPDATE partners SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  
  return db.prepare('SELECT * FROM partners WHERE id = ?').get(id) as Partner;
}

export function deletePartner(id: number): boolean {
  const db = getDb();
  // Delete associated posts first
  db.prepare('DELETE FROM partner_posts WHERE partner_id = ?').run(id);
  const result = db.prepare('DELETE FROM partners WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getAllPartners(): Partner[] {
  const db = getDb();
  return db.prepare('SELECT * FROM partners ORDER BY name').all() as Partner[];
}

export function getPartnerById(id: number): PartnerWithStats | null {
  const db = getDb();
  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(id) as Partner | undefined;
  if (!partner) return null;

  // Get associated articles with stats
  const articles = db.prepare(`
    SELECT a.id, a.content_id, a.title, a.chapeau, a.validated_at
    FROM articles a
    INNER JOIN partner_posts pp ON pp.content_id = a.content_id
    WHERE pp.partner_id = ?
    ORDER BY a.validated_at DESC
  `).all(id) as { id: number; content_id: string; title: string; chapeau: string | null; validated_at: string | null }[];

  // Get stats for each article
  const articlesWithStats = articles.map(article => {
    const stats = db.prepare('SELECT engagement_rate, reach FROM stats WHERE content_id = ?').get(article.content_id) as { engagement_rate: number; reach: number } | undefined;
    return {
      ...article,
      engagement_rate: stats?.engagement_rate,
      reach: stats?.reach,
    };
  });

  const post_count = db.prepare('SELECT COUNT(*) as count FROM partner_posts WHERE partner_id = ?').get(id) as { count: number };

  return {
    ...partner,
    post_count: post_count.count,
    articles: articlesWithStats,
  };
}

// CRUD Partner Posts
export function associatePost(partnerId: number, contentId: string): PartnerPost {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO partner_posts (partner_id, content_id)
    VALUES (?, ?)
  `).run(partnerId, contentId);
  
  return db.prepare('SELECT * FROM partner_posts WHERE id = ?').get(result.lastInsertRowid) as PartnerPost;
}

export function dissociatePost(partnerId: number, contentId: string): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM partner_posts WHERE partner_id = ? AND content_id = ?').run(partnerId, contentId);
  return result.changes > 0;
}

export function getAvailableArticles(): { id: number; content_id: string; title: string }[] {
  const db = getDb();
  return db.prepare(`
    SELECT a.id, a.content_id, a.title
    FROM articles a
    WHERE a.status = 'validated'
    ORDER BY a.validated_at DESC
  `).all() as { id: number; content_id: string; title: string }[];
}

// Report Generation
export function generatePartnerReport(partnerId: number): PartnerReport | null {
  const db = getDb();
  const partner = db.prepare('SELECT * FROM partners WHERE id = ?').get(partnerId) as Partner | undefined;
  if (!partner) return null;

  // Get all associated posts with article details
  const posts = db.prepare(`
    SELECT 
      a.content_id,
      a.title,
      a.chapeau,
      a.validated_at as published_at,
      s.engagement_rate,
      s.reach
    FROM articles a
    INNER JOIN partner_posts pp ON pp.content_id = a.content_id
    LEFT JOIN stats s ON s.content_id = a.content_id
    WHERE pp.partner_id = ?
    ORDER BY a.validated_at DESC
  `).all(partnerId) as {
    content_id: string;
    title: string;
    chapeau: string | null;
    published_at: string | null;
    engagement_rate: number | null;
    reach: number | null;
  }[];

  const totalEngagement = posts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0);
  const avgEngagement = posts.length > 0 ? totalEngagement / posts.length : 0;

  // Calculate period
  const dates = posts
    .filter(p => p.published_at)
    .map(p => new Date(p.published_at!));
  
  const periodStart = dates.length > 0 ? new Date(Math.min(...dates.map(d => d.getTime()))) : new Date();
  const periodEnd = dates.length > 0 ? new Date(Math.max(...dates.map(d => d.getTime()))) : new Date();

  return {
    partner,
    period: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
    },
    posts: posts.map(p => ({
      content_id: p.content_id,
      title: p.title,
      chapeau: p.chapeau,
      published_at: p.published_at,
      engagement_rate: p.engagement_rate || undefined,
      reach: p.reach || undefined,
    })),
    summary: {
      total_posts: posts.length,
      avg_engagement: Math.round(avgEngagement * 100) / 100,
    },
  };
}
