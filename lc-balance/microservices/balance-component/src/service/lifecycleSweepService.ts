import { computeConfirmedBalance } from '../domain/balanceDerivation';
import { isPastAutoCloseGrace } from '../domain/autoCloseGracePeriod';
import { isPastExpiryGrace } from '../domain/expiryEligibility';
import {
  AUTO_CLOSE_ENABLED,
  AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS,
  AUTO_CLOSE_REASON_CODE,
  AUTO_EXPIRY_ENABLED,
  BATCH_CHECKER_ACTOR,
  BATCH_MAKER_ACTOR,
  EXPIRY_SWEEP_INTERVAL,
  MAIL_FLOAT_GRACE_DAYS,
  toIntervalMs,
} from '../config';
import type { BalanceContractStore } from '../store/balanceContractStore';
import type { BalanceMovementStore } from '../store/balanceMovementStore';
import type { BalanceContract, BalanceMovement } from '../types';
import type { CreateMovementRequest, CreateMovementResult } from './balanceService';

export interface LifecycleCommandPort {
  createMovement(request: CreateMovementRequest): CreateMovementResult;
  release(movementId: string, releasedBy: string): BalanceMovement;
}

export interface SweepResult {
  balanceContractId: string;
  ok: boolean;
  error?: string;
}

/** Background lifecycle orchestration; business commands remain behind LifecycleCommandPort. */
export class LifecycleSweepService {
  constructor(
    private readonly contracts: BalanceContractStore,
    private readonly movements: BalanceMovementStore,
    private readonly commands: LifecycleCommandPort,
    private readonly nextEventSeq: () => number = () => Date.now(),
  ) {}

  runAutoExpiry(asOf: Date = new Date()): SweepResult[] {
    if (!AUTO_EXPIRY_ENABLED) return [];
    const results: SweepResult[] = [];
    for (const contract of this.contracts.listActiveExpirable()) {
      const graceDays =
        contract.mailFloatGraceDays ?? (contract.instrumentType === 'EPLC_CONFIRMATION' ? MAIL_FLOAT_GRACE_DAYS.EXPORT : MAIL_FLOAT_GRACE_DAYS.IMPORT);
      if (!isPastExpiryGrace(contract.expiryDate, graceDays, asOf) || this.isRecentlyReopened(contract, asOf)) continue;
      results.push(this.process(contract, 'EXPIRE', BATCH_MAKER_ACTOR, BATCH_CHECKER_ACTOR));
    }
    return results;
  }

  runAutoClose(asOf: Date = new Date()): SweepResult[] {
    if (!AUTO_CLOSE_ENABLED) return [];
    return this.contracts
      .listExpiredContracts()
      .filter((contract) => !this.isRecentlyReopened(contract, asOf))
      .filter((contract) => isPastAutoCloseGrace(contract.effectiveTo, AUTO_CLOSE_GRACE_PERIOD_BUSINESS_DAYS, asOf))
      .map((contract) => this.process(contract, 'CLOSE', BATCH_MAKER_ACTOR, BATCH_CHECKER_ACTOR, AUTO_CLOSE_REASON_CODE));
  }

  runCycle(asOf: Date = new Date()): { expiry: SweepResult[]; close: SweepResult[] } {
    return { expiry: this.runAutoExpiry(asOf), close: this.runAutoClose(asOf) };
  }

  private isRecentlyReopened(contract: BalanceContract, asOf: Date): boolean {
    const sorted = [...this.movements.listByContract(contract.balanceContractId)].sort((left, right) => left.eventSeq - right.eventSeq);
    const latest = sorted[sorted.length - 1];
    if (!latest || latest.movementType !== 'REOPEN' || latest.status !== 'RELEASED' || !latest.releasedAt) return false;
    return asOf.getTime() - new Date(latest.releasedAt).getTime() < toIntervalMs(EXPIRY_SWEEP_INTERVAL);
  }

  private process(contract: BalanceContract, movementType: 'EXPIRE' | 'CLOSE', createdBy: string, releasedBy: string, reasonCode?: string): SweepResult {
    const confirmedBalance = computeConfirmedBalance(this.movements.listByContract(contract.balanceContractId));
    try {
      const result = this.commands.createMovement({
        instrumentType: contract.instrumentType,
        balanceContractId: contract.balanceContractId,
        movementType,
        eventSeq: this.nextEventSeq(),
        amount: confirmedBalance.toFixed(),
        currency: contract.currency,
        createdBy,
        reasonCode,
      });
      if (!result.created) {
        return {
          balanceContractId: contract.balanceContractId,
          ok: false,
          error: 'idempotency conflict — a movement already exists at this eventSeq (unexpected for a fresh Date.now() eventSeq).',
        };
      }
      this.commands.release(result.movement.movementId, releasedBy);
      return { balanceContractId: contract.balanceContractId, ok: true };
    } catch (error) {
      return { balanceContractId: contract.balanceContractId, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}
