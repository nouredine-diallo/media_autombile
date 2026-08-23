// Compare concrètement 2 options pour le fond quand le sujet est trop
// large pour un recadrage "cover" 4:5 :
//   A) étirement plafonné (implémentation actuelle, cropToAspectSmart)
//   B) fond flou/assombri + masque alpha dégradé (bords fondus, proposition)
// Usage : node scripts/dev-compare-fond-options.mjs

import * as ort from "onnxruntime-node";
import sharp from "sharp";

const MODEL_PATH = "models/u2net.onnx";
const INPUT_SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const TARGET_W = 1080;
const TARGET_H = 1350;
const INPUT = "test3.webp";

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

function bbox(mask, width, height, threshold=40) {
  let minX=width, minY=height, maxX=-1, maxY=-1;
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    if (mask[y*width+x] >= threshold) {
      if (x<minX) minX=x; if (x>maxX) maxX=x;
      if (y<minY) minY=y; if (y>maxY) maxY=y;
    }
  }
  return { left:minX, top:minY, width:maxX-minX+1, height:maxY-minY+1 };
}

const { mask, width: sourceW, height: sourceH } = await computeMask(INPUT);
const box = bbox(mask, sourceW, sourceH);
console.log(`Boîte englobante du sujet : ${box.width}px sur ${sourceW}px (${(box.width/sourceW*100).toFixed(1)}%)`);

// ---- Option A : étirement plafonné (implémentation actuelle) ----
const MAX_DISTORTION = 0.18;
const MARGIN_RATIO = 0.06;
function computeStretchFitCrop(sourceWidth, sourceHeight, box, targetW, targetH, marginRatio, maxDistortion) {
  const margin = Math.max(box.width, box.height) * marginRatio;
  const neededW = Math.min(box.width + 2*margin, sourceWidth);
  const targetAspect = targetW/targetH;
  let coverW = sourceHeight*targetAspect;
  if (coverW > sourceWidth) coverW = sourceWidth;
  let cropW = Math.max(neededW, coverW);
  const cropH = sourceHeight;
  const distortionFor = (w) => (targetH/cropH)/(targetW/w);
  if (distortionFor(cropW) - 1 > maxDistortion) {
    cropW = ((1+maxDistortion)*targetW*cropH)/targetH;
    cropW = Math.min(Math.max(cropW, coverW), sourceWidth);
  }
  const bboxCx = box.left + box.width/2;
  let left = bboxCx - cropW/2;
  left = Math.max(0, Math.min(sourceWidth-cropW, left));
  return { left: Math.round(left), top: 0, width: Math.round(cropW), height: Math.round(cropH), distortion: distortionFor(cropW) };
}

const stretchCrop = computeStretchFitCrop(sourceW, sourceH, box, TARGET_W, TARGET_H, MARGIN_RATIO, MAX_DISTORTION);
console.log(`\nOption A (étirement plafonné) :`);
console.log(`  fenêtre recadrée : ${stretchCrop.width}px sur ${sourceW}px (contre 800px pour un "cover" pur, boîte=${box.width}px)`);
console.log(`  pixels de la boîte encore hors-cadre : ${Math.max(0, box.width - stretchCrop.width)}px sur ${box.width}px`);
console.log(`  étirement vertical relatif à l'horizontal : ${((stretchCrop.distortion-1)*100).toFixed(1)}%`);

await sharp(INPUT)
  .extract({ left: stretchCrop.left, top: stretchCrop.top, width: stretchCrop.width, height: stretchCrop.height })
  .resize(TARGET_W, TARGET_H, { fit: "fill" })
  .jpeg({ quality: 92 })
  .toFile("test/fond-option-A-etirement.jpg");
console.log("  -> test/fond-option-A-etirement.jpg");

// ---- Option B : fond flou/assombri + masque alpha dégradé (bords fondus) ----
const FEATHER_PX = 130; // hauteur du fondu, à ajuster si besoin

const backgroundBuffer = await sharp(INPUT)
  .resize(TARGET_W, TARGET_H, { fit: "cover", position: "centre" })
  .blur(48)
  .modulate({ brightness: 0.55 })
  .toBuffer();

const scale = Math.min(TARGET_W / sourceW, TARGET_H / sourceH);
const containedW = Math.round(sourceW * scale);
const containedH = Math.round(sourceH * scale);

// Masque SVG : dégradé vertical, opaque au centre, transparent sur les
// FEATHER_PX derniers pixels en haut et en bas de l'image nette.
const svgMask = `
<svg width="${containedW}" height="${containedH}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="white" stop-opacity="0"/>
      <stop offset="${(FEATHER_PX / containedH).toFixed(4)}" stop-color="white" stop-opacity="1"/>
      <stop offset="${(1 - FEATHER_PX / containedH).toFixed(4)}" stop-color="white" stop-opacity="1"/>
      <stop offset="1" stop-color="white" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#fade)"/>
</svg>`;

const sharpForeground = await sharp(INPUT).resize(containedW, containedH, { fit: "fill" }).ensureAlpha().toBuffer();
const maskBuffer = await sharp(Buffer.from(svgMask)).png().toBuffer();

const featheredForeground = await sharp(sharpForeground)
  .composite([{ input: maskBuffer, blend: "dest-in" }])
  .png()
  .toBuffer();

await sharp(backgroundBuffer)
  .composite([{ input: featheredForeground, left: Math.round((TARGET_W - containedW)/2), top: Math.round((TARGET_H - containedH)/2) }])
  .jpeg({ quality: 92 })
  .toFile("test/fond-option-B-flou-fondu.jpg");
console.log(`\nOption B (fond flou + bords fondus, ${FEATHER_PX}px) :`);
console.log(`  image nette : ${containedW}x${containedH} (pas de coupe, zéro déformation)`);
console.log("  -> test/fond-option-B-flou-fondu.jpg");
