// Typologie mesurée des visuels : sur quels types le montage automatique tient,
// sur lesquels il ne tient pas, et pourquoi. Trois indicateurs, chacun relié à
// un défaut observé.
//
//  A. CONTRASTE SUJET/FOND au niveau du contour — commande la qualité du
//     détourage. Faible contraste = contour approximatif, halo ou grignotage.
//  B. LARGEUR DU SUJET rapportée à la HAUTEUR de la source — commande si la
//     zone photo doit se raccourcir, voire si le repli flou se déclenche.
//  C. REMPLISSAGE DU CADRE par le sujet — commande si le gabarit à bulles est
//     jouable (sujet trop gros = bulles avalées) et si un débordement se lit.
import * as ort from "onnxruntime-node";
import sharp from "sharp";
import fs from "node:fs";

const MODEL = "models/u2net.onnx";
const S = 320, MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];
const CACHE = "test/bbox-cache.json";
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

async function masque(f) {
  const session = await ort.InferenceSession.create(MODEL);
  const m = await sharp(f).metadata();
  const { data } = await sharp(f).resize(S, S, { kernel: "lanczos3", fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let mx = 1e-6; for (let i = 0; i < data.length; i++) if (data[i] > mx) mx = data[i];
  const HW = S * S, chw = new Float32Array(3 * HW);
  for (let p = 0; p < HW; p++) {
    chw[p] = (data[p * 3] / mx - MEAN[0]) / STD[0];
    chw[HW + p] = (data[p * 3 + 1] / mx - MEAN[1]) / STD[1];
    chw[2 * HW + p] = (data[p * 3 + 2] / mx - MEAN[2]) / STD[2];
  }
  const r = await session.run({ [session.inputNames[0]]: new ort.Tensor("float32", chw, [1, 3, S, S]) });
  const d0 = r[session.outputNames[0]];
  let mn = Infinity, mxo = -Infinity;
  for (let i = 0; i < d0.data.length; i++) { const v = d0.data[i]; if (v < mn) mn = v; if (v > mxo) mxo = v; }
  const rg = mxo - mn || 1e-6;
  const m320 = new Uint8Array(HW);
  for (let i = 0; i < HW; i++) m320[i] = Math.max(0, Math.min(255, Math.round(((d0.data[i] - mn) / rg) * 255)));
  const up = await sharp(Buffer.from(m320), { raw: { width: S, height: S, channels: 1 } })
    .resize(m.width, m.height, { kernel: "lanczos3" }).toColourspace("b-w").raw().toBuffer();
  return { mask: up, width: m.width, height: m.height };
}

/** Distance de couleur médiane entre l'intérieur et l'extérieur du contour. */
function contraste(rgba, mask, W, H, ch) {
  const ecarts = [];
  const pas = Math.max(2, Math.round(W / 400));
  for (let y = pas; y < H - pas; y += pas) {
    for (let x = pas; x < W - pas; x += pas) {
      const p = y * W + x;
      if (mask[p] < 200) continue;
      // pixel de contour : au moins un voisin franchement hors masque
      for (const [dx, dy] of [[8, 0], [-8, 0], [0, 8], [0, -8]]) {
        const q = (y + dy) * W + (x + dx);
        if (q < 0 || q >= W * H || mask[q] > 40) continue;
        ecarts.push(
          Math.abs(rgba[p * ch] - rgba[q * ch]) +
          Math.abs(rgba[p * ch + 1] - rgba[q * ch + 1]) +
          Math.abs(rgba[p * ch + 2] - rgba[q * ch + 2]),
        );
        break;
      }
    }
  }
  if (!ecarts.length) return 0;
  ecarts.sort((a, b) => a - b);
  return ecarts[Math.floor(ecarts.length / 2)];
}

const FICHIERS = process.argv.slice(2);
console.log("visuel              contraste  largeur/hauteur  remplissage  verdict");
console.log("                    contour    source           du cadre");
for (const f of FICHIERS) {
  const { mask, width: W, height: H } = await masque(f);
  const { data: rgba, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = W, maxX = -1, minY = H, maxY = -1, aire = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (mask[y * W + x] < 40) continue;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    aire++;
  }
  const bw = maxX - minX + 1, bh = maxY - minY + 1;
  const c = contraste(rgba, mask, W, H, info.channels);
  const ratio = bw / H;                 // > 1,08 => la zone photo doit se raccourcir
  const remplissage = aire / (W * H);
  cache[f] = { sourceWidth: W, sourceHeight: H, bbox: { left: minX, top: minY, width: bw, height: bh } };

  const soucis = [];
  if (c < 60) soucis.push("découpe fragile");
  if (ratio > 1.35) soucis.push("zone photo très raccourcie");
  if (remplissage > 0.45) soucis.push("sujet trop grand pour des bulles");
  console.log(
    f.padEnd(20) +
    String(c).padStart(6) + "     " +
    ratio.toFixed(2).padStart(6) + "          " +
    (remplissage * 100).toFixed(0).padStart(3) + "%        " +
    (soucis.length ? soucis.join(", ") : "OK"),
  );
}
fs.writeFileSync(CACHE, JSON.stringify(cache, null, 2));
