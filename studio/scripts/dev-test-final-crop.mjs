// Teste l'architecture de recadrage du fond sur plusieurs images réelles, en
// reproduisant exactement la logique de src/lib/images/pipeline.ts +
// smartCrop.ts (copie fonctionnelle, pas d'import TS direct depuis un .mjs).
//
// Règle testée ici (2026-08-20, correctif "point 4") : le fond flou n'est plus
// déclenché par `fitsFully` (boîte englobante + marge de 6%) mais par
// `fitsSubject` (boîte englobante seule). Autrement dit : on recadre au plus
// serré que la hauteur de la source permet, sans flou, tant que le sujet n'est
// pas coupé — le flou ne reste que pour le cas où le sujet est réellement plus
// large que la fenêtre maximale.
//
// Usage : node scripts/dev-test-final-crop.mjs
//   (utilise test/bbox-cache.json si présent, sinon relance u2net)

import * as ort from "onnxruntime-node";
import sharp from "sharp";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const MODEL_PATH = "models/u2net.onnx";
const INPUT_SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const TARGET_W = 1080;
const TARGET_H = 1350;
const MARGIN_RATIO = 0.06;
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
    const r = resizedRgb[p*3]/maxVal, g = resizedRgb[p*3+1]/maxVal, b = resizedRgb[p*3+2]/maxVal;
    chw[p]=(r-MEAN[0])/STD[0]; chw[HW+p]=(g-MEAN[1])/STD[1]; chw[2*HW+p]=(b-MEAN[2])/STD[2];
  }
  const inputTensor = new ort.Tensor("float32", chw, [1,3,INPUT_SIZE,INPUT_SIZE]);
  const results = await session.run({ [session.inputNames[0]]: inputTensor });
  const d0 = results[session.outputNames[0]];
  let mn=Infinity, mx=-Infinity;
  for (let i=0;i<d0.data.length;i++){ const v=d0.data[i]; if(v<mn)mn=v; if(v>mx)mx=v; }
  const range = mx-mn || 1e-6;
  const mask320 = new Uint8Array(HW);
  for (let i=0;i<HW;i++) mask320[i]=Math.max(0,Math.min(255,Math.round(((d0.data[i]-mn)/range)*255)));
  const maskResized = await sharp(Buffer.from(mask320), { raw: { width: INPUT_SIZE, height: INPUT_SIZE, channels: 1 } })
    .resize(origW, origH, { kernel: "lanczos3" }).toColourspace("b-w").raw().toBuffer();
  return { mask: maskResized, width: origW, height: origH };
}

function bboxOf(mask, width, height, threshold=40) {
  let minX=width, minY=height, maxX=-1, maxY=-1;
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    if (mask[y*width+x] >= threshold) {
      if (x<minX) minX=x; if (x>maxX) maxX=x;
      if (y<minY) minY=y; if (y>maxY) maxY=y;
    }
  }
  return { left:minX, top:minY, width:maxX-minX+1, height:maxY-minY+1 };
}

const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

async function getBox(inputPath) {
  if (cache[inputPath]) return cache[inputPath];
  const { mask, width, height } = await computeMask(inputPath);
  const entry = { sourceWidth: width, sourceHeight: height, bbox: bboxOf(mask, width, height) };
  cache[inputPath] = entry;
  writeFileSync(CACHE, JSON.stringify(cache, null, 2));
  return entry;
}

function computeSubjectAwareCrop(sourceWidth, sourceHeight, box, targetW, targetH, marginRatio) {
  const targetAspect = targetW/targetH;
  let cropW = sourceHeight*targetAspect, cropH = sourceHeight;
  if (cropW > sourceWidth) { cropW = sourceWidth; cropH = sourceWidth/targetAspect; }
  const margin = Math.max(box.width, box.height)*marginRatio;
  const neededW = box.width+2*margin, neededH = box.height+2*margin;
  const cx = box.left+box.width/2, cy = box.top+box.height/2;
  const fitsFully = neededW<=cropW && neededH<=cropH;
  const fitsSubject = box.width<=cropW && box.height<=cropH;
  let left = cx-cropW/2, top = cy-cropH/2;
  left = Math.max(0, Math.min(sourceWidth-cropW, left));
  top = Math.max(0, Math.min(sourceHeight-cropH, top));
  return { left: Math.round(left), top: Math.round(top), width: Math.round(cropW), height: Math.round(cropH), fitsFully, fitsSubject };
}

