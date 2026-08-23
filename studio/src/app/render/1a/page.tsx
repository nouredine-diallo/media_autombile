import Gabarit1A from "@/components/gabarits/Gabarit1A";

interface RenderPageProps {
  searchParams: Promise<{ title?: string; imageUrl?: string }>;
}

/**
 * Page de capture pour le gabarit 1A — utilisée uniquement par la route
 * /api/render/1a (Playwright). N'affiche rien d'autre que le composant, pour
 * que la capture soit exacte. Protégée par l'auth standard (proxy.ts) ;
 * l'appel Playwright s'authentifie avec un cookie de session dédié.
 */
export default async function Render1APage({ searchParams }: RenderPageProps) {
  const { title, imageUrl } = await searchParams;

  return (
    <Gabarit1A
      title={title ?? ""}
      imageUrl={imageUrl ?? "/test/placeholder-photo.jpg"}
    />
  );
}
