import { createDb } from './db';
import { createApp } from './app';
import { BalanceService } from './service/balanceService';
import { EXPIRY_SWEEP_INTERVAL, toIntervalMs } from './config';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4100;
const DB_PATH = process.env.DB_PATH ?? 'balance-component.sqlite';

const db = createDb(DB_PATH);
const service = new BalanceService(db);
const app = createApp(db, service);

const server = app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`balance-component-service listening on :${PORT} (db=${DB_PATH})`);
});

/**
 * F1 (external BA review) — AUTO EXPIRY/AUTO CLOSE background sweep. Deliberately registered ONLY
 * here, never inside BalanceService's own constructor — every test that does `new BalanceService(db)`
 * directly (the overwhelming majority of this suite) must never accidentally start a live timer.
 * Each sweep independently no-ops per its own feature flag (config.ts's AUTO_EXPIRY_ENABLED/
 * AUTO_CLOSE_ENABLED) — this interval always fires, the flags gate what it actually does.
 */
const sweepTimer = setInterval(() => {
  try {
    service.runExpirySweepCycle();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('AUTO EXPIRY/AUTO CLOSE sweep failed:', err);
  }
}, toIntervalMs(EXPIRY_SWEEP_INTERVAL));

// Fix Backend Restart / EADDRINUSE (user-directed, 2026-08-29) — `npm run dev` runs this under
// `node --watch -r ts-node/register`, which kills and re-execs the whole process on every save; that's
// a hard kill of the OLD process, not a request the old HTTP server ever sees, so it never got the
// chance to release :4100 before the new instance tried to bind it — the actual EADDRINUSE root cause,
// not a genuinely different process squatting on the port (same fix as backend/server.js's own — see
// that file's own doc comment for the fuller rationale). SIGINT/SIGTERM handlers let a NORMAL shutdown
// close the server (and stop the sweep timer / close the DB handle) before the process exits.
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    // eslint-disable-next-line no-console
    console.error(`Port ${PORT} is already in use — is another microservice instance already running?`);
    process.exit(1);
  }
  throw err;
});

function shutdown(signal: string): void {
  // eslint-disable-next-line no-console
  console.log(`${signal} received. Closing server...`);
  clearInterval(sweepTimer);
  server.close((err) => {
    if (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to close server:', err);
      process.exit(1);
    }
    db.close();
    // eslint-disable-next-line no-console
    console.log('Server closed.');
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
