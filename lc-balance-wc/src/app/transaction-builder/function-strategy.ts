import { EXPORT_FUNCTIONS, IMPORT_FUNCTIONS, type InstrumentType, type TransactionFunction } from './balance-component.model';

/**
 * Per-function behavior registry (desiger-comments.md F-01) — the sole source of truth for the 11
 * flags that used to live directly on `TransactionFunction`. Grouped into focused interfaces
 * (Interface Segregation) matching their consumers: movement derivation, submission, Checker release,
 * selection, and same-session Delete Pending. `hasParent` is deliberately excluded — it's already a pure
 * derivation of `model.instrumentType` in `function-policy.ts`, not a flag.
 *
 * `movementTypeMatchesFunction`/`resolveFunctionForMovement`/`payExistingUtilizeFunctionFor` live here
 * rather than `balance-component.model.ts` (used by `inquire-events.service.ts` to resolve which named
 * function produced a historical movement) — this file already imports the registry, so keeping them
 * here avoids a circular import.
 */

/** `submit-rules.ts`'s own "what movementType does this function actually submit" question. */
export interface MovementDerivationStrategy {
  /** B4 only — HONOUR vs. ACCEPT is derived from the contract's own tenorType at submit time, not user-picked. */
  derivesMovementTypeFromTenor: boolean;
  /** 'SETTLE' (B5): FULL_x/PARTIAL_x still genuinely derived from Amount vs. Available at submit time. 'REDEEM' (A9): historically the same derivation, but BA-confirmed 2026-08-21 this is now an A9 identity marker only — Amount is locked and movementType is hardcoded FULL_REDEEM, see that function's own registry doc comment below. Null otherwise (movementType is fixed or user-picked via subChoice). */
  amountVsAvailableDerivation: 'REDEEM' | 'SETTLE' | null;
  /**
   * A10/B6 (Close) only — genuinely different from `amountVsAvailableDerivation` above: A9/B5 still let
   * the Maker TYPE an amount (compared against Available to derive FULL_/PARTIAL_); Close's own Amount is
   * NEVER typed at all, only ever carried from the selected contract's current Confirmed Balance and
   * locked (`builder-fields.ts`'s own `amountFromClose`) — see `maker-panel.component.ts`'s
   * `refreshSelectedContractSnapshot()` for where the value itself gets read from `snap.confirmedBalance`
   * (not `availableBalance` — Close writes off the RELEASED figure, not the PENDING-inclusive one).
   */
  amountAutoFilledFrom: 'confirmedBalance' | null;
  /**
   * A11/B7 (Reopen, F1) only — genuinely different from `amountAutoFilledFrom` above: Reopen's own Amount
   * is NEVER carried from any CLIENT-visible balance figure (a CLOSED contract's own Confirmed Balance is
   * always exactly 0, having already been written off by the CLOSE/EXPIRE this Reopen restores) — the
   * REAL restoration amount is computed entirely server-side at Submit time, from the contract's own
   * write-off history (domain/reopenRestoration.ts on the microservice side), and is never surfaced to
   * the Maker as an input at all (redesigned 2026-08-25 — see builder-fields.ts's own `amountFromFixed`,
   * which HIDES the Amount field outright rather than merely locking it). This `'0'` is only ever a
   * harmless wire placeholder — the request schema requires some valid MonetaryAmount string, and the
   * server discards whatever is sent and substitutes its own computed figure regardless.
   */
  amountFixed: '0' | null;
}

/** `maker-submit.service.ts`'s own dispatch-table shape — which submission method a function's own Submit uses. */
export type SubmissionShape = 'plain' | 'documentArrivalWithSg' | 'confirmationHonourWithReceivable' | 'confirmationAcceptWithReceivable';

export interface CompoundSubmissionStrategy {
  /** Every submission shape this function can produce. B4 is the only function with two (HONOUR/ACCEPT both true on its registry entry; chosen at submit time by model.movementType). */
  possibleShapes: readonly SubmissionShape[];
}

