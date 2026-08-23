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

/**
 * A6/B4 Calculated Maturity Date — one entry in the `calendars[]` array Standing's own
 * `POST /business-days/adjust` expects (design doc §3.1). Deliberately a loose local shape (plain
 * `string` fields, not the union-typed `StandingCalendarRef` `clients/standingClient.ts` builds the
 * actual request from) — this type describes what's PERSISTED on a BalanceContract/BalanceMovement, a
 * different concern from what's valid to SEND to Standing; keeping them separate avoids types.ts (this
 * project's OAS-schema mirror) taking a dependency on the Standing HTTP client module.
 */
export interface MaturityDateCalendarRef {
  calendarType: string;
  code: string;
  role: string;
  required?: boolean;
}

/**
 * analysis/contingent-liability-ledger.html — the Dr/Cr contingent-liability account-entry pair for
 * ONE event, server-derived once at movement-creation time (domain/contingentAccountEntry.ts) and
 * persisted immutably with the movement. Distinct from `AccountEntry`/`accountEntries` above: that
 * field is caller-supplied, general-purpose GL passthrough for a downstream accounting component
 * (Design doc §2/§3.3 "GL Ownership") and stays untouched by this feature; `contingentAccountEntry` is
 * this service's own, server-generated, contingent/off-balance-sheet-only pair — on-balance-sheet
 * liability is explicitly out of scope and never populates it (null for the ON_BALANCE_ASSET
 * instrumentTypes and any movementType the ledger has no pair for).
 */
