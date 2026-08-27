import { getDb } from "@/lib/db";
import { buildStudioLink } from "@/lib/studio-prefill";
import { PageHeader } from "@/components/PageHeader";
import { Badge, ButtonLink, EmptyState, Thumb } from "@/components/ui";
import { PlanifierButton } from "@/components/PlanifierButton";
import { AssociatePartnerButton } from "@/components/AssociatePartnerButton";
import {
  IconArrowRight,
  IconCheck,
  IconImage,
  IconImageOff,
  IconInbox,
  IconStudio,
} from "@/components/icons";

interface Article {
  id: number;
  content_id: string | null;
  event_id: number;
  title: string;
  chapeau: string | null;
  content: string;
  word_count: number;
  status: string;
  generated_at: string;
  event_title: string | null;
  image_url: string | null;
  exported_at: string | null;
  drive_url: string | null;
}

export default function ReadyForInstagram() {
  const db = getDb();

  // LEFT JOIN, pas INNER : le nettoyage de cache peut supprimer l'événement
  // source sans toucher à l'article validé — il doit rester visible ici quand
  // même (sinon cette page dit "aucun article" pendant que le Dashboard en
  // compte plusieurs, les deux vues doivent toujours raconter la même chose).
  const articles = db.prepare(`
    SELECT a.*, e.title as event_title,
      (SELECT i.image_url FROM items i
       JOIN event_items ei ON ei.item_id = i.id
       WHERE ei.event_id = a.event_id AND i.image_url IS NOT NULL
       ORDER BY
         CASE
           WHEN i.image_source = 'og:image' THEN 1
           WHEN i.image_source = 'twitter:image' THEN 2
           WHEN i.image_source = 'page' THEN 3
           WHEN i.image_source = 'rss' THEN 4
           ELSE 5
         END
       LIMIT 1) as image_url
    FROM articles a
    LEFT JOIN events e ON a.event_id = e.id
    WHERE a.status = 'validated'
    ORDER BY a.validated_at DESC
  `).all() as Article[];

  return (
    <div className="min-h-screen">
      <PageHeader
        title="Articles validés"
        subtitle={`${articles.length} article${articles.length > 1 ? "s" : ""} validé${
          articles.length > 1 ? "s" : ""
        } — historique cumulatif, y compris les articles déjà exportés`}
        back={{ href: "/", label: "Accueil" }}
      />

      <main className="mx-auto max-w-4xl px-6 py-6">
        {articles.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)]">
            <EmptyState
              icon={IconInbox}
              title="Aucun article validé pour le moment"
              hint="Un article apparaît ici dès qu'il a passé la revue humaine dans la veille."
              action={
                <ButtonLink href="/events" variant="secondary">
                  Aller à la veille
                  <IconArrowRight size={13} strokeWidth={2} />
                </ButtonLink>
              }
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            {articles.map((article) => (
              <article
                key={article.id}
                className="flex gap-4 rounded-[var(--radius-lg)] border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 transition-colors duration-[var(--dur)] hover:border-[var(--border-default)]"
              >
                <Thumb
                  src={article.image_url}
                  alt={article.title}
                  size={72}
                />

                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2">
                    {article.image_url ? (
                      <Badge tone="neutral" icon={IconImage}>
                        Visuel trouvé
                      </Badge>
                    ) : (
                      <Badge tone="warn" icon={IconImageOff}>
                        Sans visuel
                      </Badge>
                    )}
                    {article.exported_at && (
                      <Badge tone="success" icon={IconCheck}>
                        Exporté
                      </Badge>
                    )}
                  </div>

                  <h2 className="t-title truncate text-[var(--text-primary)]">
                    {article.title}
                  </h2>
                  {article.chapeau && (
                    <p className="t-body mt-1 line-clamp-2 text-[var(--text-secondary)]">
                      {article.chapeau}
                    </p>
                  )}
                  <p className="t-caption mt-2 truncate text-[var(--text-muted)]">
                    Événement : {article.event_title || "archivé"}
                  </p>
                </div>

                <div className="flex shrink-0 items-start gap-2">
                  {article.content_id && (
                    <AssociatePartnerButton contentId={article.content_id} />
                  )}
                  <PlanifierButton articleId={article.id} />
                  {article.exported_at && article.drive_url ? (
                    <ButtonLink href={article.drive_url} external variant="secondary" size="md">
                      <IconCheck size={14} strokeWidth={1.75} />
                      Ouvrir dans Drive
                    </ButtonLink>
                  ) : (
                    <ButtonLink
                      href={buildStudioLink({
                        title: article.title,
                        source: (article.event_title || "RADAR").slice(0, 50),
                        imageUrl: article.image_url,
                        contentId: article.content_id || "",
                        briefHeadline:
                          article.chapeau?.slice(0, 200) || article.title.slice(0, 200),
                      })}
                      external
                      variant="studio"
                      size="md"
                    >
                      <IconStudio size={14} strokeWidth={1.75} />
                      Créer un post
                    </ButtonLink>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
