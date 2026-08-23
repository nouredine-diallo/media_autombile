// Mesure la COURBE D'ASSOMBRISSEMENT réellement appliquée par le bloc titre,
// en comparant le rendu final à sa propre photo non retouchée, ligne par
// ligne. Tout écart vient du dégradé et de rien d'autre.
//
// Usage : node scripts/dev-profil-degrade.mjs <rendu.png> <photo.jpg> [hauteurPhoto] [noirCible%]
import sharp from "sharp";

const CANVAS_W = 1080, CANVAS_H = 1350;
const SAFE_LEFT = 0.075, SAFE_RIGHT = 0.925; // colonnes hors des bulles

const [renderFile, photoFile] = process.argv.slice(2);
const photoHeight = Number(process.argv[4] ?? CANVAS_H);
const blackTarget = Number(process.argv[5] ?? 78);

async function rows(file, height) {
  const { data, info } = await sharp(file).resize(CANVAS_W, height, { fit: "fill" })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, channels: C } = info;
  const xs = [];
  for (let x = 0; x < W; x++) if (x < W * SAFE_LEFT || x > W * SAFE_RIGHT) xs.push(x);
  const out = new Array(height);
  for (let y = 0; y < height; y++) {
    let s = 0;
    for (const x of xs) { const i = (y * W + x) * C; s += (data[i] + data[i + 1] + data[i + 2]) / 3; }
    out[y] = s / xs.length;
  }
  return out;
}

const r = await rows(renderFile, CANVAS_H);
const b = await rows(photoFile, photoHeight);

console.log("%H     assombrissement mesuré");
let fadeStart = null, blackAt = null;
for (let pct = 50; pct <= 90; pct += 1) {
  const y = Math.round((pct / 100) * CANVAS_H);
  if (y >= photoHeight) break;
  const alpha = 1 - r[y] / Math.max(1, b[y]);
  if (fadeStart === null && alpha > 0.03) fadeStart = pct;
  if (blackAt === null && alpha > 0.97) blackAt = pct;
  if (pct % 2 === 0) console.log(`${String(pct).padStart(4)}%    ${(alpha * 100).toFixed(0).padStart(4)} %`);
}
// Quand la photo ne couvre pas tout le canevas (familles 2/3), le noir plein
// tombe exactement sur son bord bas : il n'existe aucune ligne de photo au-delà
// pour l'observer. Le critère devient alors "la dernière ligne de photo est-elle
// déjà masquée ?" — c'est ce qui garantit l'absence de couture visible.
const reduced = photoHeight < CANVAS_H;
const lastRow = photoHeight - 1;
const alphaLast = 1 - r[lastRow] / Math.max(1, b[lastRow]);

console.log();
console.log(`début d'assombrissement : ${fadeStart ?? "—"} %   (cible 58,5 %)`);
let ok = fadeStart !== null && Math.abs(fadeStart - 58.5) <= 2;
if (reduced) {
  console.log(`bord bas de la photo à  : ${(photoHeight / CANVAS_H * 100).toFixed(1)} % — assombrissement à cette ligne : ${(alphaLast * 100).toFixed(1)} %  (cible ≥ 97 %, sinon couture visible)`);
  ok = ok && alphaLast >= 0.97;
} else {
  console.log(`noir plein atteint à    : ${blackAt ?? "—"} %   (cible ${blackTarget} %)`);
  ok = ok && blackAt !== null && Math.abs(blackAt - blackTarget) <= 2;
}
console.log(ok ? "CRITÈRE ATTEINT" : "CRITÈRE NON ATTEINT");
process.exit(ok ? 0 : 1);
