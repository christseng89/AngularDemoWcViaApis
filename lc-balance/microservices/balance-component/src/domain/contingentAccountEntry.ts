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
 * concept that table already encodes for balance math; this module only adds the account-NAME layer
 * on top (Design doc §5's direction table vs. this ledger's own account-inventory table are two views
 * of the same underlying fact).
 *
 * Returns null for:
 *  - instrumentTypes outside the Balance Component's own contingent/off-balance-sheet scope — the
 *    ON_BALANCE_ASSET instruments a Confirmation's own Honour/Accept transforms into
 *    (EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE / EPLC_EXPORT_BILLS_DISCOUNTED) —
 *    on-balance-sheet liability/asset entries are never generated here, by design (ledger's own scope
 *    boundary: "On-Balance-Sheet Liability remains out of scope for the Balance Component").
 *  - EPLC_EXAMINATION (B3 Present Docs) — business-confirmed 2026-08-17: B3 never actually posts to the
 *    books (Design Principle D3, "Documents arriving is a physical event... Only legal events move
 *    balances"), so no account-entry pair is generated for it, even though the ledger's own Folio 1/4
 *    "no GL effect" rows visually named a pair. This reverses this module's own earlier decision to
 *    model that pair as a real, named entry rather than leaving it silently absent.
 *  - any movementType this ledger does not document a contingent pair for (defensive default — every
 *    movementType actually reachable through balanceService.createMovement() today is covered).
 */
import { parseMonetaryAmount } from '../money';
import { MOVEMENT_DIRECTION } from './balanceDerivation';
import type { InstrumentType, TenorType } from '../types';

export interface ContingentAccountEntry {
  drAccount: string;
  crAccount: string;
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
/** Ledger Folio 2 — not tenor-suffixed; the SG's own contingent pair is identical regardless of the parent LC's tenor. */
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
    // EPLC_EXAMINATION (B3 Present Docs) never posts a real account-entry pair (see this file's own top
    // doc comment for the 2026-08-17 reversal), grouped here with the ON_BALANCE_ASSET instruments —
    // explicitly out of the Balance Component's own contingent scope (ledger's own Scope boundary). No
    // family, no entry, by design.
    case 'EPLC_EXAMINATION':
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
}): ContingentAccountEntry | null {
  const family = accountFamilyFor(params.instrumentType);
  if (!family) return null;

  // F1, user-reported 2026-08-25 ("A2 B2 extension不牽涉金額 不需要出ACCOUNT ENTRIES") — AMEND_EXPIRY_DATE
  // never has a real balance/GL effect of its own (plain amendment, or the Expiry Extension Amendment
  // entry point — either way it only ever updates the expiryDate column; the actual restoration on the
  // Extension path is Checker Release's own linked REVERSAL, which generates its own separate real entry).
  // Explicitly null, same treatment as EPLC_EXAMINATION (B3) above — not a zero-amount placeholder pair.
  if (params.movementType === 'AMEND_EXPIRY_DATE') return null;

  // Now MOVEMENT_DIRECTION's every remaining entry is genuinely fixed at 1 or -1 — AMEND_EXPIRY_DATE (the
  // one other 0-mapped entry) already returned null above, so this cast is exact, not an approximation.
  const baseDirection =
    params.movementType === 'REVERSAL'
      ? params.reversedDirection === undefined
        ? undefined
        : ((-params.reversedDirection) as 1 | -1)
      : (MOVEMENT_DIRECTION[params.movementType] as 1 | -1 | undefined);
  if (baseDirection === undefined) return null;

  const signedAmount = parseMonetaryAmount(params.amount);
  // AMEND (EPLC_CONFIRMATION only, Design doc/B2's own registry) is the one movementType whose fixed
  // MOVEMENT_DIRECTION coefficient (+1) does not by itself distinguish Increase from Decrease —
  // Balance Component has no separate AMEND_INCREASE/AMEND_DECREASE for EPLC_CONFIRMATION the way
  // IPLC_LC does; a decrease is expressed as a negative typed amount instead (MonetaryAmount's own
  // pattern permits a leading '-'). Folding the amount's own sign into the direction here reproduces
  // Folio 4's own "Amendment — Increase / Decrease" pair correctly from this one movementType. Every
  // other movementType is always submitted with a positive amount, so this is a no-op for them.
  const netDirection: 1 | -1 = signedAmount.isNegative() ? (baseDirection === 1 ? -1 : 1) : baseDirection;

  const establishDr = withTenorSuffix(family.establishDr, family, params.tenorType);
  const establishCr = withTenorSuffix(family.establishCr, family, params.tenorType);

  return {
    drAccount: netDirection === 1 ? establishDr : establishCr,
    crAccount: netDirection === 1 ? establishCr : establishDr,
    currency: params.currency,
    amount: signedAmount.abs().toFixed(),
  };
}
