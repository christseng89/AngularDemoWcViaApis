import { EXPORT_FUNCTIONS, IMPORT_FUNCTIONS, type TransactionFunction } from './balance-component.model';

/**
 * PR-2 of the F-01 Strategy refactoring (`lc-balance-wc/desiger-comments.md`, OOD review finding F-01
 * — "the 14-function registry is a Strategy pattern in name only"). **Not yet consumed by any
 * production code path.** `transaction-builder.component.ts`, `checker-actions.service.ts`,
 * `maker-submit.service.ts`, `submit-rules.ts`, and `builder-fields.ts` are UNCHANGED by this file —
 * they still read `TransactionFunction`'s own boolean flags directly, exactly as before. PR-3/PR-4
 * (separate, later PRs) will migrate the Import (A-series) and Export (B-series) consumers to call the
 * `FunctionStrategy` API below instead of re-deriving these same answers independently five times.
 *
 * Deliberately built as a THIN, DERIVED PROJECTION over the existing `IMPORT_FUNCTIONS`/
 * `EXPORT_FUNCTIONS` registry (`deriveFunctionStrategy()` below), not a second, independently-typed
 * data source someone has to remember to keep in sync — the OOD review's own finding F-06 already
 * flags exactly that "kept in sync by hand" pattern as a real drift risk elsewhere in this codebase
 * (`BalanceContract`/`BalanceMovement` across the Angular/microservice boundary); this file avoids
 * reproducing that same risk shape within one app. PR-3/PR-4 may later choose to move the SOURCE of
 * this data from the derivation function onto each registry entry directly (making the boolean flags
 * on `TransactionFunction` themselves redundant and removable) — that's a decision for those PRs, not
 * this one; this PR only proves the shape and the current-behavior equivalence.
 *
 * Grouped into four small interfaces (Interface Segregation) rather than one god-interface, matching
 * the four genuinely distinct consumers/concerns found by re-reading the 5 files fresh for this PR:
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

/**
 * Pure projection — computes a `FunctionStrategy` from one `TransactionFunction`'s own CURRENT flags.
 * Reproduces today's behavior exactly (including the B4 dual-shape/`possibleShapes` case above); does
 * not change, correct, or reinterpret anything. See `function-strategy.spec.ts` for the equivalence
 * proof against `transaction-function-flags.characterization.spec.ts` (PR-1).
 */
export function deriveFunctionStrategy(fn: TransactionFunction): FunctionStrategy {
  const possibleShapes: SubmissionShape[] = [];
  if (fn.documentArrivalWithSg) possibleShapes.push('documentArrivalWithSg');
  if (fn.createsIssuingBankReceivableOnHonour) possibleShapes.push('confirmationHonourWithReceivable');
  if (fn.createsAcceptanceReimbReceivableOnCreate) possibleShapes.push('confirmationAcceptWithReceivable');
  if (fn.settlesAcceptanceOnMature) possibleShapes.push('acceptanceSettleWithReceivable');
  if (possibleShapes.length === 0) possibleShapes.push('plain');

  return {
    code: fn.code,
    movementDerivation: {
      derivesMovementTypeFromTenor: !!fn.movementTypeFromContractTenor,
      amountVsAvailableDerivation: fn.autoRedeemType ? 'REDEEM' : fn.settlesAcceptanceOnMature ? 'SETTLE' : null,
    },
    compoundSubmission: { possibleShapes },
    checkerRelease: {
      releasesExistingMovementInPlace: !!fn.payExistingUtilize,
      settlesDocumentArrival: !!fn.settlesDocumentArrival,
      sourceAlreadyReleasedBeforePick: !!fn.payableMovementRequiresRelease,
      deferSettlement: !!fn.deferSettlement,
    },
    selectionFlow: {
      usesSettleableBalanceIndex: !!fn.settleableBalanceIndex,
    },
  };
}

/** One `FunctionStrategy` per registered function code (A1-A9, B1-B5) — built once from the current registry. */
export const FUNCTION_STRATEGIES: Readonly<Record<string, FunctionStrategy>> = Object.fromEntries(
  [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].map((fn) => [fn.code, deriveFunctionStrategy(fn)]),
);
