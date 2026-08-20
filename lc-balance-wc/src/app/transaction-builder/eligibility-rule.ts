import { BalanceContract, BalanceSnapshot } from './balance-component-api.service';
import { DECREASING_MOVEMENT_TYPES } from './balance-component.model';

/**
 * Unifies the repeated TAIL of `filteredCatalogContracts`/`filteredParentCatalog`/`filteredIbIndexCatalog`
 * (`maker-panel.component.ts`) — each getter independently hand-rolled the identical "filter by a hint-set
 * of eligible contract ids, OR pass through unconditionally, OR fall back to excluding 0-Available-Balance
 * candidates but only for a decreasing movementType" shape. Pure function, zero DI, matching this
 * project's own convention for shared picker-adjacent utility logic (`paged-list-state.ts`'s precedent).
 *
 * Deliberately does NOT decide WHICH rule applies to a given function/picker — that reads
 * `TransactionFunction` registry fields scoped out of the F-01 Strategy migration
 * (`payableMovementInstrumentType`, `catalogTenorFilter`); each getter still resolves its own
 * `EligibilityRule` locally, and only the final "now apply it" step is shared.
 *
 * Not a discriminated union keyed by picker — no function needs its catalog-picker and parent-picker
 * eligibility to differ (each uses exactly one Step-1 picker type, determined by `hasParent`), so one
 * rule shape serves all three call sites.
 */
/** Minimal structural type both `Set<string>` (`catalogSgEligible`/`parentSgEligible`) and `Map<string, string[]>` (`catalogPayableIbs`/`parentPayableIbs`/`catalogChildPayableIbs`) already satisfy — `applyEligibilityRule()` only ever needs membership, never a value. */
export interface EligibilityIdLookup {
  has(id: string): boolean;
}

export type EligibilityRule =
  { kind: 'hintSet'; ids: EligibilityIdLookup } | { kind: 'unconditional' } | { kind: 'genericFallback'; gatedByMovementType: boolean };

/**
 * Applies an already-resolved `EligibilityRule` to a (tenor-pre-filtered, picker-specific) candidate list.
 * `movementType`/`snapshots` are only read for the `'genericFallback'` case.
 *
 * `gatedByMovementType` preserves a real, pre-existing asymmetry between the 3 original getters:
 * `filteredCatalogContracts`/`filteredIbIndexCatalog`'s own trailing branch only excluded 0-Available-
 * Balance candidates when `movementType` is one of `DECREASING_MOVEMENT_TYPES` (an Increase/Create never
 * needs to exclude an already-exhausted candidate — 0 is a normal starting point), but
 * `filteredParentCatalog`'s own trailing branch applied the 0-balance exclusion unconditionally, with no
 * `DECREASING_MOVEMENT_TYPES` gate at all. `gatedByMovementType: true` reproduces the first shape;
 * `false` reproduces the second (parent-picker caller).
 *
 * A missing snapshot (still loading) is never excluded.
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
