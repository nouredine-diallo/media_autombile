import { getDb } from "./db";
import path from "path";
import fs from "fs/promises";

/**
 * Nettoyage du cache et archivage des données obsolètes.
 * 
 * Règles de rétention :
 * - visual-cache : 72h (déjà implémenté dans visualSearch.ts)
 * - pipeline_runs : 30 jours
 * - items sans image : 14 jours
 * - events sans article : 7 jours
 * - calendar_events passés : 90 jours
 */

const PIPELINE_RETENTION_DAYS = 30;
const ITEMS_RETENTION_DAYS = 14;
const EVENTS_RETENTION_DAYS = 7;
const CALENDAR_RETENTION_DAYS = 90;

/**
 * Supprime les anciennes exécutions de pipeline.
 */
export function cleanupOldPipelineRuns(): number {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - PIPELINE_RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString();

  const result = db.prepare("DELETE FROM pipeline_runs WHERE started_at < ?").run(cutoffStr);
  return result.changes;
}

/**
 * Archive (flag comme duplicates) les items sans image trop anciens.
 */
export function cleanupOldItemsWithoutImages(): number {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ITEMS_RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString();

  // Flag comme doublons les items sans image trop anciens
  const result = db.prepare(`
    UPDATE items 
    SET is_duplicate = 1 
    WHERE image_url IS NULL 
    AND image_rejected = 0
    AND fetched_at < ?
    AND is_duplicate = 0
  `).run(cutoffStr);

  return result.changes;
}

/**
 * Supprime les événements orphelins (sans article et trop anciens).
 */
export function cleanupOldEvents(): number {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - EVENTS_RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString();

  // Supprime les événements sans article et sans brief
  const result = db.prepare(`
    DELETE FROM events 
    WHERE id NOT IN (SELECT event_id FROM articles)
    AND id NOT IN (SELECT event_id FROM briefs)
    AND first_seen_at < ?
  `).run(cutoffStr);

  return result.changes;
}

/**
 * Supprime les calendar_events passés (hors publication_instagram gardées comme historique).
 */
export function cleanupOldCalendarEvents(): number {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CALENDAR_RETENTION_DAYS);
  const cutoffStr = cutoff.toISOString();

  // Supprime les événements calendrier passés sauf les publications Instagram
  const result = db.prepare(`
    DELETE FROM calendar_events 
    WHERE end_date < ?
    AND event_type != 'publication_instagram'
  `).run(cutoffStr);

  return result.changes;
}

/**
 * Nettoyage complet du cache et archivage.
 * Exécuté après chaque pipeline run ou manuellement.
 */
export interface CacheCleanupResult {
  pipelineRunsDeleted: number;
  itemsArchived: number;
  eventsDeleted: number;
  calendarEventsDeleted: number;
  visualCacheFreed: string;
  timestamp: string;
}

export async function runCacheCleanup(): Promise<CacheCleanupResult> {
  console.log("[cache-cleanup] Début du nettoyage...");

  const pipelineRunsDeleted = cleanupOldPipelineRuns();
  console.log(`[cache-cleanup] ${pipelineRunsDeleted} pipeline runs supprimés`);

  const itemsArchived = cleanupOldItemsWithoutImages();
  console.log(`[cache-cleanup] ${itemsArchived} items sans image archivés`);

  const eventsDeleted = cleanupOldEvents();
  console.log(`[cache-cleanup] ${eventsDeleted} événements orphelins supprimés`);

  const calendarEventsDeleted = cleanupOldCalendarEvents();
  console.log(`[cache-cleanup] ${calendarEventsDeleted} événements calendrier supprimés`);

  // Calcul de l'espace libéré dans le visual-cache
  const visualCacheFreed = await cleanupVisualCacheDirectory();

  const result: CacheCleanupResult = {
    pipelineRunsDeleted,
    itemsArchived,
    eventsDeleted,
    calendarEventsDeleted,
    visualCacheFreed,
    timestamp: new Date().toISOString(),
  };

  console.log("[cache-cleanup] Terminé:", result);
  return result;
}

/**
 * Supprime les fichiers du visual-cache trop anciens (>72h).
 */
async function cleanupVisualCacheDirectory(): Promise<string> {
  const cacheDir = path.join(process.cwd(), "visual-cache");
  try {
    const files = await fs.readdir(cacheDir);
    const now = Date.now();
    let freed = 0;
    let count = 0;

    for (const file of files) {
      const filePath = path.join(cacheDir, file);
      const stat = await fs.stat(filePath);
      const ageMs = now - stat.mtimeMs;

      // 72h = 259200000ms
      if (ageMs > 259200000) {
        freed += stat.size;
        await fs.unlink(filePath);
        count++;
      }
    }

    const freedMB = (freed / 1024 / 1024).toFixed(2);
    return `${freedMB} Mo (${count} fichiers)`;
  } catch (error) {
    return "répertoire non trouvé ou inaccessible";
  }
}

/**
 * Statistiques du cache pour le dashboard.
 */
export interface CacheStats {
  pipelineRunsCount: number;
  oldestRun: string | null;
  itemsWithoutImages: number;
  eventsWithoutArticles: number;
  calendarEventsUpcoming: number;
}

export function getCacheStats(): CacheStats {
  const db = getDb();

  const pipelineRunsCount = (db.prepare("SELECT COUNT(*) as count FROM pipeline_runs").get() as { count: number }).count;
  const oldestRun = (db.prepare("SELECT MIN(started_at) as oldest FROM pipeline_runs").get() as { oldest: string | null }).oldest;
  const itemsWithoutImages = (db.prepare("SELECT COUNT(*) as count FROM items WHERE image_url IS NULL AND is_duplicate = 0").get() as { count: number }).count;
  const eventsWithoutArticles = (db.prepare("SELECT COUNT(*) as count FROM events WHERE id NOT IN (SELECT event_id FROM articles)").get() as { count: number }).count;
  const calendarEventsUpcoming = (db.prepare("SELECT COUNT(*) as count FROM calendar_events WHERE end_date >= date('now')").get() as { count: number }).count;

  return {
    pipelineRunsCount,
    oldestRun,
    itemsWithoutImages,
    eventsWithoutArticles,
    calendarEventsUpcoming,
  };
}
