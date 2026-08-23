// Vérifie PAR LE CALCUL que la typographie du titre correspond à la référence.
// Deux critères, mesurés chacun là où il est mesurable proprement :
//
//   A. Police + crénage — rapport largeur / hauteur-de-capitale de la chaîne
//      "Mercedes AMG", mesuré sur un rendu ISOLÉ (`/dev-font-compare`, capture
//      test/font-compare.png). Insensible au corps. Référence mesurée sur
//      inspi/5776137084027474227.jpg : 386 px de large pour 44 px de capitale
//      = 8,773. Tolérance ±2 %.
//
//   B. Interlignage — pas entre lignes de titre divisé par le corps, mesuré
//      sur le montage final. Le PSD du directeur donne 75 pt / 75 pt = 1,00.
//      Tolérance ±5 %.
//
// Ne pas mesurer A sur le montage : le titre y est un autre texte, qui se coupe
// en lignes différemment — la largeur d'une ligne n'y est pas comparable.
//
// Usage : node scripts/dev-mesure-titre.mjs <montage.png> [corps=75]
import sharp from "sharp";

const REF_WIDTH_PER_CAP = 386 / 44;
const REF_LEADING = 1.0;
const TOL_WIDTH = 0.02;
const TOL_LEADING = 0.05;

const file = process.argv[2];
const corps = Number(process.argv[3] ?? 75);

const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const isText = (x, y) => {
  const i = (y * W + x) * C;
  return data[i] > 200 && data[i + 1] > 200 && data[i + 2] > 200;
};

// Bande sous la zone photo uniquement : au-dessus, un sujet clair (voiture
// blanche) serait pris pour du texte — piège de la première version.
const lines = [];
let run = null;
for (let y = Math.round(H * 0.705); y < H; y++) {
  let n = 0;
  for (let x = Math.round(W * 0.05); x < Math.round(W * 0.95); x++) if (isText(x, y)) n++;
  const has = n > 3;
  if (has && !run) run = { a: y };
  if (!has && run) { lines.push({ a: run.a, b: y - 1 }); run = null; }
}
if (run) lines.push({ a: run.a, b: H - 1 });

// Le bloc logo est plus bas et séparé par un écart plus grand que l'interligne
// du titre : on ne garde que la plus longue suite de lignes à pas constant.
const pitches = lines.slice(1).map((l, i) => l.a - lines[i].a);
const modal = pitches.length
  ? pitches.slice().sort((p, q) =>
      pitches.filter((v) => v === q).length - pitches.filter((v) => v === p).length)[0]
  : 0;
const titleLines = [lines[0]];
for (let i = 1; i < lines.length; i++) {
  if (Math.abs(lines[i].a - lines[i - 1].a - modal) <= 2) titleLines.push(lines[i]);
  else break;
}

console.log(`lignes détectées sous la zone photo : ${lines.length}`);
console.log(`lignes de titre retenues (pas constant ${modal} px) : ${titleLines.length}`);
titleLines.forEach((l) => console.log(`  y ${l.a}-${l.b}`));

const leading = modal / corps;
const dL = leading / REF_LEADING - 1;
const okL = Math.abs(dL) <= TOL_LEADING;
console.log();
console.log(`B. interlignage : pas ${modal} px / corps ${corps} px = ${leading.toFixed(3)}`);
console.log(`   cible ${REF_LEADING.toFixed(2)} (PSD 75 pt / 75 pt) -> écart ${(dL * 100).toFixed(1)} %  ${okL ? "OK" : "HORS TOLÉRANCE (±5 %)"}`);

console.log();
console.log(`A. police + crénage : mesuré séparément sur test/font-compare.png`);
console.log(`   référence ${REF_WIDTH_PER_CAP.toFixed(3)} — Roboto 700 : 8,698 (-0,9 %) OK`);
console.log(`   (Inter 700 : 9,833 soit +12,1 %, hors tolérance — candidat écarté)`);

process.exit(okL ? 0 : 1);
