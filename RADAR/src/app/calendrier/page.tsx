'use client';

import { useState, useEffect, useCallback } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui';
import { ConfirmButton } from '@/components/ConfirmButton';
import { IconPartners, IconPlus, IconRefresh } from '@/components/icons';

interface CalendarEvent {
  id: number;
  title: string;
  description: string | null;
  event_type: string;
  start_date: string;
  end_date: string | null;
  all_day: number;
  content_id: string | null;
  partner_id: number | null;
  article_id: number | null;
  color: string;
  partner_name?: string;
  article_title?: string;
  type_label: string;
  type_color: string;
}

const EVENT_TYPES = [
  { value: 'deadline_article', label: 'Deadline article', color: '#F87171' },
  { value: 'publication_instagram', label: 'Publication Instagram', color: '#A78BFA' },
  { value: 'envoi_rapport', label: 'Envoi rapport', color: '#3B82F6' },
  { value: 'campagne_partenaire', label: 'Campagne partenaire', color: '#4ADE80' },
  { value: 'autre', label: 'Autre', color: '#64748B' },
];

function getWeekDates(date: Date = new Date()): { start: string; end: string; dates: string[] } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);

  const monday = new Date(d);
  monday.setDate(diff);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const curr = new Date(monday);
    curr.setDate(monday.getDate() + i);
    dates.push(curr.toISOString().split('T')[0]);
  }

  return { start: dates[0], end: dates[6], dates };
}

function getDayName(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  return days[date.getDay()];
}

function getShortDayName(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  return days[date.getDay()];
}

