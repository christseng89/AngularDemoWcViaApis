import { randomUUID } from 'node:crypto';
import type { Db } from '../db';
import type { MakerExcessPersistenceBundle } from '../service/makerExcessSubmitService';
import type { ExcessPolicyConfig } from '../config/excessPolicyConfig';

export interface CheckerExcessDecisionSnapshot {
  movementId: string;
  excessAccountId: string;
  factsVersion: string;
  ownerCurrency: string;
  effectiveLimitOwner: string;
  excessDecision: 'NOT_REQUIRED' | 'WITHIN_ALLOWANCE' | 'LIMIT_EXCEEDED';
  businessResultCode: 'EXCESS_LIMIT_EXCEEDED' | null;
  releaseEligibility: 'ELIGIBLE' | 'BLOCKED';
  policySnapshot: Readonly<ExcessPolicyConfig>;
  commandIdempotencyKey: string;
  actorContext: string;
  decisionTime: string;
}

export class ExcessDecisionSnapshotStore {
  constructor(private readonly db: Db) {}

  insert(bundle: MakerExcessPersistenceBundle, createdAt: string): void {
    this.db
      .prepare(
        `INSERT INTO excess_decision_snapshots (
          decision_snapshot_id, movement_id, excess_account_id, facts_version, owner_currency, effective_limit_owner,
          excess_decision, business_result_code, release_eligibility, policy_snapshot_json,
          action, command_idempotency_key, actor_context, decision_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        bundle.movementId,
        bundle.excessAccountId,
        bundle.expectedFactsVersion,
        bundle.ownerCurrency,
        bundle.effectiveLimitOwner,
        bundle.excessDecision,
        bundle.businessResultCode,
        bundle.releaseEligibility,
        JSON.stringify(bundle.policySnapshot),
        bundle.audit.action,
        bundle.idempotency.key,
        bundle.audit.actorContext,
        bundle.audit.decisionTime,
        createdAt,
      );
  }

  insertChecker(input: CheckerExcessDecisionSnapshot, createdAt: string): void {
    this.db
      .prepare(
        `INSERT INTO excess_decision_snapshots (
          decision_snapshot_id, movement_id, excess_account_id, facts_version, owner_currency, effective_limit_owner,
          excess_decision, business_result_code, release_eligibility, policy_snapshot_json,
          action, command_idempotency_key, actor_context, decision_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CHECKER_RELEASE', ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.movementId,
        input.excessAccountId,
        input.factsVersion,
        input.ownerCurrency,
        input.effectiveLimitOwner,
        input.excessDecision,
        input.businessResultCode,
        input.releaseEligibility,
        JSON.stringify(input.policySnapshot),
        input.commandIdempotencyKey,
        input.actorContext,
        input.decisionTime,
        createdAt,
      );
  }

  insertFix(input: Omit<CheckerExcessDecisionSnapshot, 'businessResultCode' | 'releaseEligibility'> & {
    excessDecision: 'NOT_REQUIRED' | 'WITHIN_ALLOWANCE';
  }, createdAt: string): void {
    this.db
      .prepare(
        `INSERT INTO excess_decision_snapshots (
          decision_snapshot_id, movement_id, excess_account_id, facts_version, owner_currency, effective_limit_owner,
          excess_decision, business_result_code, release_eligibility, policy_snapshot_json,
          action, command_idempotency_key, actor_context, decision_time, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'ELIGIBLE', ?, 'FIX_PENDING', ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        input.movementId,
        input.excessAccountId,
        input.factsVersion,
        input.ownerCurrency,
        input.effectiveLimitOwner,
        input.excessDecision,
        JSON.stringify(input.policySnapshot),
        input.commandIdempotencyKey,
        input.actorContext,
        input.decisionTime,
        createdAt,
      );
  }
}
