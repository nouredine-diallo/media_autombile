"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/ui";
import { IconAnalytics } from "@/components/icons";

interface AnalyticsData {
  totals: { page_views: number; actions: number; sessions: number };
  topPages: { page: string; count: number }[];
  topActions: { label: string; count: number }[];
  byUser: { user_name: string; count: number }[];
  dailyActivity: { day: string; count: number }[];
}

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.max(4, (count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="t-caption w-40 shrink-0 truncate text-[var(--text-secondary)]" title={label}>
        {label}
      </span>
      <div className="h-5 flex-1 overflow-hidden rounded-[var(--radius-sm)] bg-[var(--surface-sunken)]">
        <div
          className="h-full rounded-[var(--radius-sm)] bg-[var(--accent)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-data t-caption w-8 shrink-0 text-right text-[var(--text-primary)]">
        {count}
      </span>
    </div>
  );
}

/**
 * Heatmap calendrier (style GitHub) en CSS pur — pas de bibliothèque de
 * graphiques ajoutée pour ça. Un pixel-mouse-heatmap (type Hotjar) serait
 * disproportionné pour un outil interne de 5-10 personnes ; ce format
 * répond au même besoin ("où/quand l'activité a-t-elle lieu") avec un coût
 * d'implémentation minimal.
 */
function ActivityHeatmap({ data }: { data: { day: string; count: number }[] }) {
  const byDay = new Map(data.map((d) => [d.day, d.count]));
  const max = Math.max(1, ...data.map((d) => d.count));
  const days: string[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  function shade(count: number): string {
    if (count === 0) return "var(--surface-sunken)";
    const intensity = Math.min(1, count / max);
    if (intensity < 0.25) return "var(--accent-soft)";
    if (intensity < 0.5) return "rgba(202, 62, 62, 0.35)";
    if (intensity < 0.75) return "rgba(202, 62, 62, 0.6)";
    return "var(--accent)";
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {days.map((day) => {
        const count = byDay.get(day) ?? 0;
        return (
          <div
            key={day}
            title={`${day} — ${count} action${count > 1 ? "s" : ""}`}
            className="h-6 w-6 rounded-[var(--radius-sm)] border border-[var(--border-subtle)]"
            style={{ background: shade(count) }}
          />
        );
      })}
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    fetch("/api/analytics")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => json?.success && setData(json))
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <div className="min-h-screen">
        <PageHeader title="Usage de l'outil" back={{ href: "/", label: "Accueil" }} />
        <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
          <div className="skeleton h-40 rounded-[var(--radius-lg)]" aria-hidden />
        </main>
      </div>
    );
  }

  const maxPage = Math.max(1, ...data.topPages.map((p) => p.count));
  const maxAction = Math.max(1, ...data.topActions.map((a) => a.count));
  const maxUser = Math.max(1, ...data.byUser.map((u) => u.count));

  const nothingYet = data.totals.page_views === 0 && data.totals.actions === 0;

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Usage de l'outil"
        subtitle="Suivi interne — jamais envoyé à un tiers"
        back={{ href: "/", label: "Accueil" }}
      />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {nothingYet ? (
          <EmptyState
            icon={IconAnalytics}
            title="Rien à afficher pour l'instant"
            hint="Les pages visitées et les actions clés (générer, valider…) apparaîtront ici au fil de l'usage réel de l'équipe."
          />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                <div className="font-data text-2xl font-semibold text-[var(--text-primary)]">
                  {data.totals.page_views}
                </div>
                <div className="t-caption text-[var(--text-muted)]">Pages vues</div>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                <div className="font-data text-2xl font-semibold text-[var(--text-primary)]">
                  {data.totals.actions}
                </div>
                <div className="t-caption text-[var(--text-muted)]">Actions clés</div>
              </div>
              <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                <div className="font-data text-2xl font-semibold text-[var(--text-primary)]">
                  {data.totals.sessions}
                </div>
                <div className="t-caption text-[var(--text-muted)]">Sessions</div>
              </div>
            </div>

            <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
              <h2 className="t-label mb-3 text-[var(--text-primary)]">Activité — 30 derniers jours</h2>
              <ActivityHeatmap data={data.dailyActivity} />
            </section>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                <h2 className="t-label mb-3 text-[var(--text-primary)]">Pages les plus visitées</h2>
                {data.topPages.length === 0 ? (
                  <p className="t-caption text-[var(--text-muted)]">Aucune donnée.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.topPages.map((p) => (
                      <Bar key={p.page} label={p.page} count={p.count} max={maxPage} />
                    ))}
                  </div>
                )}
              </section>

              <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
                <h2 className="t-label mb-3 text-[var(--text-primary)]">Actions les plus utilisées</h2>
                {data.topActions.length === 0 ? (
                  <p className="t-caption text-[var(--text-muted)]">
                    Aucune action suivie pour l&apos;instant — générer un brief, un article, ou valider en produira.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {data.topActions.map((a) => (
                      <Bar key={a.label} label={a.label} count={a.count} max={maxAction} />
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4">
              <h2 className="t-label mb-3 text-[var(--text-primary)]">Activité par membre de l&apos;équipe</h2>
              <div className="flex flex-col gap-2">
                {data.byUser.map((u) => (
                  <Bar key={u.user_name} label={u.user_name} count={u.count} max={maxUser} />
                ))}
              </div>
            </section>

            <p className="t-caption text-[var(--text-muted)]">
              Suivi léger (pages vues + actions clés) — pas de pistage pixel par pixel. Utile pour voir ce qui est
              réellement utilisé et où l&apos;équipe a besoin d&apos;aide, pas pour surveiller qui que ce soit individuellement.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
