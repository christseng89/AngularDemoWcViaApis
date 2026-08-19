import { EXPORT_FUNCTIONS, IMPORT_FUNCTIONS, type InstrumentType, type TransactionFunction } from './balance-component.model';

/**
 * F-01 Strategy refactoring (`lc-balance-wc/desiger-comments.md`, OOD review finding F-01 — "the
 * 14-function registry is a Strategy pattern in name only"). History: PR-1 characterized the OLD
 * flag-driven behavior; PR-2 introduced this file as a derived projection OVER 11 boolean flags that
 * used to live on `TransactionFunction`, proven equivalent to PR-1's characterization; PR-3/PR-4
 * migrated `transaction-builder.component.ts`/`checker-actions.service.ts`/`maker-submit.service.ts`/
 * `submit-rules.ts`/`builder-fields.ts` to call `deriveFunctionStrategy()` instead of reading those
 * flags directly. **PR-5 (this state) removes the 11 flags from `TransactionFunction`/the registry
 * entirely** — `FUNCTION_STRATEGY_DEFINITIONS` below is now the SOLE source of truth for this behavior,
 * hand-authored per function code rather than derived from anything, closing the inversion PR-2's own
 * doc comment already anticipated ("PR-3/PR-4 may later choose to move the SOURCE of this data... onto
 * each registry entry directly"). `deriveFunctionStrategy(fn)`'s own public signature is UNCHANGED
 * (still takes a full `TransactionFunction` and returns a `FunctionStrategy`) so none of the 5
 * consumer files needed a single call-site edit — only this function's own internal implementation
 * changed, from reading `fn.xxxFlag` to looking up `fn.code` in the hardcoded table.
 *
 * PR-5 also relocated `movementTypeMatchesFunction`/`resolveFunctionForMovement`/
 * `payExistingUtilizeFunctionFor` here from `balance-component.model.ts` — a SIXTH real consumer of the
 * 11 flags that PR-3/PR-4's own "5 consumer files" scoping never accounted for (used by
 * `inquire-events.service.ts` to resolve which named function produced a historical movement). They
 * couldn't stay in `balance-component.model.ts` once it stopped carrying the flags at all — this file
 * already imports the registry, so moving them here (rather than the reverse) avoids a circular import.
 *
 * Grouped into four small interfaces (Interface Segregation) rather than one god-interface, matching
 * the four genuinely distinct consumers/concerns PR-2 found by re-reading the 5 files fresh:
 * - `MovementDerivationStrategy` — `submit-rules.ts`'s own "what movementType does this function
 *   actually submit" question (fixed vs. derived-from-tenor vs. derived-from-Amount-vs-Available).
 * - `CompoundSubmissionStrategy` — `maker-submit.service.ts`'s own "which of the 5 submission methods"
 *   dispatch.
 * - `CheckerReleaseStrategy` — `checker-actions.service.ts`'s own release()/reject() routing.
 * - `SelectionFlowStrategy` — which Step-2 picker shape a Maker sees (currently just B5's own
 *   Settleable-Balance/EB Index picker; `hasParent` itself is deliberately NOT included here — it's
 *   already a clean, DERIVED function of `model.instrumentType` in `function-policy.ts`, not a stored
 *   `TransactionFunction` flag at all, so it was never part of finding F-01's own "flags scattered
 *   across 5 files" problem and doesn't need migrating).
 */

/** `submit-rules.ts`'s own "what movementType does this function actually submit" question. */
export interface MovementDerivationStrategy {
  /**
   * B4 only (`movementTypeFromContractTenor`) — HONOUR vs. ACCEPT is read from the resolved contract's
   * own declared `tenorType` at submit time, not fixed on the registry entry and not user-picked.
   */
  derivesMovementTypeFromTenor: boolean;
  /**
   * Non-null when this function derives FULL_x vs. PARTIAL_x from typed Amount vs. Available Balance
   * at submit time (A9 `autoRedeemType` → `'REDEEM'`; B5 `settlesAcceptanceOnMature` → `'SETTLE'`) —
   * `null` for every other function, where `movementType` is either fixed or user-picked via a
   * `subChoice`.
   */
  amountVsAvailableDerivation: 'REDEEM' | 'SETTLE' | null;
}

