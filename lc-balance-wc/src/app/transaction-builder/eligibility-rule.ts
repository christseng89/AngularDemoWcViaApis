import { BalanceContract, BalanceSnapshot } from './balance-component-api.service';
import { DECREASING_MOVEMENT_TYPES } from './balance-component.model';

/**
 * BAL-003 "Feature Components + Facade" Phase 3 (2026-08-20, desiger-comments.md — user-directed after
 * being warned this exact unification was evaluated once already this session, during the
 * `CatalogPickerService` pagination pass, and judged not worth the risk/reward at the time; explicitly
 * overridden — "實作 eligibility 邏輯統一（接受風險）").
 *
 * Unifies the repeated TAIL of `filteredCatalogContracts`/`filteredParentCatalog`/`filteredIbIndexCatalog`
 * (`maker-panel.component.ts`) — each getter independently hand-rolled the identical "filter by a hint-set
 * of eligible contract ids, OR pass through unconditionally, OR fall back to excluding 0-Available-Balance
 * candidates but only for a decreasing movementType" shape. That mechanical tail is what this module
 * extracts; it is a pure function with zero DI, matching this project's own established convention for
 * shared picker-adjacent utility logic (`paged-list-state.ts`'s own precedent).
 *
 * **Deliberately NOT extended to also decide WHICH rule applies to a given function/picker** — that
 * decision reads `TransactionFunction` registry fields that were explicitly scoped OUT of the F-01 Strategy
 * migration (`payableMovementInstrumentType`, `catalogTenorFilter` — see `function-strategy.ts`'s own
 * top-of-file doc comment: only the 11 flags that were "scattered across 5 files" moved into
 * `FunctionStrategy`; every other registry field, including these two, was deliberately left alone).
 * Forcing them into a Strategy-shaped abstraction here would mean either (a) growing `function-strategy.ts`
 * beyond its own documented scope for a single caller, or (b) duplicating those two registry fields into a
 * second, independently-maintained place — both worse than the alternative: each getter still resolves its
 * OWN `EligibilityRule` value locally (unchanged branching, unchanged flags/fields read, unchanged order),
 * and only the FINAL "now apply it" step is shared. This keeps the unification honest about its own actual
 * scope — deduplicating a mechanical filtering step, not merging three different business-rule cascades
 * into one that could subtly drift from any of the three original ones.
 *
 * Also deliberately NOT a discriminated union keyed by picker (catalog/parent/ibIndex) — `filteredIbIndexCatalog`
 * has no special-case rule at all today (always `{kind: 'genericFallback'}`), and no function needs its
 * catalog-picker and parent-picker eligibility to differ (each function uses exactly one Step-1 picker
 * type, determined by `hasParent`), so one rule shape genuinely serves all three call sites without any
 * per-picker branching baked into the type itself.
 */
/** Minimal structural type both `Set<string>` (`catalogSgEligible`/`parentSgEligible`) and
 * `Map<string, string[]>` (`catalogPayableIbs`/`parentPayableIbs`/`catalogChildPayableIbs` — these three
 * carry per-contract IB-number hint text alongside eligibility, per `DocumentArrivalHintsService`'s own
 * doc comment) already satisfy — `applyEligibilityRule()` only ever needs membership, never a value. */
export interface EligibilityIdLookup {
  has(id: string): boolean;
}

export type EligibilityRule =
  { kind: 'hintSet'; ids: EligibilityIdLookup } | { kind: 'unconditional' } | { kind: 'genericFallback'; gatedByMovementType: boolean };

/**
 * Applies an already-resolved `EligibilityRule` to a (tenor-pre-filtered, picker-specific) candidate list.
 * `movementType`/`snapshots` are only read for the `'genericFallback'` case.
 *
 * `gatedByMovementType` preserves a real, pre-existing ASYMMETRY between the 3 original getters, found
 * while migrating this and confirmed via `git show HEAD:...` against the pre-unification source before
 * "fixing" it (out of scope — zero business logic change is the whole point of this pass):
 * `filteredCatalogContracts`/`filteredIbIndexCatalog`'s own trailing branch only excluded 0-Available-
 * Balance candidates when `movementType` is one of `DECREASING_MOVEMENT_TYPES` (an Increase/Create never
 * needs to exclude an already-exhausted candidate — 0 is a normal starting point), but
 * `filteredParentCatalog`'s own trailing branch applied the 0-balance exclusion UNCONDITIONALLY, with no
 * `DECREASING_MOVEMENT_TYPES` gate at all. `gatedByMovementType: true` reproduces the first shape (catalog/
 * IB Index callers); `gatedByMovementType: false` reproduces the second (the parent-picker caller) — this
 * flag exists ONLY to keep that pre-existing difference intact, not because a new caller needs to choose
 * between the two.
 *
 * A missing snapshot (still loading) is never excluded, matching the original
 * "!snap || snap.availableBalance !== '0'" condition verbatim in every case.
 */
export function applyEligibilityRule(
  list: readonly BalanceContract[],
  rule: EligibilityRule,
  movementType: string | undefined,
  snapshots: ReadonlyMap<string, BalanceSnapshot>,
): BalanceContract[] {
  switch (rule.kind) {
    case 'hintSet':
      return list.filter((c) => rule.ids.has(c.balanceContractId));
    case 'unconditional':
      return [...list];
    case 'genericFallback': {
      if (rule.gatedByMovementType && (!movementType || !DECREASING_MOVEMENT_TYPES.has(movementType))) return [...list];
      return list.filter((c) => {
        const snap = snapshots.get(c.balanceContractId);
        return !snap || snap.availableBalance !== '0';
      });
    }
  }
}
