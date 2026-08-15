/**
 * Wipes every row from balance_movements and balance_contracts (schema/
 * tables stay in place). Uses node:sqlite directly, same as
 * cleanup-by-lc.mjs and src/db/index.ts — the sqlite3 CLI isn't installed
 * on this machine.
 */
import { DatabaseSync } from 'node:sqlite';

const dryRun = process.argv.includes('--dry-run');
const dbPath = process.env.DB_PATH ?? 'balance-component.sqlite';

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

const contractCount = db.prepare('SELECT COUNT(*) AS n FROM balance_contracts').get().n;
const movementCount = db.prepare('SELECT COUNT(*) AS n FROM balance_movements').get().n;

console.log(`db=${dbPath}`);
console.log(`  balance_contracts: ${contractCount}`);
console.log(`  balance_movements: ${movementCount}`);

if (contractCount === 0 && movementCount === 0) {
  console.log('Already empty.');
  db.close();
  process.exit(0);
}

if (dryRun) {
  console.log('--dry-run: no rows deleted');
  db.close();
  process.exit(0);
}

db.exec('BEGIN');
try {
  db.exec('DELETE FROM balance_movements');
  db.exec('DELETE FROM balance_contracts');
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  db.close();
  throw err;
}

console.log(`Deleted ${movementCount} movement(s) and ${contractCount} contract(s). Tables now empty.`);
db.close();
