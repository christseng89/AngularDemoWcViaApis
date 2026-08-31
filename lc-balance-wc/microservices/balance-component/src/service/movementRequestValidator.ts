import Decimal from 'decimal.js';
import { domesticNonBusinessDayReason } from '../domain/domesticCalendar';
import { computeConfirmedBalance } from '../domain/balanceDerivation';
import { parseMonetaryAmount } from '../money';
import { RequestValidationError } from '../errors';
import type { BalanceMovement, InstrumentType } from '../types';
import type { CreateMovementRequest } from './balanceService';

export const ROOT_INSTRUMENT_TYPES: ReadonlySet<InstrumentType> = new Set(['IPLC_LC', 'EPLC_LC', 'EPLC_CONFIRMATION']);

export const NATURAL_KEY_FIELDS_BY_INSTRUMENT: Readonly<Record<InstrumentType, ReadonlyArray<'ibNumber' | 'sgNumber'>>> = {
  IPLC_LC: [],
  EPLC_LC: [],
  IPLC_ACCEPTANCE: ['ibNumber'],
  EPLC_ACCEPTANCE: ['ibNumber'],
  SHGT: ['sgNumber'],
  EPLC_CONFIRMATION: [],
  EPLC_DUE_FROM_ISSUING_BANK: ['ibNumber'],
  EPLC_ACCEPTANCE_REIMB_RECEIVABLE: ['ibNumber'],
  EPLC_EXPORT_BILLS_DISCOUNTED: ['ibNumber'],
  EPLC_EXAMINATION: ['ibNumber'],
};

export const SECONDARY_REF_REQUIRED_MOVEMENT_TYPES: ReadonlySet<string> = new Set([
  'AMEND_INCREASE',
  'AMEND_DECREASE',
  'AMEND',
  'AMEND_EXPIRY_DATE',
  'UTILIZE',
  'HONOUR',
  'ACCEPT',
]);

export const TENOR_TYPE_REQUIRED_PAIRS: ReadonlySet<string> = new Set(['IPLC_LC:ISSUE', 'EPLC_CONFIRMATION:ISSUE', 'IPLC_ACCEPTANCE:CREATE']);

export interface MovementValidationReader {
  findByBusinessEventId(businessEventId: string): BalanceMovement[];
  listByContract(balanceContractId: string): BalanceMovement[];
}

/** Request-level business validation shared by Submit, Checker re-check and Fix Pending. */
export class MovementRequestValidator {
  constructor(
    private readonly movements: MovementValidationReader,
    private readonly isCreatingMovement: (movementType: string) => boolean,
  ) {}

  validateCreateRequest(req: CreateMovementRequest): void {
    if (req.movementType !== 'REOPEN') this.assertValidAmount(req.movementType, req.amount);
    this.assertReasonCodeRequired(req.movementType, req.reasonCode);
    this.assertExpiryDateRequired(req);
    this.assertExpiryDateIsBusinessDay(req);
    this.assertNaturalKeyFieldsRequired(req);
    this.assertSecondaryRefRequired(req);
    this.assertTenorRequired(req);
    this.assertToleranceNonNegative(req.tolerancePct);
  }

  assertValidAmount(movementType: string, amount: string): void {
    const amt = parseMonetaryAmount(amount);
    if (movementType === 'AMEND') {
      if (amt.isZero()) throw new RequestValidationError(`amount "${amount}" must not be zero for AMEND — Direction is carried by its own sign.`);
      return;
    }
    if (movementType === 'CLOSE' || movementType === 'EXPIRE' || movementType === 'REOPEN') {
      if (amt.isNegative()) throw new RequestValidationError(`amount "${amount}" must not be negative for ${movementType}.`);
      return;
    }
    if (movementType === 'AMEND_EXPIRY_DATE') {
      if (!amt.isZero()) throw new RequestValidationError(`amount "${amount}" must be exactly 0 for ${movementType}.`);
      return;
    }
    if (movementType === 'REVERSAL') {
      if (amt.isNegative()) throw new RequestValidationError(`amount "${amount}" must not be negative for REVERSAL.`);
      return;
    }
    if (amt.isZero() || amt.isNegative()) throw new RequestValidationError(`amount "${amount}" must be greater than 0.`);
  }

