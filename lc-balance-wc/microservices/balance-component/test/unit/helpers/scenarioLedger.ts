/**
 * Test-only helper: an in-memory movement ledger for one BalanceContract,
 * used to replay the Case 1-5 business scenarios step-by-step against the
 * real domain functions (src/domain/*) — no DB involved, these are pure
 * function calls. Mirrors the narrative structure of the conversation's own
 * Case 1-5 walkthrough tables so the tests read the same way.
 */
import Decimal from 'decimal.js';
import { computeCeilingAmount } from '../../../src/domain/tolerance';
import { computeAvailableBalance, computeConfirmedBalance, computeFaceAmount } from '../../../src/domain/balanceDerivation';
import { checkUtilizeSufficiency, computeOffBalanceExposure, UtilizeSufficiencyResult } from '../../../src/domain/offBalanceExposure';
import { checkAmendDecreaseSufficiency } from '../../../src/domain/amendDecrease';
import { checkRedeemSufficiency, RedeemCheckResult } from '../../../src/domain/shgtRedeem';
import type { BalanceMovement, InstrumentType } from '../../../src/types';

type LedgerMovement = Pick<BalanceMovement, 'movementType' | 'amount' | 'ceilingAmount' | 'status'>;

export class ScenarioLedger {
  private movements: LedgerMovement[] = [];

  /**
   * instrumentType gates Tolerance conversion (Design doc §6.2, business
   * confirmed 2026-08-14: Tolerance only ever applies to an LC's own
   * ISSUE/AMEND — SHGT/Acceptance/Confirmation amounts are always their own
   * face value). Pass 'IPLC_LC'/'EPLC_LC' for an LC ledger, anything else
   * for a non-LC one — tolerancePct is then structurally inert regardless
   * of what's passed for it.
   */
  constructor(
    private readonly instrumentType: InstrumentType,
    private readonly tolerancePct: string | null = null,
  ) {}

  confirmed(): Decimal {
    return computeConfirmedBalance(this.movements);
  }

  available(): Decimal {
    return computeAvailableBalance(this.confirmed(), this.movements);
  }

  faceAmount(): Decimal {
    return computeFaceAmount(this.movements);
  }

  /** Design doc §6.1 — this ledger's own PENDING+RELEASED net exposure (meaningful when this ledger represents a SHGT contract, consumed by another contract's utilize() call). */
  offBalanceExposure(): Decimal {
    return computeOffBalanceExposure(this.movements);
  }

  private ceilingFor(movementType: string, amount: string): Decimal {
    return computeCeilingAmount(amount, this.tolerancePct, movementType, this.instrumentType);
  }

  /**
   * A movementType with no sufficiency check (Design doc §5: ISSUE/
   * AMEND_INCREASE on IPLC_LC/EPLC_LC; CREATE on Acceptance; ISSUE on SHGT
   * — none of these compete against an Available Balance ceiling), released
   * immediately for test brevity (Maker+Checker collapsed to one call).
   */
  credit(movementType: string, amount: string): Decimal {
    const ceiling = this.ceilingFor(movementType, amount);
    this.movements.push({ movementType, amount, ceilingAmount: ceiling.toFixed(), status: 'RELEASED' });
    return ceiling;
  }

  /** Symmetric to credit() — a decreasing movementType with no Available-Balance sufficiency check (e.g. PARTIAL_SETTLE/FULL_SETTLE on Acceptance). */
  debit(movementType: string, amount: string): Decimal {
    const ceiling = this.ceilingFor(movementType, amount);
    this.movements.push({ movementType, amount, ceilingAmount: ceiling.toFixed(), status: 'RELEASED' });
    return ceiling;
  }

  /** Design doc §6.2 — returns the check result; only pushes a RELEASED movement when ok. */
  amendDecrease(amount: string): { ok: boolean; error?: string; ceilingAmount: Decimal } {
    const ceiling = this.ceilingFor('AMEND_DECREASE', amount);
    const result = checkAmendDecreaseSufficiency({
      amount: new Decimal(amount),
      ceilingAmount: ceiling,
      availableBalance: this.available(),
    });
    if (result.ok) {
      this.movements.push({ movementType: 'AMEND_DECREASE', amount, ceilingAmount: ceiling.toFixed(), status: 'RELEASED' });
    }
    return { ...result, ceilingAmount: ceiling };
  }

  /** Design doc §6/§6.1 — UTILIZE (到單), creates a PENDING earmark if the ERROR check passes. */
  utilize(amount: string, offBalanceExposure: Decimal = new Decimal(0)): UtilizeSufficiencyResult {
    const requestedAmount = new Decimal(amount);
    const result = checkUtilizeSufficiency({ requestedAmount, availableBalance: this.available(), offBalanceExposure });
    if (result.ok) {
      this.movements.push({ movementType: 'UTILIZE', amount, ceilingAmount: amount, status: 'PENDING' });
    }
    return result;
  }

  /** Design doc §5 (v0.6) — SHGT PARTIAL_REDEEM/FULL_REDEEM, capped at this SG's own outstanding balance. Never auto-triggered by another ledger's utilize() — always an explicit call. */
  redeem(movementType: 'PARTIAL_REDEEM' | 'FULL_REDEEM', amount: string): RedeemCheckResult {
    const ceiling = this.ceilingFor(movementType, amount);
    const result = checkRedeemSufficiency({ redeemAmount: ceiling, sgAvailableBalance: this.available() });
    if (result.ok) {
      this.movements.push({ movementType, amount, ceilingAmount: ceiling.toFixed(), status: 'RELEASED' });
    }
    return result;
  }

  /** Checker releases the most recent PENDING movement of the given type. */
  release(movementType: string): void {
    for (let i = this.movements.length - 1; i >= 0; i--) {
      if (this.movements[i]!.movementType === movementType && this.movements[i]!.status === 'PENDING') {
        this.movements[i]!.status = 'RELEASED';
        return;
      }
    }
    throw new Error(`No PENDING ${movementType} movement to release.`);
  }
}
