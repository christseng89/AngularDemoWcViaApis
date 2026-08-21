/**
 * Deletes all balance_contracts / balance_movements rows tied to one LC
 * number — including its child contracts (SHGT, EPLC_CONFIRMATION,
 * Acceptance) since those carry the same lc_number in their natural key
 * (see src/store/balanceContractStore.ts), not just the parent LC row.
 *
 * Uses node:sqlite directly (same driver as src/db/index.ts) rather than
 * the sqlite3 CLI, which is not installed on this machine.
 */
import { DatabaseSync } from 'node:sqlite';

const [, , lcNumber, ...flags] = process.argv;
const dryRun = flags.includes('--dry-run');
const dbPath = process.env.DB_PATH ?? 'balance-component.sqlite';

if (!lcNumber || lcNumber.startsWith('--')) {
  console.error('Usage: node scripts/cleanup-by-lc.mjs <LC_NUMBER> [--dry-run]');
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

const contracts = db
  .prepare('SELECT balance_contract_id, logical_contract_id, instrument_type, status FROM balance_contracts WHERE lc_number = ?')
  .all(lcNumber);

if (contracts.length === 0) {
  console.log(`No balance_contracts found for lc_number=${lcNumber} (db=${dbPath})`);
  db.close();
  process.exit(0);
}

const contractIds = contracts.map((c) => c.balance_contract_id);
const placeholders = contractIds.map(() => '?').join(',');
const movementCount = db
  .prepare(`SELECT COUNT(*) AS n FROM balance_movements WHERE balance_contract_id IN (${placeholders})`)
  .get(...contractIds).n;

console.log(`lc_number=${lcNumber} (db=${dbPath})`);
console.log(`  balance_contracts: ${contracts.length}`);
for (const c of contracts) {
  console.log(`    - ${c.balance_contract_id}  ${c.instrument_type}  ${c.status}  (logical=${c.logical_contract_id})`);
}
console.log(`  balance_movements: ${movementCount}`);

if (dryRun) {
  console.log('--dry-run: no rows deleted');
  db.close();
  process.exit(0);
}

db.exec('BEGIN');
try {
  db.prepare(`DELETE FROM balance_movements WHERE balance_contract_id IN (${placeholders})`).run(...contractIds);
  db.prepare('DELETE FROM balance_contracts WHERE lc_number = ?').run(lcNumber);
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  db.close();
  throw err;
}

console.log(`Deleted ${movementCount} movement(s) and ${contracts.length} contract(s).`);
db.close();
