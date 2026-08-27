import "server-only";
import { google } from "googleapis";
import path from "node:path";
import { readFile } from "node:fs/promises";

let driveClient: ReturnType<typeof google.drive> | null = null;

async function getDrive() {
  if (driveClient) return driveClient;

  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

  if (!keyFile || !serviceEmail) {
    throw new Error(
      "Google Drive non configuré — variables GOOGLE_SERVICE_ACCOUNT_KEY_FILE et GOOGLE_SERVICE_ACCOUNT_EMAIL requises dans .env.local",
    );
  }

  const keyPath = path.isAbsolute(keyFile)
    ? keyFile
    : path.join(process.cwd(), /* turbopackIgnore: true */ keyFile);

  const key = JSON.parse(await readFile(keyPath, "utf-8"));

  const auth = new google.auth.GoogleAuth({
    credentials: key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });

  driveClient = google.drive({ version: "v3", auth });
  return driveClient;
}

/**
 * Upload un fichier texte brut vers le même dossier Drive que l'image.
 * Utilisé pour déposer la légende validée alongside le PNG.
 */
async function uploadCaptionToDrive(
  caption: string,
  filename: string,
  folderId: string,
): Promise<void> {
  const drive = await getDrive();
  const { Readable } = await import("node:stream");
  const buffer = Buffer.from(caption, "utf-8");
  await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType: "text/plain; charset=utf-8",
      body: Readable.from(buffer),
    },
    fields: "id",
  });
}

/**
 * Primitive partagée : dépose un buffer dans un dossier Drive donné.
 * Extraite de `uploadToDrive` (single-image, dossier racine) pour être
 * réutilisée telle quelle par `uploadCarouselToDrive` (N images, sous-dossier
 * dédié) — un seul chemin d'upload, pas deux implémentations qui pourraient
 * diverger.
 */
async function uploadBufferToFolder(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  folderId: string,
  properties?: Record<string, string>,
): Promise<{ fileId: string; webViewLink: string }> {
  const drive = await getDrive();
  const { Readable } = await import("node:stream");

  const fileMetadata: Record<string, unknown> = {
    name: filename,
    parents: [folderId],
  };
  if (properties) {
    fileMetadata.properties = properties;
  }

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id,webViewLink",
  });

  const fileId = file.data.id ?? "";
  const webViewLink = file.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;
  return { fileId, webViewLink };
}

/**
 * Upload un PNG vers le dossier Drive partagé de l'équipe.
 * Si `caption` est fourni, un fichier .txt est déposé dans le même dossier
 * pour que le Community Manager ait image + légende côte à côte.
 *
 * @param pngBuffer — le fichier PNG à uploader
 * @param filename — nom du fichier (ex: "post-2026-08-18-abc123.png")
 * @param metadata — métadonnées optionnelles (titre, hashtags, légende)
 * @returns { fileId, webViewLink } — identifiant et lien web du fichier
 */
export async function uploadToDrive(
  pngBuffer: Buffer,
  filename: string,
  metadata?: { title?: string; hashtags?: string; caption?: string },
): Promise<{ fileId: string; webViewLink: string }> {
  const drive = await getDrive();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!folderId) {
    throw new Error(
      "Google Drive non configuré — variable GOOGLE_DRIVE_FOLDER_ID requise dans .env.local",
    );
  }

  const fileMetadata: Record<string, unknown> = {
    name: filename,
    parents: [folderId],
  };

  if (metadata?.title) {
    fileMetadata.properties = {
      studioTitle: metadata.title,
      studioHashtags: metadata.hashtags ?? "",
    };
  }

  const { Readable } = await import("node:stream");
  const media = {
    mimeType: "image/png",
    body: Readable.from(pngBuffer),
  };

  const file = await drive.files.create({
    requestBody: fileMetadata,
    media,
    fields: "id,webViewLink",
  });

  const fileId = file.data.id ?? "";
  const webViewLink = file.data.webViewLink ?? `https://drive.google.com/file/d/${fileId}/view`;

  // Package unifié : déposer la légende alongside l'image
  if (metadata?.caption && metadata.caption.trim().length > 0) {
    try {
      const txtFilename = filename.replace(/\.png$/i, ".txt");
      await uploadCaptionToDrive(metadata.caption, txtFilename, folderId);
    } catch (err) {
      // Non-fatal : l'image est déjà uploadée, la légende est un bonus
      console.warn("[Drive] Échec upload légende:", err);
    }
  }

  return { fileId, webViewLink };
}

/**
 * Upload un carrousel (plusieurs slides) dans un vrai sous-dossier Drive dédié
 * — contrairement à `uploadToDrive` (single-image), qui dépose à plat dans le
 * dossier racine partagé. `studio/CLAUDE.md` §6b décrivait déjà un "dossier
 * par publication" pour le cas single-image ; vérifié dans le code existant,
 * ça n'a jamais été réellement construit. Ce chemin carrousel est le premier
 * à créer un vrai dossier — le chemin single-image n'est pas touché.
 *
 * @param slides — les PNG déjà rendus, dans l'ordre d'affichage du carrousel
 * @param folderName — nom du sous-dossier (ex: "post-2026-08-27-a1b2c3d4")
 * @param caption — légende du post, déposée une seule fois pour le carrousel entier
 * @returns { folderId, folderUrl } — le dossier créé, compatible avec le
 * callback RADAR existant (`{ driveUrl, driveFileId }`, voir CLAUDE.md §6b) :
 * `driveUrl` devient l'URL du dossier plutôt que d'une image, `driveFileId`
 * son id — aucune migration de schéma RADAR nécessaire.
 */
export async function uploadCarouselToDrive(
  slides: Array<{ buffer: Buffer; filename: string }>,
  folderName: string,
  caption?: string,
): Promise<{ folderId: string; folderUrl: string }> {
  const drive = await getDrive();
  const rootFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!rootFolderId) {
    throw new Error(
      "Google Drive non configuré — variable GOOGLE_DRIVE_FOLDER_ID requise dans .env.local",
    );
  }

  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootFolderId],
    },
    fields: "id,webViewLink",
  });

  const folderId = folder.data.id ?? "";
  const folderUrl = folder.data.webViewLink ?? `https://drive.google.com/drive/folders/${folderId}`;

  for (const slide of slides) {
    await uploadBufferToFolder(slide.buffer, slide.filename, "image/png", folderId);
  }

  if (caption && caption.trim().length > 0) {
    try {
      await uploadCaptionToDrive(caption, "legende.txt", folderId);
    } catch (err) {
      // Non-fatal, même logique que uploadToDrive : les images sont déjà uploadées.
      console.warn("[Drive] Échec upload légende carrousel:", err);
    }
  }

  return { folderId, folderUrl };
}
