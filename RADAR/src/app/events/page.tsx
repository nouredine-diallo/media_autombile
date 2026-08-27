'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/PageHeader';
import { Badge, EmptyState, SkeletonRows } from '@/components/ui';
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClose,
  IconInbox,
  IconPlus,
  IconUrgent,
  IconUser,
} from '@/components/icons';

interface Event {
  id: number;
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
  tags: string[];
  feed_names?: string[];
}

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [tagsMap, setTagsMap] = useState<Record<number, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    try {
      const response = await fetch('/api/events');
      const data = await response.json();
      const fetchedEvents: Event[] = data.events || [];
      setEvents(fetchedEvents);

      // Les tags viennent déjà avec la liste (une seule requête, plus de
      // N appels /api/events/tags côté client).
      const newTagsMap: Record<number, string[]> = {};
      for (const e of fetchedEvents) {
        newTagsMap[e.id] = e.tags || [];
      }
      setTagsMap(newTagsMap);
    } catch {
      setError('Erreur lors du chargement des événements');
    } finally {
      setLoading(false);
    }
  };

  const handleForceUrgent = async (eventId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const isCurrentlyUrgent = events.find(ev => ev.id === eventId)?.urgent_until &&
      new Date(events.find(ev => ev.id === eventId)!.urgent_until!) > new Date();

    try {
      await fetch('/api/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, force_urgent: !isCurrentlyUrgent }),
      });

      setEvents(prev => prev.map(ev =>
        ev.id === eventId ? {
          ...ev,
          urgent_until: isCurrentlyUrgent ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        } : ev
      ));
    } catch {
      // Silent fail
    }
  };

  const handleRemoveTag = async (eventId: number, tag: string) => {
    try {
      await fetch(`/api/events/tags?event_id=${eventId}&tag=${encodeURIComponent(tag)}`, {
        method: 'DELETE',
      });
      setTagsMap(prev => ({
        ...prev,
        [eventId]: (prev[eventId] || []).filter(t => t !== tag),
      }));
    } catch {
      // Silent fail
    }
  };

  const handleAssign = async (eventId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const username = localStorage.getItem('lma-username') || 'unknown';
    const event = events.find(ev => ev.id === eventId);
    const newAssigned = event?.assigned_to === username ? null : username;

    try {
      await fetch('/api/events', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, assigned_to: newAssigned }),
      });
      setEvents(prev => prev.map(ev =>
        ev.id === eventId ? { ...ev, assigned_to: newAssigned } : ev
      ));
    } catch {}
  };

  /** Le score pilote la hiérarchie : au-delà de 60, la donnée est mise en avant. */
  const scoreTone = (score: number) => (score >= 60 ? 'accent' : 'neutral');

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Veille"
        subtitle={
          !loading && !error
            ? `${events.length} événement${events.length > 1 ? 's' : ''}`
            : undefined
        }
        back={{ href: '/', label: 'Accueil' }}
      />

      <main className="mx-auto max-w-4xl px-6 py-6">
        {/* État 1/3 — squelette à la forme du contenu attendu */}
        {loading && <SkeletonRows rows={5} height={84} />}

        {/* État 3/3 — l'erreur est dite, jamais un écran blanc */}
        {!loading && error && (
          <div className="flex items-start gap-2.5 rounded-[var(--radius-lg)] border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3">
            <IconAlert size={16} strokeWidth={2} className="mt-0.5 text-[var(--danger)]" />
            <div>
              <p className="t-label text-[var(--danger)]">{error}</p>
              <button
                onClick={() => { setLoading(true); setError(null); fetchEvents(); }}
                className="t-caption mt-1 text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
              >
                Réessayer
              </button>
            </div>
          </div>
        )}

        {/* État 2/3 — dire quoi faire */}
        {!loading && !error && events.length === 0 && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
            <EmptyState
              icon={IconInbox}
              title="Aucun événement pour le moment"
              hint="Le pipeline ingère les flux RSS toutes les 4 h. Vous pouvez aussi le déclencher depuis l'accueil."
            />
          </div>
        )}

        {!loading && !error && events.length > 0 && (
          <div className="space-y-2">
            {events.map((event) => {
              const isUrgent = event.urgent_until && new Date(event.urgent_until) > new Date();
              const tags = tagsMap[event.id] || [];

              return (
                <Link
                  key={event.id}
                  href={`/events/${event.id}`}
                  className={`group block rounded-[var(--radius-lg)] border px-4 py-3 transition-colors duration-[var(--dur)] ${
                    isUrgent
                      ? 'border-[var(--warn-border)] bg-[var(--warn-soft)]'
                      : 'border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:border-[var(--border-default)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {isUrgent && (
                          <IconUrgent size={13} strokeWidth={2.25} className="text-[var(--warn)]" />
                        )}
                        <h2 className="t-label truncate text-[var(--text-primary)]">
                          {event.title_fr || event.title}
                        </h2>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {(() => {
                        // Repli sur les deux formes renvoyées par l'API (tableau via
                        // getEventsWithItems, chaîne via GROUP_CONCAT sur le chemin filtré
                        // par assigned_to) — un seul affichage, quelle que soit la forme.
                        const names = Array.isArray(event.feed_names)
                          ? event.feed_names
                          : String(event.feed_names ?? '').split(',').filter(Boolean);
                        if (names.length === 0) return null;
                        return (
                          <span
                            className="t-caption max-w-[9rem] truncate text-[var(--text-muted)]"
                            title={names.join(', ')}
                          >
                            {names[0]}{names.length > 1 ? ` +${names.length - 1}` : ''}
                          </span>
                        );
                      })()}
                      <Badge tone={scoreTone(event.score)}>
                        <span className="font-data">{event.score}</span>
                      </Badge>
                      <button
                        onClick={(e) => handleForceUrgent(event.id, e)}
                        title={isUrgent ? "Retirer l'urgence" : "Forcer l'urgence (24 h)"}
                        aria-label={isUrgent ? "Retirer l'urgence" : "Forcer l'urgence (24 h)"}
                        className={`flex h-7 w-7 items-center justify-center rounded-[var(--radius-sm)] transition-colors duration-[var(--dur-fast)] focus-visible:opacity-100 ${
                          isUrgent
                            ? 'text-[var(--warn)] hover:bg-[var(--warn-soft)]'
                            : 'text-[var(--text-faint)] opacity-0 hover:bg-[var(--surface-hover)] hover:text-[var(--warn)] group-hover:opacity-100'
                        }`}
                      >
                        <IconUrgent size={14} strokeWidth={2} />
                      </button>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-data t-caption shrink-0 text-[var(--text-muted)]">
                        {new Date(event.first_seen_at).toLocaleDateString('fr-FR')}
                      </span>
                      {tags.length > 0 && (
                        <div className="flex min-w-0 flex-wrap items-center gap-1">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-0.5 rounded-[var(--radius-sm)] bg-[var(--surface-hover)] py-0.5 pl-1.5 pr-0.5 text-[11px] leading-4 text-[var(--text-secondary)]"
                            >
                              {tag}
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleRemoveTag(event.id, tag); }}
                                aria-label={`Retirer le tag ${tag}`}
                                className="rounded p-0.5 text-[var(--text-faint)] transition-colors hover:text-[var(--danger)]"
                              >
                                <IconClose size={10} strokeWidth={2.5} />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {event.assigned_to && (
                        <Badge tone="accent" icon={IconUser}>
                          {event.assigned_to}
                        </Badge>
                      )}
                      <button
                        onClick={(e) => handleAssign(event.id, e)}
                        title={event.assigned_to ? 'Se désassigner' : 'Prendre en charge'}
                        className={`inline-flex h-6 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-[11px] font-medium transition-colors duration-[var(--dur-fast)] focus-visible:opacity-100 ${
                          event.assigned_to
                            ? 'text-[var(--accent)] hover:bg-[var(--accent-soft)]'
                            : 'text-[var(--text-muted)] opacity-0 hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] group-hover:opacity-100'
                        }`}
                      >
                        {event.assigned_to ? (
                          <><IconCheck size={11} strokeWidth={2.5} />Pris</>
                        ) : (
                          <><IconPlus size={11} strokeWidth={2.5} />Prendre</>
                        )}
                      </button>
                      <IconArrowRight
                        size={14}
                        strokeWidth={2}
                        className="text-[var(--text-faint)] transition-colors group-hover:text-[var(--accent)]"
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
