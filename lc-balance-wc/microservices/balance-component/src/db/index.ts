/**
 * Uses Node's built-in `node:sqlite` (DatabaseSync, Node >=22.5, no native
 * compilation) instead of better-sqlite3 — this machine has no Visual
 * Studio "Desktop development with C++" workload installed, which
 * better-sqlite3's node-gyp build requires. node:sqlite supports the same
 * named-parameter (`@name`) prepared-statement style used throughout
 * src/store/, so the store layer needed no changes to switch.
 *
 * Known limitation (documented, not silently glossed over): SQLite locks at
 * the whole-database-file level (even under WAL, only one writer at a time)
 * — it has no row-level lock / SELECT...FOR UPDATE. Design doc §6 requires
 * "同一張 LC 底下的多筆同時申請會被正確序列化，但不同 LC 之間完全不互相阻塞"
 * (same-LC requests serialize, different-LC requests never block each
 * other). SQLite structurally cannot demonstrate the second half of that
 * requirement — every write serializes globally, regardless of which
 * logicalContractId it touches. This is safe (over-conservative, not
 * incorrect) for a single-process prototype, but a production deployment
 * MUST move to a database with real row-level locking (PostgreSQL —
 * SELECT...FOR UPDATE scoped to balance_contract_id — or MySQL/InnoDB)
 * before the per-instrument-concurrency requirement can be considered
 * actually validated.
 */
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_SQL } from './schema';
import { runMigrations } from './migrations';

/** Pass ':memory:' for tests. */
export function createDb(filePath: string): DatabaseSync {
  const db = new DatabaseSync(filePath);
  if (filePath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL');
  }
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  // Quality-report-balance.md BAL-106 — see migrations.ts's own doc comment for what changed and why.
  runMigrations(db);
  return db;
}

export type Db = DatabaseSync;
