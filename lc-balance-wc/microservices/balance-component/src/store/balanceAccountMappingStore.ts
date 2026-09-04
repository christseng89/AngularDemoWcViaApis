import type { Db } from '../db';
import type { BalanceAccountMapping } from '../domain/balanceAccountMapping';
import { BALANCE_ACCOUNT_TAXONOMY, type BalanceAccountSeedMapping, type BalanceAccountTaxonomyReader } from '../config/balanceAccountTaxonomy';

interface MappingRow {
  mapping_key: string;
  instrument_type: string;
  risk_class: string;
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
  constructor(
    private readonly db: Db,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly taxonomy: BalanceAccountTaxonomyReader = BALANCE_ACCOUNT_TAXONOMY,
  ) {
    this.reconcileConfiguredMappings();
  }

  private reconcileConfiguredMappings(): void {
    const insert = this.db.prepare(`INSERT OR IGNORE INTO balance_account_mappings (
      mapping_key, instrument_type, risk_class, account_a_number, account_a_description,
      account_b_number, account_b_description, version, updated_by, updated_at
    ) VALUES (@mappingKey, @instrumentType, @riskClass, @accountANumber, @accountADescription,
      @accountBNumber, @accountBDescription, 1, 'SYSTEM_SEED', @updatedAt)`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const item of this.taxonomy.mappings()) {
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
    const configuredKeys = this.taxonomy.mappings().map((item) => item.mappingKey);
    const placeholders = configuredKeys.map(() => '?').join(',');
    const rows = (this.db.prepare(`SELECT * FROM balance_account_mappings WHERE mapping_key IN (${placeholders})`).all(...configuredKeys) as unknown as MappingRow[]).map(toMapping);
    const byKey = new Map(rows.map((item) => [item.mappingKey, item]));
    return configuredKeys.flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []));
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

  updateFamily(
    updates: readonly {
      mappingKey: string;
      expectedVersion: number;
      accountA: BalanceAccountMapping['accountA'];
      accountB: BalanceAccountMapping['accountB'];
    }[],
    updatedBy: string,
  ): BalanceAccountMapping[] | null {
    const update = this.db.prepare(`UPDATE balance_account_mappings SET
      account_a_number = @accountANumber, account_a_description = @accountADescription,
      account_b_number = @accountBNumber, account_b_description = @accountBDescription,
      version = version + 1, updated_by = @updatedBy, updated_at = @updatedAt
      WHERE mapping_key = @mappingKey AND version = @expectedVersion`);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const item of updates) {
        const current = this.findByKey(item.mappingKey);
        if (!current || current.version !== item.expectedVersion) {
          this.db.exec('ROLLBACK');
          return null;
        }
      }
      const updatedAt = this.now();
      for (const item of updates) {
        update.run({
          mappingKey: item.mappingKey,
          expectedVersion: item.expectedVersion,
          accountANumber: item.accountA.accountNumber,
          accountADescription: item.accountA.accountDescription,
          accountBNumber: item.accountB.accountNumber,
          accountBDescription: item.accountB.accountDescription,
          updatedBy,
          updatedAt,
        });
      }
      this.db.exec('COMMIT');
      return updates.map((item) => this.findByKey(item.mappingKey)!);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  replaceConfiguration(mappings: readonly BalanceAccountSeedMapping[], updatedBy: string): BalanceAccountMapping[] {
    const replace = this.db.prepare(`INSERT INTO balance_account_mappings (
      mapping_key, instrument_type, risk_class, account_a_number, account_a_description,
      account_b_number, account_b_description, version, updated_by, updated_at
    ) VALUES (@mappingKey, @instrumentType, @riskClass, @accountANumber, @accountADescription,
      @accountBNumber, @accountBDescription, 1, @updatedBy, @updatedAt)
    ON CONFLICT(mapping_key) DO UPDATE SET
      instrument_type = excluded.instrument_type,
      risk_class = excluded.risk_class,
      account_a_number = excluded.account_a_number,
      account_a_description = excluded.account_a_description,
      account_b_number = excluded.account_b_number,
      account_b_description = excluded.account_b_description,
      version = 1,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at`);
    const updatedAt = this.now();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const mapping of mappings) {
        replace.run({
          mappingKey: mapping.mappingKey,
          instrumentType: mapping.instrumentType,
          riskClass: mapping.riskClass,
          accountANumber: mapping.accountA.accountNumber,
          accountADescription: mapping.accountA.accountDescription,
          accountBNumber: mapping.accountB.accountNumber,
          accountBDescription: mapping.accountB.accountDescription,
          updatedBy,
          updatedAt,
        });
      }
      this.db.exec('COMMIT');
      return mappings.map((mapping) => this.findByKey(mapping.mappingKey)!);
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
