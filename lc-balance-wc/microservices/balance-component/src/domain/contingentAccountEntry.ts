/**
 * Derives the single Dr/Cr contingent-liability account-entry pair for one BalanceMovement, per
 * analysis/contingent-liability-ledger.html — the authoritative reference for which account names
 * apply to which (instrumentType, movementType, tenorType) combination (Folios 1-5). Generated ONCE,
 * at movement-creation time (service/balanceService.ts's own createMovement()), and persisted
 * immutably with the movement — never recomputed from the current balance, per the ledger's own
 * "Event-Level Relationship" requirement (account entries belong to the event that generated them,
 * not derived dynamically at inquiry time).
 *
 * Deliberately reuses domain/balanceDerivation.ts's own MOVEMENT_DIRECTION table rather than
 * duplicating a second direction map — the Dr/Cr side an event posts to is the exact same "+1/-1"
 * concept that table already encodes for balance math; this module adds the account identity layer
 * on top (Design doc §5's direction table vs. this ledger's own account-inventory table are two views
 * of the same underlying fact).
 *
 * Returns null for:
 *  - instrumentTypes outside the Balance Component's own contingent/off-balance-sheet scope — the
 *    ON_BALANCE_ASSET instruments a Confirmation's own Honour/Accept transforms into
 *    (EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE / EPLC_EXPORT_BILLS_DISCOUNTED) —
 *    on-balance-sheet liability/asset entries are never generated here, by design (ledger's own scope
 *    boundary: "On-Balance-Sheet Liability remains out of scope for the Balance Component").
 *  - EPLC_EXAMINATION is the exception to "real posting": B3 keeps a named internal memo pair so Maker,
 *    Checker and inquiry screens can display its EARMARKING/EARMARKED voucher. It remains MEMO exposure,
 *    so `accountEntries` (the downstream Accounting payload) is forced null by BalanceService and this
 *    pair is never sent to Accounting or reversed.
 *  - any movementType this ledger does not document a contingent pair for (defensive default — every
 *    movementType actually reachable through balanceService.createMovement() today is covered).
 */
import { parseMonetaryAmount } from '../money';
import { MOVEMENT_DIRECTION } from './balanceDerivation';
import type { InstrumentType, TenorType } from '../types';
import type { BalanceAccountMapping } from './balanceAccountMapping';

export interface ContingentAccountEntry {
  drAccount: string;
  crAccount: string;
  drAccountNumber?: string;
  drAccountDescription?: string;
  crAccountNumber?: string;
  crAccountDescription?: string;
  accountMappingKey?: string;
  accountMappingVersion?: number;
  currency: string;
  amount: string;
}

interface AccountFamily {
  /** The "Customers' Liability" / "Exposure" side — Dr when the pair is being established (direction +1). */
  establishDr: string;
  /** The "Outstanding" side — Cr when the pair is being established (direction +1). */
  establishCr: string;
  tenorSuffix: 'LC' | 'CONFIRMATION' | 'NONE';
}

/** Ledger Folio 1 (also EPLC_LC — schema-valid but no function creates one today; kept in the same family for correctness if it ever is). */
const LC_FAMILY: AccountFamily = { establishDr: "Customers' Liability under DC", establishCr: 'Documentary Credits Outstanding', tenorSuffix: 'LC' };
/** Ledger Folio 2 fallback names. Runtime mappings deliberately split SG by the parent LC risk class. */
const SG_FAMILY: AccountFamily = {
  establishDr: "Customers' Liability under Shipping Guarantees",
  establishCr: 'Shipping Guarantees Outstanding',
  tenorSuffix: 'NONE',
};
/** Ledger Folio 3 — the reporting shadow memo pair only (never the on-BS accounting record — see the ledger's own Classification note). */
const IMPORT_ACCEPTANCE_FAMILY: AccountFamily = {
  establishDr: "Acceptances & DPU — Customers' Liability (memo)",
  establishCr: 'Acceptances & DPU — Outstanding (memo)',
  tenorSuffix: 'NONE',
};
/** Ledger Folio 4. */
const CONFIRMATION_FAMILY: AccountFamily = {
  establishDr: 'Issuing Bank Confirmation Exposure',
  establishCr: 'Confirmation Undertakings Outstanding',
  tenorSuffix: 'CONFIRMATION',
};
/** Ledger Folio 5 — Export equivalent of Folio 3; Usance only in practice (Sight never creates an Acceptance — see the ledger's own Folio 5 callout), but the family itself carries no tenor logic of its own. */
const EXPORT_ACCEPTANCE_FAMILY: AccountFamily = {
  establishDr: "Confirmed Acceptances & DPU — Customers' Liability (memo)",
  establishCr: 'Confirmed Acceptances & DPU — Outstanding (memo)',
  tenorSuffix: 'NONE',
};
/** B3 Present Docs — visible internal earmark voucher only; never a downstream Accounting posting. */
const EXAMINATION_FAMILY: AccountFamily = {
  establishDr: 'Export Bills — Received, Under Examination (memo)',
  establishCr: 'Export Bills — Contra (memo)',
  tenorSuffix: 'NONE',
};

