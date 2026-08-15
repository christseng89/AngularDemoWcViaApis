/**
 * TypeScript mirror of balance-component-api.yaml v0.3.0's component
 * schemas. Kept in sync by hand — see analysis/COMMON-BalanceComponent-Design-zh.md
 * (v0.5) for the authoritative business rules behind each field.
 */

/**
 * EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE / EPLC_EXPORT_BILLS_DISCOUNTED —
 * added 2026-08-15 per analysis/COMMON-BalanceComponent-ExportConfirmation-Gap-Analysis-zh.md §4.1,
 * grounded in cs-tf-balance-knowhow's frozen event catalogue (CNF_HONOUR_SIGHT/CNF_HONOUR_BU ->
 * DUE_FROM_ISSUING_BANK, CNF_ACCEPT -> ACCEPTANCE_REIMB_RECEIVABLE_ISSUING_BANK, CNF_DISCOUNT
 * reclassifies the latter into EXPORT_BILLS_DISCOUNTED). All three are ON_BALANCE_ASSET, obligor =
 * issuing bank — the asset-side counterpart the Confirmation contingent transforms into once honoured/
 * accepted, not a separate funded-lending product (EBL Nego's own discount/interest accounting stays
 * out of Balance Component scope, per the same gap analysis §1).
 */
/**
 * EPLC_EXAMINATION — added 2026-08-15, cs-tf-balance-knowhow business-expert review of a proposed
 * "Confirm LC Balance control" lifecycle table found the table's own "Confirmation Pending 100K" at
 * Present Docs violates Design Principle D3 ("Documents arriving is a physical event... Only legal
 * events move balances") — impl-spec-en.md's own event matrix confirms `EX_DOC_RCV` only ever touches
 * `EXPORT_BILLS_UNDER_EXAMINATION`/`_CONTRA`, never `CONFIRMATION_OUTSTANDING`. `MEMO_ONLY` — CREATE
 * only (Present Docs, B3); B4's Honour/Accept compound releases that same PENDING CREATE (mirroring
 * A6's own settlesDocumentArrival pattern — see B4's own doc comment) rather than a separate closing
 * movement. Never posts accountEntries, never feeds EPLC_CONFIRMATION's own balance.
 */
export type InstrumentType =
  | 'IPLC_LC'
  | 'EPLC_LC'
  | 'IPLC_ACCEPTANCE'
  | 'EPLC_ACCEPTANCE'
  | 'SHGT'
  | 'EPLC_CONFIRMATION'
  | 'EPLC_DUE_FROM_ISSUING_BANK'
  | 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE'
  | 'EPLC_EXPORT_BILLS_DISCOUNTED'
  | 'EPLC_EXAMINATION';

export type ContractStatus = 'ACTIVE' | 'SUPERSEDED' | 'CLOSED' | 'CANCELLED';

/**
 * §4 Maker/Checker lifecycle. PENDING is created by a maker (createdBy);
 * every other state is a Checker action (RELEASED/REJECTED, releasedBy) or a
 * Maker action on their own not-yet-released record (CANCELLED/SUPERSEDED).
 * Design doc §8: a transition into an illegal target state from the movement's
 * CURRENT status must fail loudly — see domain/statusTransition.ts.
 */
export type MovementStatus = 'PENDING' | 'RELEASED' | 'REJECTED' | 'CANCELLED' | 'SUPERSEDED';

/**
 * MEMO (business-confirmed 2026-08-14, Export LC design): an Unconfirmed
 * LC's "Accepted Amount" tracking (the issuing bank's own obligation, not
 * this bank's) — carried for receivable/maturity tracking only, never posts
 * accountEntries, never a real liability of this bank.
 */
export type ExposureNature = 'CONTINGENT' | 'ACTUAL' | 'MEMO';

export type TenorType = 'SIGHT' | 'BUYERS_USANCE' | 'SELLERS_USANCE' | 'DP' | 'DA';

export interface NaturalKey {
  lcNumber: string;
  ibNumber?: string | null;
  sgNumber?: string | null;
  legSeq?: string | null;
}