function formatDateDisplay(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00');
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function isToday(dateStr: string): boolean {
  return dateStr === new Date().toISOString().split('T')[0];
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [showForm, setShowForm] = useState(false);
  const [draggedEvent, setDraggedEvent] = useState<CalendarEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    event_type: 'autre',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    all_day: true,
    color: '#7E8CA0',
  });

  const weekDates = getWeekDates(currentWeek);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/calendar?start=${weekDates.start}&end=${weekDates.end}`);
      const data = await response.json();

      if (!data.success) throw new Error(data.error);
      setEvents(data.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, [weekDates.start, weekDates.end]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const handlePrevWeek = () => {
    const prev = new Date(currentWeek);
    prev.setDate(prev.getDate() - 7);
    setCurrentWeek(prev);
  };

  const handleNextWeek = () => {
    const next = new Date(currentWeek);
    next.setDate(next.getDate() + 7);
    setCurrentWeek(next);
  };

  const handleToday = () => {
    setCurrentWeek(new Date());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const response = await fetch('/api/calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setShowForm(false);
      setFormData({
        title: '',
        description: '',
        event_type: 'autre',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        all_day: true,
        color: '#7E8CA0',
      });
      fetchEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  const handleDragStart = (event: CalendarEvent) => {
    setDraggedEvent(event);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (date: string) => {
    if (!draggedEvent) return;

    try {
      const response = await fetch(`/api/calendar?id=${draggedEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_date: date }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      setDraggedEvent(null);
      fetchEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const response = await fetch(`/api/calendar?id=${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      fetchEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  const handleGenerateDeadlines = async () => {
    try {
      const response = await fetch('/api/calendar?generate=deadlines');
      const data = await response.json();
      if (!data.success) throw new Error(data.error);
      fetchEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    }
  };

  // Group events by date
  const eventsByDate: Record<string, CalendarEvent[]> = {};
  for (const date of weekDates.dates) {
    eventsByDate[date] = [];
  }

  for (const event of events) {
    if (eventsByDate[event.start_date]) {
      eventsByDate[event.start_date].push(event);
    }
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Calendrier"
        back={{ href: '/', label: 'Accueil' }}
        actions={
          <>
            <Button onClick={handleGenerateDeadlines} variant="secondary">
              <IconRefresh size={13} strokeWidth={2} />
              Générer deadlines
            </Button>
            <Button onClick={() => setShowForm(true)} variant="primary">
              <IconPlus size={13} strokeWidth={2.5} />
              Ajouter
            </Button>
          </>
        }
      />
      <div className="mx-auto max-w-7xl px-6 py-6">
        {/* Week Navigation */}
        <div className="flex items-center justify-between mb-6 bg-[var(--surface-raised)] rounded-xl border border-[var(--border-subtle)] p-4">
          <button
            onClick={handlePrevWeek}
            className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-base)]"
          >
            ← Semaine précédente
          </button>
          <div className="text-center">
            <div className="font-semibold text-[var(--text-primary)]">
              {formatDateDisplay(weekDates.start)} — {formatDateDisplay(weekDates.end)}
            </div>
            <button
              onClick={handleToday}
              className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] mt-1"
            >
              Aujourd'hui
            </button>
          </div>
          <button
            onClick={handleNextWeek}
            className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-base)]"
          >
            Semaine suivante →
          </button>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-soft)] p-4 text-[var(--danger)] text-sm">
            {error}
          </div>
        )}

        {/* Calendar Grid — 7 colonnes fixes ne peuvent pas tenir sur un
            téléphone sans devenir illisibles (colonnes de ~40px). Plutôt que
            de casser la vue semaine, le défilement horizontal est contenu
            dans ce wrapper (2026-08-29) : la page elle-même ne défile jamais
            de côté, seule cette bande le fait — motif standard des vues
            calendrier sur mobile (glisser pour voir les jours suivants). */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="grid min-w-[640px] grid-cols-7 gap-2">
          {/* Day Headers */}
          {weekDates.dates.map((date) => (
            <div
              key={date}
              className={`text-center p-3 rounded-lg ${isToday(date) ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-raised)] border border-[var(--border-subtle)]'}`}
            >
              <div className="text-xs font-medium uppercase">
                {getShortDayName(date)}
              </div>
              <div className={`text-lg font-bold ${isToday(date) ? 'text-white' : 'text-[var(--text-primary)]'}`}>
                {new Date(date + 'T12:00:00').getDate()}
              </div>
            </div>
          ))}

          {/* Day Columns */}
          {weekDates.dates.map((date) => (
            <div
              key={date}
              className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-lg min-h-[200px] p-2"
              onDragOver={handleDragOver}
              onDrop={() => handleDrop(date)}
            >
              {eventsByDate[date]?.map((event) => (
                <div
                  key={event.id}
                  draggable
                  onDragStart={() => handleDragStart(event)}
                  className="mb-2 p-2 rounded-lg text-sm cursor-move border-l-4 hover:shadow-md transition-shadow"
                  style={{
                    backgroundColor: `${event.type_color}10`,
                    borderLeftColor: event.type_color,
                  }}
                >
                  <div className="font-medium text-[var(--text-primary)] line-clamp-2">
                    {event.title}
                  </div>
                  {event.partner_name && (
                    <div className="t-caption mt-1 flex items-center gap-1 text-[var(--text-muted)]">
                      <IconPartners size={11} strokeWidth={2} />
                      {event.partner_name}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: `${event.type_color}20`,
                        color: event.type_color,
                      }}
                    >
                      {event.type_label}
                    </span>
                    <ConfirmButton
                      onConfirm={() => handleDelete(event.id)}
                      confirmLabel="Oui"
                      className="text-xs text-[var(--text-muted)] hover:text-[var(--danger)]"
                      confirmClassName="text-xs text-[var(--danger)] font-medium"
                    >
                      ×
                    </ConfirmButton>
                  </div>
                </div>
              ))}

              {eventsByDate[date]?.length === 0 && (
                <div className="text-xs text-[var(--text-muted)] text-center mt-8">
                  Aucun événement
                </div>
              )}
            </div>
          ))}
        </div>
        </div>

        {/* Legend */}
        <div className="mt-6 flex flex-wrap gap-4 justify-center">
          {EVENT_TYPES.map((type) => (
            <div key={type.value} className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: type.color }}
              />
              {type.label}
            </div>
          ))}
        </div>

        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] rounded-xl p-6 w-full max-w-md">
              <h2 className="text-lg font-semibold mb-4 text-[var(--text-primary)]">Nouvel événement</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Titre *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Type</label>
                  <select
                    value={formData.event_type}
                    onChange={(e) => setFormData({ ...formData, event_type: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  >
                    {EVENT_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Date *</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-base)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    rows={2}
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
                  >
                    Créer
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 rounded-lg border border-[var(--border-subtle)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-base)]"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
