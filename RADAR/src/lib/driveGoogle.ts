import { getValidAccessToken } from './google-auth';
import { getDb } from './db';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export interface DriveCloudFile {
  id: string;
  name: string;
  mimeType: string;
  size: string;
  modifiedTime: string;
  createdTime: string;
  parents?: string[];
  thumbnailLink?: string;
  webViewLink?: string;
  iconLink?: string;
}

interface DriveListResponse {
  files: DriveCloudFile[];
  nextPageToken?: string;
}

async function driveFetch(path: string, params?: Record<string, string>): Promise<Response> {
  const token = await getValidAccessToken();
  if (!token) throw new Error('Google Drive non connecté');

  const url = new URL(`${DRIVE_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }

  const response = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Drive API error (${response.status}): ${err}`);
  }

  return response;
}

export async function listDriveFiles(
  folderId?: string,
  pageToken?: string,
  search?: string
): Promise<DriveListResponse> {
  const fields = 'nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,parents,thumbnailLink,webViewLink,iconLink)';

  const params: Record<string, string> = {
    fields,
    pageSize: '100',
    orderBy: 'folder,name',
  };

  let q = 'trashed = false';
  if (folderId) {
    q += ` and '${folderId}' in parents`;
  } else {
    q += ` and 'root' in parents`;
  }
  if (search) {
    q += ` and name contains '${search.replace(/'/g, "\\'")}'`;
  }
  params.q = q;

  if (pageToken) {
    params.pageToken = pageToken;
  }

  const response = await driveFetch('/files', params);
  return response.json();
}

export async function getDriveFile(fileId: string): Promise<DriveCloudFile> {
  const fields = 'id,name,mimeType,size,modifiedTime,createdTime,parents,thumbnailLink,webViewLink,iconLink';
  const response = await driveFetch(`/files/${fileId}`, { fields });
  return response.json();
}

export async function getDriveFileContent(fileId: string): Promise<ReadableStream<Uint8Array> | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  const response = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return null;
  return response.body;
}

export async function getDriveThumbnail(fileId: string): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  const token = await getValidAccessToken();
  if (!token) return null;

  const response = await fetch(`${DRIVE_API}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) return null;
  const contentType = response.headers.get('content-type') || 'image/jpeg';
  const buffer = await response.arrayBuffer();
  return { buffer, contentType };
}

export async function syncDriveToDb(): Promise<{ files: number; folders: number }> {
  const db = getDb();
  let files = 0;
  let folders = 0;

  // Clear old cloud files
  db.prepare('DELETE FROM drive_files WHERE is_cloud = 1').run();

  async function walkFolder(parentId: string | null): Promise<void> {
    let pageToken: string | undefined;

    do {
      const result = await listDriveFiles(parentId ?? undefined, pageToken);
      for (const file of result.files) {
        const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
        const size = parseInt(file.size || '0', 10);

        db.prepare(`
          INSERT INTO drive_files (drive_id, name, mime_type, size, modified_at, created_at, parent_id, is_folder, thumbnail_url, web_view_link, is_cloud, synced_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
          ON CONFLICT(drive_id) DO UPDATE SET
            name = excluded.name,
            mime_type = excluded.mime_type,
            size = excluded.size,
            modified_at = excluded.modified_at,
            thumbnail_url = excluded.thumbnail_url,
            web_view_link = excluded.web_view_link,
            synced_at = datetime('now')
        `).run(
          file.id,
          file.name,
          file.mimeType,
          size,
          file.modifiedTime,
          file.createdTime,
          file.parents?.[0] ?? null,
          isFolder ? 1 : 0,
          file.thumbnailLink ?? null,
          file.webViewLink ?? null
        );

        if (isFolder) {
          folders++;
          await walkFolder(file.id);
        } else {
          files++;
        }
      }

      pageToken = result.nextPageToken;
    } while (pageToken);
  }

  await walkFolder(null);
  return { files, folders };
}

export function getCloudFilesFromDb(parentId?: string, search?: string) {
  const db = getDb();

  let query = 'SELECT * FROM drive_files WHERE is_cloud = 1';
  const params: (string | number)[] = [];

  if (search) {
    query += ' AND name LIKE ?';
    params.push(`%${search}%`);
  } else if (parentId) {
    query += ' AND parent_id = ?';
    params.push(parentId);
  } else if (!search) {
    query += ' AND parent_id IS NULL';
  }

  query += ' ORDER BY is_folder DESC, name ASC';
  return db.prepare(query).all(...params);
}
