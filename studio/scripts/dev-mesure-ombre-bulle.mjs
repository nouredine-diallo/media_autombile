// §0.3 — L'ombre des bulles de la référence est-elle INTERNE (assombrissement
// du bord intérieur, côté photo) ou EXTERNE (halo projeté sur le fond), ou les
// deux ?
//
// Méthode : profil radial de luminance moyenné sur 360°, de part et d'autre de
// l'anneau blanc. Moyenner sur tout le pourtour annule les variations de
// contenu de la photo ; il ne reste que ce qui dépend du RAYON, c'est-à-dire
// l'effet d'ombre. Les secteurs recouverts par un autre calque (l'autre bulle,
// la voiture du fond) sont exclus.
import sharp from "sharp";

const FILE = "inspi/5776137084027474227.jpg";
// Cercles ajustés le 2026-08-20 (scripts/dev-fit-bulles.mjs)
const BULLE_D = { cx: 696.0, cy: 394.2, r: 243.9 };
const BULLE_G = { cx: 320.9, cy: 416.6, r: 235.9 };

const { data, info } = await sharp(FILE).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const lum = (x, y) => {
  const i = ((y | 0) * W + (x | 0)) * C;
  return (data[i] + data[i + 1] + data[i + 2]) / 3;
};

function profil(b, other) {
  const rows = [];
  for (let k = 0.60; k <= 1.35; k += 0.025) {
    const rr = b.r * k;
    let s = 0, n = 0;
    for (let deg = 0; deg < 360; deg += 1) {
      const a = (deg * Math.PI) / 180;
      const x = b.cx + Math.cos(a) * rr, y = b.cy + Math.sin(a) * rr;
      if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) continue;
      // exclut la zone couverte par l'autre bulle
      if (other && Math.hypot(x - other.cx, y - other.cy) <= other.r * 1.05) continue;
      // exclut le bas du cadre (voiture du fond au premier plan + bandeau)
      if (y > 900) continue;
      s += lum(x, y); n++;
    }
    if (n > 40) rows.push([k, s / n, n]);
  }
  return rows;
}

for (const [nom, b, other] of [["BULLE DROITE", BULLE_D, BULLE_G], ["BULLE GAUCHE", BULLE_G, null]]) {
  console.log(`\n=== ${nom} (centre ${b.cx}, ${b.cy} — rayon ${b.r}) ===`);
  console.log("r/R    luminance moyenne   n  zone");
  for (const [k, v, n] of profil(b, other)) {
    const zone = k < 0.94 ? "intérieur photo" : k <= 1.05 ? "ANNEAU BLANC" : "fond extérieur";
    console.log(`${k.toFixed(3)}  ${v.toFixed(1).padStart(6)}            ${String(n).padStart(3)}  ${zone}`);
  }
}