export interface ContingentAccountEntry {
  drAccount: string;
  crAccount: string;
  currency: string;
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
  /**
   * A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §1/§3 — Business Date, required at root A1/B1
   * ISSUE (400 if missing on a root create — enforced in service/balanceService.ts's own
   * resolveOrCreateContract(), not requestSchema.ts, since it's conditional on parentLogicalContractId
   * being absent — the zod layer has no contract/parent to resolve at validation time). Inherited unmodified by child/derived
   * contracts (SHGT/Acceptance/etc.) via the same resolveOrCreateContract() currency-derivation path.
   * §2 GAP-15 discovery query (GET /balance-contracts/close-eligible?expiredBefore=...) filters on this.
   */
  expiryDate?: string | null;
  /** §1/§3 — optional at root A1/B1 ISSUE, defaults to today's Business Date when omitted. */
  issueDate?: string | null;
  /**
   * A6/B4 Calculated Maturity Date (2026-08-23, Maturity-Date-Business-Day-Convention-Decision-
   * Request.md, resolved) — this LC/Confirmation's own Standing calendar reference config, captured
   * once at A1/B1 root ISSUE, amendable via A2/B2's own AMEND_MATURITY_CALENDARS (see
   * BalanceMovement.maturityDateCalendars's own doc comment for the Submit->Release carry). Read
   * automatically by any Acceptance CREATE (A6, or B4's own Usance-branch compound-submission leg)
   * under this LC/Confirmation — see BalanceService.getMaturityDateCalendarsFromParent() — so the Maker
   * never re-types or re-selects it per Acceptance; A3/A3S/B3 show it read-only for context (the same
   * config that will eventually drive A6/B4's own Standing call), never accept input for it.
   */
  maturityDateCalendars?: MaturityDateCalendarRef[] | null;
  /** design doc §3.1 `combinationRule` — `ALL_REQUIRED_OPEN`/`ANY_ELIGIBLE_OPEN`. Defaults applied server-side (see maturityDateCalculation.ts) when this LC has calendars but omits an explicit rule. */
  maturityDateCombinationRule?: string | null;
  /** design doc §3.1 `convention` — `FOLLOWING`/`PRECEDING`/`MODIFIED_FOLLOWING`/`MODIFIED_PRECEDING`/`NEAREST`. Same default-applied-server-side note as maturityDateCombinationRule above. */
  maturityDateConvention?: string | null;
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
  /** Server-derived, immutable — see ContingentAccountEntry's own doc comment. Null when out of contingent scope (e.g. an ON_BALANCE_ASSET instrumentType). */
  contingentAccountEntry?: ContingentAccountEntry | null;
  lmtsReservationId?: string | null;
  status: MovementStatus;
  supersededMovementId?: string | null;
  reversalOfMovementId?: string | null;
  reasonCode?: string | null;
  remarks?: string | null;
  transactionDate?: string | null;
  businessDate?: string | null;
  valueDate?: string | null;
  /**
   * A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2/§3 — A3/A3S (Import) and B3 (Export)
   * document-presentation movements only. Checked against the parent contract's own expiryDate
   * (reasonCode: PRESENTATION_AFTER_EXPIRY when documentPresentationDate > contract.expiryDate). Caller-
   * supplied, not derived server-side — null/absent on every other movementType.
   */
  documentPresentationDate?: string | null;
  /**
   * §0.1 — Layer 2/3 (Maker Submit / Checker Release) informational-only audit flag for the GAP-15
   * expiry-discovery three-layer design. A10/B6 CLOSE only; never read by evaluateCloseEligibility() or
   * any other business-logic check — purely a "was this triggered by an expiry batch scan" audit marker
   * a Checker can see on screen. null/absent for every movement not explicitly marked by the caller.
   */
  triggeredByExpiry?: boolean | null;
  /**
   * §2/§3 — A2/B2 AMEND_EXPIRY only: the REQUESTED new expiryDate, carried on this immutable movement
   * record until release() copies it onto BalanceContract.expiryDate (mirrors how CLOSE's own contract
   * mutation — markClosed() — happens at release(), not createMovement()). Null for every other
   * movementType.
   */
  expiryDate?: string | null;
  /**
   * A6/B4 Calculated Maturity Date (2026-08-23) — A2/B2 AMEND_MATURITY_CALENDARS only: the REQUESTED
   * new calendar config, carried on this immutable movement record until release() copies it onto
   * BalanceContract's own three columns of the same name (same "mutate the contract at Release, not
   * Submit" posture as expiryDate/AMEND_EXPIRY immediately above). Null for every other movementType.
   */
  maturityDateCalendars?: MaturityDateCalendarRef[] | null;
  maturityDateCombinationRule?: string | null;
  maturityDateConvention?: string | null;
  sourceModule?: string | null;
  sourceFunction?: string | null;
  sourceTransactionRef?: string | null;
  /**
   * Bug fixed 2026-08-16, reviewer-reported ("A6/B4 也修一下" — extending the same-day
   * businessEventId fix to A6/B4) — the movementId of a PRE-EXISTING record this movement converts/
   * finalizes (A6/B4's own "still-PENDING source Document Arrival/Present Docs" picked at Submit
   * time). Distinct from businessEventId (which only ever links movements CREATED TOGETHER in the
   * same submission): the source record here was created by an earlier, separate submission, so it
   * never shares a businessEventId with this one — this field is the only correlation between them.
   * Lets a genuinely independent Checker session resolve and release the source record without
   * needing the Maker's own in-memory `selectedPayMovement` — same reasoning as businessEventId's own
   * v1.2.0 fix, for the one correlation shape businessEventId can't cover. Passthrough only — this
   * service never validates that it resolves to a real movement (same posture as sourceTransactionRef/
   * businessEventId, both also caller-supplied correlation-only fields).
   */
  referencedTransactionId?: string | null;
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
   * 2026-08-20 (business instruction, "交易要有 SUBMIT DATETIME/USER, EC DATETIME/USER (optional) AND
   * APPROVE DATETIME/USER") — the Maker's own EC/`cancel()` actor and time, split out from
   * `releasedBy`/`releasedAt` (which `cancel()` used to reuse, disambiguated only by `status ===
   * 'CANCELLED'`) so the UI can show Submit/EC/Approve as three genuinely independent facts rather than
   * inferring EC from an overloaded "released" field. Null unless `status === 'CANCELLED'`. `reject()`
   * still writes into `releasedBy`/`releasedAt` for a REJECTED movement — no dedicated `rejectedBy`/
   * `rejectedAt` pair was requested, out of scope for this change.
   */
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  /**
   * EPLC_EXAMINATION only (2026-08-15, "Present Docs 須有一個 Present Docs Earmark (Pending/Approved)
   * 來控制"). HISTORICAL FIELD, no longer written — superseded 2026-08-18 (business instruction, "所有
   * 交易要RELEASE過後 才能根據流程走下一個交易"): B3's own Checker action is now a genuine
   * PENDING->RELEASED transition via the standard `release()` endpoint (releasedBy/releasedAt), not a
   * separate acknowledgment that left status PENDING. `presentDocsConsumedAt`/`presentDocsConsumedBy`
   * below are what the Present Docs Earmark Pending/Approved split reads now — see their own doc
   * comments and `domain/offBalanceExposure.ts`'s own basis-change note. Kept on the type purely so a
   * pre-2026-08-18 row's own historical value still round-trips through the API; `acknowledge()` and
   * its `/acknowledge` route no longer exist.
   */
  acknowledgedBy?: string | null;
  acknowledgedAt?: string | null;
  /**
   * EPLC_EXAMINATION/CREATE only (2026-08-18, business instruction "所有交易要RELEASE過後 才能根據流程走
   * 下一個交易" — superseding the prior acknowledgedAt-based design, see acknowledgedAt's own doc
   * comment above). Set as a SIDE EFFECT of `release()` on the Confirmation's own linked HONOUR/ACCEPT
   * movement (identified via that movement's own `referencedTransactionId` pointing back at this
   * EPLC_EXAMINATION CREATE) — i.e. the moment B4 actually consumes this presentation, not when B3
   * itself is Released. Distinct from `status`/`releasedAt` (B3's OWN Checker Release, which now happens
   * independently and earlier) — a presentation can be `status: 'RELEASED'` (EARMARKED) for a while with
   * `presentDocsConsumedAt` still null, exactly the window `computePresentDocsEarmark`'s own doc comment
   * explains must still occupy Present Docs Earmark capacity. Null until B4 consumes it, and for
   * movements predating this field (a pre-2026-08-18 row that was already fully processed by B4 under
   * the OLD design — its own EPLC_EXAMINATION CREATE reached RELEASED via B4's own compound release call
   * directly, not via this consume side effect, so it has no `presentDocsConsumedAt` value to backfill;
   * harmless — `computePresentDocsEarmark`'s own filter only matters for a presentation that's still
   * genuinely outstanding, and a fully-processed historical row's own real-world capacity was already
   * retired regardless of which mechanism recorded it).
   */
  presentDocsConsumedAt?: string | null;
  /** Audit metadata only, paired with presentDocsConsumedAt above — the checkerId who released the consuming HONOUR/ACCEPT. */
  presentDocsConsumedBy?: string | null;
  /**
   * A4 (Sight Settlement) only (2026-08-16, business instruction "Add real Maker Submit, then have
   * Checker to Release it. Exactly the same as A1."). A4 has no movement of its own to create — it
   * settles the PRE-EXISTING UTILIZE A3/A3S already earmarked — so this is the genuine,
   * backend-persisted Maker action standing in for A1's own createMovement()-as-Submit step. Mirrors
   * acknowledgedBy/acknowledgedAt's own shape (a second, non-finalizing actor action recorded on the
   * SAME movement) but on the MAKER side: status stays PENDING either way. Set via
   * POST /balance-movements/{id}/maker-submit — see service.submitByMaker()'s own doc comment for
   * why /release itself does not hard-require this (would break the Business Case Runner's own
   * orchestrated Import Case 1/2, which release a UTILIZE directly with no separate maker-submit
   * step); the Transaction Builder's own A4 Checker flow enforces it client-side instead.
   */
  makerSubmittedBy?: string | null;
  makerSubmittedAt?: string | null;
  /**
   * Business instruction 2026-08-17 ("建議把交易當時(PENDING XOR APPROVED) 交易時的Current Balance
   * 存檔 VIEW EVENTS時 直接抓取為EVENT SNAPSHOT" / "只存PENDING 或 APPROVED 其中一個", later simplified
   * to "不複雜 就是交易處理時 Look Up Current Balance 的SNAPSHOT (PENDING OR APPROVED) SAVED TO DB ==
   * EVENT BALANCE SNAPSHOT") — THIS movement's own contract's own balance, the exact same plain
   * BalanceSnapshot shape/values GET /balance-contracts/{id}/balance (Look Up Current Balance) would
   * return for this same contract at this same moment — captured once and persisted here instead:
   * written at createMovement() (reflecting this movement's own still-PENDING contribution) and
   * OVERWRITTEN at release() (reflecting the finalized/RELEASED state) — never both at once, always the
   * snapshot as of this movement's current status. Always this movement's OWN contract — see
   * BalanceMovement.rootEventSnapshot below for the separate, additional parent-contract capture on a
   * child-ledger movement (SHGT/Acceptance/EPLC_EXAMINATION). Null for movements created before this
   * field existed (pre-migration rows) and for reject()/cancel() (out of scope per business instruction
   * — those transitions leave whatever was captured at Create). Same "computed once, persisted
   * immutably, never recomputed at inquiry time" posture as contingentAccountEntry above.
   *
   * ONE exception to "OVERWRITTEN at release()", added 2026-08-18 (business instruction, "做完A4 A3
   * 的EVENT SNAPSHOT應該跟當初A3交易時一樣 不應改變" — after A4 finalizes, A3's own Event Snapshot must
   * stay exactly as it was at A3's own transaction time, unchanged): for a Sight-tenor IPLC_LC/UTILIZE
   * (the one movement type Inquire Events splits into a 'create' + 'finalize' row — see
   * inquire-events.service.ts's own InquiredEvent doc comment on the Angular side, and
   * BalanceService.release()'s own doc comment here), release() deliberately does NOT overwrite this
   * field — it stays exactly what createMovement() captured (A3's own Document Arrival submission,
   * PENDING) — and instead writes the release-time figure into the NEW finalizeEventSnapshot field
   * below. Every OTHER movement type's own eventSnapshot is unaffected — still always overwritten at
   * release(), same as before this date.
   */
  eventSnapshot?: BalanceSnapshot | null;
  /**
   * 2026-08-17 ("REFER TO DB S01" business-reported gap, then "不複雜 就是...SAVED TO DB == EVENT
   * BALANCE SNAPSHOT") — set ONLY on a child-ledger movement (SHGT, IPLC_ACCEPTANCE, EPLC_ACCEPTANCE,
   * EPLC_EXAMINATION — see BalanceService.resolveParentContract's own doc comment): the PARENT LC/
   * EPLC_CONFIRMATION's own plain balance, captured at the exact same moment as eventSnapshot above —
   * exactly what Look Up Current Balance's own "LC tab" would show for the parent if queried live right
   * then. Additive, never a replacement for eventSnapshot (which always stays this movement's own
   * contract) — Inquire Events' Balance Tabs read whichever of the two applies per tab (see
   * inquire-events.service.ts's own doc comment). Null for a root-level movement (IPLC_LC/EPLC_LC/
   * EPLC_CONFIRMATION — there is no parent to redirect to) and for movements predating this field.
   */
  rootEventSnapshot?: BalanceSnapshot | null;
  /**
   * 2026-08-17 ("就是交易當時LC所有的BALANCE的拍照存檔" — a snapshot of ALL the LC family's balances at
   * transaction time, saved to DB; business-confirmed live example, LC S02's 3rd event — a plain A3
   * Document Arrival UTILIZE with no direct SG movement, still needs SG G01's own balance captured too)
   * — the ONE Acceptance contract's own CURRENT plain balance under this movement's own root LC/
   * Confirmation, captured ONLY when exactly one such contract exists (two or more is ambiguous — left
   * null, same posture Inquire Events' own Balance Tabs use). Null when this movement's own contract
   * already IS an Acceptance (eventSnapshot already covers it), when the root has no Acceptance yet, when
   * more than one exists, or for movements predating this field. See
   * BalanceService.captureSiblingSnapshots's own doc comment for the full capture rule.
   */
  acceptanceEventSnapshot?: BalanceSnapshot | null;
  /** Same rule as acceptanceEventSnapshot above, for the ONE Shipping Guarantee contract instead (Import-side only — SHGT has no Export equivalent). */
  sgEventSnapshot?: BalanceSnapshot | null;
  /**
   * 2026-08-18, business instruction ("做完A4 A3 的EVENT SNAPSHOT應該跟當初A3交易時一樣 不應改變") — the
   * release-time counterpart to eventSnapshot's own new exception above: set ONLY when release() is
   * finalizing a Sight-tenor IPLC_LC/UTILIZE (A4's own `payExistingUtilize` target — see
   * BalanceService.release()'s own doc comment for the exact condition, reusing BAL-123's already-
   * existing gate check). Holds the release-time balance (what eventSnapshot itself used to be
   * overwritten with, before this date) WITHOUT touching eventSnapshot, which instead stays frozen at
   * whatever createMovement() originally captured. Null for every other movement (the vast majority —
   * this field only ever exists to give Inquire Events' own 'finalize' row, see
   * inquire-events.service.ts's own InquiredEvent doc comment, something to read that its sibling
   * 'create' row's eventSnapshot no longer provides once the two started genuinely diverging) and for
   * movements predating this field.
   */
  finalizeEventSnapshot?: BalanceSnapshot | null;
  /**
   * 2026-08-18, business instruction ("SNAP SHOT保留當時 LC, SG, ACCEPTANCE BALANCE 不會因為後續交易改變"
   * — the LC/SG/Acceptance figures a snapshot preserves must NOT be changed by a later transaction) —
   * the release-time counterpart to acceptanceEventSnapshot above, same rule finalizeEventSnapshot
   * already established for eventSnapshot itself: set ONLY when release() finalizes a Sight-tenor
   * IPLC_LC/UTILIZE (isSightUtilizeFinalize). Reproduces the live gap exactly: LC S01's own A3 Document
   * Arrival happened BEFORE SG G01 was even issued (A8), so acceptanceEventSnapshot/sgEventSnapshot
   * captured at A3's own createMovement() time correctly show "no such contract yet" — but
   * captureSiblingSnapshots() was, before this date, unconditionally RE-RUN and OVERWRITTEN at every
   * release() call regardless of movement type, silently replacing that correct "didn't exist yet"
   * picture with whatever the sibling looked like by A4's own much-later Release. Without this field,
   * A3's own 'create' row (Inquire Events) would incorrectly show A8's SG as if it already existed at
   * A3's own transaction time. Null for every other movement and for movements predating this field.
   */
  finalizeAcceptanceEventSnapshot?: BalanceSnapshot | null;
  /** Same rule as finalizeAcceptanceEventSnapshot above, for the ONE Shipping Guarantee contract instead (Import-side only). */
  finalizeSgEventSnapshot?: BalanceSnapshot | null;
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
  /**
   * IPLC_LC/EPLC_LC: availableBalance minus offBalanceExposure (§6.1, outstanding SHGT exposure).
   * EPLC_CONFIRMATION (2026-08-18, user-requested — "the same field for the Export Confirmed LC"):
   * availableBalance minus computePresentDocsEarmark() (Pending+Approved combined) — the genuine
   * Export-side analog, NOT the same computation as the Import case (EPLC_CONFIRMATION has no sibling
   * SHGT exposure to net out; SHGT is always a child of IPLC_LC). Both share the same PURPOSE — "true
   * remaining capacity before the next event" — via a different deduction. Null for every other
   * instrumentType (SHGT/IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/EPLC_EXAMINATION/the 3 ON_BALANCE_ASSET types).
   */
  tightAvailableBalance?: string | null;
  /**
   * EPLC_CONFIRMATION only (2026-08-15, "Present Docs Earmark (Pending/Approved)") — null for every
   * other instrumentType. presentDocsEarmarkPending = Σ still-unacknowledged PENDING EPLC_EXAMINATION
   * CREATE amounts under this Confirmation; presentDocsEarmarkApproved = Σ Checker-acknowledged (B3's
   * own Release) but not-yet-B4-consumed ones. B3's own sufficiency check nets BOTH against
   * availableBalance combined (see domain/offBalanceExposure.ts's computePresentDocsEarmark) — the same
   * combined figure tightAvailableBalance above now also surfaces for this instrumentType.
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
