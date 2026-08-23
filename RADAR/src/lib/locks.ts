import { getDb } from './db';

export interface LockInfo {
  locked_by: string | null;
  locked_at: string | null;
}

export function acquireLock(articleId: number, username: string): LockInfo {
  const db = getDb();
  const article = db.prepare(
    'SELECT locked_by, locked_at FROM articles WHERE id = ?'
  ).get(articleId) as LockInfo | undefined;

  if (!article) return { locked_by: null, locked_at: null };

  // Check if already locked by someone else
  if (article.locked_by && article.locked_by !== username) {
    // Check if lock is stale (older than 2 minutes)
    const lockAge = article.locked_at
      ? (Date.now() - new Date(article.locked_at).getTime()) / 1000
      : Infinity;

    if (lockAge < 120) {
      // Lock is fresh, deny
      return { locked_by: article.locked_by, locked_at: article.locked_at };
    }
    // Lock is stale, steal it
  }

  // Acquire or refresh lock
  db.prepare(`
    UPDATE articles SET locked_by = ?, locked_at = datetime('now') WHERE id = ?
  `).run(username, articleId);

  return { locked_by: username, locked_at: new Date().toISOString() };
}

export function releaseLock(articleId: number, username: string): void {
  const db = getDb();
  db.prepare(`
    UPDATE articles SET locked_by = NULL, locked_at = NULL
    WHERE id = ? AND locked_by = ?
  `).run(articleId, username);
}

export function heartbeat(articleId: number, username: string): boolean {
  const db = getDb();
  const result = db.prepare(`
    UPDATE articles SET locked_at = datetime('now')
    WHERE id = ? AND locked_by = ?
  `).run(articleId, username);
  return result.changes > 0;
}

export function forceUnlock(articleId: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE articles SET locked_by = NULL, locked_at = NULL WHERE id = ?
  `).run(articleId);
}

export function unlockStale(): number {
  const db = getDb();
  // Unlock articles not pinged in 2 minutes
  const result = db.prepare(`
    UPDATE articles SET locked_by = NULL, locked_at = NULL
    WHERE locked_by IS NOT NULL
      AND locked_at < datetime('now', '-2 minutes')
  `).run();
  return result.changes;
}

export function getLockStatus(articleIds: number[]): Record<number, LockInfo> {
  if (articleIds.length === 0) return {};
  const db = getDb();
  const placeholders = articleIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT id, locked_by, locked_at FROM articles WHERE id IN (${placeholders})
  `).all(...articleIds) as { id: number; locked_by: string | null; locked_at: string | null }[];

  const map: Record<number, LockInfo> = {};
  for (const row of rows) {
    map[row.id] = { locked_by: row.locked_by, locked_at: row.locked_at };
  }
  return map;
}
