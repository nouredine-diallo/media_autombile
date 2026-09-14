import Gabarit1A from "@/components/gabarits/Gabarit1A";

interface RenderPageProps {
  searchParams: Promise<{ title?: string; imageUrl?: string; imageCadre?: string; photoHeight?: string }>;
}

/**
 * Page de capture pour le gabarit 1A — utilisée à la fois par le vrai export
 * de production (`renderGabaritToPng`, appelé par `/api/export`) et par les
 * scripts de vérification pixel-exacte d'Étape 1. N'affiche rien d'autre que
 * le composant, pour que la capture soit exacte. Protégée par l'auth
 * standard (proxy.ts) ; l'appel Playwright s'authentifie avec un cookie de
 * session dédié.
 *
 * Bug trouvé le 2026-09-14 en branchant le recadrage manuel (RecadrageFond) :
 * `imageCadre`/`photoHeight` n'étaient jamais lus ici — le vrai export PNG
 * ignorait donc silencieusement tout recadrage manuel, même si l'aperçu
 * navigateur (passant par cette même page via l'écran d'ajustement générique)
 * le montrait correctement. Violation directe de CLAUDE.md §1 ("zéro écart
 * entre aperçu et rendu final"). Corrigé en lisant ces deux paramètres comme
 * le fait déjà la route générique `/render/[gabaritId]`.
 */
export default async function Render1APage({ searchParams }: RenderPageProps) {
  const { title, imageUrl, imageCadre, photoHeight } = await searchParams;

  return (
    <Gabarit1A
      title={title ?? ""}
      imageUrl={imageUrl ?? "/test/placeholder-photo.jpg"}
      imageCadre={imageCadre}
      photoHeight={photoHeight}
    />
  );
}
