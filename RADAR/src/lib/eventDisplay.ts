/**
 * Return the French title/summary for an event, falling back to the original.
 */
export function getEventTitleFr(event: { title: string; title_fr?: string | null }): string {
  return event.title_fr || event.title;
}

export function getEventSummaryFr(event: { summary?: string | null; summary_fr?: string | null }): string {
  return event.summary_fr || event.summary || '';
}