/** `checker-actions.service.ts`'s own release()/reject() routing. */
export interface CheckerReleaseStrategy {
  /** A4 only — Checker release() targets an EXISTING movement in place; this function's own Submit never creates a new one. */
  releasesExistingMovementInPlace: boolean;
  /** A6/B4 only — release() must resolve and release a previously-picked SOURCE record (Document Arrival / Present Docs) as part of this function's own compound release. */
  settlesDocumentArrival: boolean;
  /** B4 only, meaningful alongside settlesDocumentArrival — B4's own source (B3's Present Docs) is already independently released by pick time, so B4's compound release skips re-releasing it; A6's source (a plain Document Arrival) is still PENDING and gets released as the first leg. */
  sourceAlreadyReleasedBeforePick: boolean;
  /** A3/A3S only — the Checker step is acknowledgment-only; it never calls the real release API, and the movement stays PENDING server-side. */
  deferSettlement: boolean;
}

/** Which Step-2 picker shape a Maker sees for this function. */
export interface SelectionFlowStrategy {
  /** B5 only — Step-2 surfaces still-outstanding settleable-balance candidates (the "EB Index"), not a plain still-PENDING-movement picker the way A4/A6 use. */
  usesSettleableBalanceIndex: boolean;
}

/**
 * Fix Pending (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §2.2/§15/§19,
 * 2026-08-28) — the closed set of `BuilderModel` fields a Function's own Fix Pending screen could EVER
 * offer as editable. `instrumentType`/`movementType`/`currency`/`eventSeq`/`createdBy`/`secondaryRef`
 * (the movement's own business "2ndary Key") are deliberately NOT expressible here at all — §15 locks
 * them for every Function unconditionally, so the type system rules out a Function ever declaring one
 * editable, rather than relying on every Function's own config to correctly omit them.
 */
export type FixPendingEditableField = 'amount' | 'tolerancePct' | 'toleranceChangePct' | 'tenorType' | 'tenorDays' | 'expiryDate' | 'newExpiryDate' | 'reasonCode' | 'remarks';
export type FixPendingMode = 'STANDARD' | 'REMARKS_ONLY';

export type MakerResultSiblingKey =
  | 'dueFromIssuingBankMovementId'
  | 'acceptanceMovementId'
  | 'acceptanceReimbReceivableMovementId'
  | 'arrivalSgRedeemMovementId';

export interface MakerResultDeletePendingStrategy {
  enabled: boolean;
  operation: 'CANCEL' | 'WITHDRAW_MAKER_SUBMIT';
  siblingMovementIdKeys: readonly MakerResultSiblingKey[];
}

export interface FunctionStrategy {
  code: string;
  movementDerivation: MovementDerivationStrategy;
  compoundSubmission: CompoundSubmissionStrategy;
  checkerRelease: CheckerReleaseStrategy;
  selectionFlow: SelectionFlowStrategy;
  /** Enables the Maker-result and Maker-queue Fix Pending entry points. */
  fixPendingEnabled: boolean;
  /** STANDARD edits derived unlocked fields; REMARKS_ONLY changes only Remarks. */
  fixPendingMode: FixPendingMode | null;
  /** Same-session Maker Result deletion policy; independent of Maker Queue. */
  makerResultDeletePending: MakerResultDeletePendingStrategy;
}

/** Single derived source of truth for "does this Function offer a Fix Pending entry point at all" — a template-friendly wrapper around `FunctionStrategy.fixPendingEnabled` (never re-derive this from field-level editability; a Function with `fixPendingEnabled: false` offers no entry point even if every field would otherwise derive as editable). */
export function functionSupportsFixPending(strategy: FunctionStrategy | null | undefined): boolean {
  return !!strategy?.fixPendingEnabled;
}

const NO_SPECIAL_BEHAVIOR: FunctionStrategy = Object.freeze({
  code: '',
  movementDerivation: Object.freeze({ derivesMovementTypeFromTenor: false, amountVsAvailableDerivation: null, amountAutoFilledFrom: null, amountFixed: null }),
  compoundSubmission: Object.freeze({ possibleShapes: Object.freeze(['plain']) as readonly SubmissionShape[] }),
  checkerRelease: Object.freeze({ releasesExistingMovementInPlace: false, settlesDocumentArrival: false, sourceAlreadyReleasedBeforePick: false, deferSettlement: false }),
  selectionFlow: Object.freeze({ usesSettleableBalanceIndex: false }),
  fixPendingEnabled: false,
  fixPendingMode: null,
  makerResultDeletePending: Object.freeze({ enabled: false, operation: 'CANCEL', siblingMovementIdKeys: Object.freeze([]) }),
});