/** `maker-submit.service.ts`'s own dispatch-table shape — which submission method a function's own Submit uses. */
export type SubmissionShape = 'plain' | 'documentArrivalWithSg' | 'confirmationHonourWithReceivable' | 'confirmationAcceptWithReceivable' | 'acceptanceSettleWithReceivable';

export interface CompoundSubmissionStrategy {
  /**
   * Every submission shape this function can genuinely produce. Most functions have exactly one
   * (`['plain']` for the common case). B4 is the one function with TWO real possibilities
   * (`createsIssuingBankReceivableOnHonour`/`createsAcceptanceReimbReceivableOnCreate` are BOTH
   * unconditionally `true` on its own registry entry — which of the two actually fires is chosen at
   * submit time by `model.movementType` being `'HONOUR'` vs. `'ACCEPT'`, per
   * `maker-submit.service.ts`'s own real if-chain — a single fixed answer would misrepresent this
   * function, so this is deliberately a list, not one value).
   */
  possibleShapes: readonly SubmissionShape[];
}

/** `checker-actions.service.ts`'s own release()/reject() routing. */
export interface CheckerReleaseStrategy {
  /** A4 only (`payExistingUtilize`) — Checker release() targets an EXISTING movement in place; this function's own Submit never creates a new one. */
  releasesExistingMovementInPlace: boolean;
  /** A6/B4 only (`settlesDocumentArrival`) — release() must resolve and release a previously-picked SOURCE record (Document Arrival / Present Docs) as part of this function's own compound release. */
  settlesDocumentArrival: boolean;
  /**
   * B4 only (`payableMovementRequiresRelease`), meaningful only alongside `settlesDocumentArrival`
   * above — B4's own source (B3's Present Docs record) is ALREADY independently released by the time
   * B4 can even pick it (per the 2026-08-18 "B3 redesigned to genuinely RELEASE" change), so B4's own
   * compound release does NOT attempt to release that source again — unlike A6, whose own source
   * (a plain Document Arrival) is still genuinely PENDING at pick time and DOES get released as the
   * first leg of A6's own compound release.
   */
  sourceAlreadyReleasedBeforePick: boolean;
  /** A3/A3S only (`deferSettlement`) — the Checker step is acknowledgment-only; it never calls the real release API, and the movement stays PENDING server-side. */
  deferSettlement: boolean;
}

/** Which Step-2 picker shape a Maker sees for this function. */
export interface SelectionFlowStrategy {
  /** B5 only (`settleableBalanceIndex`) — Step-2 surfaces still-outstanding settleable-balance candidates (the "EB Index"), not a plain still-PENDING-movement picker the way A4/A6 use. */
  usesSettleableBalanceIndex: boolean;
}

export interface FunctionStrategy {
  code: string;
  movementDerivation: MovementDerivationStrategy;
  compoundSubmission: CompoundSubmissionStrategy;
  checkerRelease: CheckerReleaseStrategy;
  selectionFlow: SelectionFlowStrategy;
}

const NO_SPECIAL_BEHAVIOR: FunctionStrategy = Object.freeze({
  code: '',
  movementDerivation: Object.freeze({ derivesMovementTypeFromTenor: false, amountVsAvailableDerivation: null }),
  compoundSubmission: Object.freeze({ possibleShapes: Object.freeze(['plain']) as readonly SubmissionShape[] }),
  checkerRelease: Object.freeze({ releasesExistingMovementInPlace: false, settlesDocumentArrival: false, sourceAlreadyReleasedBeforePick: false, deferSettlement: false }),
  selectionFlow: Object.freeze({ usesSettleableBalanceIndex: false }),
});

