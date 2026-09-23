import type { Db } from '../db';
import type { ExcessAccount, ExcessOwnerType } from '../types';

interface ExcessAccountRow {
  excess_account_id: string;
  owner_type: ExcessOwnerType;
  owner_id: string;
  owner_currency: string;
  policy_version: string;
  version: number;
  created_at: string;
  updated_at: string;
}

function toAccount(row: ExcessAccountRow): ExcessAccount {
  return {
    excessAccountId: row.excess_account_id,
    ownerType: row.owner_type,
    ownerId: row.owner_id,
    ownerCurrency: row.owner_currency,
    policyVersion: row.policy_version,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ExcessAccountStore {
  constructor(private readonly db: Db) {}

  insert(account: ExcessAccount): void {
    this.db
      .prepare(
        `INSERT INTO excess_accounts (
          excess_account_id, owner_type, owner_id, owner_currency, policy_version, version, created_at, updated_at
        ) VALUES (@excessAccountId, @ownerType, @ownerId, @ownerCurrency, @policyVersion, @version, @createdAt, @updatedAt)`,
      )
      .run({
        excessAccountId: account.excessAccountId,
        ownerType: account.ownerType,
        ownerId: account.ownerId,
        ownerCurrency: account.ownerCurrency,
        policyVersion: account.policyVersion,
        version: account.version,
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
      });
  }

  getById(excessAccountId: string): ExcessAccount | null {
    const row = this.db.prepare('SELECT * FROM excess_accounts WHERE excess_account_id = ?').get(excessAccountId) as ExcessAccountRow | undefined;
    return row ? toAccount(row) : null;
  }

  getByOwner(ownerType: ExcessOwnerType, ownerId: string): ExcessAccount | null {
    const row = this.db.prepare('SELECT * FROM excess_accounts WHERE owner_type = ? AND owner_id = ?').get(ownerType, ownerId) as ExcessAccountRow | undefined;
    return row ? toAccount(row) : null;
  }

  advanceVersion(excessAccountId: string, expectedVersion: number, policyVersion: string, updatedAt: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE excess_accounts
         SET version = version + 1, policy_version = @policyVersion, updated_at = @updatedAt
         WHERE excess_account_id = @excessAccountId AND version = @expectedVersion`,
      )
      .run({ excessAccountId, expectedVersion, policyVersion, updatedAt });
    return result.changes === 1;
  }
}