const CANCEL_DELETE: MakerResultDeletePendingStrategy = Object.freeze({ enabled: true, operation: 'CANCEL', siblingMovementIdKeys: Object.freeze([]) });
const WITHDRAW_DELETE: MakerResultDeletePendingStrategy = Object.freeze({ enabled: true, operation: 'WITHDRAW_MAKER_SUBMIT', siblingMovementIdKeys: Object.freeze([]) });
const A3S_DELETE: MakerResultDeletePendingStrategy = Object.freeze({
  enabled: true,
  operation: 'CANCEL',
  siblingMovementIdKeys: Object.freeze<MakerResultSiblingKey[]>(['arrivalSgRedeemMovementId']),
});
const B4_DELETE: MakerResultDeletePendingStrategy = Object.freeze({
  enabled: true,
  operation: 'CANCEL',
  siblingMovementIdKeys: Object.freeze<MakerResultSiblingKey[]>(['dueFromIssuingBankMovementId', 'acceptanceMovementId', 'acceptanceReimbReceivableMovementId']),
});
/**
 * Per-function behavior, hand-authored per code — the sole source of truth (no longer derived from
 * flags on `TransactionFunction`). A1/A2/A7/A8/B1/B2/B3 share `NO_SPECIAL_BEHAVIOR` (no special case in
 * any of the four categories).
 *
 * - A3/A3S — deferSettlement (Checker Release is acknowledgment-only, movement stays PENDING; A4/A6
 *   later finalizes it for real). A3S also has the documentArrivalWithSg compound shape.
 * - A4 — releasesExistingMovementInPlace (Checker Release finalizes A3's already-earmarked UTILIZE in
 *   place; A4 itself never creates a new movement).
 * - A6 — settlesDocumentArrival, without sourceAlreadyReleasedBeforePick (its source, a plain Document
 *   Arrival, is still PENDING at pick time — released as the first leg of the compound release).
 * - A9 — amountVsAvailableDerivation 'REDEEM'. BA-confirmed 2026-08-21 (TF_Balance_Component_Mapping
 *   Rule #1, "SG discharge is instrument-based, not amount-based"): Amount is locked to the SG's own
 *   Available Balance and movementType is hardcoded FULL_REDEEM — this flag now serves purely as an A9
 *   identity marker (parent-eligibility hints, historical PARTIAL_REDEEM redisplay via
 *   `movementTypeMatchesFunction` below), not a live amount-vs-available derivation choice; see
 *   `builder-fields.ts`'s own `amountFromSgRedeem` and `submit-rules.ts`'s own REDEEM branch.
 * - B4 — derivesMovementTypeFromTenor (HONOUR vs. ACCEPT read from the Confirmation's own tenorType);
 *   settlesDocumentArrival WITH sourceAlreadyReleasedBeforePick (the A6-vs-B4 asymmetry — B3's Present
 *   Docs record is already released by pick time); compoundSubmission has both
 *   confirmationHonourWithReceivable and confirmationAcceptWithReceivable, chosen at submit time by
 *   model.movementType.
 * - B5 — amountVsAvailableDerivation 'SETTLE' (same shape as A9's REDEEM derivation) and
 *   usesSettleableBalanceIndex (a dedicated "EB Index" Step-2 picker). Submit and Checker Release both
 *   act only on the selected Acceptance; no Reimbursement Receivable lookup or companion leg is used.
 * - A10/B6 — amountAutoFilledFrom 'confirmedBalance' (Amount is never typed at all, unlike A9/B5's own
 *   amountVsAvailableDerivation above — see that field's own doc comment for the distinction).
 * - A11/B7 (Reopen, F1) — amountFixed '0' (Amount is a fixed literal, not carried from any live balance —
 *   see that field's own doc comment for why this is genuinely different from A10/B6's own
 *   amountAutoFilledFrom).
 */
