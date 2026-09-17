/** Une slide du carrousel en cours de composition — éditable avant export. */
export interface Slide {
  gabaritId: string;
  /** Clé du champ texte principal du gabarit ("title" pour 1a, "paragraph" pour 1b, "message" pour cta). */
  textKey: string;
  fieldValues: Record<string, string>;
  imageIndex: number; // index dans `uploaded`, pour le sélecteur d'échange d'image
}

/** Ce qu'assembleSlides() a besoin de connaître du paquet carrousel — pas la
 * forme complète venue de RADAR (contentId, images, pertinent, score…), qui
 * reste propre à l'écran appelant. */
export interface AssembleSlidesPackage {
  title: string;
  devSlides: string[];
}

/** Ce qu'assembleSlides() a besoin de connaître d'une image uploadée — même
 * logique que ci-dessus, découplé du type `UploadedImage` de l'écran. */
export interface AssembleSlidesImage {
  backdropUrl: string;
  croppedUrl: string;
}

/**
 * Assigne les images uploadées aux slides (§2.1 du plan écosystème) : la
 * meilleure va à l'accroche, une distincte à la fin (CTA) quand c'est
 * possible, celles du milieu au développement — jamais une slide 1B sans
 * image dédiée : le nombre de slides de dev réel est plafonné par le nombre
 * d'images restantes, pas seulement par le texte disponible.
 *
 * Extrait de `titres/carrousel/page.tsx` (2026-09-17, phase 3 du plan
 * écosystème) pour être appelable côté serveur (automatisation RADAR →
 * STUDIO), sans dépendre de React ni du navigateur — cette fonction est pure
 * et ne touche à rien d'autre qu'à ses arguments.
 */
export function assembleSlides(pkg: AssembleSlidesPackage, uploaded: AssembleSlidesImage[]): Slide[] {
  const imgUrl = (img: AssembleSlidesImage) => img.backdropUrl || img.croppedUrl;

  const heroIdx = 0;
  const ctaIdx = uploaded.length > 1 ? uploaded.length - 1 : 0;
  const devPool = uploaded.slice(1, Math.max(1, uploaded.length - 1));
  const devCount = Math.min(pkg.devSlides.length, devPool.length);

  const slides: Slide[] = [
    {
      gabaritId: "1a",
      textKey: "title",
      imageIndex: heroIdx,
      fieldValues: { imageUrl: imgUrl(uploaded[heroIdx]), title: pkg.title },
    },
  ];

  for (let i = 0; i < devCount; i++) {
    const imageIndex = 1 + i;
    slides.push({
      gabaritId: "1b",
      textKey: "paragraph",
      imageIndex,
      fieldValues: { imageUrl: imgUrl(uploaded[imageIndex]), paragraph: pkg.devSlides[i] },
    });
  }

  slides.push({
    gabaritId: "cta",
    textKey: "message",
    imageIndex: ctaIdx,
    fieldValues: { imageUrl: imgUrl(uploaded[ctaIdx]) },
  });

  return slides;
}
