import type { Db } from '../db';

export interface ApplicantWaiverSnapshotInsert {
  waiverSnapshotId: string;
  sourceMovementId: string;
  releaseMovementId: string;
  excessAccountId: string;
  excessAmountOwner: string;
  checkerContext: string;
  confirmedAt: string;
  waiverReference?: string;
  waiverDate?: string;
  waiverEvidence?: string;
  createdAt: string;
}

export class ApplicantWaiverSnapshotStore {
  constructor(private readonly db: Db) {}

  insert(snapshot: ApplicantWaiverSnapshotInsert): void {
    this.db
      .prepare(
        `INSERT INTO applicant_waiver_snapshots (
          waiver_snapshot_id, source_movement_id, release_movement_id, excess_account_id,
          excess_amount_owner, validation_result, checker_context, confirmed_at,
          waiver_reference, waiver_date, waiver_evidence, created_at
        ) VALUES (?, ?, ?, ?, ?, 'CONFIRMED', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        snapshot.waiverSnapshotId,
        snapshot.sourceMovementId,
        snapshot.releaseMovementId,
        snapshot.excessAccountId,
        snapshot.excessAmountOwner,
        snapshot.checkerContext,
        snapshot.confirmedAt,
        snapshot.waiverReference ?? null,
        snapshot.waiverDate ?? null,
        snapshot.waiverEvidence ?? null,
        snapshot.createdAt,
      );
  }
}