const FUNCTION_STRATEGY_DEFINITIONS: Readonly<Record<string, FunctionStrategy>> = {
  // A1 — a CREATING movementType (ISSUE): builder-fields.ts's own deriveFixPendingLockFlags() therefore
  // also unlocks the 4 contract-level fields (tolerancePct/tenorType/tenorDays/expiryDate) alongside
  // Amount, per isCreatingMovement(model) — see BalanceContractStore.updateIssueFields()'s own doc
  // comment for why that's safe (nothing else can have relied on them yet).
  A1: { ...NO_SPECIAL_BEHAVIOR, code: 'A1', fixPendingEnabled: true, makerResultDeletePending: CANCEL_DELETE },
  // A2 — a non-creating movementType (AMEND_INCREASE/AMEND_DECREASE/AMEND_EXPIRY_DATE):
  // deriveFixPendingLockFlags() locks the 4 contract-level fields automatically (isCreatingMovement is
  // false, same as A3), leaving Amount (or newExpiryDate, for the AMEND_EXPIRY_DATE subChoice) as the
  // only editable field(s) — zero extra logic needed, same derivation A3 already exercises.
  A2: { ...NO_SPECIAL_BEHAVIOR, code: 'A2', fixPendingEnabled: true, makerResultDeletePending: CANCEL_DELETE },
  // A3 — a non-creating movementType (UTILIZE): deriveFixPendingLockFlags() locks the 4 contract-level
  // fields automatically (isCreatingMovement is false), leaving Amount as the only editable field.
  A3: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A3',
    fixPendingEnabled: true,
    makerResultDeletePending: CANCEL_DELETE,
    checkerRelease: { ...NO_SPECIAL_BEHAVIOR.checkerRelease, deferSettlement: true },
  },
  // A3S — Phase 4 compound Fix Pending (2026-08-28, "現在實作 Phase 4 compound cascade"): the same
  // deriveFixPendingLockFlags() derivation as plain A3 applies to the LC's own UTILIZE leg (non-creating,
  // Amount — labeled "Bill Amount" here — is the only Fix-Pending-editable field); the SG's own matched
  // redemption leg is never directly user-editable (server-recomputed, see fixPendingEnabled's own doc
  // comment above), so no separate SG-leg field config is needed here.
  A3S: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A3S',
    fixPendingEnabled: true,
    makerResultDeletePending: A3S_DELETE,
    compoundSubmission: { possibleShapes: ['documentArrivalWithSg'] },
    checkerRelease: { ...NO_SPECIAL_BEHAVIOR.checkerRelease, deferSettlement: true },
  },
  A4: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A4',
    fixPendingEnabled: true,
    fixPendingMode: 'REMARKS_ONLY',
    makerResultDeletePending: WITHDRAW_DELETE,
    checkerRelease: { ...NO_SPECIAL_BEHAVIOR.checkerRelease, releasesExistingMovementInPlace: true },
  },
  A6: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A6',
    fixPendingEnabled: true,
    fixPendingMode: 'REMARKS_ONLY',
    makerResultDeletePending: CANCEL_DELETE,
    checkerRelease: { ...NO_SPECIAL_BEHAVIOR.checkerRelease, settlesDocumentArrival: true },
  },
  A7: { ...NO_SPECIAL_BEHAVIOR, code: 'A7', fixPendingEnabled: true, fixPendingMode: 'REMARKS_ONLY', makerResultDeletePending: CANCEL_DELETE },
  // A8 — a CREATING movementType (ISSUE, SHGT): same shape as A1/B1, Amount is genuinely free-typed (no
  // amountLocked rule applies to A8 at all) — a real, meaningful Fix Pending target.
  A8: { ...NO_SPECIAL_BEHAVIOR, code: 'A8', fixPendingEnabled: true, makerResultDeletePending: CANCEL_DELETE },
  // A9 — deliberately NOT Fix-Pending-enabled (2026-08-28, user-confirmed via AskUserQuestion): Amount is
  // fully locked to the SG's own Available Balance (BA-confirmed Full-Redeem-only rule) and A9 has no
  // secondaryRef/reasonCode of its own — every field on this screen is already locked at fresh Submit, so
  // a Fix Pending screen for A9 would have genuinely nothing editable to fix.
  A9: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A9',
    fixPendingEnabled: true,
    fixPendingMode: 'REMARKS_ONLY',
    makerResultDeletePending: CANCEL_DELETE,
    movementDerivation: { ...NO_SPECIAL_BEHAVIOR.movementDerivation, amountVsAvailableDerivation: 'REDEEM' },
  },
  // A10 — Amount is fully auto-filled/locked (amountAutoFilledFrom), but Reason Code (F1 §13.1, mandatory
  // for Close) is genuinely editable — the meaningful Fix Pending target here, via the SAME
  // requiresReasonCode-driven reasonCode unlock A11/B6/B7 below already share.
  A10: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A10',
    fixPendingEnabled: true,
    makerResultDeletePending: CANCEL_DELETE,
    movementDerivation: { ...NO_SPECIAL_BEHAVIOR.movementDerivation, amountAutoFilledFrom: 'confirmedBalance' },
  },
  // A11 — Amount is hidden entirely (amountFixed, server-computed at Submit), but Reason Code (F1 §13.1,
  // mandatory for Reopen) is genuinely editable — same "Reason Code is the real Fix Pending target" shape
  // as A10 above.
  A11: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A11',
    fixPendingEnabled: true,
    makerResultDeletePending: CANCEL_DELETE,
    movementDerivation: { ...NO_SPECIAL_BEHAVIOR.movementDerivation, amountFixed: '0' },
  },
  // B1 — a CREATING movementType (ISSUE, EPLC_CONFIRMATION), same shape as A1: the 4 contract-level
  // fields unlock alongside Amount per isCreatingMovement(model).
  B1: { ...NO_SPECIAL_BEHAVIOR, code: 'B1', fixPendingEnabled: true, makerResultDeletePending: CANCEL_DELETE },
  // B2 — a non-creating movementType (AMEND, direction via sign) — same shape as A2: deriveFixPendingLockFlags()
  // locks the 4 contract-level fields automatically, leaving Amount (or newExpiryDate for its own
  // AMEND_EXPIRY_DATE subChoice option) as the only editable field, and Tolerance % (EPLC_CONFIRMATION is
  // tolerance-applicable) stays editable via the same 2026-08-28 exception A2 already exercises — zero
  // extra derivation logic needed, only this flag (2026-08-28, "使用同樣方式處理...B2").
  B2: { ...NO_SPECIAL_BEHAVIOR, code: 'B2', fixPendingEnabled: true, makerResultDeletePending: CANCEL_DELETE },
  // B3 — a plain creating CREATE (hasParent, no Step-2 picker of its own — same shape as A8), Amount is
  // genuinely free-typed (face-level Bill Amount) — a real, meaningful Fix Pending target, same reasoning
  // A8 already got (2026-08-28, "Use the same method for B3 with Fix Pending"). EPLC_EXAMINATION's own
  // contingentAccountEntry is always null (D3, MEMO_ONLY, never posts) regardless of Fix Pending — that's
  // unrelated to whether the Bill Amount itself can be corrected before Release.
  B3: { ...NO_SPECIAL_BEHAVIOR, code: 'B3', fixPendingEnabled: true, makerResultDeletePending: CANCEL_DELETE },
  B4: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'B4',
    fixPendingEnabled: true,
    fixPendingMode: 'REMARKS_ONLY',
    makerResultDeletePending: B4_DELETE,
    movementDerivation: { ...NO_SPECIAL_BEHAVIOR.movementDerivation, derivesMovementTypeFromTenor: true },
    compoundSubmission: { possibleShapes: ['confirmationHonourWithReceivable', 'confirmationAcceptWithReceivable'] },
    checkerRelease: { ...NO_SPECIAL_BEHAVIOR.checkerRelease, settlesDocumentArrival: true, sourceAlreadyReleasedBeforePick: true },
  },
  B5: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'B5',
    fixPendingEnabled: true,
    fixPendingMode: 'REMARKS_ONLY',
    makerResultDeletePending: CANCEL_DELETE,
    movementDerivation: { ...NO_SPECIAL_BEHAVIOR.movementDerivation, amountVsAvailableDerivation: 'SETTLE' },
    selectionFlow: { usesSettleableBalanceIndex: true },
  },
  // B6 — Export counterpart of A10: same "Reason Code is the real Fix Pending target" shape.
  B6: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'B6',
    fixPendingEnabled: true,
    makerResultDeletePending: CANCEL_DELETE,
    movementDerivation: { ...NO_SPECIAL_BEHAVIOR.movementDerivation, amountAutoFilledFrom: 'confirmedBalance' },
  },
  // B7 — Export counterpart of A11: same "Reason Code is the real Fix Pending target" shape.
  B7: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'B7',
    fixPendingEnabled: true,
    makerResultDeletePending: CANCEL_DELETE,
    movementDerivation: { ...NO_SPECIAL_BEHAVIOR.movementDerivation, amountFixed: '0' },
  },
};