/**
 * The 14 functions' own behavior, hand-authored per code — the sole source of truth as of PR-5 (no
 * longer derived from flags on `TransactionFunction`, since those flags no longer exist). Values below
 * reproduce exactly what PR-2's own flag-derivation produced for each code, verified against the real
 * registry entries immediately before their 11 flags were removed (`git show` on this same commit's own
 * parent, or `lc-balance-wc/desiger-comments.md`'s own F-01 finding, has the original flag values if
 * ever needed for audit). A1/A2/A7/A8/B1/B2/B3 have no special behavior in any of the four categories —
 * they share `NO_SPECIAL_BEHAVIOR` above rather than repeating the same all-false/all-null literal 7
 * times.
 *
 * - **A3 / A3S** — deferSettlement (Checker Release is acknowledgment-only, movement stays PENDING
 *   server-side; A4/A6 later finalizes it for real). A3S additionally has the `documentArrivalWithSg`
 *   compound shape (redeems the matched SG's own FULL/PARTIAL_REDEEM alongside the Document Arrival).
 * - **A4** — releasesExistingMovementInPlace (Checker Release finalizes A3's own already-earmarked
 *   UTILIZE in place; A4 itself never creates a new movement).
 * - **A6** — settlesDocumentArrival, WITHOUT sourceAlreadyReleasedBeforePick (its own source, a plain
 *   Document Arrival, is still genuinely PENDING at pick time — Checker Release releases it as the
 *   first leg of A6's own compound release).
 * - **A9** — amountVsAvailableDerivation 'REDEEM' (FULL_REDEEM vs. PARTIAL_REDEEM is derived from typed
 *   Amount vs. the SG's own Available Balance at submit time, never user-picked).
 * - **B4** — derivesMovementTypeFromTenor (HONOUR vs. ACCEPT read from the picked Confirmation's own
 *   tenorType); settlesDocumentArrival WITH sourceAlreadyReleasedBeforePick (B3's own Present Docs
 *   record is ALREADY independently released by the time B4 can pick it — the A6-vs-B4 asymmetry);
 *   compoundSubmission has BOTH `confirmationHonourWithReceivable` and `confirmationAcceptWithReceivable`
 *   as possible shapes — which one actually fires is chosen at submit time by `model.movementType`
 *   being `'HONOUR'` vs. `'ACCEPT'`, never a single fixed answer.
 * - **B5** — amountVsAvailableDerivation 'SETTLE' (FULL_SETTLE vs. PARTIAL_SETTLE, same shape as A9's
 *   own REDEEM derivation); compoundSubmission `acceptanceSettleWithReceivable` (settles the Acceptance
 *   and its linked Reimbursement Receivable together); usesSettleableBalanceIndex (a dedicated "EB
 *   Index" Step-2 picker, not a plain still-PENDING-movement picker).
 */
const FUNCTION_STRATEGY_DEFINITIONS: Readonly<Record<string, FunctionStrategy>> = {
  A1: { ...NO_SPECIAL_BEHAVIOR, code: 'A1' },
  A2: { ...NO_SPECIAL_BEHAVIOR, code: 'A2' },
  A3: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A3',
    checkerRelease: { ...NO_SPECIAL_BEHAVIOR.checkerRelease, deferSettlement: true },
  },
  A3S: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A3S',
    compoundSubmission: { possibleShapes: ['documentArrivalWithSg'] },
    checkerRelease: { ...NO_SPECIAL_BEHAVIOR.checkerRelease, deferSettlement: true },
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
  A7: { ...NO_SPECIAL_BEHAVIOR, code: 'A7' },
  A8: { ...NO_SPECIAL_BEHAVIOR, code: 'A8' },
  A9: {
    ...NO_SPECIAL_BEHAVIOR,
    code: 'A9',
    movementDerivation: { ...NO_SPECIAL_BEHAVIOR.movementDerivation, amountVsAvailableDerivation: 'REDEEM' },
  },
  B1: { ...NO_SPECIAL_BEHAVIOR, code: 'B1' },
  B2: { ...NO_SPECIAL_BEHAVIOR, code: 'B2' },
  B3: { ...NO_SPECIAL_BEHAVIOR, code: 'B3' },
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
  },
};

