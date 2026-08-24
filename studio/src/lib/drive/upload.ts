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