/**
 * Looks up `fn.code`'s own `FunctionStrategy` (see `FUNCTION_STRATEGY_DEFINITIONS` above). Returns a
 * FRESH object each call (never the literal `FUNCTION_STRATEGY_DEFINITIONS[fn.code]` reference) —
 * independent objects, not shared mutable state.
 */
export function deriveFunctionStrategy(fn: TransactionFunction): FunctionStrategy {
  const strategy = FUNCTION_STRATEGY_DEFINITIONS[fn.code] ?? { ...NO_SPECIAL_BEHAVIOR, code: fn.code };
  return {
    code: strategy.code,
    movementDerivation: { ...strategy.movementDerivation },
    compoundSubmission: { possibleShapes: [...strategy.compoundSubmission.possibleShapes] },
    checkerRelease: { ...strategy.checkerRelease },
    selectionFlow: { ...strategy.selectionFlow },
    fixPendingEnabled: strategy.fixPendingEnabled,
    fixPendingMode: strategy.fixPendingMode ?? (strategy.fixPendingEnabled ? 'STANDARD' : null),
    makerResultDeletePending: {
      ...strategy.makerResultDeletePending,
      siblingMovementIdKeys: [...strategy.makerResultDeletePending.siblingMovementIdKeys],
    },
  };
}

