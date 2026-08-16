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
/** B3 (Present Docs) — MEMO_ONLY, operational memo per Design Principle D3; shown in the ledger (Folios 1/4's own "No GL effect" rows) as a real, named pair rather than silently absent. Import's own equivalent (A3 "Document Arrival received") has no distinct persisted movement to attach it to — A3 IS the LC's own UTILIZE earmark, not a separate memo event — so it is intentionally not modelled here. */
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
    // ON_BALANCE_ASSET — explicitly out of the Balance Component's own contingent scope (ledger's own
    // Scope boundary). No family, no entry, by design.
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
}): ContingentAccountEntry | null {
  const family = accountFamilyFor(params.instrumentType);
  if (!family) return null;

  const baseDirection = MOVEMENT_DIRECTION[params.movementType];
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
