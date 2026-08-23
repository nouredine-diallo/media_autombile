// Vérifie par le calcul les deux exigences du montage :
//
//   1. AUCUNE DÉFORMATION — chaque recadrage produit doit avoir exactement le
//      ratio de sa cible. Une fenêtre extraite avec un ratio différent puis
//      redimensionnée en `fill` étirerait la photo.
//
//   2. LE SUJET PRINCIPAL N'EST JAMAIS MASQUÉ — partout où la découpe du sujet
//      du fond est opaque ET tombe dans le disque d'une bulle, le pixel du
//      montage final doit être celui du FOND, pas celui de la bulle. C'est ce
//      qui donne l'effet de perspective : les bulles passent derrière la
//      voiture, jamais devant.
//
// Usage : node scripts/dev-verifie-empilement.mjs <uploadIdFond> <montage.png>
import sharp from "sharp";
import path from "node:path";

const W = 1080, H = 1350;
const PHOTO_H = Math.round(H * 0.74);
const BULLES = [
  { leftPercent: 31.3, topPercent: 32.5, sizePercent: 46.1 },
  { leftPercent: 68.0, topPercent: 30.8, sizePercent: 47.6 },
];
const CIBLES = {
  "cropped.jpg": 1080 / 1350,
  "backdrop.jpg": 1080 / Math.round(1350 * 0.74),
  "bulle.jpg": 1350 / 1080,
};

const [fondId, montage] = process.argv.slice(2);
const dir = path.join("uploads", fondId);

console.log("1. DÉFORMATION");
let deformationOk = true;
for (const [file, cible] of Object.entries(CIBLES)) {
  try {
    const m = await sharp(path.join(dir, file)).metadata();
    const a = m.width / m.height;
    const ecart = Math.abs(a / cible - 1);
    const ok = ecart < 0.005;
    if (!ok) deformationOk = false;
    console.log(`   ${file.padEnd(14)} ${m.width}x${m.height}  ratio ${a.toFixed(4)} vs cible ${cible.toFixed(4)}  écart ${(ecart * 100).toFixed(2)} %  ${ok ? "OK" : "DÉFORMÉ"}`);
  } catch { console.log(`   ${file.padEnd(14)} absent`); }
}

console.log();
console.log("2. SUJET PRINCIPAL DEVANT LES BULLES");
const subj = await sharp(path.join(dir, "subject.png")).resize(W, PHOTO_H, { fit: "cover" })
  .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const fond = await sharp(path.join(dir, "backdrop.jpg")).resize(W, PHOTO_H, { fit: "fill" })
  .removeAlpha().raw().toBuffer({ resolveWithObject: true });
const rendu = await sharp(montage).removeAlpha().raw().toBuffer({ resolveWithObject: true });

let dansBulle = 0, conforme = 0;
for (const b of BULLES) {
  const cx = (b.leftPercent / 100) * W;
  const cy = (b.topPercent / 100) * H;
  const r = ((b.sizePercent / 100) * W) / 2;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(PHOTO_H - 1, Math.ceil(cy + r)); y += 2) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x += 2) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r * r) continue;
      const i = (y * W + x) * subj.info.channels;
      if (subj.data[i + 3] < 200) continue; // sujet non opaque ici
      dansBulle++;
      const j = (y * W + x) * fond.info.channels;
      const k = (y * W + x) * rendu.info.channels;
      // Le rendu doit reprendre le pixel du fond (le sujet est découpé dedans),
      // à la tolérance JPEG près. Le bandeau titre n'atteint pas cette zone.
      const d = Math.abs(rendu.data[k] - fond.data[j]) + Math.abs(rendu.data[k + 1] - fond.data[j + 1]) + Math.abs(rendu.data[k + 2] - fond.data[j + 2]);
      if (d < 45) conforme++;
    }
  }
}
const taux = dansBulle ? conforme / dansBulle : 1;
console.log(`   pixels de sujet tombant dans une bulle : ${dansBulle}`);
console.log(`   dont affichés comme sujet (et non comme bulle) : ${conforme} = ${(taux * 100).toFixed(1)} %`);
const empilementOk = dansBulle === 0 || taux >= 0.95;
console.log(`   ${empilementOk ? "OK — le sujet passe bien devant les bulles" : "ÉCHEC — une bulle recouvre le sujet"}`);

console.log();
console.log(deformationOk && empilementOk ? "CRITÈRES ATTEINTS" : "CRITÈRES NON ATTEINTS");
process.exit(deformationOk && empilementOk ? 0 : 1);
