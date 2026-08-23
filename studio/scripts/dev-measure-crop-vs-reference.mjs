// Compare le recadrage centré v1 et le recadrage "aware" (Chantier 1,
// 2026-08-19) sur une image donnée — mesure en pixels la marge autour de
// la boîte englobante du sujet pour chacun (négatif = sujet coupé).
//
// Usage : node scripts/dev-measure-crop-vs-reference.mjs <chemin-image> [targetW] [targetH]

import * as ort from "onnxruntime-node";
import sharp from "sharp";

const MODEL_PATH = "models/u2net.onnx";
const INPUT_SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

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
    const r = resizedRgb[p*3]/maxVal, g = resizedRgb[p*3+1]/maxVal, b = resizedRgb[p*3+2]/maxVal;
    chw[p] = (r-MEAN[0])/STD[0]; chw[HW+p] = (g-MEAN[1])/STD[1]; chw[2*HW+p] = (b-MEAN[2])/STD[2];
  }
  const inputTensor = new ort.Tensor("float32", chw, [1,3,INPUT_SIZE,INPUT_SIZE]);
  const results = await session.run({ [session.inputNames[0]]: inputTensor });
  const d0 = results[session.outputNames[0]];
  let mn=Infinity, mx=-Infinity;
  for (let i=0;i<d0.data.length;i++){ const v=d0.data[i]; if(v<mn)mn=v; if(v>mx)mx=v; }
  const range = mx-mn || 1e-6;
  const mask320 = new Uint8Array(HW);
  for (let i=0;i<HW;i++) mask320[i] = Math.max(0,Math.min(255,Math.round(((d0.data[i]-mn)/range)*255)));

  const maskResized = await sharp(Buffer.from(mask320), { raw: { width: INPUT_SIZE, height: INPUT_SIZE, channels: 1 } })
    .resize(origW, origH, { kernel: "lanczos3" }).toColourspace("b-w").raw().toBuffer();

  return { mask: maskResized, width: origW, height: origH };
}

function bbox(mask, width, height, threshold=40) {
  let minX=width, minY=height, maxX=-1, maxY=-1;
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    if (mask[y*width+x] >= threshold) {
      if (x<minX) minX=x; if (x>maxX) maxX=x;
      if (y<minY) minY=y; if (y>maxY) maxY=y;
    }
  }
  if (maxX<minX) return null;
  return { left:minX, top:minY, width:maxX-minX+1, height:maxY-minY+1 };
}

function oldCenterCrop(sourceW, sourceH, targetW, targetH) {
  const targetAspect = targetW/targetH;
  let cropW = sourceH*targetAspect, cropH = sourceH;
  if (cropW > sourceW) { cropW = sourceW; cropH = sourceW/targetAspect; }
  return { left: Math.round((sourceW-cropW)/2), top: Math.round((sourceH-cropH)/2), width: Math.round(cropW), height: Math.round(cropH) };
}

function newSmartCrop(sourceW, sourceH, box, targetW, targetH, marginRatio=0.06) {
  const targetAspect = targetW/targetH;
  let cropW = sourceH*targetAspect, cropH = sourceH;
  if (cropW > sourceW) { cropW = sourceW; cropH = sourceW/targetAspect; }
  const margin = Math.max(box.width, box.height)*marginRatio;
  const cx = box.left+box.width/2, cy = box.top+box.height/2;
  let left = cx-cropW/2, top = cy-cropH/2;
  left = Math.max(0, Math.min(sourceW-cropW, left));
  top = Math.max(0, Math.min(sourceH-cropH, top));
  return { left: Math.round(left), top: Math.round(top), width: Math.round(cropW), height: Math.round(cropH) };
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/dev-measure-crop-vs-reference.mjs <chemin-image> [targetW] [targetH]");
  process.exit(1);
}
const targetW = Number(process.argv[3] ?? 1080);
const targetH = Number(process.argv[4] ?? 1350);

const { mask, width, height } = await computeMask(inputPath);
const box = bbox(mask, width, height);
console.log("Image source:", width, "x", height);
console.log("Boîte englobante du sujet (voiture):", box, `(${(box.width/width*100).toFixed(1)}% de la largeur)`);

const oldCrop = oldCenterCrop(width, height, targetW, targetH);
const newCrop = newSmartCrop(width, height, box, targetW, targetH);
console.log("\nAncien recadrage (centré) :", oldCrop);
console.log("Nouveau recadrage (aware) :", newCrop);

function margins(crop, box) {
  const boxRight = box.left+box.width, boxBottom = box.top+box.height;
  const cropRight = crop.left+crop.width, cropBottom = crop.top+crop.height;
  return {
    gauche: box.left - crop.left,
    droite: cropRight - boxRight,
    haut: box.top - crop.top,
    bas: cropBottom - boxBottom,
  };
}
console.log("\nMarges (px, négatif = sujet coupé) — ancien:", margins(oldCrop, box));
console.log("Marges (px, négatif = sujet coupé) — nouveau:", margins(newCrop, box));
