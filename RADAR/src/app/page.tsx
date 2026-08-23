import Link from "next/link";
import { getDashboardAgenda } from "@/lib/db";
import { HomeShortcuts } from "@/components/HomeShortcuts";
import { ViewToggle } from "@/components/ViewToggle";
import { PipelineStatusIndicator } from "@/components/PipelineStatus";
import { DriveStatusBadge } from "@/components/DriveStatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { buildStudioLink } from "@/lib/studio-prefill";
import { getEventTitleFr } from "@/lib/eventDisplay";
import {
  Badge,
  ButtonLink,
  EmptyState,
  SectionHeader,
  StatTile,
  Thumb,
} from "@/components/ui";
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconImageOff,
  IconInbox,
  IconPartners,
  IconPenLine,
  IconStudio,
  IconUrgent,
  IconUser,
} from "@/components/icons";

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
    counters,
  } = getDashboardAgenda();

  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const nothingToDo =
    urgent.length === 0 &&
    inProgress.length === 0 &&
    ready.length === 0 &&
    partnerTasks.length === 0;

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Aujourd'hui"
        subtitle={today}
        actions={<ViewToggle />}
      />

      <main className="mx-auto max-w-5xl px-6 py-6">
        {/* Coup d'œil en 30 secondes — la Direction s'arrête ici */}
        <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
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
          />
          <StatTile
            value={<IconStudio size={22} strokeWidth={1.75} />}
            label="Ouvrir STUDIO"
            href="http://localhost:3001"
            external
            tone="studio"
          />
        </div>

        <div className="mb-6 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <PipelineStatusIndicator />
          </div>
          <DriveStatusBadge />
        </div>

        {nothingToDo && (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
            <EmptyState
              icon={IconInbox}
              title="Rien en attente"
              hint="Le pipeline ingère les flux automatiquement. Les nouveaux événements apparaîtront ici."
              action={
                <ButtonLink href="/events" variant="secondary">
                  Voir la veille
                  <IconArrowRight size={13} strokeWidth={2} />
                </ButtonLink>
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

        {/* Prêt à publier */}
        {ready.length > 0 && (
          <section className="mb-6">
            <SectionHeader
              label="Prêt à publier"
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
                </Row>
              ))}
            </div>
          </section>
        )}

        {/* Partenaires */}
        {partnerTasks.length > 0 && (
          <section className="mb-6">
            <SectionHeader label="Partenaires" icon={IconPartners} />
            <div className="space-y-2">
              {partnerTasks.map((item) => (
                <Row key={item.id} href="/partenaires">
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
