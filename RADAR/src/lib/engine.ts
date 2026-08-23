/**
 * Signature du moteur technique.
 *
 * On sépare volontairement deux identités :
 * - la marque cliente, « Le Média Automobile », visible partout dans l'interface ;
 * - le moteur qui fait tourner l'outil, mentionné une seule fois par page,
 *   en pied de page, de façon discrète.
 *
 * Une seule source de vérité pour ces valeurs : on ne les recopie nulle part.
 */
export const ENGINE = {
  brand: 'LAN_D',
  product: 'Core Engine',
  version: '1.0.0',
  author: 'Nouredine Diallo',
} as const;

/** « Powered by LAN_D Core Engine — v1.0.0 » */
export const ENGINE_LABEL = `Powered by ${ENGINE.brand} ${ENGINE.product} — v${ENGINE.version}`;