  assertReasonCodeRequired(movementType: string, reasonCode: string | null | undefined): void {
    if ((movementType === 'CLOSE' || movementType === 'REOPEN') && !reasonCode) {
      throw new RequestValidationError(`reasonCode is required for ${movementType}.`);
    }
  }

  assertExpiryDateRequired(req: CreateMovementRequest): void {
    if (req.movementType === 'ISSUE' && ROOT_INSTRUMENT_TYPES.has(req.instrumentType) && !req.expiryDate) {
      throw new RequestValidationError(`expiryDate is required for ISSUE against ${req.instrumentType}.`);
    }
  }

  assertExpiryDateIsBusinessDay(req: CreateMovementRequest): void {
    if (req.movementType !== 'ISSUE' || !ROOT_INSTRUMENT_TYPES.has(req.instrumentType) || !req.expiryDate) return;
    const reason = domesticNonBusinessDayReason(req.expiryDate);
    if (reason) {
      throw new RequestValidationError(`expiryDate ${req.expiryDate} falls on a domestic non-business day (${reason}) — pick a genuine business day.`);
    }
  }

  assertNaturalKeyFieldsRequired(req: CreateMovementRequest): void {
    if (!this.isCreatingMovement(req.movementType) || !req.naturalKey) return;
    if (!req.naturalKey.lcNumber) {
      throw new RequestValidationError(`naturalKey.lcNumber is required for ${req.movementType} against ${req.instrumentType}.`);
    }
    for (const field of NATURAL_KEY_FIELDS_BY_INSTRUMENT[req.instrumentType] ?? []) {
      if (!req.naturalKey[field]) {
        throw new RequestValidationError(`naturalKey.${field} is required for ${req.movementType} against ${req.instrumentType}.`);
      }
    }
  }

  assertSecondaryRefRequired(req: CreateMovementRequest): void {
    if (SECONDARY_REF_REQUIRED_MOVEMENT_TYPES.has(req.movementType) && !req.sourceTransactionRef) {
      throw new RequestValidationError(`sourceTransactionRef is required for ${req.movementType}.`);
    }
  }

  assertTenorRequired(req: CreateMovementRequest): void {
    const pairKey = `${req.instrumentType}:${req.movementType}`;
    if (!TENOR_TYPE_REQUIRED_PAIRS.has(pairKey)) return;
    if (!req.tenorType) {
      throw new RequestValidationError(`tenorType is required for ${req.movementType} against ${req.instrumentType}.`);
    }
    if (pairKey === 'IPLC_LC:ISSUE' && req.tenorType !== 'SIGHT' && !(req.tenorDays && req.tenorDays > 0)) {
      throw new RequestValidationError(`tenorDays must be greater than 0 for ${req.tenorType}.`);
    }
  }

  assertToleranceNonNegative(tolerancePct: string | null | undefined): void {
    if (tolerancePct == null) return;
    if (new Decimal(tolerancePct).isNegative()) {
      throw new RequestValidationError(`tolerancePct "${tolerancePct}" must not be negative.`);
    }
  }

  assertA3SBillCoversShippingGuarantee(businessEventId: string | null | undefined, billAmount: string): void {
    if (!businessEventId) return;
    const sgRedemptions = this.movements
      .findByBusinessEventId(businessEventId)
      .filter((movement) => movement.movementType === 'FULL_REDEEM' || movement.movementType === 'PARTIAL_REDEEM');
    if (sgRedemptions.length !== 1) {
      throw new RequestValidationError(`A3S event ${businessEventId} must reference exactly one Shipping Guarantee redemption.`);
    }
    const redemption = sgRedemptions[0]!;
    const sgBalanceBeforeRedemption = computeConfirmedBalance(
      this.movements.listByContract(redemption.balanceContractId).filter((movement) => movement.movementId !== redemption.movementId),
    );
    if (new Decimal(billAmount).lessThan(sgBalanceBeforeRedemption)) {
      throw new RequestValidationError(
        `A3S Bill Amount must be greater than or equal to the Shipping Guarantee Balance (${sgBalanceBeforeRedemption.toFixed()}).`,
      );
    }
  }
}
