// Mesure, pour une image de bulle détourée, quelle part de l'anneau juste au
// -delà du cercle est occupée par le sujet. Sert à décider si l'effet de
// débordement (Chantier 3) est pertinent ou s'il produirait un halo continu.
//
// Repère : la bulle affiche l'image en object-cover dans un carré, et le
// cercle est inscrit dans ce carré. En coordonnées image (L×H, L<H), le carré
// visible est le carré central de côté L, le cercle a pour rayon L/2.
import sharp from "sharp";

const OVERFLOW_SCALE = 1.14;

  for (const f of process.argv.slice(2)) {
    const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { width: W, height: H, channels: C } = info;
    const cx = W / 2, cy = H / 2, r = W / 2;
    const rOut = r * OVERFLOW_SCALE;
    let inAnnulus = 0, covered = 0, insideCovered = 0, inside = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const a = data[(y * W + x) * C + 3];
        if (d <= r) { inside++; if (a >= 128) insideCovered++; }
        else if (d <= rOut) { inAnnulus++; if (a >= 128) covered++; }
      }
    }
    // Couverture d'ARC : sur quelle part du pourtour le sujet franchit-il
    // l'anneau ? C'est ce qui décide de l'aspect visuel — un arc court se lit
    // comme un débordement volontaire (référence : l'arrière de la Mercedes),
    // un arc long fait disparaître l'anneau et donne une bulle "cassée".
    let arcHit = 0, arcTotal = 0, longest = 0, run = 0;
    for (let deg = 0; deg < 360; deg += 1) {
      const a = (deg * Math.PI) / 180;
      const x = Math.round(cx + Math.cos(a) * r * 1.03);
      const y = Math.round(cy + Math.sin(a) * r * 1.03);
      arcTotal++;
      const inBounds = x >= 0 && y >= 0 && x < W && y < H;
      if (inBounds && data[(y * W + x) * C + 3] >= 128) { arcHit++; run++; if (run > longest) longest = run; }
      else run = 0;
    }
    console.log(
      `${f}\n  anneau [r, ${OVERFLOW_SCALE}r] : ${(covered / inAnnulus * 100).toFixed(1)}% de surface couverte` +
      `\n  ARC franchi : ${arcHit}/${arcTotal}° = ${(arcHit / arcTotal * 100).toFixed(1)}%  (plus long arc continu : ${longest}°)` +
      `\n  disque intérieur : ${(insideCovered / inside * 100).toFixed(1)}% couvert`,
    );
  }
