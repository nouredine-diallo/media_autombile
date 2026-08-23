import { startCron } from './cron';

let initialized = false;

export function initCron() {
  if (initialized) return;
  initialized = true;
  
  // Start cron scheduler
  startCron();
  
  console.log('[STARTUP] Cron scheduler initialized');
}
