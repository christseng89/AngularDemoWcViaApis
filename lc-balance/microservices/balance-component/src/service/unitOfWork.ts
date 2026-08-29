import type { Db } from '../db';

export interface UnitOfWork {
  execute<T>(operation: () => T): T;
}

/** SQLite implementation used by business commands that must update several ledgers atomically. */
export class SqliteUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Db) {}

  execute<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
