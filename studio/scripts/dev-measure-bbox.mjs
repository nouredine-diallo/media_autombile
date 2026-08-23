// Mesure la boîte englobante réelle du sujet (u2net, même pré/post-traitement
// que src/lib/images/segment.ts) sur les images passées en argument, et écrit
// le résultat dans test/bbox-cache.json pour éviter de relancer ONNX à chaque
// itération de test de recadrage.
// Usage : node scripts/dev-measure-bbox.mjs test3.webp test33.jpeg

import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { writeFileSync, existsSync, readFileSync } from "node:fs";

const MODEL_PATH = "models/u2net.onnx";
const INPUT_SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const CACHE = "test/bbox-cache.json";

async function computeMask(inputPath) {
  const session = await ort.InferenceSession.create(MODEL_PATH);
  const metadata = await sharp(inputPath).metadata();
  const origW = metadata.width, origH = metadata.height;
  const { data: resizedRgb } = await sharp(inputPath)
    .resize(INPUT_SIZE, INPUT_SIZE, { kernel: "lanczos3", fit: "fill" })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let maxVal = 1e-6;
  for (let i = 0; i < resizedRgb.length; i++) if (resizedRgb[i] > maxVal) maxVal = resizedRgb[i];
  const HW = INPUT_SIZE * INPUT_SIZE;
  const chw = new Float32Array(3 * HW);
  for (let p = 0; p < HW; p++) {
    const r = resizedRgb[p * 3] / maxVal, g = resizedRgb[p * 3 + 1] / maxVal, b = resizedRgb[p * 3 + 2] / maxVal;
    chw[p] = (r - MEAN[0]) / STD[0]; chw[HW + p] = (g - MEAN[1]) / STD[1]; chw[2 * HW + p] = (b - MEAN[2]) / STD[2];
  }
  const inputTensor = new ort.Tensor("float32", chw, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const results = await session.run({ [session.inputNames[0]]: inputTensor });
  const d0 = results[session.outputNames[0]];
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < d0.data.length; i++) { const v = d0.data[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const range = mx - mn || 1e-6;
  const mask320 = new Uint8Array(HW);
  for (let i = 0; i < HW; i++) mask320[i] = Math.max(0, Math.min(255, Math.round(((d0.data[i] - mn) / range) * 255)));
  const maskResized = await sharp(Buffer.from(mask320), { raw: { width: INPUT_SIZE, height: INPUT_SIZE, channels: 1 } })
    .resize(origW, origH, { kernel: "lanczos3" }).toColourspace("b-w").raw().toBuffer();
  return { mask: maskResized, width: origW, height: origH };
}

function bbox(mask, width, height, threshold = 40) {
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (mask[y * width + x] >= threshold) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

const files = process.argv.slice(2);
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

for (const f of files) {
  const { mask, width, height } = await computeMask(f);
  const box = bbox(mask, width, height);
  cache[f] = { sourceWidth: width, sourceHeight: height, bbox: box };
  console.log(
    `${f} : source ${width}x${height} — sujet left=${box.left} top=${box.top} ` +
    `w=${box.width} h=${box.height} (${(box.width / width * 100).toFixed(1)}% de la largeur source)`,
  );
}

writeFileSync(CACHE, JSON.stringify(cache, null, 2));
console.log(`\n-> ${CACHE}`);