function accountFamilyFor(instrumentType: InstrumentType): AccountFamily | null {
  switch (instrumentType) {
    case 'IPLC_LC':
    case 'EPLC_LC':
      return LC_FAMILY;
    case 'SHGT':
      return SG_FAMILY;
    case 'IPLC_ACCEPTANCE':
      return IMPORT_ACCEPTANCE_FAMILY;
    case 'EPLC_CONFIRMATION':
      return CONFIRMATION_FAMILY;
    case 'EPLC_ACCEPTANCE':
      return EXPORT_ACCEPTANCE_FAMILY;
    case 'EPLC_EXAMINATION':
      return EXAMINATION_FAMILY;
    // ON_BALANCE_ASSET — explicitly out of the Balance Component's own contingent scope. No family,
    // no internal voucher pair, by design.
    case 'EPLC_DUE_FROM_ISSUING_BANK':
    case 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE':
    case 'EPLC_EXPORT_BILLS_DISCOUNTED':
      return null;
  }
}

/** Ledger Folio 1 — Sight / Buyer's Usance / Seller's Usance. Anything not BUYERS_USANCE/SELLERS_USANCE (SIGHT, or DP/DA — legacy TenorType values no Balance Component function ever produces) reads as Sight. */
function lcTenorLabel(tenorType: TenorType | null | undefined): string {
  if (tenorType === 'BUYERS_USANCE') return "Buyer's Usance";
  if (tenorType === 'SELLERS_USANCE') return "Seller's Usance";
  return 'Sight';
}

/** Ledger Folio 4 — Balance Component's own Export functions distinguish only Sight vs. Usance (B4's movementTypeFromContractTenor collapses the source document's own three-way split — see the ledger's own note 10). */
function confirmationTenorLabel(tenorType: TenorType | null | undefined): string {
  return tenorType === 'SIGHT' ? 'Sight' : 'Usance';
}

function withTenorSuffix(accountName: string, family: AccountFamily, tenorType: TenorType | null | undefined): string {
  if (family.tenorSuffix === 'LC') return `${accountName} — ${lcTenorLabel(tenorType)}`;
  if (family.tenorSuffix === 'CONFIRMATION') return `${accountName} — ${confirmationTenorLabel(tenorType)}`;
  return accountName;
}

