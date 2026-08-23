import { EXPORT_FUNCTIONS, IMPORT_FUNCTIONS, type InstrumentType, type TransactionFunction } from './balance-component.model';

/**
 * Per-function behavior registry (desiger-comments.md F-01) — the sole source of truth for the 11
 * flags that used to live directly on `TransactionFunction`. Grouped into four small interfaces
 * (Interface Segregation) matching four distinct consumers: `submit-rules.ts` (movement derivation),
 * `maker-submit.service.ts` (submission shape), `checker-actions.service.ts` (release routing), and
 * the Step-2 picker (selection flow). `hasParent` is deliberately excluded — it's already a pure
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
}

/** `maker-submit.service.ts`'s own dispatch-table shape — which submission method a function's own Submit uses. */
export type SubmissionShape = 'plain' | 'documentArrivalWithSg' | 'confirmationHonourWithReceivable' | 'confirmationAcceptWithReceivable' | 'acceptanceSettleWithReceivable';

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
 * A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §7 — which of the four date-control shapes this
 * function's own Submit is subject to. Deliberately covers ALL functions explicitly, including the
 * `'NONE'` ones (A1/A4/A9/A10/B1/B4 Sight branch) — spec's own rationale (mirroring desiger-comments.md
 * F-09, the eligibility-rule.ts merge that silently swallowed A8's 0-balance exclusion): a function must
 * never be exempt from a date check merely because "no rule happened to match it" — it has to be an
 * explicit, visible `'NONE'`.
 *
 * A6 and B4's own Usance branch are DELIBERATELY `'NONE'` too, even though both have a real date-related
 * behavior (Calculated Maturity Date, spec §2/§3) — per the spec's own §7 closing note, that behavior is
 * NOT a dateControl-gated validation on A6/B4's own Submit (nothing here blocks/rejects A6/B4 based on a
 * date comparison — the actual Expiry-vs-presentation gate already ran upstream, at A3/B3); it's an
 * auto-fill DEFAULT-VALUE behavior (same shape as `amountAutoFilledFrom` above), tracked separately once
 * implemented, not a 5th `DateControlKind`.
 */
export type DateControlKind = 'NEW_EXPOSURE' | 'EXISTING_LIABILITY' | 'MATURITY_SETTLEMENT' | 'NONE';

export interface FunctionStrategy {
  code: string;
  movementDerivation: MovementDerivationStrategy;
  compoundSubmission: CompoundSubmissionStrategy;
  checkerRelease: CheckerReleaseStrategy;
  selectionFlow: SelectionFlowStrategy;
  dateControl: DateControlKind;
}