export interface AccountEntry {
  accountRef: string;
  drCr: 'D' | 'C';
  amount: string;
}

export interface MovementWarning {
  code: 'OFF_BALANCE_EXPOSURE_WARNING';
  message: string;
  offBalanceExposureAtCheck?: string | null;
  tightAvailableBalance?: string | null;
}

export interface BalanceContract {
  balanceContractId: string;
  logicalContractId: string;
  contractVersion: number;
  instrumentType: InstrumentType;
  naturalKey: NaturalKey;
  parentLogicalContractId?: string | null;
  status: ContractStatus;
  supersedesBalanceContractId?: string | null;
  supersededByBalanceContractId?: string | null;
  currency: string;
  /** §6.2 — IPLC_LC/EPLC_LC only. Positive Tolerance %, e.g. "10". */
  tolerancePct?: string | null;
  tenorType?: TenorType | null;
  tenorDays?: number | null;
  maturityDate?: string | null;
  openingBalance: string;
  sourceAmendmentNo?: number | null;
  effectiveFrom: string;
  effectiveTo?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface BalanceMovement {
  movementId: string;
  balanceContractId: string;
  eventSeq: number;
  businessEventId?: string | null;
  movementType: string;
  exposureNature: ExposureNature;
  /** Face-level amount as typed by the caller — see ceilingAmount for the §6.2-converted figure. */
  amount: string;
  /** §6.2 — amount × (1+tolerancePct/100) for IPLC_LC/EPLC_LC ISSUE/AMEND_*, else equal to amount. */
  ceilingAmount: string;
  currency: string;
  legRef?: string | null;
  accountEntries?: AccountEntry[] | null;
  lmtsReservationId?: string | null;
  status: MovementStatus;
  supersededMovementId?: string | null;
  reversalOfMovementId?: string | null;
  reasonCode?: string | null;
  remarks?: string | null;
  transactionDate?: string | null;
  businessDate?: string | null;
  valueDate?: string | null;
  sourceModule?: string | null;
  sourceFunction?: string | null;
  sourceTransactionRef?: string | null;
  balanceBefore?: string | null;
  balanceAfter?: string | null;
  warnings?: MovementWarning[] | null;
  /** Maker — who created the PENDING record. */
  createdBy: string;
  /** Checker — who RELEASED or REJECTED it; null while still PENDING. */
  releasedBy?: string | null;
  createdAt: string;
  releasedAt?: string | null;
  /**
   * EPLC_EXAMINATION only (2026-08-15, "Present Docs 須有一個 Present Docs Earmark (Pending/Approved)
   * 來控制") — a Checker's B3 "Release" acknowledgment of a still-PENDING Present Docs earmark,
   * WITHOUT finalizing it (status stays PENDING — B4 still needs to find and consume it). Distinct
   * from releasedBy/releasedAt (the real PENDING->RELEASED/REJECTED transition).
   */
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
}

export interface BalanceSnapshot {
  balanceContractId: string;
  logicalContractId: string;
  currency: string;
  confirmedBalance: string;
  availableBalance: string;
  pendingEarmarkTotal: string;
  /** §6.1 — null for instrumentTypes other than IPLC_LC/EPLC_LC. */
  offBalanceExposure?: string | null;
  tightAvailableBalance?: string | null;
  /**
   * EPLC_CONFIRMATION only (2026-08-15, "Present Docs Earmark (Pending/Approved)") — null for every
   * other instrumentType. presentDocsEarmarkPending = Σ still-unacknowledged PENDING EPLC_EXAMINATION
   * CREATE amounts under this Confirmation; presentDocsEarmarkApproved = Σ Checker-acknowledged (B3's
   * own Release) but not-yet-B4-consumed ones. B3's own sufficiency check nets BOTH against
   * availableBalance combined (see domain/offBalanceExposure.ts's computePresentDocsEarmark).
   */
  presentDocsEarmarkPending?: string | null;
  presentDocsEarmarkApproved?: string | null;
  asOf?: string | null;
}

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}
