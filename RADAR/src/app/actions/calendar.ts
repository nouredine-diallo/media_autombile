"use server";

import { createCalendarEvent } from "@/lib/calendar";
import { getDb } from "@/lib/db";

export async function scheduleArticlePublication(
  articleId: number,
  publishDate: string
): Promise<{ success: boolean; error?: string; eventId?: number }> {
  try {
    const db = getDb();
    const article = db.prepare(`
      SELECT a.id, a.title, a.content_id, a.event_id, a.validated_at,
        e.title as event_title
      FROM articles a
      JOIN events e ON a.event_id = e.id
      WHERE a.id = ? AND a.status = 'validated'
    `).get(articleId) as { id: number; title: string; content_id: string | null; event_id: number; validated_at: string; event_title: string } | undefined;

    if (!article) {
      return { success: false, error: "Article non trouvé ou non validé." };
    }

    // Check if already scheduled
    const existing = db.prepare(`
      SELECT id FROM calendar_events 
      WHERE article_id = ? AND event_type = 'publication_instagram'
    `).get(articleId);

    if (existing) {
      return { success: false, error: "Cet article est déjà planifié." };
    }

    // Validate date is in the future
    const dateObj = new Date(publishDate + "T12:00:00");
    if (isNaN(dateObj.getTime())) {
      return { success: false, error: "Date invalide." };
    }

    const event = createCalendarEvent({
      title: `Publier : ${article.title}`,
      description: `Publication Instagram — ${article.event_title}`,
      event_type: "publication_instagram",
      start_date: publishDate,
      end_date: null,
      all_day: 1,
      content_id: article.content_id,
      partner_id: null,
      article_id: article.id,
      color: "#8b5cf6",
    });

    return { success: true, eventId: event.id };
  } catch (error) {
    console.error("[scheduleArticlePublication]", error);
    return { success: false, error: "Erreur serveur." };
  }
}
