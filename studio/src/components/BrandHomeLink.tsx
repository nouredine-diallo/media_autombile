import Link from "next/link";

/**
 * Trouvé le 15 sept. 2026 (demande utilisateur, P6) : les 3 en-têtes de
 * STUDIO (`titres`, `titres/carrousel`, `gabarits/[gabaritId]`) affichaient
 * un badge "SA" identique, sans lien — ni la marque du Média Automobile, ni
 * un moyen de revenir à l'accueil depuis ces pages. Remplacé par le même
 * logo déjà utilisé dans l'en-tête RADAR (`PageHeader.tsx`, `/logo.png`,
 * cohérence de marque entre les deux apps) transformé en lien vers l'accueil
 * STUDIO — même pattern, extrait une seule fois ici plutôt que dupliqué
 * 3 fois (les 3 en-têtes divergeaient déjà légèrement sur tout le reste,
 * seul ce badge était identique).
 */
export function BrandHomeLink() {
  return (
    <Link
      href="/"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-900"
      aria-label="Retour à l'accueil STUDIO"
    >
      <img
        src="/logo.png"
        alt="Le Média Automobile"
        className="h-6 w-6 object-contain opacity-95 transition-opacity hover:opacity-100"
      />
    </Link>
  );
}
