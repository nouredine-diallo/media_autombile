import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

async function makePlanche() {
  const dir = "test/phase3";
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".png")).sort();
  if (files.length === 0) {
    console.log("No images found in test/phase3");
    return;
  }

  // Load all images
  const images = await Promise.all(
    files.map(async f => {
      const p = path.join(dir, f);
      const img = sharp(p);
      const metadata = await img.metadata();
      return { p, buffer: await img.toBuffer(), width: metadata.width, height: metadata.height };
    })
  );

  // We want a grid. 2 columns by 2 rows for 4 images.
  const cols = 2;
  const rows = Math.ceil(images.length / cols);

  // Use the first image's dimensions for grid cells (assuming all are the same size)
  const cellW = images[0].width;
  const cellH = images[0].height;

  const totalW = cols * cellW;
  const totalH = rows * cellH;

  const composites = images.map((img, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return {
      input: img.buffer,
      top: row * cellH,
      left: col * cellW
    };
  });

  await sharp({
    create: {
      width: totalW,
      height: totalH,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
  .composite(composites)
  .jpeg({ quality: 80 })
  .toFile("test/planche-phase3.jpg");

  console.log("Planche generated at test/planche-phase3.jpg");
}

makePlanche().catch(console.error);
