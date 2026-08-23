import "server-only";
import sharp from "sharp";
import { spawn } from "node:child_process";
import { computeSubjectBoundingBox, SegmentationUnavailableError } from "./segment";
import { computeSubjectAwareCrop, hauteurZonePhoto } from "./smartCrop";

export interface CropTarget {
  width: number;
  height: number;
}

/**
 * Recadrage centré (crop "cover") vers le ratio cible — v1, sans détection
 * de sujet. Conservé comme repli de `cropToAspectSmart` (modèle de
 * détourage indisponible/en échec) : un upload doit toujours produire un
 * `cropped.jpg`, jamais bloquer parce que le détourage a échoué.
 */
export async function cropToAspect(
  inputPath: string,
  outputPath: string,
  target: CropTarget,
): Promise<CropTarget> {
  await sharp(inputPath)
    .resize(target.width, target.height, { fit: "cover", position: "centre" })
    .jpeg({ quality: 92 })
    .toFile(outputPath);
  return target;
}

export interface SmartCropOutcome extends CropTarget {
  /** true si la boîte englobante du sujet a pu être conservée entière **avec sa marge de respiration**. */
  fitsFully: boolean;
  /**
   * true si la boîte englobante du sujet tient entière dans le recadrage,
   * même sans marge — c'est-à-dire : le recadrage strict ne coupe pas dans
   * le sujet. Seul ce critère décide d'un repli en fond flou (2026-08-20).
   */
  fitsSubject: boolean;
  /** true si le détourage a échoué et qu'on est retombé sur le recadrage centré v1. */
  fallbackToCenter: boolean;
  /** true si le sujet ne tenait dans aucun recadrage "cover" 4:5 — image entière affichée sur fond flou/assombri à la place. */
  usedBackdrop: boolean;
}

export interface UploadCropOutcome {
  /** `bulle.jpg` — recadrage paysage dédié aux bulles (marge autour du cercle pour l'effet de débordement). */
  bulle?: SmartCropOutcome;
  /** `cropped.jpg` — toujours un recadrage strict, jamais de fond flou. Utilisé pour les bulles (comportement accepté tel quel par l'utilisateur le 2026-08-20, voir §1.1 point 2). */
  cropped: SmartCropOutcome;
  /** `backdrop.jpg` — identique à `cropped` quand le sujet tient dans le cadre ; sinon photo entière sur fond flou/assombri étendu. Utilisé pour le fond plein cadre des gabarits. */
  backdrop: SmartCropOutcome;
}

async function cropStrict(
  inputPath: string,
  outputPath: string,
  target: CropTarget,
  crop: { left: number; top: number; width: number; height: number },
): Promise<void> {
  await sharp(inputPath)
    .extract({ left: crop.left, top: crop.top, width: crop.width, height: crop.height })
    .resize(target.width, target.height, { fit: "fill" })
    .jpeg({ quality: 92 })
    .toFile(outputPath);
}

/**
 * Fond flou/assombri étendu — dernier recours, uniquement quand le sujet
 * est mathématiquement trop large pour tenir dans un recadrage "cover" 4:5
 * (voir `smartCrop.ts` pour le calcul, et CLAUDE.md §1.1 pour l'historique :
 * un étirement léger plafonné a été essayé comme alternative, écarté par
 * l'utilisateur — déformation trop perceptible sur `test3.webp` — puis la
 * transition nette du fond flou lui-même a été vérifiée légitimement
 * nécessaire sur `test1.jpg` et `test3.webp` : même en rognant le fond
 * jusqu'à la fenêtre maximale sans déformation, le sujet dépasse encore).
 *
 * Transition en fondu (pas un bord net), mais **borné par la position
 * réelle du sujet** (`bbox`, en coordonnées source) — un premier essai
 * dégradait sur toute la bande flou/haut disponible sans regarder où le
 * sujet commence, ce qui aurait fait disparaître progressivement le toit
 * de la voiture (le sujet touche presque le haut du cadre sur certaines
 * photos, voir `test3.webp` : boîte englobante à 42% de la hauteur). Le
 * fondu ne peut jamais mordre plus loin que le bord du sujet le plus
 * proche — juste en dessous, le sujet reste 100% opaque.
 */
