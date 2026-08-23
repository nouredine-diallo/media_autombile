// Vérification du Chantier 2 : la 3e couche (découpe alpha du sujet du fond)
// recouvre-t-elle réellement le bas des bulles, comme sur la référence
// inspi/5776137084027474227.jpg ?
//
// Balayage pixel, pas d'appréciation à l'œil : on teste l'intersection entre
// les pixels opaques de subject.png (déjà au format final 1080×1350, produit à
// partir de backdrop.jpg — donc aligné pixel pour pixel avec le fond affiché)
// et le disque de chaque bulle, dont la géométrie est reprise telle quelle des
// constantes du gabarit.
//
// Usage : node scripts/dev-check-chantier2.mjs <uploadId> [gabaritId]

import sharp from "sharp";
import path from "node:path";

const W = 1080, H = 1350;
// La photo de fond n'occupe que la zone haute du canevas depuis le
// 2026-08-20 (GABARIT_PHOTO_HEIGHT = 70%). subject.png a donc la taille de
// cette zone, et il est ancré en haut : la coordonnée y d'un pixel du sujet
// dans le canevas est la même que dans subject.png.
const PHOTO_H = Math.round(H * 0.74);

// Reprises de src/components/gabarits/Gabarit3A.tsx / Gabarit3B.tsx.
// leftPercent/topPercent = centre du cercle (% largeur / % hauteur du canvas),
// sizePercent = diamètre en % de la LARGEUR (voir Bulle.tsx).
const GEOM = {
  "2a": {
    bulle: { leftPercent: 50, topPercent: 0, sizePercent: 54 },
  },
  "3a": {
    bulle1: { leftPercent: 31.3, topPercent: 32.5, sizePercent: 46.1 },
    bulle2: { leftPercent: 68.0, topPercent: 30.8, sizePercent: 47.6 },
  },
};

const uploadId = process.argv[2];
const gabaritId = process.argv[3] ?? "3a";
if (!uploadId) {
  console.error("Usage: node scripts/dev-check-chantier2.mjs <uploadId> [gabaritId]");
  process.exit(1);
}
const geom = GEOM[gabaritId];
if (!geom) { console.error(`Géométrie inconnue pour le gabarit ${gabaritId}`); process.exit(1); }

const subjectPath = path.join("uploads", uploadId, "subject.png");
const { data, info } = await sharp(subjectPath)
  .resize(W, PHOTO_H, { fit: "cover" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const channels = info.channels;

const ALPHA_MIN = 128; // pixel considéré comme "sujet visible"

// Bord supérieur du sujet, toutes colonnes confondues.
let subjectTop = PHOTO_H;
for (let y = 0; y < PHOTO_H && subjectTop === PHOTO_H; y++) {
  for (let x = 0; x < W; x++) {
    if (data[(y * W + x) * channels + 3] >= ALPHA_MIN) { subjectTop = y; break; }
  }
}
console.log(`Sujet (3e couche) : premier pixel opaque à y=${subjectTop} sur ${H} (${(subjectTop / H * 100).toFixed(1)}% de la hauteur)`);

for (const [name, g] of Object.entries(geom)) {
  const cx = g.leftPercent / 100 * W;
  const cy = g.topPercent / 100 * H;
  const r = g.sizePercent / 100 * W / 2;
  const top = cy - r, bottom = cy + r;

  let covered = 0, total = 0, deepest = null;
  const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(PHOTO_H - 1, Math.ceil(bottom));
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r * r) continue;
      total++;
      if (data[(y * W + x) * channels + 3] >= ALPHA_MIN) {
        covered++;
        if (deepest === null) deepest = y;
      }
    }
  }
  const pct = total ? covered / total * 100 : 0;
  console.log(
    `\n${name} : centre (${cx.toFixed(0)}, ${cy.toFixed(0)}) rayon ${r.toFixed(0)} — disque de ${top.toFixed(0)} à ${bottom.toFixed(0)}`,
  );
  console.log(`  pixels du disque recouverts par le sujet : ${covered}/${total} (${pct.toFixed(2)}%)`);
  if (covered === 0) {
    console.log(`  ÉCHEC critère Chantier 2 : aucun contact. Écart vertical bulle→sujet = ${(subjectTop - bottom).toFixed(0)}px`);
  } else {
    console.log(`  OK : recouvrement effectif, premier contact à y=${deepest}`);
  }
}
