#!/usr/bin/env node

/**
 * Script de synchronisation Google Drive → RADAR
 * 
 * Ce script scanne un dossier local contenant les fichiers Google Drive
 * et met à jour la base de données SQLite.
 * 
 * Usage:
 *   node scripts/sync-drive.js [chemin-vers-dossier-drive]
 * 
 * Exemple:
 *   node scripts/sync-drive.js ~/Google\ Drive
 *   node scripts/sync-drive.js /mnt/google-drive
 * 
 * Cron (toutes les heures):
 *   0 * * * * cd /home/land/media_autombile/RADAR && node scripts/sync-drive.js ~/Google\ Drive >> /tmp/drive-sync.log 2>&1
 */

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'radar.db');
const DEFAULT_SYNC_DIR = path.join(process.cwd(), 'drive-sync');

// Get sync directory from args or use default
const syncDir = process.argv[2] || DEFAULT_SYNC_DIR;

console.log(`[Drive Sync] Démarrage: ${syncDir}`);
console.log(`[Drive Sync] Heure: ${new Date().toISOString()}`);

// Initialize database
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// Create tables if not exists
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

// Mime type mapping
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

// Scan directory recursively
function scanDirectory(dirPath: string, parentId: string | null = null): number {
  if (!fs.existsSync(dirPath)) {
    console.log(`[Drive Sync] Dossier non trouvé: ${dirPath}`);
    return 0;
  }

  let count = 0;
  const items = fs.readdirSync(dirPath);

  const insert = db.prepare(`
    INSERT INTO drive_files (drive_id, name, mime_type, path, size, modified_at, created_at, parent_id, is_folder, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(drive_id) DO UPDATE SET
      name = excluded.name,
      mime_type = excluded.mime_type,
      path = excluded.path,
      size = excluded.size,
      modified_at = excluded.modified_at,
      synced_at = datetime('now')
  `);

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    
    try {
      const stat = fs.statSync(fullPath);
      const isFolder = stat.isDirectory();
      
      // Generate unique ID based on path
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
      insert.run(
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

      // Log progress every 100 files
      if (count % 100 === 0) {
        console.log(`[Drive Sync] ${count} fichiers traités...`);
      }

      // Recurse into folders
      if (isFolder) {
        count += scanDirectory(fullPath, driveId);
      }
    } catch (err) {
      console.error(`[Drive Sync] Erreur sur ${fullPath}:`, err);
    }
  }

  return count;
}

// Main
try {
  const total = scanDirectory(syncDir);
  
  // Get stats
  const stats = {
    totalFiles: db.prepare('SELECT COUNT(*) as count FROM drive_files WHERE is_folder = 0').get().count,
    totalFolders: db.prepare('SELECT COUNT(*) as count FROM drive_files WHERE is_folder = 1').get().count,
    totalSize: db.prepare('SELECT SUM(size) as total FROM drive_files WHERE is_folder = 0').get().total || 0,
  };

  console.log(`[Drive Sync] Terminé: ${total} éléments synchronisés`);
  console.log(`[Drive Sync] Stats: ${stats.totalFiles} fichiers, ${stats.totalFolders} dossiers, ${(stats.totalSize / 1024 / 1024).toFixed(1)} MB`);
  
  db.close();
  process.exit(0);
} catch (err) {
  console.error('[Drive Sync] Erreur fatale:', err);
  db.close();
  process.exit(1);
}