/** One `FunctionStrategy` per registered function code (A1-A11, B1-B7) — built once from the current registry. */
export const FUNCTION_STRATEGIES: Readonly<Record<string, FunctionStrategy>> = Object.fromEntries(
  [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].map((fn) => [fn.code, deriveFunctionStrategy(fn)]),
);

/**
 * True when `movementType` is one this function could actually have produced, treating
 * `IMPORT_FUNCTIONS`/`EXPORT_FUNCTIONS` as a strategy table rather than a second, separately-maintained
 * `(instrumentType, movementType) -> function` map.
 *
 * A literal `fn.movementType`/`fn.subChoice.options` match covers most functions. Three cases mean the
 * registry's own `movementType` is only a placeholder default — the real value is derived elsewhere —
 * so a literal-only match would silently miss half of what the function actually produces:
 *  - B4 (`derivesMovementTypeFromTenor`): HONOUR vs. ACCEPT, read from the contract at submit time.
 *  - A9 (`amountVsAvailableDerivation === 'REDEEM'`): PARTIAL_REDEEM derived from Amount vs. Available.
 *  - B5 (`amountVsAvailableDerivation === 'SETTLE'`): PARTIAL_SETTLE, same shape as A9's own REDEEM case.
 *
 * Exported (2026-08-20, business instruction "各功能 RELEASE 自己產生的 PENDING 或 EARMARKING 交易" — "A2
 * 不該看到 UTILIZED 交易") for `checker-panel.component.ts`'s own `loadCheckerQueue()` too: several
 * instrumentTypes are shared by more than one function (IPLC_LC: A1/A2/A3/A3S/A4; IPLC_ACCEPTANCE: A6/A7;
 * SHGT: A8/A9; EPLC_CONFIRMATION: B1/B2/B4), so a plain `status === 'PENDING'` filter on the resolved
 * contract mixes every function's own pending movements into one Checker Queue — e.g. A2's own screen
 * showing an unrelated A3 UTILIZE. Filtering the queue to only movementTypes the CURRENTLY selected
 * function could itself have produced fixes that, using the exact same "could this function have made
 * this movement" question `resolveFunctionForMovement()` above already answers for Inquire Events.
 */
