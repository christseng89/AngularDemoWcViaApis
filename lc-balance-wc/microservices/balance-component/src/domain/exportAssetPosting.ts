import Decimal from 'decimal.js';
import { MakerCheckerConflictError, RequestValidationError } from '../errors';

export type ExportAuthorizationClaim =
  | Readonly<{
      claimStatus: 'ABSENT';
      authorizationValidationResult: 'NOT_CONFIRMED';
    }>
  | Readonly<{
      claimStatus: 'SUBMITTED';
      authorizationReference?: string;
      authorizedAmountOwner?: string;
      authorizedCurrency?: string;
      authorizationValidationResult: 'CONFIRMED' | 'NOT_CONFIRMED';
    }>;

export type ExportExcessDebtor = 'ISSUING_BANK' | 'BENEFICIARY_OR_RECOURSE_PARTY';
export type ExportAssetBalanceType = 'Due from Issuing Bank' | 'Reimbursement Receivable' | 'EXPORT_EXCESS_ASSET';

export interface ExportAssetLeg {
  balanceType: ExportAssetBalanceType;
  amountOwner: string;
  ownerCurrency: string;
  debtor: ExportExcessDebtor;
  mappingKey: string;
}

export interface ExportAssetPostingPlan {
  excessDebtor: ExportExcessDebtor;
  assets: readonly [ExportAssetLeg, ExportAssetLeg];
}

export interface PlanExportAssetPostingInput {
  makerContext: string;
  checkerContext: string;
  ownerCurrency: string;
  legalAmountOwner: string;
  coveredAmountOwner: string;
  excessAmountOwner: string;
  tenorBehavior: 'SIGHT' | 'USANCE';
  authorization: ExportAuthorizationClaim;
}

function positiveDecimal(value: string, field: string): Decimal {
  try {
    const parsed = new Decimal(value);
    if (!parsed.isFinite() || !parsed.greaterThan(0)) throw new Error('not positive');
    return parsed;
  } catch {
    throw new RequestValidationError(`${field} must be a positive exact decimal.`);
  }
}

function resolveDebtor(input: PlanExportAssetPostingInput, excessAmount: Decimal): ExportExcessDebtor {
  const claim = input.authorization;
  if (claim.claimStatus !== 'SUBMITTED' || claim.authorizationValidationResult !== 'CONFIRMED') {
    return 'BENEFICIARY_OR_RECOURSE_PARTY';
  }
  const referenceValid = Boolean(claim.authorizationReference?.trim());
  const currencyValid = claim.authorizedCurrency === input.ownerCurrency;
  let amountValid = false;
  try {
    const amount = new Decimal(claim.authorizedAmountOwner ?? '');
    amountValid = amount.isFinite() && amount.greaterThanOrEqualTo(excessAmount);
  } catch {
    amountValid = false;
  }
  return referenceValid && currencyValid && amountValid ? 'ISSUING_BANK' : 'BENEFICIARY_OR_RECOURSE_PARTY';
}

/**
 * FROZEN V2 TC-14/TC-15 pure decision table. It has no authorization lookup
 * and never allocates a partial claim: one debtor owns the complete locked
 * Excess amount while Covered keeps the existing Sight/Usance balance type.
 */
export function planExportAssetPosting(input: PlanExportAssetPostingInput): ExportAssetPostingPlan {
  if (!input.makerContext.trim() || !input.checkerContext.trim()) throw new RequestValidationError('Maker and Checker identities are required.');
  if (input.makerContext === input.checkerContext) {
    throw new MakerCheckerConflictError('Cannot release B4 — Maker and Checker cannot be the same user.');
  }
  const ownerCurrency = input.ownerCurrency.trim();
  if (!ownerCurrency) throw new RequestValidationError('ownerCurrency is required.');
  const legal = positiveDecimal(input.legalAmountOwner, 'legalAmountOwner');
  const covered = positiveDecimal(input.coveredAmountOwner, 'coveredAmountOwner');
  const excess = positiveDecimal(input.excessAmountOwner, 'excessAmountOwner');
  if (!covered.plus(excess).equals(legal)) throw new RequestValidationError('Locked Covered plus Excess must equal Legal amount.');

  const excessDebtor = resolveDebtor(input, excess);
  const coveredAsset =
    input.tenorBehavior === 'SIGHT'
      ? ({
          balanceType: 'Due from Issuing Bank',
          amountOwner: covered.toFixed(),
          ownerCurrency,
          debtor: 'ISSUING_BANK',
          mappingKey: 'EPLC_DUE_FROM_ISSUING_BANK:SIGHT',
        } as const)
      : ({
          balanceType: 'Reimbursement Receivable',
          amountOwner: covered.toFixed(),
          ownerCurrency,
          debtor: 'ISSUING_BANK',
          mappingKey: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE:USANCE',
        } as const);
  return {
    excessDebtor,
    assets: [
      coveredAsset,
      {
        balanceType: 'EXPORT_EXCESS_ASSET',
        amountOwner: excess.toFixed(),
        ownerCurrency,
        debtor: excessDebtor,
        mappingKey: `EXPORT_EXCESS_ASSET:${input.tenorBehavior}`,
      },
    ],
  };
}