const NO_SPECIAL_BEHAVIOR: FunctionStrategy = Object.freeze({
  code: '',
  movementDerivation: Object.freeze({ derivesMovementTypeFromTenor: false, amountVsAvailableDerivation: null, amountAutoFilledFrom: null }),
  compoundSubmission: Object.freeze({ possibleShapes: Object.freeze(['plain']) as readonly SubmissionShape[] }),
  checkerRelease: Object.freeze({ releasesExistingMovementInPlace: false, settlesDocumentArrival: false, sourceAlreadyReleasedBeforePick: false, deferSettlement: false }),
  selectionFlow: Object.freeze({ usesSettleableBalanceIndex: false }),
  dateControl: 'NONE',
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
 * - B5 — amountVsAvailableDerivation 'SETTLE' (same shape as A9's REDEEM derivation); compoundSubmission
 *   acceptanceSettleWithReceivable (settles the Acceptance and its linked Reimbursement Receivable
 *   together); usesSettleableBalanceIndex (a dedicated "EB Index" Step-2 picker).
 * - A10/B6 — amountAutoFilledFrom 'confirmedBalance' (Amount is never typed at all, unlike A9/B5's own
 *   amountVsAvailableDerivation above — see that field's own doc comment for the distinction).
 */
const FUNCTION_STRATEGY_DEFINITIONS: Readonly<Record<string, FunctionStrategy>> = {
  A1: { ...NO_SPECIAL_BEHAVIOR, code: 'A1' },
  A2: { ...NO_SPECIAL_BEHAVIOR, code: 'A2', dateControl: 'NEW_EXPOSURE' },
  A3: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A3',
    checkerRelease: { ...NO_SPECIAL_BEHAVIOR.checkerRelease, deferSettlement: true },
    dateControl: 'EXISTING_LIABILITY',
  },
  A3S: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A3S',
    compoundSubmission: { possibleShapes: ['documentArrivalWithSg'] },
    checkerRelease: { ...NO_SPECIAL_BEHAVIOR.checkerRelease, deferSettlement: true },
    dateControl: 'EXISTING_LIABILITY',
  },
  A4: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A4',
    checkerRelease: { ...NO_SPECIAL_BEHAVIOR.checkerRelease, releasesExistingMovementInPlace: true },
  },
  A6: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A6',
    checkerRelease: { ...NO_SPECIAL_BEHAVIOR.checkerRelease, settlesDocumentArrival: true },
  },
  A7: { ...NO_SPECIAL_BEHAVIOR, code: 'A7', dateControl: 'MATURITY_SETTLEMENT' },
  A8: { ...NO_SPECIAL_BEHAVIOR, code: 'A8', dateControl: 'NEW_EXPOSURE' },
  A9: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A9',
    movementDerivation: { ...NO_SPECIAL_BEHAVIOR.movementDerivation, amountVsAvailableDerivation: 'REDEEM' },
  },
  A10: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A10',
    movementDerivation: { ...NO_SPECIAL_BEHAVIOR.movementDerivation, amountAutoFilledFrom: 'confirmedBalance' },
  },
  B1: { ...NO_SPECIAL_BEHAVIOR, code: 'B1' },
  B2: { ...NO_SPECIAL_BEHAVIOR, code: 'B2', dateControl: 'NEW_EXPOSURE' },
  B3: { ...NO_SPECIAL_BEHAVIOR, code: 'B3', dateControl: 'EXISTING_LIABILITY' },
  B4: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'B4',
    movementDerivation: { ...NO_SPECIAL_BEHAVIOR.movementDerivation, derivesMovementTypeFromTenor: true },
    compoundSubmission: { possibleShapes: ['confirmationHonourWithReceivable', 'confirmationAcceptWithReceivable'] },
    checkerRelease: { ...NO_SPECIAL_BEHAVIOR.checkerRelease, settlesDocumentArrival: true, sourceAlreadyReleasedBeforePick: true },
  },
  B5: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'B5',
    movementDerivation: { ...NO_SPECIAL_BEHAVIOR.movementDerivation, amountVsAvailableDerivation: 'SETTLE' },
    compoundSubmission: { possibleShapes: ['acceptanceSettleWithReceivable'] },
    selectionFlow: { usesSettleableBalanceIndex: true },
    dateControl: 'MATURITY_SETTLEMENT',
  },
  B6: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'B6',
    movementDerivation: { ...NO_SPECIAL_BEHAVIOR.movementDerivation, amountAutoFilledFrom: 'confirmedBalance' },
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
    dateControl: strategy.dateControl,
  };
}

/** One `FunctionStrategy` per registered function code (A1-A10, B1-B6) — built once from the current registry. */
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
  if (fn.subChoice?.options.some((o) => o.value === movementType)) return true;
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
  // B4's Usance compound Submit creates EPLC_ACCEPTANCE/CREATE as a secondary leg, but B4's own
  // registry entry is instrumentType EPLC_CONFIRMATION, so the direct match above can't find it
  // (unlike A6, whose entry IS IPLC_ACCEPTANCE/CREATE). A real in-scope event, so it gets a fallback
  // rather than staying blank.
  if (instrumentType === 'EPLC_ACCEPTANCE' && movementType === 'CREATE') {
    return EXPORT_FUNCTIONS.find((fn) => FUNCTION_STRATEGIES[fn.code]?.compoundSubmission.possibleShapes.includes('confirmationAcceptWithReceivable'));
  }
  return undefined;
}

/**
 * The one function that finalizes (Maker-Submits + Checker-Releases) an EXISTING movement instead of
 * creating a new one (A4 only). `resolveFunctionForMovement()` above always resolves this same pair to
 * A3 (the first registry match) — correct for the CREATE event, wrong for the later FINALIZE event
 * (A4's own Release). `InquireEventsService` uses this instead for that later event, so "View" shows
 * "A4 · Sight Settlement" rather than "A3 · Document Arrival" once actually Settled.
 */
export function payExistingUtilizeFunctionFor(instrumentType: InstrumentType): TransactionFunction | undefined {
  return IMPORT_FUNCTIONS.find((fn) => fn.instrumentType === instrumentType && FUNCTION_STRATEGIES[fn.code]?.checkerRelease.releasesExistingMovementInPlace);
}
