import { startCron } from './cron';

let initialized = false;

export function initCron() {
  if (initialized) return;
  
  // CRITICAL FIX: DO NOT RUN CRON OR NATIVE MODULES DURING NEXT.JS SSG BUILD PHASE
  if (
    process.env.npm_lifecycle_event === 'build' || 
    process.env.NEXT_PHASE === 'phase-production-build' ||
    process.env.NODE_ENV !== 'production' // avoid starting cron in dev to prevent multiple instances
  ) {
    if (process.env.NODE_ENV === 'production') {
      console.log('[STARTUP] Build phase detected, skipping cron initialization');
      return;
    }
  }
  
  initialized = true;
  
  // Start cron scheduler
  startCron();
  
  console.log('[STARTUP] Cron scheduler initialized');
}