export function movementTypeMatchesFunction(fn: TransactionFunction, movementType: string): boolean {
  if (fn.movementType === movementType) return true;
  // F1 (external BA review, v1.19.0) — a subChoice option's own `value` is what the UI shows/writes into
  // its own field, but `movementTypeOverride` (when set, B2's own "Expiry Date" option) is the ACTUAL
  // wire movementType submitted — see SubChoice.options[].movementTypeOverride's own doc comment. Without
  // this, B2's Checker Queue would never surface a PENDING AMEND_EXPIRY_DATE movement it had itself just
  // Maker-Submitted, since 'EXPIRY_DATE' (the option's own value) never equals the real movementType.
  if (fn.subChoice?.options.some((o) => o.value === movementType || o.movementTypeOverride === movementType)) return true;
  const strategy = FUNCTION_STRATEGIES[fn.code];
  // Bug fixed 2026-08-21 (user-reported, "A10 B6 也是交易EVENT 所以 LOOKUP & INQUIRE EVENTS都應該顯示這筆
  // CLOSE EVENT" — U03's own CLOSE row displayed as "B4 Honour/Acceptance" instead of "B6 Confirmed LC
  // Close"): this branch used to return true UNCONDITIONALLY whenever derivesMovementTypeFromTenor is
  // set, regardless of movementType — B4 is the only function with this flag, so it silently swallowed
  // EVERY otherwise-unmatched EPLC_CONFIRMATION movementType (CLOSE included, and any future one) into
  // matching B4, since B4 is registered before B6 and `resolveFunctionForMovement()`'s own `.find()`
  // takes the first match. The doc comment above always said "HONOUR vs. ACCEPT" — the code just never
  // actually checked that, harmless only because no OTHER movementType existed on EPLC_CONFIRMATION
  // until CLOSE. Also fixes the same latent bug in loadCheckerQueue() (this function's other caller) —
  // a PENDING CLOSE could have shown up in B4's own Checker Queue.
  if (strategy?.movementDerivation.derivesMovementTypeFromTenor && (movementType === 'HONOUR' || movementType === 'ACCEPT')) return true;
  if (strategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM' && movementType === 'PARTIAL_REDEEM') return true;
  if (strategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' && movementType === 'PARTIAL_SETTLE') return true;
  return false;
}

/**
 * Which named business function (A1-A9/B1-B5) could have produced a given (instrumentType,
 * movementType) pair, so a historical movement can be redisplayed through that function's own field set
 * (`builder-fields.ts`'s `buildFields()`) rather than a second, purpose-built "view" field list.
 *
 * Known, explicitly-accepted limitation: a few pairs are produced by more than one function — e.g.
 * IPLC_LC/UTILIZE by both A3 and A3S; SHGT/FULL_REDEEM by both A9 and A3S's own first leg. Returns the
 * first registry match — the reconstructed field set is identical either way (the difference is only a
 * label string), so this only affects which function-code badge Inquire Events shows, never the data
 * displayed. Returns undefined when nothing matches; callers must fall back to a generic field set.
 */
export function resolveFunctionForMovement(instrumentType: InstrumentType, movementType: string): TransactionFunction | undefined {
  const direct = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].find((fn) => fn.instrumentType === instrumentType && movementTypeMatchesFunction(fn, movementType));
  if (direct) return direct;
  // B4's own compound Submit creates a THIRD-instrumentType secondary leg beyond its own registry entry
  // (instrumentType EPLC_CONFIRMATION), so the direct match above can't find any of them — same reasoning
  // as EPLC_ACCEPTANCE/CREATE below (unlike A6, whose entry IS IPLC_ACCEPTANCE/CREATE) applies to the
  // asset-side receivable leg every B4 shape also creates in the SAME businessEventId (reviewer-reported
  // 2026-08-28, Maker Queue showing a bare "—" Function for this exact row): EPLC_ACCEPTANCE_REIMB_
  // RECEIVABLE/CREATE for the Usance shape, EPLC_DUE_FROM_ISSUING_BANK/CREATE for the Sight shape. Real
  // in-scope events, so they get a fallback rather than staying blank, same as the Acceptance leg.
  if (instrumentType === 'EPLC_ACCEPTANCE' && movementType === 'CREATE') {
    return EXPORT_FUNCTIONS.find((fn) => FUNCTION_STRATEGIES[fn.code]?.compoundSubmission.possibleShapes.includes('confirmationAcceptWithReceivable'));
  }
  if (instrumentType === 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE' && movementType === 'CREATE') {
    return EXPORT_FUNCTIONS.find((fn) => FUNCTION_STRATEGIES[fn.code]?.compoundSubmission.possibleShapes.includes('confirmationAcceptWithReceivable'));
  }
  if (instrumentType === 'EPLC_DUE_FROM_ISSUING_BANK' && movementType === 'CREATE') {
    return EXPORT_FUNCTIONS.find((fn) => FUNCTION_STRATEGIES[fn.code]?.compoundSubmission.possibleShapes.includes('confirmationHonourWithReceivable'));
  }
  return undefined;
}

/**
 * The Function that finalizes an EXISTING A3/A3S UTILIZE instead of creating a new movement of its own —
 * A4 for Sight (Maker-Submits + Checker-Releases the SAME movement directly,
 * `releasesExistingMovementInPlace`), A6 for Usance (business-confirmed 2026-08-27, "A6 必須... 承接並
 * 正式轉換 A3/A3S 的 EARMARKED exposure" — creates its OWN separate `IPLC_ACCEPTANCE/CREATE`, but its own
 * Checker Release CASCADES into finalizing the referenced UTILIZE too, see `BalanceService.
 * applyReleaseSideEffects()`'s own doc comment; `settlesDocumentArrival && !sourceAlreadyReleasedBeforePick`
 * picks out exactly A6 from that flag's shared set — B4 also sets `settlesDocumentArrival` but its own
 * referenced B3 record is ALREADY released before B4 ever picks it, so B4 needs no such cascade).
 * `resolveFunctionForMovement()` above always resolves an IPLC_LC/UTILIZE to A3 (the first registry
 * match) — correct for the CREATE event, wrong for the later FINALIZE event. `InquireEventsService` uses
 * this instead for that later event, so "View" shows "A4 · Sight Settlement"/"A6 · Acceptance (Usance)"
 * rather than "A3 · Document Arrival" once actually finalized.
 */
export function payExistingUtilizeFunctionFor(instrumentType: InstrumentType, tenorType?: 'SIGHT' | 'SELLERS_USANCE' | 'BUYERS_USANCE' | null): TransactionFunction | undefined {
  if (instrumentType !== 'IPLC_LC' || !tenorType) return undefined;
  if (tenorType === 'SIGHT') {
    // A4 finalizes the referenced UTILIZE directly, in place — its OWN registry instrumentType is
    // IPLC_LC too, so this can filter on it directly.
    return IMPORT_FUNCTIONS.find((fn) => fn.instrumentType === instrumentType && FUNCTION_STRATEGIES[fn.code]?.checkerRelease.releasesExistingMovementInPlace);
  }
  // A6's OWN registry instrumentType is IPLC_ACCEPTANCE, not IPLC_LC (it creates a genuinely separate
  // contract) — filtering on `fn.instrumentType === instrumentType` here would never match it, unlike
  // A4's in-place case above. `settlesDocumentArrival && !sourceAlreadyReleasedBeforePick` alone already
  // uniquely identifies A6 among every Import Function (B4 sets settlesDocumentArrival too, but only
  // A6's own strategy omits sourceAlreadyReleasedBeforePick — and B4 lives in EXPORT_FUNCTIONS, never
  // searched here, anyway).
  return IMPORT_FUNCTIONS.find(
    (fn) => FUNCTION_STRATEGIES[fn.code]?.checkerRelease.settlesDocumentArrival && !FUNCTION_STRATEGIES[fn.code]?.checkerRelease.sourceAlreadyReleasedBeforePick,
  );
}
