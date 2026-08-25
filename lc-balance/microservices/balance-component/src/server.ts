import { createDb } from './db';
import { createApp } from './app';
import { BalanceService } from './service/balanceService';
import { EXPIRY_SWEEP_INTERVAL, toIntervalMs } from './config';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4100;
const DB_PATH = process.env.DB_PATH ?? 'balance-component.sqlite';

const db = createDb(DB_PATH);
const service = new BalanceService(db);
const app = createApp(db, service);

app.listen(PORT, () => {
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
setInterval(() => {
  try {
    service.runExpirySweepCycle();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('AUTO EXPIRY/AUTO CLOSE sweep failed:', err);
  }
}, toIntervalMs(EXPIRY_SWEEP_INTERVAL));
