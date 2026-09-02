import type { Db } from '../db';
import type { BalanceAccountMapping, BalanceAccountRiskClass } from '../domain/balanceAccountMapping';
import type { InstrumentType } from '../types';
import seed from '../../config/balance-account-mappings.json';

interface MappingRow {
  mapping_key: string;
  instrument_type: InstrumentType;
  risk_class: BalanceAccountRiskClass;
  account_a_number: string;
  account_a_description: string;
  account_b_number: string;
  account_b_description: string;
  version: number;
  updated_by: string;
  updated_at: string;
}

function toMapping(row: MappingRow): BalanceAccountMapping {
  return {
    mappingKey: row.mapping_key,
    instrumentType: row.instrument_type,
    riskClass: row.risk_class,
    accountA: { accountNumber: row.account_a_number, accountDescription: row.account_a_description },
    accountB: { accountNumber: row.account_b_number, accountDescription: row.account_b_description },
    version: row.version,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at,
  };
}

export class BalanceAccountMappingStore {
  constructor(private readonly db: Db, private readonly now: () => string = () => new Date().toISOString()) {
    this.seedIfEmpty();
  }

  private seedIfEmpty(): void {
    const count = this.db.prepare('SELECT COUNT(*) AS count FROM balance_account_mappings').get() as { count: number };
    if (count.count > 0) return;
    const insert = this.db.prepare(`INSERT INTO balance_account_mappings (
      mapping_key, instrument_type, risk_class, account_a_number, account_a_description,
      account_b_number, account_b_description, version, updated_by, updated_at
    ) VALUES (@mappingKey, @instrumentType, @riskClass, @accountANumber, @accountADescription,
      @accountBNumber, @accountBDescription, 1, 'SYSTEM_SEED', @updatedAt)`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const item of seed.mappings) {
        insert.run({
          mappingKey: item.mappingKey,
          instrumentType: item.instrumentType,
          riskClass: item.riskClass,
          accountANumber: item.accountA.accountNumber,
          accountADescription: item.accountA.accountDescription,
          accountBNumber: item.accountB.accountNumber,
          accountBDescription: item.accountB.accountDescription,
          updatedAt: this.now(),
        });
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  list(): BalanceAccountMapping[] {
    return (this.db.prepare('SELECT * FROM balance_account_mappings ORDER BY instrument_type, risk_class').all() as unknown as MappingRow[]).map(toMapping);
  }

  findByKey(mappingKey: string): BalanceAccountMapping | undefined {
    const row = this.db.prepare('SELECT * FROM balance_account_mappings WHERE mapping_key = ?').get(mappingKey) as unknown as MappingRow | undefined;
    return row ? toMapping(row) : undefined;
  }

  update(mappingKey: string, expectedVersion: number, accountA: BalanceAccountMapping['accountA'], accountB: BalanceAccountMapping['accountB'], updatedBy: string): BalanceAccountMapping | null {
    const result = this.db.prepare(`UPDATE balance_account_mappings SET
      account_a_number = @accountANumber, account_a_description = @accountADescription,
      account_b_number = @accountBNumber, account_b_description = @accountBDescription,
      version = version + 1, updated_by = @updatedBy, updated_at = @updatedAt
      WHERE mapping_key = @mappingKey AND version = @expectedVersion`).run({
      mappingKey,
      expectedVersion,
      accountANumber: accountA.accountNumber,
      accountADescription: accountA.accountDescription,
      accountBNumber: accountB.accountNumber,
      accountBDescription: accountB.accountDescription,
      updatedBy,
      updatedAt: this.now(),
    });
    return Number(result.changes) === 1 ? this.findByKey(mappingKey)! : null;
  }
}
