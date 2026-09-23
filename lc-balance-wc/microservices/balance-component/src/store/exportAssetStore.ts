import type { Db } from '../db';
import type { ExportAssetBalanceType, ExportExcessDebtor } from '../domain/exportAssetPosting';

export interface ExportAuthorizationSnapshot {
  authorizationSnapshotId: string;
  b4MovementId: string;
  sourceB3MovementId: string;
  claimStatus: 'ABSENT' | 'SUBMITTED';
  authorizationReference?: string;
  authorizedAmountOwner?: string;
  authorizedCurrency?: string;
  authorizationValidationResult: 'CONFIRMED' | 'NOT_CONFIRMED';
  checkerContext: string;
  decisionTime: string;
  confirmedAt: string;
  excessDebtor: ExportExcessDebtor;
  createdAt: string;
}

export interface ExportAssetPosting {
  postingId: string;
  businessEventId: string;
  b4MovementId: string;
  sourceB3MovementId: string;
  balanceType: ExportAssetBalanceType;
  amountOwner: string;
  ownerCurrency: string;
  debtor: ExportExcessDebtor;
  mappingKey: string;
  mappingVersion: number;
  accountANumber: string;
  accountBNumber: string;
  authorizationSnapshotId: string;
  createdAt: string;
}

interface AuthorizationRow {
  authorization_snapshot_id: string;
  b4_movement_id: string;
  source_b3_movement_id: string;
  claim_status: 'ABSENT' | 'SUBMITTED';
  authorization_reference: string | null;
  authorized_amount_owner: string | null;
  authorized_currency: string | null;
  authorization_validation_result: 'CONFIRMED' | 'NOT_CONFIRMED';
  checker_context: string;
  decision_time: string;
  confirmed_at: string;
  excess_debtor: ExportExcessDebtor;
  created_at: string;
}

interface PostingRow {
  posting_id: string;
  business_event_id: string;
  b4_movement_id: string;
  source_b3_movement_id: string;
  balance_type: ExportAssetBalanceType;
  amount_owner: string;
  owner_currency: string;
  debtor: ExportExcessDebtor;
  mapping_key: string;
  mapping_version: number;
  account_a_number: string;
  account_b_number: string;
  authorization_snapshot_id: string;
  created_at: string;
}

function toAuthorization(row: AuthorizationRow): ExportAuthorizationSnapshot {
  return {
    authorizationSnapshotId: row.authorization_snapshot_id,
    b4MovementId: row.b4_movement_id,
    sourceB3MovementId: row.source_b3_movement_id,
    claimStatus: row.claim_status,
    authorizationReference: row.authorization_reference ?? undefined,
    authorizedAmountOwner: row.authorized_amount_owner ?? undefined,
    authorizedCurrency: row.authorized_currency ?? undefined,
    authorizationValidationResult: row.authorization_validation_result,
    checkerContext: row.checker_context,
    decisionTime: row.decision_time,
    confirmedAt: row.confirmed_at,
    excessDebtor: row.excess_debtor,
    createdAt: row.created_at,
  };
}

function toPosting(row: PostingRow): ExportAssetPosting {
  return {
    postingId: row.posting_id,
    businessEventId: row.business_event_id,
    b4MovementId: row.b4_movement_id,
    sourceB3MovementId: row.source_b3_movement_id,
    balanceType: row.balance_type,
    amountOwner: row.amount_owner,
    ownerCurrency: row.owner_currency,
    debtor: row.debtor,
    mappingKey: row.mapping_key,
    mappingVersion: row.mapping_version,
    accountANumber: row.account_a_number,
    accountBNumber: row.account_b_number,
    authorizationSnapshotId: row.authorization_snapshot_id,
    createdAt: row.created_at,
  };
}

export class ExportAssetStore {
  constructor(private readonly db: Db) {}

  insertAuthorization(snapshot: ExportAuthorizationSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO export_authorization_snapshots (
      authorization_snapshot_id, b4_movement_id, source_b3_movement_id, claim_status,
      authorization_reference, authorized_amount_owner, authorized_currency,
      authorization_validation_result, checker_context, decision_time, confirmed_at, excess_debtor, created_at
    ) VALUES (@authorizationSnapshotId, @b4MovementId, @sourceB3MovementId, @claimStatus,
      @authorizationReference, @authorizedAmountOwner, @authorizedCurrency,
      @authorizationValidationResult, @checkerContext, @decisionTime, @confirmedAt, @excessDebtor, @createdAt)`,
      )
      .run({
        ...snapshot,
        authorizationReference: snapshot.authorizationReference ?? null,
        authorizedAmountOwner: snapshot.authorizedAmountOwner ?? null,
        authorizedCurrency: snapshot.authorizedCurrency ?? null,
      });
  }

  insertPosting(posting: ExportAssetPosting): void {
    this.db
      .prepare(
        `INSERT INTO export_asset_postings (
      posting_id, business_event_id, b4_movement_id, source_b3_movement_id, balance_type,
      amount_owner, owner_currency, debtor, mapping_key, mapping_version,
      account_a_number, account_b_number, authorization_snapshot_id, created_at
    ) VALUES (@postingId, @businessEventId, @b4MovementId, @sourceB3MovementId, @balanceType,
      @amountOwner, @ownerCurrency, @debtor, @mappingKey, @mappingVersion,
      @accountANumber, @accountBNumber, @authorizationSnapshotId, @createdAt)`,
      )
      .run({
        postingId: posting.postingId,
        businessEventId: posting.businessEventId,
        b4MovementId: posting.b4MovementId,
        sourceB3MovementId: posting.sourceB3MovementId,
        balanceType: posting.balanceType,
        amountOwner: posting.amountOwner,
        ownerCurrency: posting.ownerCurrency,
        debtor: posting.debtor,
        mappingKey: posting.mappingKey,
        mappingVersion: posting.mappingVersion,
        accountANumber: posting.accountANumber,
        accountBNumber: posting.accountBNumber,
        authorizationSnapshotId: posting.authorizationSnapshotId,
        createdAt: posting.createdAt,
      });
  }

  findAuthorizationByB4(b4MovementId: string): ExportAuthorizationSnapshot | undefined {
    const row = this.db.prepare('SELECT * FROM export_authorization_snapshots WHERE b4_movement_id = ?').get(b4MovementId) as AuthorizationRow | undefined;
    return row ? toAuthorization(row) : undefined;
  }

  listPostingsByB4(b4MovementId: string): ExportAssetPosting[] {
    return (this.db.prepare('SELECT * FROM export_asset_postings WHERE b4_movement_id = ? ORDER BY rowid').all(b4MovementId) as unknown as PostingRow[]).map(
      toPosting,
    );
  }
}
