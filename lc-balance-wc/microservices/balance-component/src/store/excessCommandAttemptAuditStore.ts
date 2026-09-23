import { randomUUID } from 'node:crypto';
import type { ExcessAllowanceOwnerType } from '../config/excessPolicyConfig';
import type { Db } from '../db';

export interface CheckerFxFailureCommandAttempt {
  movementId: string;
  ownerType: ExcessAllowanceOwnerType;
  ownerId: string;
  ownerCurrency: string;
  actorContext: string;
  commandIdempotencyKey: string;
  requestHash: string;
  resultCode: 'FX_RATE_UNAVAILABLE' | 'FX_RATE_STALE';
  policyVersion: string;
  requestedAmountUsd: string;
  decisionTime: string;
  createdAt: string;
}

export type CheckerFxFailureAuditDecision =
  Readonly<{ kind: 'MISS' }> | Readonly<{ kind: 'REPLAY'; resultCode: CheckerFxFailureCommandAttempt['resultCode'] }> | Readonly<{ kind: 'CONFLICT' }>;

export class ExcessCommandAttemptAuditStore {
  constructor(private readonly db: Db) {}

  resolve(input: Pick<CheckerFxFailureCommandAttempt, 'movementId' | 'actorContext' | 'commandIdempotencyKey' | 'requestHash'>): CheckerFxFailureAuditDecision {
    const stored = this.db
      .prepare(
        `SELECT request_hash, result_code FROM excess_command_attempt_audits
         WHERE command_type = 'CHECKER_RELEASE' AND movement_id = ?
           AND actor_context = ? AND command_idempotency_key = ?`,
      )
      .get(input.movementId, input.actorContext, input.commandIdempotencyKey) as
      { request_hash: string; result_code: CheckerFxFailureCommandAttempt['resultCode'] } | undefined;
    if (!stored) return { kind: 'MISS' };
    if (stored.request_hash !== input.requestHash) return { kind: 'CONFLICT' };
    return { kind: 'REPLAY', resultCode: stored.result_code };
  }

  recordCheckerFxFailure(input: CheckerFxFailureCommandAttempt): Exclude<CheckerFxFailureAuditDecision, { kind: 'MISS' }> {
    this.db
      .prepare(
        `INSERT INTO excess_command_attempt_audits (
          command_attempt_audit_id, command_type, movement_id, owner_type, owner_id, owner_currency,
          actor_context, command_idempotency_key, request_hash, result_code, policy_version, from_currency,
          to_currency, requested_amount_usd, rate_purpose, decision_time, created_at
        ) VALUES (?, 'CHECKER_RELEASE', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, 'BOOKING', ?, ?)
        ON CONFLICT(command_type, movement_id, actor_context, command_idempotency_key) DO NOTHING`,
      )
      .run(
        randomUUID(),
        input.movementId,
        input.ownerType,
        input.ownerId,
        input.ownerCurrency,
        input.actorContext,
        input.commandIdempotencyKey,
        input.requestHash,
        input.resultCode,
        input.policyVersion,
        input.ownerCurrency,
        input.requestedAmountUsd,
        input.decisionTime,
        input.createdAt,
      );
    const decision = this.resolve(input);
    if (decision.kind === 'MISS') throw new Error('Checker FX failure audit was not persisted.');
    return decision;
  }
}