/**
 * Looks up `fn.code`'s own hardcoded `FunctionStrategy` (see `FUNCTION_STRATEGY_DEFINITIONS` above).
 * Public signature UNCHANGED since PR-2 (still takes the full `TransactionFunction`, not just its code)
 * so every existing consumer call site (`deriveFunctionStrategy(ctx.selectedFunction)`, etc.) needed
 * zero edits when this stopped being a derivation and became a lookup. Returns a FRESH object each call
 * (never the literal `FUNCTION_STRATEGY_DEFINITIONS[fn.code]` reference) — preserves the same
 * "independent objects, not shared mutable state" guarantee the original derivation naturally had,
 * verified by `function-strategy.spec.ts`'s own "calling it twice yields deep-equal, independent
 * objects" test, unchanged since PR-2.
 */
export function deriveFunctionStrategy(fn: TransactionFunction): FunctionStrategy {
  const strategy = FUNCTION_STRATEGY_DEFINITIONS[fn.code] ?? { ...NO_SPECIAL_BEHAVIOR, code: fn.code };
  return {
    code: strategy.code,
    movementDerivation: { ...strategy.movementDerivation },
    compoundSubmission: { possibleShapes: [...strategy.compoundSubmission.possibleShapes] },
    checkerRelease: { ...strategy.checkerRelease },
    selectionFlow: { ...strategy.selectionFlow },
  };
}

/** One `FunctionStrategy` per registered function code (A1-A9, B1-B5) — built once from the current registry. */
export const FUNCTION_STRATEGIES: Readonly<Record<string, FunctionStrategy>> = Object.fromEntries(
  [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].map((fn) => [fn.code, deriveFunctionStrategy(fn)]),
);

/**
 * Relocated from `balance-component.model.ts` (PR-5) — see this file's own top-of-file doc comment for
 * why. True when `movementType` is one this function could actually have produced, treating
 * `IMPORT_FUNCTIONS`/`EXPORT_FUNCTIONS` as a strategy table for `resolveFunctionForMovement()` below
 * rather than adding a second, separately-maintained `(instrumentType, movementType) -> function` map.
 *
 * A literal `fn.movementType`/`fn.subChoice.options` match covers most functions (unaffected by PR-5 —
 * these were never part of the 11-flag problem). Three cases mean the registry's own `movementType` is
 * only a placeholder default — the real value is derived elsewhere — so a literal-only match would
 * silently miss half of what the function actually produces; these three now read `FUNCTION_STRATEGIES`
 * instead of raw flags, byte-identical to the pre-PR-5 behavior:
 *  - B4 (`derivesMovementTypeFromTenor`): HONOUR vs. ACCEPT, read from the contract at submit time.
 *  - A9 (`amountVsAvailableDerivation === 'REDEEM'`): PARTIAL_REDEEM derived from Amount vs. Available.
 *  - B5 (`amountVsAvailableDerivation === 'SETTLE'`): PARTIAL_SETTLE, same shape as A9's own REDEEM case.
 */
