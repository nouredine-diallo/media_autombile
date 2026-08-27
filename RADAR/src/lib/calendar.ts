import { getDb } from './db';

export interface CalendarEvent {
  id: number;
  title: string;
  description: string | null;
  event_type: 'deadline_article' | 'publication_instagram' | 'envoi_rapport' | 'campagne_partenaire' | 'autre';
  start_date: string;
  end_date: string | null;
  all_day: number;
  content_id: string | null;
  partner_id: number | null;
  article_id: number | null;
  color: string | null;
  created_at: string;
  // Joined fields
  partner_name?: string;
  article_title?: string;
}

export interface CalendarEventWithType extends CalendarEvent {
  type_label: string;
  type_color: string;
}

// Event type colors and labels
export const EVENT_TYPES: Record<string, { label: string; color: string }> = {
  deadline_article: { label: 'Deadline article', color: '#ef4444' },
  publication_instagram: { label: 'Publication Instagram', color: '#8b5cf6' },
  envoi_rapport: { label: 'Envoi rapport', color: '#3b82f6' },
  campagne_partenaire: { label: 'Campagne partenaire', color: '#10b981' },
  autre: { label: 'Autre', color: '#6b7280' },
};

// CRUD Calendar Events
export function createCalendarEvent(data: Omit<CalendarEvent, 'id' | 'created_at'>): CalendarEvent {
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO calendar_events (title, description, event_type, start_date, end_date, all_day, content_id, partner_id, article_id, color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.title,
    data.description ?? null,
    data.event_type,
    data.start_date,
    data.end_date ?? null,
    data.all_day ?? 1,
    data.content_id ?? null,
    data.partner_id ?? null,
    data.article_id ?? null,
    data.color ?? null
  );

  return db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(result.lastInsertRowid) as CalendarEvent;
}

