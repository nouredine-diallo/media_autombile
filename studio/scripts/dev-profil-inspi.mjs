// Analyse la courbe d'assombrissement du bandeau titre sur TOUS les posts de
// `inspi/`, pour en tirer une courbe moyenne plutôt qu'un réglage calé sur un
// seul exemple.
//
// Méthode : pour chaque ligne, on prend le **10e centile** de la luminance sur
// la largeur. Ce percentile bas suit le noir du bandeau et ignore le texte
// blanc, qui ne concerne qu'une minorité de pixels d'une ligne. On normalise
// chaque post par sa propre luminance de référence, prise au-dessus du
// dégradé, pour comparer des courbes d'assombrissement et non des expositions.
import sharp from "sharp";
import fs from "node:fs";

// Fichiers supplémentaires à comparer (nos rendus), passés en argument.
const extras = process.argv.slice(2);
const files = fs.readdirSync("inspi").filter((f) => /\.(jpg|png)$/i.test(f)).map((f) => `inspi/${f}`).concat(extras);

function pct10(vals) {
  const s = vals.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length * 0.10)];
}

const courbes = [];
for (const f of files) {
  const { data, info } = await sharp(f).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const ligne = (pct) => {
    const y = Math.min(H - 1, Math.round((pct / 100) * H));
    const vals = [];
    for (let x = 0; x < W; x++) { const i = (y * W + x) * C; vals.push((data[i] + data[i + 1] + data[i + 2]) / 3); }
    return pct10(vals);
  };
  // référence de luminance : moyenne des lignes 40-52 %, franchement au-dessus
  // de tout dégradé observé
  let base = 0;
  for (let p = 40; p <= 52; p += 2) base += ligne(p);
  base /= 7;
  if (base < 8) { console.log(`${f} : ignoré (image trop sombre pour normaliser, base=${base.toFixed(1)})`); continue; }
  const c = {};
  for (let p = 50; p <= 92; p += 2) c[p] = Math.max(0, Math.min(1, 1 - ligne(p) / base));
  courbes.push({ f, base, c });
}

console.log(`\n${courbes.length} posts exploitables sur ${files.length}\n`);
const head = courbes.map((c) => c.f.replace(/^inspi\//, "").replace(/^test\//, "*").replace(/Capture d'écran 2026-08-18 /, "cap").replace(/\.(jpg|png)/, "").slice(0, 8).padStart(9)).join("");
console.log("  %H" + head + "   MÉDIANE");
for (let p = 50; p <= 92; p += 2) {
  const vals = courbes.map((c) => c.c[p]);
  const med = vals.slice().sort((a, b) => a - b)[Math.floor(vals.length / 2)];
  console.log(
    String(p).padStart(5) +
    vals.map((v) => `${(v * 100).toFixed(0)}%`.padStart(9)).join("") +
    `   ${(med * 100).toFixed(0)}%`.padStart(10),
  );
}
