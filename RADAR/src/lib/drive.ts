import { getDb } from './db';
import fs from 'fs';
import path from 'path';

export interface DriveFile {
  id: number;
  drive_id: string;
  name: string;
  mime_type: string;
  path: string;
  size: number;
  modified_at: string;
  created_at: string;
  parent_id: string | null;
  is_folder: boolean;
  thumbnail_url: string | null;
  web_view_link: string | null;
  synced_at: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  path: string;
  parent_id: string | null;
}

// Local sync directory
const SYNC_DIR = path.join(process.cwd(), 'drive-sync');

// Initialize drive tables
export function initDriveDb() {
  const db = getDb();
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS drive_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      drive_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      mime_type TEXT,
      path TEXT NOT NULL,
      size INTEGER DEFAULT 0,
      modified_at TEXT,
      created_at TEXT,
      parent_id TEXT,
      is_folder INTEGER DEFAULT 0,
      thumbnail_url TEXT,
      web_view_link TEXT,
      synced_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_drive_files_name ON drive_files(name);
    CREATE INDEX IF NOT EXISTS idx_drive_files_parent ON drive_files(parent_id);
    CREATE INDEX IF NOT EXISTS idx_drive_files_path ON drive_files(path);
  `);
}

// Scan local directory and update database
export function syncLocalDirectory(dirPath: string = SYNC_DIR, parentId: string | null = null): number {
  const db = getDb();
  initDriveDb();
  
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return 0;
  }

  let count = 0;
  const items = fs.readdirSync(dirPath);

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);
    const isFolder = stat.isDirectory();
    const driveId = `local-${Buffer.from(fullPath).toString('base64').replace(/=/g, '').substring(0, 20)}`;
    
    // Get mime type
    let mimeType = 'application/octet-stream';
    if (isFolder) {
      mimeType = 'application/x-directory';
    } else {
      const ext = path.extname(item).toLowerCase();
      mimeType = getMimeType(ext);
    }

    // Insert or update
    db.prepare(`
      INSERT INTO drive_files (drive_id, name, mime_type, path, size, modified_at, created_at, parent_id, is_folder, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(drive_id) DO UPDATE SET
        name = excluded.name,
        mime_type = excluded.mime_type,
        path = excluded.path,
        size = excluded.size,
        modified_at = excluded.modified_at,
        synced_at = datetime('now')
    `).run(
      driveId,
      item,
      mimeType,
      fullPath,
      stat.size,
      stat.mtime.toISOString(),
      stat.birthtime.toISOString(),
      parentId,
      isFolder ? 1 : 0
    );

    count++;

    // Recurse into folders
    if (isFolder) {
      count += syncLocalDirectory(fullPath, driveId);
    }
  }

  return count;
}

// Get all files with optional search
export function getDriveFiles(search?: string, parentId?: string): DriveFile[] {
  const db = getDb();
  initDriveDb();

  let query = 'SELECT * FROM drive_files WHERE 1=1';
  const params: (string | number)[] = [];

  if (search) {
    query += ' AND name LIKE ?';
    params.push(`%${search}%`);
  }

  if (parentId) {
    query += ' AND parent_id = ?';
    params.push(parentId);
  } else if (!search) {
    query += ' AND parent_id IS NULL';
  }

  query += ' ORDER BY is_folder DESC, name ASC';

  return db.prepare(query).all(...params) as DriveFile[];
}

// Get file by ID
export function getDriveFileById(id: number): DriveFile | null {
  const db = getDb();
  initDriveDb();
  return db.prepare('SELECT * FROM drive_files WHERE id = ?').get(id) as DriveFile | null;
}

// Get breadcrumb path
export function getBreadcrumb(fileId: number): DriveFile[] {
  const db = getDb();
  const file = db.prepare('SELECT * FROM drive_files WHERE id = ?').get(fileId) as DriveFile | undefined;
  if (!file) return [];

  const breadcrumb: DriveFile[] = [file];
  let current = file;

  while (current.parent_id) {
    const parent = db.prepare('SELECT * FROM drive_files WHERE drive_id = ?').get(current.parent_id) as DriveFile | undefined;
    if (!parent) break;
    breadcrumb.unshift(parent);
    current = parent;
  }

  return breadcrumb;
}

// Get folder contents
export function getFolderContents(folderId: string): DriveFile[] {
  return getDriveFiles(undefined, folderId);
}

// Get storage stats
export function getDriveStats() {
  const db = getDb();
  initDriveDb();

  const totalFiles = db.prepare('SELECT COUNT(*) as count FROM drive_files WHERE is_folder = 0').get() as { count: number };
  const totalFolders = db.prepare('SELECT COUNT(*) as count FROM drive_files WHERE is_folder = 1').get() as { count: number };
  const totalSize = db.prepare('SELECT SUM(size) as total FROM drive_files WHERE is_folder = 0').get() as { total: number };
  const lastSync = db.prepare('SELECT MAX(synced_at) as last FROM drive_files').get() as { last: string | null };

  return {
    totalFiles: totalFiles.count,
    totalFolders: totalFolders.count,
    totalSize: totalSize.total || 0,
    lastSync: lastSync.last,
  };
}

// Helper: get mime type from extension
function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.json': 'application/json',
    '.zip': 'application/zip',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

// Helper: format file size
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// L'icône de fichier est désormais un composant vectoriel côté interface
// (voir `fileIconFor` dans src/app/drive/page.tsx). Aucun emoji ne doit
// remonter depuis la couche données : le rendu dépendrait du système.