export function deriveContingentAccountEntry(params: {
  instrumentType: InstrumentType;
  movementType: string;
  amount: string;
  currency: string;
  tenorType?: TenorType | null;
  /**
   * F1 (external BA review) — `REVERSAL` only. `REVERSAL` has no fixed MOVEMENT_DIRECTION entry of its
   * own (dynamic, per domain/balanceDerivation.ts's own doc comment) — the caller (service/
   * balanceService.ts, which has already resolved the movement being reversed in order to compute the
   * REVERSAL's own amount) passes that original movement's fixed direction here so this function can
   * derive the flipped pair. Ignored for every other movementType.
   */
  reversedDirection?: 1 | -1;
  accountMapping?: BalanceAccountMapping | null;
}): ContingentAccountEntry | null {
  const family = accountFamilyFor(params.instrumentType);
  if (!family) return null;

  // Plain ACTIVE expiry-date amendments have no accounting effect. An EXPIRED extension supplies the
  // original EXPIRE direction so its own PENDING row can carry the real restoration voucher for Checker
  // review; Release then activates this same entry rather than creating an unseen linked movement.
  if (params.movementType === 'AMEND_EXPIRY_DATE' && params.reversedDirection === undefined) return null;

  // Now MOVEMENT_DIRECTION's every remaining entry is genuinely fixed at 1 or -1 — AMEND_EXPIRY_DATE (the
  // one other 0-mapped entry) already returned null above, so this cast is exact, not an approximation.
  const baseDirection =
    params.movementType === 'REVERSAL' || params.movementType === 'AMEND_EXPIRY_DATE'
      ? params.reversedDirection === undefined
        ? undefined
        : ((-params.reversedDirection) as 1 | -1)
      : (MOVEMENT_DIRECTION[params.movementType] as 1 | -1 | undefined);
  if (baseDirection === undefined) return null;

  const signedAmount = parseMonetaryAmount(params.amount);

  // User-directed 2026-08-28 ("A10 and A11 if Tight Available Balance = 0 then no entries should be
  // generated") — CLOSE/EXPIRE/REOPEN are the only movementTypes where a genuinely zero amount is a
  // legitimate value at all (assertValidAmount()'s own doc comment: "an already-fully-utilized LC that
  // has since expired/been closed has 0 left to write off/restore, which is a legitimate figure" — every
  // other movementType is rejected outright by assertValidAmount() before ever reaching here, so this
  // guard can never silently swallow a real, non-zero-but-mistaken amount elsewhere). A zero-value Dr/Cr
  // voucher carries no real accounting information — same "no real balance effect, don't generate a
  // placeholder pair" reasoning AMEND_EXPIRY_DATE/EPLC_EXAMINATION already use above, just triggered by
  // the AMOUNT being zero here rather than the movementType itself never having one.
  if (signedAmount.isZero() && (params.movementType === 'CLOSE' || params.movementType === 'EXPIRE' || params.movementType === 'REOPEN')) {
    return null;
  }

  // AMEND (EPLC_CONFIRMATION only, Design doc/B2's own registry) is the one movementType whose fixed
  // MOVEMENT_DIRECTION coefficient (+1) does not by itself distinguish Increase from Decrease —
  // Balance Component has no separate AMEND_INCREASE/AMEND_DECREASE for EPLC_CONFIRMATION the way
  // IPLC_LC does; a decrease is expressed as a negative typed amount instead (MonetaryAmount's own
  // pattern permits a leading '-'). Folding the amount's own sign into the direction here reproduces
  // Folio 4's own "Amendment — Increase / Decrease" pair correctly from this one movementType. Every
  // other movementType is always submitted with a positive amount, so this is a no-op for them.
  const netDirection: 1 | -1 = signedAmount.isNegative() ? (baseDirection === 1 ? -1 : 1) : baseDirection;

  const establishDr = params.accountMapping?.accountA.accountDescription ?? withTenorSuffix(family.establishDr, family, params.tenorType);
  const establishCr = params.accountMapping?.accountB.accountDescription ?? withTenorSuffix(family.establishCr, family, params.tenorType);
  const drIdentity = netDirection === 1 ? params.accountMapping?.accountA : params.accountMapping?.accountB;
  const crIdentity = netDirection === 1 ? params.accountMapping?.accountB : params.accountMapping?.accountA;

  return {
    drAccount: netDirection === 1 ? establishDr : establishCr,
    crAccount: netDirection === 1 ? establishCr : establishDr,
    ...(params.accountMapping
      ? {
          drAccountNumber: drIdentity!.accountNumber,
          drAccountDescription: drIdentity!.accountDescription,
          crAccountNumber: crIdentity!.accountNumber,
          crAccountDescription: crIdentity!.accountDescription,
          accountMappingKey: params.accountMapping.mappingKey,
          accountMappingVersion: params.accountMapping.version,
        }
      : {}),
    currency: params.currency,
    amount: signedAmount.abs().toFixed(),
  };
}