function movementTypeMatchesFunction(fn: TransactionFunction, movementType: string): boolean {
  if (fn.movementType === movementType) return true;
  if (fn.subChoice?.options.some((o) => o.value === movementType)) return true;
  const strategy = FUNCTION_STRATEGIES[fn.code];
  if (strategy?.movementDerivation.derivesMovementTypeFromTenor) return true;
  if (strategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM' && movementType === 'PARTIAL_REDEEM') return true;
  if (strategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' && movementType === 'PARTIAL_SETTLE') return true;
  return false;
}

/**
 * Relocated from `balance-component.model.ts` (PR-5). Which named business function (A1-A9/B1-B5) could
 * have produced a given (instrumentType, movementType) pair, so a historical movement's own data can be
 * redisplayed through that function's own field set (`builder-fields.ts`'s `buildFields()`, unchanged)
 * rather than a second, purpose-built "view" field list.
 *
 * Known, explicitly-accepted limitation (same honesty convention as Quality-report-balance.md BAL-108's
 * own "left as-is, documented" entries): a handful of (instrumentType, movementType) pairs are produced
 * by MORE than one function code — e.g. IPLC_LC/UTILIZE comes from both A3 (Document Arrival, Sight)
 * and A3S (Document Arrival w/ Shipping Gtee); SHGT/FULL_REDEEM comes from both A9 (SG Redemption) and
 * A3S's own first leg. This resolver returns the first registry match (IMPORT_FUNCTIONS ahead of
 * EXPORT_FUNCTIONS, each searched in declared order) rather than trying to disambiguate via
 * businessEventId cross-referencing — the reconstructed FIELD SET is identical either way in every such
 * case (the difference between the two functions is a label string, never which fields exist), so this
 * only affects which function-code badge Inquire Events shows, never the data displayed. Returns
 * undefined when nothing matches (a movementType/instrumentType combination no current function
 * produces, e.g. legacy data) — callers must fall back to a generic, function-less field set rather than
 * guessing.
 */
export function resolveFunctionForMovement(instrumentType: InstrumentType, movementType: string): TransactionFunction | undefined {
  const direct = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].find((fn) => fn.instrumentType === instrumentType && movementTypeMatchesFunction(fn, movementType));
  if (direct) return direct;
  // Bug fixed 2026-08-18, reviewer-reported (Inquire Events on LC U01 showed a blank "–" Function
  // column for the EPLC_ACCEPTANCE/CREATE row) — B4's own Usance compound Maker Submit creates this
  // movement as a SECONDARY leg, but B4's own registry entry is instrumentType EPLC_CONFIRMATION, so
  // the direct match above can never find it for this leg's own instrumentType (unlike A6 on the
  // Import side, whose registry entry IS instrumentType IPLC_ACCEPTANCE/CREATE directly). A real,
  // named, in-scope Balance Component ledger event, so it earns its own fallback rather than staying
  // blank — unlike the on-balance-sheet asset legs, which genuinely have no Balance Component function.
  if (instrumentType === 'EPLC_ACCEPTANCE' && movementType === 'CREATE') {
    return EXPORT_FUNCTIONS.find((fn) => FUNCTION_STRATEGIES[fn.code]?.compoundSubmission.possibleShapes.includes('confirmationAcceptWithReceivable'));
  }
  return undefined;
}

/**
 * Relocated from `balance-component.model.ts` (PR-5). The ONE function in this whole registry that
 * finalizes (Maker-Submits + Checker-Releases) an EXISTING movement instead of creating a new one
 * (`releasesExistingMovementInPlace`, A4 only today). `resolveFunctionForMovement()` above always
 * resolves this same (instrumentType, movementType) pair to A3 (the first registry match, since A3/A4
 * share an identical shape) — correct for the movement's own CREATE event, but wrong for its later,
 * separately-timed FINALIZE event (A4's own Release). `InquireEventsService` uses this instead,
 * specifically for that later event, so the "View" screen correctly shows "A4 · Sight Settlement"
 * rather than "A3 · Document Arrival" once a Sight-tenor Document Arrival has actually been Settled.
 */
export function payExistingUtilizeFunctionFor(instrumentType: InstrumentType): TransactionFunction | undefined {
  return IMPORT_FUNCTIONS.find((fn) => fn.instrumentType === instrumentType && FUNCTION_STRATEGIES[fn.code]?.checkerRelease.releasesExistingMovementInPlace);
}
