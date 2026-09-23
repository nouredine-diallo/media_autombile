import Link from "next/link";
import { getDashboardAgenda } from "@/lib/db";
import { HomeShortcuts } from "@/components/HomeShortcuts";
import { ViewToggle } from "@/components/ViewToggle";
import { PipelineStatusIndicator } from "@/components/PipelineStatus";
import { DriveStatusBadge } from "@/components/DriveStatusBadge";
import { PageHeader } from "@/components/PageHeader";
import { buildStudioLink, getStudioUrl } from "@/lib/studio-prefill";
import { getEventTitleFr } from "@/lib/eventDisplay";
import { getAutoValidateTrust } from "@/lib/killswitch";
import { EVENT_TYPES } from "@/lib/calendar";
import {
  Badge,
  ButtonLink,
  EmptyState,
  SectionHeader,
  Thumb,
} from "@/components/ui";
import { Mascot } from "@/components/assistant/Mascot";
import { PostPreviewOverlay } from "@/components/PostPreviewOverlay";
import { QuickConfirmButton } from "@/components/QuickConfirmButton";
import {
  IconAlert,
  IconArrowRight,
  IconCalendar,
  IconChevronDown,
  IconCheck,
  IconClock,
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
    ready,
    partnerTasks,
    calendarUpcoming,
    morningAutoGen,
    correctionsCount,
    correctionsThreshold,
    counters,
  } = getDashboardAgenda();
  const autoValidateTrust = getAutoValidateTrust();

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
        {/* Restructuration UI du 17 sept. 2026 : les 3 tuiles chiffrées
            (Événements suivis / En rédaction / Validés) disparaissent d'ici —
            "Validés" est déjà le badge de comptage sur "Articles validés"
            plus bas, "Événements suivis" devient le lien texte "Voir les X"
            en bas de Zone 2, "En rédaction" (0 la plupart du temps) n'avait
            pas de destination propre et faisait doublon avec "Urgent"/les
            brouillons du matin ci-dessous. Pipeline automatique + Drive
            déplacés dans "Outils avancés" (repliable, en bas de page) : ils
            ne disputent plus l'attention aux deux zones d'action. */}

        {/* Zone 1 — "À poster maintenant" : brouillons auto-générés dont la
            confiance mesurée a déjà dépassé le seuil de validation (Phase 6
            du plan écosystème) — personne n'a encore lu le texte, mais le
            visuel est déjà prêt. Masquée tant qu'elle est vide plutôt que
            d'afficher une zone "priorité absolue" sans rien dedans. */}
        {morningAutoGen && morningAutoGen.readyToConfirm.length > 0 && (
          <section className="mb-6">
            <SectionHeader
              label="À poster maintenant"
              icon={IconCheck}
              tone="success"
              count={morningAutoGen.readyToConfirm.length}
            />
            <div className="space-y-2">
              {morningAutoGen.readyToConfirm.map((post) => {
                const images = post.auto_preview_data_urls
                  ? (JSON.parse(post.auto_preview_data_urls) as string[])
                  : post.auto_preview_data_url
                    ? [post.auto_preview_data_url]
                    : [];
                return (
                  <div
                    key={post.id}
                    className="flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--success-border)] bg-[var(--success-soft)] px-3.5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="t-label block truncate text-[var(--text-primary)]">
                        {post.title}
                      </span>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="font-data t-caption text-[var(--text-muted)]">
                          Score {post.event_score}
                        </span>
                        {post.publish_date && (
                          <span className="font-data t-caption text-[var(--success)]">
                            Publier {relativeDayLabel(post.publish_date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <PostPreviewOverlay
                      data={{
                        title: post.title,
                        chapeau: post.chapeau,
                        content: post.content,
                        images,
                        imagesAreRendered: true,
                      }}
                      actions={<QuickConfirmButton articleId={post.id} />}
                    />
                    <QuickConfirmButton articleId={post.id} />
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Brouillons générés ce matin, encore à valider par un humain —
            distinct de la Zone 1 ci-dessus (dont la confiance mesurée a déjà
            franchi le seuil d'auto-validation). Sans cette section, un
            brouillon 'draft' généré à 8h serait invisible : "En production"
            n'affiche que les événements SANS article, "Articles validés"
            exige status='validated'. */}
        {morningAutoGen && (morningAutoGen.drafts.length > 0 || morningAutoGen.passed === 0) && (
          <section className="mb-6">
            <div className="mb-2.5 flex items-center gap-2">
              <h2 className="t-eyebrow">Brouillons du matin — à valider</h2>
              <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-full)] bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium leading-5 text-[var(--accent)]">
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

            {morningAutoGen.drafts.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {morningAutoGen.drafts.map((draft) => (
                  <Link
                    key={draft.id}
                    href={`/events/${draft.event_id}`}
                    className="group flex flex-col gap-2.5 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition-colors duration-[var(--dur)] hover:border-[var(--accent-border)] hover:bg-[var(--surface-hover)]"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
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
            )}

            {morningAutoGen.passed === 0 && (
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

        {/* Confiance dans le seuil d'auto-validation (B) — mesurée, pas
            estimée. Indépendante de morningAutoGen : reste visible même les
            jours sans nouveau brouillon, tant que l'historique 30j existe.
            Une seule ligne, pas un tableau de bord à part — la mascotte
            porte le verdict d'un coup d'œil, le texte donne le détail pour
            qui veut vérifier. */}
        {autoValidateTrust && (
          <div className="mb-6 flex items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3">
            <span className="h-8 w-8 flex-none">
              <Mascot state={autoValidateTrust.confirmedRate >= 80 ? "happy" : "perplexed"} variant="face" />
            </span>
            <p className="t-caption text-[var(--text-secondary)]">
              Seuil d&apos;auto-validation —{" "}
              <span
                className={
                  autoValidateTrust.confirmedRate >= 80
                    ? "font-medium text-[var(--success)]"
                    : "font-medium text-[var(--warn)]"
                }
              >
                {autoValidateTrust.confirmedRate}% confirmés sans rejet
              </span>{" "}
              sur les {autoValidateTrust.total} derniers posts auto-validés ({autoValidateTrust.windowDays}j)
              {autoValidateTrust.rejected > 0 && ` — ${autoValidateTrust.rejected} rejeté${autoValidateTrust.rejected > 1 ? "s" : ""}`}
            </p>
          </div>
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
                <Row key={item.id} href={`/events/${item.event_id}`} tone="urgent">
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

        {/* Zone 2 — "3 actualités les plus pertinentes" (restructuration UI,
            17 sept. 2026) : les événements du jour au score le plus haut,
            encore sans article — génération manuelle, contrairement à la
            Zone 1. Plafonnée à 3 (IN_PROGRESS_LIMIT, db.ts) pour ne pas
            disputer l'attention à la Zone 1 ; "Voir les X →" en bas remplace
            à la fois l'ancien lien "+N autres" et la tuile "Événements
            suivis" retirée plus haut — les deux menaient déjà à /events. */}
        {inProgress.length > 0 && (
          <section className="mb-6">
            <SectionHeader
              label="3 actualités les plus pertinentes"
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
              <Link
                href="/events"
                className="t-caption flex items-center justify-center gap-1.5 py-2 text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
              >
                Voir les {counters.totalEvents} →
              </Link>
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
                    <div className="flex items-center gap-2">
                      {item.chapeau && (
                        <span className="t-caption truncate text-[var(--text-muted)]">
                          {item.chapeau}
                        </span>
                      )}
                      {/* Échéance fusionnée ici plutôt que dans une section
                          "Échéances" séparée (restructuration UI, 17 sept. 2026). */}
                      {item.publish_date && (
                        <span className="font-data t-caption shrink-0 text-[var(--success)]">
                          Publier {relativeDayLabel(item.publish_date)}
                        </span>
                      )}
                    </div>
                  </div>
                  <PostPreviewOverlay
                    data={{
                      title: item.title,
                      chapeau: item.chapeau,
                      content: item.content,
                      images: item.image_url ? [item.image_url] : [],
                      imagesAreRendered: false,
                    }}
                  />
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

        {/* Outils avancés — Pipeline automatique + Drive, repliés par défaut
            (restructuration UI, 17 sept. 2026) : accessibles en 1 clic pour
            qui en a besoin, sans disputer l'attention aux deux zones d'action
            du haut de page. <details> natif : repliable sans JS, accessible
            par défaut, zéro dépendance nouvelle. */}
        <details className="group mb-6 rounded-[var(--radius-lg)] border border-[var(--border-subtle)]">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-[var(--text-secondary)]">
            <IconChevronDown size={14} strokeWidth={2} className="transition-transform group-open:rotate-180" />
            <span className="t-label">Outils avancés</span>
          </summary>
          <div className="flex flex-col gap-3 border-t border-[var(--border-subtle)] px-3.5 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <PipelineStatusIndicator />
            </div>
            <DriveStatusBadge />
          </div>
        </details>
      </main>

      <HomeShortcuts />
    </div>
  );
}
