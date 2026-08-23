import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

async function makePlanche() {
  const dir = "test/10-posts";
  // Filter for the 10 specific output images
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".png")).sort();
  if (files.length === 0) {
    console.log("No images found in test/10-posts");
    return;
  }

  // Generate labels (using SVG)
  const createLabelSVG = (text, width) => `
    <svg width="${width}" height="30">
      <rect x="0" y="0" width="${width}" height="30" fill="black" opacity="0.8"/>
      <text x="10" y="20" font-family="monospace" font-size="16" fill="#00ff00">${text}</text>
    </svg>
  `;

  const images = await Promise.all(
    files.map(async (f) => {
      const p = path.join(dir, f);
      const img = sharp(p);
      const metadata = await img.metadata();
      const name = f.replace(".png", "");
      const labelBuffer = Buffer.from(createLabelSVG(name, metadata.width));
      return { p, buffer: await img.toBuffer(), labelBuffer, width: metadata.width, height: metadata.height };
    })
  );

  const cols = 5;
  const rows = 2;

  // Assuming all images have same dimension (1080x1350)
  const cellW = images[0].width;
  const cellH = images[0].height;

  const totalW = cols * cellW;
  const totalH = rows * cellH;

  const composites = [];
  images.forEach((img, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = col * cellW;
    const top = row * cellH;
    
    // Add image
    composites.push({
      input: img.buffer,
      top,
      left
    });
    // Add label at the top of the cell
    composites.push({
      input: img.labelBuffer,
      top,
      left
    });
  });

  await sharp({
    create: {
      width: totalW,
      height: totalH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 }
    }
  })
  .composite(composites)
  .jpeg({ quality: 80 })
  .toFile("test/planche-10-posts-phase3.jpg");

  console.log("Planche generated at test/planche-10-posts-phase3.jpg");
}

makePlanche().catch(console.error);