async function processImage(inputPath, outLabel) {
  console.log(`\n=== ${inputPath} ===`);
  const { sourceWidth: sourceW, sourceHeight: sourceH, bbox: box } = await getBox(inputPath);
  console.log(`Source : ${sourceW}x${sourceH} — boîte du sujet : left=${box.left} w=${box.width}px (${(box.width/sourceW*100).toFixed(1)}% de la largeur source)`);

  const crop = computeSubjectAwareCrop(sourceW, sourceH, box, TARGET_W, TARGET_H, MARGIN_RATIO);
  const neededWithMargin = (box.width*(1+2*MARGIN_RATIO)).toFixed(0);
  console.log(`Fenêtre maximale au ratio 4:5 (toute la hauteur source) : ${crop.width}x${crop.height} à x=${crop.left}..${crop.left+crop.width}, y=${crop.top}..${crop.top+crop.height}`);
  console.log(`  boîte sujet ${box.width}px  -> fitsSubject = ${crop.fitsSubject}`);
  console.log(`  boîte+marge ${neededWithMargin}px -> fitsFully   = ${crop.fitsFully}`);

  const outPath = `test/final-${outLabel}.jpg`;
  if (crop.fitsSubject) {
    // Chemin normal : recadrage strict, aucun flou, aucune déformation.
    await sharp(inputPath)
      .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
      .resize(TARGET_W, TARGET_H, { fit: "fill" })
      .jpeg({ quality: 92 })
      .toFile(outPath);
    const occupancy = box.width / crop.width * 100;
    const marginLeft = (box.left - crop.left) / crop.width * 100;
    const marginRight = (crop.left + crop.width - (box.left + box.width)) / crop.width * 100;
    console.log(`-> RECADRAGE STRICT, sans flou : ${outPath}`);
    console.log(`   occupation du sujet dans le cadre final : ${occupancy.toFixed(1)}% de la largeur`);
    console.log(`   marge résiduelle : ${marginLeft.toFixed(1)}% à gauche, ${marginRight.toFixed(1)}% à droite`);
    return;
  }

  // Dernier recours : le sujet est plus large que la fenêtre maximale.
  const backgroundBuffer = await sharp(inputPath)
    .resize(TARGET_W, TARGET_H, { fit: "cover", position: "centre" })
    .blur(48).modulate({ brightness: 0.55 }).toBuffer();
  const scale = Math.min(TARGET_W/sourceW, TARGET_H/sourceH);
  const containedW = Math.round(sourceW*scale), containedH = Math.round(sourceH*scale);
  const availableGap = Math.max(1, Math.round((TARGET_H - containedH) / 2));

  const bboxTopInContained = box.top * scale;
  const bboxBottomInContained = (box.top + box.height) * scale;
  const topFeather = Math.max(1, Math.min(availableGap, Math.round(bboxTopInContained)));
  const bottomFeather = Math.max(1, Math.min(availableGap, Math.round(containedH - bboxBottomInContained)));
  console.log(`fondu haut=${topFeather}px bas=${bottomFeather}px (zone dispo=${availableGap}px, boîte sujet ${bboxTopInContained.toFixed(0)}-${bboxBottomInContained.toFixed(0)} sur ${containedH})`);

  const topStart = (topFeather / containedH).toFixed(4);
  const bottomStart = (1 - bottomFeather / containedH).toFixed(4);
  const svgMask = `<svg width="${containedW}" height="${containedH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="white" stop-opacity="0"/>
        <stop offset="${topStart}" stop-color="white" stop-opacity="1"/>
        <stop offset="${bottomStart}" stop-color="white" stop-opacity="1"/>
        <stop offset="1" stop-color="white" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#fade)"/>
  </svg>`;
  const sharpForeground = await sharp(inputPath).resize(containedW, containedH, { fit: "fill" }).ensureAlpha().toBuffer();
  const maskBuffer = await sharp(Buffer.from(svgMask)).png().toBuffer();
  const featheredForeground = await sharp(sharpForeground).composite([{ input: maskBuffer, blend: "dest-in" }]).png().toBuffer();

  await sharp(backgroundBuffer)
    .composite([{ input: featheredForeground, left: Math.round((TARGET_W-containedW)/2), top: Math.round((TARGET_H-containedH)/2) }])
    .jpeg({ quality: 92 })
    .toFile(outPath);
  const occupancy = box.width * scale / TARGET_W * 100;
  console.log(`-> DERNIER RECOURS, fond flou/assombri (sujet ${box.width}px > fenêtre ${crop.width}px) : ${outPath}`);
  console.log(`   occupation du sujet dans le cadre final : ${occupancy.toFixed(1)}% de la largeur`);
}

await processImage("test1.jpg", "test1");
await processImage("test3.webp", "test3");
await processImage("test33.jpeg", "test33");
