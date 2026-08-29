import Link from "next/link";
import { getDashboardAgenda } from "@/lib/db";
import { HomeShortcuts } from "@/components/HomeShortcuts";
import { ViewToggle } from "@/components/ViewToggle";
import { PipelineStatusIndicator } from "@/components/PipelineStatus";
import { DriveStatusBadge } from "@/components/DriveStatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { buildStudioLink, getStudioUrl } from "@/lib/studio-prefill";
import { getEventTitleFr } from "@/lib/eventDisplay";
import { EVENT_TYPES } from "@/lib/calendar";
import {
  Badge,
  ButtonLink,
  EmptyState,
  SectionHeader,
  StatTile,
  Thumb,
} from "@/components/ui";
import { Mascot } from "@/components/assistant/Mascot";
import {
  IconAlert,
  IconArrowRight,
  IconCalendar,
  IconCheck,
  IconClock,
  IconGenerate,
  IconImageOff,
  IconInbox,
  IconPenLine,
  IconStudio,
  IconUrgent,
  IconUser,
  IconWarning,
} from "@/components/icons";

/** "aujourd'hui" / "demain" / date courte — plus lisible qu'une date brute en coup d'œil. */
function relativeDayLabel(dateStr: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (diffDays === 0) return "aujourd'hui";
  if (diffDays === 1) return "demain";
  return target.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Ligne de liste : une hauteur, un alignement, partout la même. */
function Row({
  children,
  href,
  external,
  tone,
}: {
  children: React.ReactNode;
  href?: string;
  external?: boolean;
  tone?: "urgent";
}) {
  const cls = `flex items-center gap-3 rounded-[var(--radius-lg)] border px-3.5 py-3 transition-colors duration-[var(--dur)] ${
    tone === "urgent"
      ? "border-[var(--warn-border)] bg-[var(--warn-soft)] hover:bg-[color-mix(in_srgb,var(--warn-soft)_60%,var(--surface-hover))]"
      : "border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:border-[var(--border-default)] hover:bg-[var(--surface-hover)]"
  }`;

  if (!href) return <div className={cls}>{children}</div>;
  if (external)
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export default async function Home() {
  const {
    urgent,
    inProgress,
    hiddenInProgressCount,
    ready,
    partnerTasks,
    calendarUpcoming,
    morningAutoGen,
    correctionsCount,
    correctionsThreshold,
    counters,
  } = getDashboardAgenda();

  const correctionsThresholdReached = correctionsCount >= correctionsThreshold;
  const hasEcheances =
    calendarUpcoming.length > 0 || correctionsThresholdReached || partnerTasks.length > 0;

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const nothingToDo =
    urgent.length === 0 &&
    inProgress.length === 0 &&
    ready.length === 0 &&
    !hasEcheances;

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Aujourd'hui"
        subtitle={today}
        actions={
          <>
            <ButtonLink
              href={getStudioUrl()}
              external
              variant="studio"
              title="Post sans actualité liée — non traçable, non associable à un partenaire. Pour un post lié à une actualité, passe par sa fiche événement."
            >
              <IconStudio size={13} strokeWidth={1.75} />
              Ouvrir STUDIO (sans lien)
            </ButtonLink>
            <ViewToggle />
          </>
        }
      />

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
        {/* Coup d'œil en 30 secondes — la Direction s'arrête ici.
            grid-cols-1 sur mobile (2026-08-29) : en grid-cols-3 fixe, les 3
            tuiles s'écrasaient sur un téléphone au point de rendre le
            contenu illisible — jamais vérifié sur un vrai petit écran avant. */}
        <div className="mb-5 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <StatTile
            value={counters.totalEvents}
            label="Événements suivis"
            href="/events"
          />
          <StatTile
            value={counters.drafts}
            label="En rédaction"
            href="/events"
            tone={counters.drafts > 0 ? "info" : "neutral"}
          />
          <StatTile
            value={counters.validated}
            label="Validés"
            href="/ready"
            tone={counters.validated > 0 ? "success" : "neutral"}
            primary={counters.validated > 0}
          />
        </div>

        {/* flex-col sur mobile (2026-08-29) : en flex-row fixe, DriveStatusBadge
            écrasait la largeur disponible pour PipelineStatusIndicator au point
            de faire retomber son texte en un mot par ligne. */}
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <PipelineStatusIndicator />
          </div>
          <DriveStatusBadge />
        </div>

        {/* Brouillons du matin — rend visible ce que le cron produit déjà en
            arrière-plan (chantier 3). Sans cette section, un brouillon
            'draft' généré à 8h est invisible : "En production" n'affiche
            que les événements SANS article, "Articles validés" exige
            status='validated'. */}
        {morningAutoGen && (
          <section className="mb-6">
            <div className="mb-2.5 flex items-center gap-2">
              <IconGenerate size={14} strokeWidth={2} className="text-[var(--accent)]" />
              <h2 className="t-eyebrow">Brouillons du matin</h2>
              <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium leading-5 text-[var(--accent)]">
                <IconGenerate size={11} strokeWidth={2} />
                GÉNÉRÉ PAR L&apos;IA
              </span>
              <div className="ml-auto flex items-center gap-2">
                {morningAutoGen.passed > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-[var(--success)]">
                    <IconCheck size={13} strokeWidth={2} />
                    <span className="t-caption">
                      {morningAutoGen.passed}/{morningAutoGen.attempted}
                    </span>
                  </span>
                ) : (
                  <span className="t-caption text-[var(--warn)]">
                    {morningAutoGen.passed}/{morningAutoGen.attempted}
                  </span>
                )}
                <span className="h-10 w-10 flex-none">
                  <Mascot state={morningAutoGen.passed > 0 ? "happy" : "perplexed"} />
                </span>
              </div>
            </div>
            <p className="t-caption mb-3 -mt-1 text-[var(--text-muted)]">
              {morningAutoGen.passed}/{morningAutoGen.attempted} ont passé le contrôle qualité automatique ce matin.
            </p>
            {morningAutoGen.drafts.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {morningAutoGen.drafts.map((draft) => (
                  <Link
                    key={draft.id}
                    href={`/events/${draft.event_id}`}
                    className="group flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition-colors duration-[var(--dur)] hover:border-[var(--accent-border)] hover:bg-[var(--surface-hover)]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                        <IconGenerate size={10} strokeWidth={2} />
                        Généré par l&apos;IA
                      </span>
                      <span className="ml-auto t-caption text-[var(--text-muted)]">à valider</span>
                    </div>
                    <span className="t-label min-w-0 text-[var(--text-primary)] line-clamp-2">
                      {draft.title}
                    </span>
                    <span className="mt-auto inline-flex items-center gap-1 text-[12px] font-medium text-[var(--accent)] opacity-0 transition-opacity duration-[var(--dur)] group-hover:opacity-100">
                      Relire l&apos;événement
                      <IconArrowRight size={13} strokeWidth={2} />
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--warn-border)] bg-[var(--warn-soft)] p-4">
                <span className="h-12 w-12 flex-none">
                  <Mascot state="perplexed" />
                </span>
                <p className="t-caption text-[var(--text-primary)]">
                  Aucun des {morningAutoGen.attempted} brouillons n&apos;a passé le contrôle qualité ce matin — retirés automatiquement, rien à valider.
                </p>
              </div>
            )}
          </section>
        )}

        {nothingToDo && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
            <EmptyState
              icon={IconInbox}
              title="Rien en attente"
              hint="Le pipeline ingère les flux automatiquement. Les nouveaux événements apparaîtront ici."
              action={
                <div className="flex flex-col items-center gap-3">
                  <span className="inline-flex h-14 w-14 items-center justify-center">
                    <Mascot state="happy" />
                  </span>
                  <ButtonLink href="/events" variant="secondary">
                    Voir la veille
                    <IconArrowRight size={13} strokeWidth={2} />
                  </ButtonLink>
                </div>
              }
            />
          </div>
        )}

        {/* Urgent — le seul endroit de la page où le rouge est permis */}
        {urgent.length > 0 && (
          <section className="mb-6">
            <SectionHeader
              label="Urgent"
              icon={IconUrgent}
              tone="warn"
              count={counters.urgentCount}
            />
            <div className="space-y-2">
              {urgent.map((item) => (
                <Row key={item.id} href={`/events/${item.id}`} tone="urgent">
                  <div className="min-w-0 flex-1">
                    <span className="t-label block truncate text-[var(--text-primary)]">
                      {item.title}
                    </span>
                    <span className="font-data t-caption mt-0.5 flex items-center gap-1.5 text-[var(--warn)]">
                      <IconClock size={11} strokeWidth={2} />
                      en attente depuis {item.hours_waiting} h
                    </span>
                  </div>
                  <IconArrowRight
                    size={15}
                    strokeWidth={2}
                    className="text-[var(--warn)]"
                  />
                </Row>
              ))}
            </div>
          </section>
        )}

        {/* En production */}
        {inProgress.length > 0 && (
          <section className="mb-6">
            <SectionHeader
              label="En production"
              icon={IconPenLine}
              tone="info"
              count={counters.eventsWithoutArticle}
            />
            <div className="space-y-2">
              {inProgress.map((item) => (
                <Row key={item.id} href={`/events/${item.id}`}>
                  <div className="min-w-0 flex-1">
                    <span className="t-label block truncate text-[var(--text-primary)]">
                      {item.title_fr || item.title}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="font-data t-caption text-[var(--text-muted)]">
                        Score {item.score}
                      </span>
                      {item.assigned_to && (
                        <Badge tone="accent" icon={IconUser}>
                          {item.assigned_to}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <span className="t-caption hidden shrink-0 text-[var(--text-muted)] sm:inline">
                    Rédiger
                  </span>
                  <IconArrowRight
                    size={15}
                    strokeWidth={2}
                    className="text-[var(--text-muted)]"
                  />
                </Row>
              ))}
              {hiddenInProgressCount > 0 && (
                <Link
                  href="/events"
                  className="t-caption flex items-center justify-center gap-1.5 py-2 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
                >
                  +{hiddenInProgressCount} autres en attente
                  <IconArrowRight size={12} strokeWidth={2} />
                </Link>
              )}
            </div>
          </section>
        )}

        {/* Articles validés — historique cumulatif, pas une file qui se vide
            (un article y reste après export, seul son bouton change). Nom
            aligné sur /ready et la Sidebar pour ne plus laisser croire le
            contraire (§ session 2026-08-27, priorité P2). */}
        {ready.length > 0 && (
          <section className="mb-6">
            <SectionHeader
              label="Articles validés"
              icon={IconCheck}
              tone="success"
              count={counters.readyCount}
            />
            <div className="space-y-2">
              {ready.map((item) => (
                <Row key={item.id}>
                  <Thumb
                    src={item.image_url}
                    alt={item.title}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <span className="t-label block truncate text-[var(--text-primary)]">
                      {item.title}
                    </span>
                    {item.chapeau && (
                      <span className="t-caption block truncate text-[var(--text-muted)]">
                        {item.chapeau}
                      </span>
                    )}
                  </div>
                  {!item.image_url && (
                    <Badge tone="warn" icon={IconAlert} className="hidden sm:inline-flex">
                      sans visuel
                    </Badge>
                  )}
                  {item.exported_at && item.drive_url ? (
                    <ButtonLink
                      href={item.drive_url}
                      external
                      variant="primary"
                    >
                      <IconCheck size={13} strokeWidth={1.75} />
                      Ouvrir dans Drive
                    </ButtonLink>
                  ) : (
                    <ButtonLink
                      href={buildStudioLink({
                        title: item.title,
                        source: "RADAR",
                        imageUrl: item.image_url,
                        contentId: item.content_id || "",
                        briefHeadline:
                          item.chapeau?.slice(0, 200) || item.title.slice(0, 200),
                      })}
                      external
                      variant="studio"
                    >
                      <IconStudio size={13} strokeWidth={1.75} />
                      Créer un post
                    </ButtonLink>
                  )}
                </Row>
              ))}
            </div>
          </section>
        )}

        {/* Échéances — calendrier, guide de style, partenaires : tout ce qui porte une
            date ou un seuil, au même endroit. Le Dashboard est censé être "Aujourd'hui",
            il doit donc voir au-delà de la seule veille éditoriale. */}
        {hasEcheances && (
          <section className="mb-6">
            <SectionHeader
              label="Échéances"
              icon={IconCalendar}
              count={calendarUpcoming.length + partnerTasks.length + (correctionsThresholdReached ? 1 : 0)}
            />
            <div className="space-y-2">
              {calendarUpcoming.map((item) => {
                const typeInfo = EVENT_TYPES[item.event_type] || EVENT_TYPES.autre;
                return (
                  <Row key={`cal-${item.id}`} href="/calendrier">
                    <div className="min-w-0 flex-1">
                      <span className="t-label block truncate text-[var(--text-primary)]">
                        {item.title}
                      </span>
                      <span
                        className="t-caption inline-block mt-0.5"
                        style={{ color: item.color || typeInfo.color }}
                      >
                        {typeInfo.label}
                      </span>
                    </div>
                    <span className="font-data t-caption shrink-0 text-[var(--text-muted)]">
                      {relativeDayLabel(item.start_date)}
                    </span>
                    <IconArrowRight
                      size={15}
                      strokeWidth={2}
                      className="text-[var(--text-muted)]"
                    />
                  </Row>
                );
              })}

              {correctionsThresholdReached && (
                <Row href="/corrections">
                  <div className="min-w-0 flex-1">
                    <span className="t-label flex items-center gap-1.5 text-[var(--warn)]">
                      <IconWarning size={13} strokeWidth={2} />
                      Seuil du guide de style atteint
                    </span>
                    <span className="t-caption text-[var(--text-muted)]">
                      {correctionsCount} corrections enregistrées — une révision (v2) est à envisager
                    </span>
                  </div>
                  <IconArrowRight
                    size={15}
                    strokeWidth={2}
                    className="text-[var(--text-muted)]"
                  />
                </Row>
              )}

              {partnerTasks.map((item) => (
                <Row key={`partner-${item.id}`} href="/partenaires">
                  <div className="min-w-0 flex-1">
                    <span className="t-label block truncate text-[var(--text-primary)]">
                      {item.name}
                    </span>
                    {item.brand && (
                      <span className="t-caption text-[var(--text-muted)]">
                        {item.brand}
                      </span>
                    )}
                  </div>
                  {item.campaign_end && (
                    <span className="font-data t-caption text-[var(--text-muted)]">
                      fin le{" "}
                      {new Date(item.campaign_end).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                  <IconArrowRight
                    size={15}
                    strokeWidth={2}
                    className="text-[var(--text-muted)]"
                  />
                </Row>
              ))}
            </div>
          </section>
        )}
      </main>

      <HomeShortcuts />
    </div>
  );
}