async function cropWithBlurredBackdrop(
  inputPath: string,
  outputPath: string,
  target: CropTarget,
  bbox: { top: number; height: number },
): Promise<void> {
  const metadata = await sharp(inputPath).metadata();
  const sourceWidth = metadata.width ?? target.width;
  const sourceHeight = metadata.height ?? target.height;

  const backgroundBuffer = await sharp(inputPath)
    .resize(target.width, target.height, { fit: "cover", position: "centre" })
    .blur(48)
    .modulate({ brightness: 0.55 })
    .toBuffer();

  const scale = Math.min(target.width / sourceWidth, target.height / sourceHeight);
  const containedWidth = Math.round(sourceWidth * scale);
  const containedHeight = Math.round(sourceHeight * scale);
  const availableGap = Math.max(1, Math.round((target.height - containedHeight) / 2));

  // Zone "sûre" pour le fondu, en coordonnées de l'image nette (contenue) :
  // la distance entre le bord de l'image et le bord du sujet le plus
  // proche, jamais plus — pour ne jamais dégrader le sujet lui-même.
  const bboxTopInContained = bbox.top * scale;
  const bboxBottomInContained = (bbox.top + bbox.height) * scale;
  const topFeather = Math.max(1, Math.min(availableGap, Math.round(bboxTopInContained)));
  const bottomFeather = Math.max(
    1,
    Math.min(availableGap, Math.round(containedHeight - bboxBottomInContained)),
  );

  const topStart = (topFeather / containedHeight).toFixed(4);
  const bottomStart = (1 - bottomFeather / containedHeight).toFixed(4);
  const svgMask = `<svg width="${containedWidth}" height="${containedHeight}" xmlns="http://www.w3.org/2000/svg">
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

  const sharpForeground = await sharp(inputPath)
    .resize(containedWidth, containedHeight, { fit: "fill" })
    .ensureAlpha()
    .toBuffer();
  const maskBuffer = await sharp(Buffer.from(svgMask)).png().toBuffer();
  const featheredForeground = await sharp(sharpForeground)
    .composite([{ input: maskBuffer, blend: "dest-in" }])
    .png()
    .toBuffer();

  await sharp(backgroundBuffer)
    .composite([
      {
        input: featheredForeground,
        left: Math.round((target.width - containedWidth) / 2),
        top: Math.round((target.height - containedHeight) / 2),
      },
    ])
    .jpeg({ quality: 92 })
    .toFile(outputPath);
}

/**
 * Recadrage qui respecte les limites du sujet — correctif directeur
 * "Chantier 1" (2026-08-19, voir `smartCrop.ts` pour le détail du calcul
 * mathématique du problème) — puis fond flou/assombri en dernier recours
 * seulement (règle stricte confirmée par l'utilisateur le 2026-08-20 :
 * ne jamais rogner le sujet ; combler l'espace vide par une version
 * floutée/assombrie de la même image uniquement quand c'est
 * géométriquement impossible autrement).
 *
 * Correctif du 2026-08-20 (soir) : le seuil de déclenchement du fond flou
 * était `fitsFully` (boîte englobante **+ marge de 6%**), ce qui déclenchait
 * le repli alors que le sujet tenait parfaitement — il manquait juste la
 * marge. Conséquence mesurée sur `test33.jpeg` : le sujet passait de 97,8%
 * de la largeur du cadre (recadrage strict) à 49,4% (photo entière réduite
 * sur fond flou), soit exactement l'inverse de l'effet recherché. Le seuil
 * est maintenant `fitsSubject` (boîte englobante seule) : la marge devient
 * un confort, plus une condition.
 *
 * Calcule la boîte englobante du sujet une seule fois (détourage sur
 * l'image ORIGINALE, avant tout recadrage) et produit **deux fichiers**
 * distincts à partir de cette même détection :
 *
 * - `cropped.jpg` : toujours le recadrage strict de `computeSubjectAwareCrop`
 *   (zéro déformation, zéro remplissage), même si le sujet dépasse le
 *   cadre — c'est la variante utilisée pour les **bulles** (comportement
 *   accepté tel quel par l'utilisateur le 2026-08-20, voir §1.1 point 2).
 * - `backdrop.jpg` : identique à `cropped.jpg` dès que le sujet tient
 *   entièrement dans le cadre (`fitsSubject: true` — la majorité des
 *   photos, marge de respiration comprise ou non) ; sinon seulement, photo
 *   entière sur fond flou/assombri (`cropWithBlurredBackdrop`). C'est la
 *   variante utilisée pour le **fond plein cadre** des gabarits — la route
 *   de détourage (`/api/images/[id]/segment`) l'utilise pour que la 3e
 *   couche (`sujetUrl`) reste alignée pixel pour pixel avec ce qui est
 *   réellement affiché comme fond.
 *
 * Repli explicite (pas silencieux, `fallbackToCenter` renvoyé à
 * l'appelant) sur `cropToAspect` (recadrage centré v1) si le détourage est
 * indisponible ou ne détecte aucun sujet net — un upload doit toujours
 * produire un résultat, jamais échouer parce que le modèle de détourage
 * est absent (CLAUDE.md §5, §6.6 : jamais de dégradation silencieuse, mais
 * pas non plus de blocage d'une fonction cœur pour un correctif qualité).
 */
export async function cropToAspectSmart(
  inputPath: string,
  croppedOutputPath: string,
  backdropOutputPath: string,
  target: CropTarget,
  backdropTarget: CropTarget = target,
  bulleOutput?: { path: string; target: CropTarget; occupancy: number },
): Promise<UploadCropOutcome> {
  let bbox;
  try {
    bbox = await computeSubjectBoundingBox(inputPath);
  } catch (err) {
    if (err instanceof SegmentationUnavailableError) {
      await cropToAspect(inputPath, croppedOutputPath, target);
      await cropToAspect(inputPath, backdropOutputPath, backdropTarget);
      if (bulleOutput) await cropToAspect(inputPath, bulleOutput.path, bulleOutput.target);
      const base = { fitsFully: false, fitsSubject: false, fallbackToCenter: true, usedBackdrop: false };
      return {
        cropped: { ...target, ...base },
        backdrop: { ...backdropTarget, ...base },
        ...(bulleOutput ? { bulle: { ...bulleOutput.target, ...base } } : {}),
      };
    }
    throw err;
  }

  if (!bbox) {
    await cropToAspect(inputPath, croppedOutputPath, target);
    await cropToAspect(inputPath, backdropOutputPath, backdropTarget);
    if (bulleOutput) await cropToAspect(inputPath, bulleOutput.path, bulleOutput.target);
    const base = { fitsFully: false, fitsSubject: false, fallbackToCenter: true, usedBackdrop: false };
    return {
      cropped: { ...target, ...base },
      backdrop: { ...backdropTarget, ...base },
      ...(bulleOutput ? { bulle: { ...bulleOutput.target, ...base } } : {}),
    };
  }

  const metadata = await sharp(inputPath).metadata();
  const sourceWidth = metadata.width ?? 0;
  const sourceHeight = metadata.height ?? 0;

  // Deux fenêtres distinctes : les bulles gardent le ratio du canevas (4:5),
  // le fond est composé pour la ZONE PHOTO du gabarit (plus large que haute),
  // qui n'occupe pas tout le canevas — voir GABARIT_PHOTO_HEIGHT.
  const crop = computeSubjectAwareCrop(sourceWidth, sourceHeight, bbox, target.width, target.height);

  // Hauteur de zone photo adaptée à CETTE image : on la raccourcit juste assez
  // pour que le sujet tienne, plutôt que de basculer sur le fond flou.
  const hauteurAdaptee = hauteurZonePhoto(
    backdropTarget.width,
    target.height,
    sourceWidth,
    sourceHeight,
    bbox,
  );
  const cibleFond: CropTarget = { width: backdropTarget.width, height: hauteurAdaptee };
  const backdropCrop = computeSubjectAwareCrop(
    sourceWidth,
    sourceHeight,
    bbox,
    cibleFond.width,
    cibleFond.height,
  );

  // Recadrage dédié aux bulles : ratio paysage + cible d'occupation propre,
  // pour laisser une marge autour du cercle (effet de débordement).
  let bulleOutcome: SmartCropOutcome | undefined;
  if (bulleOutput) {
    const bulleCrop = computeSubjectAwareCrop(
      sourceWidth,
      sourceHeight,
      bbox,
      bulleOutput.target.width,
      bulleOutput.target.height,
      undefined,
      bulleOutput.occupancy,
    );
    await cropStrict(inputPath, bulleOutput.path, bulleOutput.target, bulleCrop);
    bulleOutcome = {
      ...bulleOutput.target,
      fitsFully: bulleCrop.fitsFully,
      fitsSubject: bulleCrop.fitsSubject,
      fallbackToCenter: false,
      usedBackdrop: false,
    };
  }

  await cropStrict(inputPath, croppedOutputPath, target, crop);
  const croppedOutcome: SmartCropOutcome = {
    ...target,
    fitsFully: crop.fitsFully,
    fitsSubject: crop.fitsSubject,
    fallbackToCenter: false,
    usedBackdrop: false,
  };

  // Le sujet tient entier dans la fenêtre (avec ou sans la marge de
  // respiration) : recadrage strict, zéro flou, zéro remplissage, zéro
  // déformation. C'est le chemin normal.
  if (backdropCrop.fitsSubject) {
    await cropStrict(inputPath, backdropOutputPath, cibleFond, backdropCrop);
    return {
      cropped: croppedOutcome,
      ...(bulleOutcome ? { bulle: bulleOutcome } : {}),
      backdrop: {
        ...cibleFond,
        fitsFully: backdropCrop.fitsFully,
        fitsSubject: true,
        fallbackToCenter: false,
        usedBackdrop: false,
      },
    };
  }

  // Dernier recours réel : même en utilisant toute la hauteur disponible de
  // la source, la boîte englobante du sujet est plus large que la fenêtre au
  // ratio cible — un recadrage strict couperait dans le sujet lui-même.
  await cropWithBlurredBackdrop(inputPath, backdropOutputPath, cibleFond, bbox);
  return {
    cropped: croppedOutcome,
    ...(bulleOutcome ? { bulle: bulleOutcome } : {}),
    backdrop: { ...cibleFond, fitsFully: false, fitsSubject: false, fallbackToCenter: false, usedBackdrop: true },
  };
}

export class UpscaleUnavailableError extends Error {}

const REALESRGAN_BIN = process.env.REALESRGAN_BIN ?? "realesrgan-ncnn-vulkan";
const REALESRGAN_MODEL = process.env.REALESRGAN_MODEL ?? "realesrgan-x4plus";
const UPSCALE_TIMEOUT_MS = 30_000;

/**
 * Amélioration HD à la demande — jamais automatique (cahier des charges
 * §5.3 et §6.6 : un échec doit être visible, jamais une dégradation
 * silencieuse). Tout échec (binaire absent, pas de device Vulkan, timeout)
 * lève UpscaleUnavailableError avec un message explicite ; l'appelant doit
 * le renvoyer tel quel à l'utilisateur plutôt que produire un résultat dégradé.
 *
 * Risque connu (CLAUDE.md §3.2) : ce binaire cible Vulkan/GPU, et
 * l'hébergement retenu (Oracle Cloud Option B) n'a pas de GPU dédié.
 * Vérifié le 2026-08-18 en environnement de développement (x86_64, sans
 * GPU dédié) : le binaire détecte un device Vulkan logiciel (llvmpipe) et
 * démarre correctement — la contrainte "pas de GPU" n'est donc pas
 * bloquante en soi. Non vérifié : présence de llvmpipe sur l'image Oracle
 * ARM réelle, et vitesse en production — à confirmer au provisioning.
 */
export async function upscale(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(/* turbopackIgnore: true */ REALESRGAN_BIN, [
      "-i",
      inputPath,
      "-o",
      outputPath,
      "-n",
      REALESRGAN_MODEL,
    ]);

    let stderr = "";
    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(
        new UpscaleUnavailableError(
          `Amélioration HD : délai dépassé (${UPSCALE_TIMEOUT_MS / 1000}s).`,
        ),
      );
    }, UPSCALE_TIMEOUT_MS);

    proc.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      const reason =
        err.code === "ENOENT"
          ? `binaire "${REALESRGAN_BIN}" introuvable sur ce serveur`
          : err.message;
      reject(new UpscaleUnavailableError(`Amélioration HD indisponible : ${reason}.`));
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new UpscaleUnavailableError(
            `Amélioration HD a échoué (code ${code}) : ${stderr.slice(-500) || "raison inconnue"}`,
          ),
        );
      }
    });
  });
}