export function updateCalendarEvent(id: number, data: Partial<Omit<CalendarEvent, 'id' | 'created_at'>>): CalendarEvent | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id) as CalendarEvent | undefined;
  if (!existing) return null;

  const updates: string[] = [];
  const values: (string | number | null)[] = [];

  if (data.title !== undefined) { updates.push('title = ?'); values.push(data.title); }
  if (data.description !== undefined) { updates.push('description = ?'); values.push(data.description); }
  if (data.event_type !== undefined) { updates.push('event_type = ?'); values.push(data.event_type); }
  if (data.start_date !== undefined) { updates.push('start_date = ?'); values.push(data.start_date); }
  if (data.end_date !== undefined) { updates.push('end_date = ?'); values.push(data.end_date); }
  if (data.all_day !== undefined) { updates.push('all_day = ?'); values.push(data.all_day); }
  if (data.content_id !== undefined) { updates.push('content_id = ?'); values.push(data.content_id); }
  if (data.partner_id !== undefined) { updates.push('partner_id = ?'); values.push(data.partner_id); }
  if (data.article_id !== undefined) { updates.push('article_id = ?'); values.push(data.article_id); }
  if (data.color !== undefined) { updates.push('color = ?'); values.push(data.color); }

  if (updates.length === 0) return existing;

  values.push(id);
  db.prepare(`UPDATE calendar_events SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  return db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id) as CalendarEvent;
}

export function deleteCalendarEvent(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM calendar_events WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getCalendarEventById(id: number): CalendarEventWithType | null {
  const db = getDb();
  const event = db.prepare(`
    SELECT ce.*, 
           p.name as partner_name,
           a.title as article_title
    FROM calendar_events ce
    LEFT JOIN partners p ON ce.partner_id = p.id
    LEFT JOIN articles a ON ce.article_id = a.id
    WHERE ce.id = ?
  `).get(id) as CalendarEvent | undefined;
  
  if (!event) return null;
  
  return enrichEventType(event);
}

// Get events for a date range (for weekly view)
export function getCalendarEvents(startDate: string, endDate: string): CalendarEventWithType[] {
  const db = getDb();
  
  const events = db.prepare(`
    SELECT ce.*, 
           p.name as partner_name,
           a.title as article_title
    FROM calendar_events ce
    LEFT JOIN partners p ON ce.partner_id = p.id
    LEFT JOIN articles a ON ce.article_id = a.id
    WHERE (ce.start_date <= ? AND (ce.end_date >= ? OR ce.end_date IS NULL))
    ORDER BY ce.start_date ASC
  `).all(endDate, startDate) as CalendarEvent[];

  // Also get partner campaigns that overlap with the range
  const partnerCampaigns = db.prepare(`
    SELECT 
      p.id as partner_id,
      p.name as partner_name,
      p.brand,
      p.campaign_start,
      p.campaign_end
    FROM partners p
    WHERE p.campaign_start IS NOT NULL 
      AND p.campaign_start <= ?
      AND (p.campaign_end >= ? OR p.campaign_end IS NULL)
  `).all(endDate, startDate) as { partner_id: number; partner_name: string; brand: string | null; campaign_start: string; campaign_end: string | null }[];

  // Convert partner campaigns to calendar events
  for (const campaign of partnerCampaigns) {
    events.push({
      id: -campaign.partner_id, // Negative ID to distinguish from regular events
      title: `${campaign.partner_name}${campaign.brand ? ` — ${campaign.brand}` : ''}`,
      description: 'Campagne partenaire',
      event_type: 'campagne_partenaire',
      start_date: campaign.campaign_start,
      end_date: campaign.campaign_end,
      all_day: 1,
      content_id: null,
      partner_id: campaign.partner_id,
      article_id: null,
      color: EVENT_TYPES.campagne_partenaire.color,
      created_at: '',
      partner_name: campaign.partner_name,
    });
  }

  return events.map(enrichEventType).sort((a, b) => a.start_date.localeCompare(b.start_date));
}

// Get all events (for full calendar)
export function getAllCalendarEvents(): CalendarEventWithType[] {
  const db = getDb();
  
  const events = db.prepare(`
    SELECT ce.*, 
           p.name as partner_name,
           a.title as article_title
    FROM calendar_events ce
    LEFT JOIN partners p ON ce.partner_id = p.id
    LEFT JOIN articles a ON ce.article_id = a.id
    ORDER BY ce.start_date ASC
  `).all() as CalendarEvent[];

  // Get all partner campaigns
  const partnerCampaigns = db.prepare(`
    SELECT 
      p.id as partner_id,
      p.name as partner_name,
      p.brand,
      p.campaign_start,
      p.campaign_end
    FROM partners p
    WHERE p.campaign_start IS NOT NULL
  `).all() as { partner_id: number; partner_name: string; brand: string | null; campaign_start: string; campaign_end: string | null }[];

  // Convert partner campaigns to calendar events
  for (const campaign of partnerCampaigns) {
    events.push({
      id: -campaign.partner_id,
      title: `${campaign.partner_name}${campaign.brand ? ` — ${campaign.brand}` : ''}`,
      description: 'Campagne partenaire',
      event_type: 'campagne_partenaire',
      start_date: campaign.campaign_start,
      end_date: campaign.campaign_end,
      all_day: 1,
      content_id: null,
      partner_id: campaign.partner_id,
      article_id: null,
      color: EVENT_TYPES.campagne_partenaire.color,
      created_at: '',
      partner_name: campaign.partner_name,
    });
  }

  return events.map(enrichEventType).sort((a, b) => a.start_date.localeCompare(b.start_date));
}

// Helper: enrich event with type info
function enrichEventType(event: CalendarEvent): CalendarEventWithType {
  const typeInfo = EVENT_TYPES[event.event_type] || EVENT_TYPES.autre;
  return {
    ...event,
    type_label: typeInfo.label,
    type_color: event.color || typeInfo.color,
  };
}

// Auto-generate calendar events from articles
export function generateArticleDeadlines(): number {
  const db = getDb();
  
  // Get validated articles without calendar events
  const articles = db.prepare(`
    SELECT a.id, a.title, a.content_id, a.validated_at
    FROM articles a
    WHERE a.status = 'validated'
      AND NOT EXISTS (
        SELECT 1 FROM calendar_events ce 
        WHERE ce.article_id = a.id 
        AND ce.event_type = 'publication_instagram'
      )
  `).all() as { id: number; title: string; content_id: string | null; validated_at: string | null }[];

  let count = 0;
  
  for (const article of articles) {
    // Schedule publication for 3 days after validation
    const publishDate = article.validated_at 
      ? new Date(new Date(article.validated_at).getTime() + 3 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

    createCalendarEvent({
      title: `Publier: ${article.title}`,
      description: `Publication Instagram pour l'article ${article.content_id || article.id}`,
      event_type: 'publication_instagram',
      start_date: publishDate.toISOString().split('T')[0],
      end_date: null,
      all_day: 1,
      content_id: article.content_id,
      partner_id: null,
      article_id: article.id,
      color: EVENT_TYPES.publication_instagram.color,
    });
    
    count++;
  }

  return count;
}

// Get week dates (Monday to Sunday)
export function getWeekDates(date: Date = new Date()): { start: string; end: string; dates: string[] } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday

  const monday = new Date(d);
  monday.setDate(diff);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const curr = new Date(monday);
    curr.setDate(monday.getDate() + i);
    dates.push(curr.toISOString().split('T')[0]);
  }

  return {
    start: dates[0],
    end: dates[6],
    dates,
  };
}

// Get day name in French
export function getDayName(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return days[date.getDay()];
}

// Get short day name
export function getShortDayName(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return days[date.getDay()];
}

// Format date for display
export function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
