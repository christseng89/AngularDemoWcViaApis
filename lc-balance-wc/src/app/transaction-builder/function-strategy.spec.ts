import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS } from './balance-component.model';
import { FUNCTION_STRATEGIES, deriveFunctionStrategy } from './function-strategy';

/**
 * PR-2 of the F-01 Strategy refactoring — equivalence proof only. Every assertion here cross-references
 * a fact already locked in by PR-1's `transaction-function-flags.characterization.spec.ts` (search that
 * file's own `codesWith(...)` assertions for the flag-to-function-code mapping this file's own
 * expectations are derived from), so the two files independently arriving at the same answer is real
 * evidence of equivalence, not a coincidence of one being copy-pasted from the other's expected values.
 *
 * `FUNCTION_STRATEGIES` is not wired into any production code path yet — this file tests the new
 * scaffolding in isolation, the same way `paged-list-state.spec.ts` tests that class in isolation before
 * any consumer relies on it.
 */
describe('PR-2 — FunctionStrategy is a faithful projection of the current registry (not yet consumed by production code)', () => {
  it('every one of the 14 registered function codes has exactly one FunctionStrategy entry', () => {
    const allCodes = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].map((f) => f.code);
    expect(allCodes).toEqual(['A1', 'A2', 'A3', 'A3S', 'A4', 'A6', 'A7', 'A8', 'A9', 'B1', 'B2', 'B3', 'B4', 'B5']);
    expect(Object.keys(FUNCTION_STRATEGIES).sort()).toEqual([...allCodes].sort());
  });

  describe('movementDerivation — matches PR-1\'s autoRedeemType/settlesAcceptanceOnMature/movementTypeFromContractTenor characterization', () => {
    it('A9 (autoRedeemType) -> REDEEM, no other function derives REDEEM', () => {
      expect(FUNCTION_STRATEGIES['A9'].movementDerivation.amountVsAvailableDerivation).toBe('REDEEM');
      const redeemCodes = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.amountVsAvailableDerivation === 'REDEEM');
      expect(redeemCodes.map((s) => s.code)).toEqual(['A9']);
    });

    it('B5 (settlesAcceptanceOnMature) -> SETTLE, no other function derives SETTLE', () => {
      expect(FUNCTION_STRATEGIES['B5'].movementDerivation.amountVsAvailableDerivation).toBe('SETTLE');
      const settleCodes = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.amountVsAvailableDerivation === 'SETTLE');
      expect(settleCodes.map((s) => s.code)).toEqual(['B5']);
    });

    it('every other function derives neither (null)', () => {
      const neither = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.amountVsAvailableDerivation === null);
      expect(neither.map((s) => s.code).sort()).toEqual(['A1', 'A2', 'A3', 'A3S', 'A4', 'A6', 'A7', 'A8', 'B1', 'B2', 'B3', 'B4'].sort());
    });

    it('B4 (movementTypeFromContractTenor) is the ONLY function reading movementType from the contract\'s own tenor', () => {
      const tenorDerived = Object.values(FUNCTION_STRATEGIES).filter((s) => s.movementDerivation.derivesMovementTypeFromTenor);
      expect(tenorDerived.map((s) => s.code)).toEqual(['B4']);
    });
  });

  describe('compoundSubmission — matches PR-1\'s MakerSubmitService dispatch-table characterization', () => {
    it('A3S (documentArrivalWithSg) -> possibleShapes includes documentArrivalWithSg, only A3S does', () => {
      expect(FUNCTION_STRATEGIES['A3S'].compoundSubmission.possibleShapes).toEqual(['documentArrivalWithSg']);
      const withShape = Object.values(FUNCTION_STRATEGIES).filter((s) => s.compoundSubmission.possibleShapes.includes('documentArrivalWithSg'));
      expect(withShape.map((s) => s.code)).toEqual(['A3S']);
    });

    it('B4 is the ONLY function with two possible shapes — Honour and Accept, chosen at runtime by movementType, never fixed', () => {
      expect(FUNCTION_STRATEGIES['B4'].compoundSubmission.possibleShapes).toEqual(['confirmationHonourWithReceivable', 'confirmationAcceptWithReceivable']);
      const twoShapes = Object.values(FUNCTION_STRATEGIES).filter((s) => s.compoundSubmission.possibleShapes.length > 1);
      expect(twoShapes.map((s) => s.code)).toEqual(['B4']);
    });

    it('B5 (settlesAcceptanceOnMature) -> acceptanceSettleWithReceivable, only B5', () => {
      expect(FUNCTION_STRATEGIES['B5'].compoundSubmission.possibleShapes).toEqual(['acceptanceSettleWithReceivable']);
    });

    it('every function without a compound flag falls back to plain (matches "no matching flag -> submitPlain" in PR-1)', () => {
      const plainCodes = Object.values(FUNCTION_STRATEGIES)
        .filter((s) => s.compoundSubmission.possibleShapes.length === 1 && s.compoundSubmission.possibleShapes[0] === 'plain')
        .map((s) => s.code)
        .sort();
      expect(plainCodes).toEqual(['A1', 'A2', 'A3', 'A4', 'A6', 'A7', 'A8', 'A9', 'B1', 'B2', 'B3'].sort());
    });
  });

  describe('checkerRelease — matches PR-1\'s CheckerActionsService A6-vs-B4 asymmetry characterization', () => {
    it('A4 (payExistingUtilize) -> releasesExistingMovementInPlace, only A4', () => {
      const inPlace = Object.values(FUNCTION_STRATEGIES).filter((s) => s.checkerRelease.releasesExistingMovementInPlace);
      expect(inPlace.map((s) => s.code)).toEqual(['A4']);
    });

    it('A6 and B4 (settlesDocumentArrival) -> exactly these two', () => {
      const settles = Object.values(FUNCTION_STRATEGIES).filter((s) => s.checkerRelease.settlesDocumentArrival);
      expect(settles.map((s) => s.code)).toEqual(['A6', 'B4']);
    });

    it('the A6-vs-B4 asymmetry itself: only B4 has sourceAlreadyReleasedBeforePick true — this is the exact fact that makes A6 release its source first while B4 does not', () => {
      expect(FUNCTION_STRATEGIES['A6'].checkerRelease.sourceAlreadyReleasedBeforePick).toBe(false);
      expect(FUNCTION_STRATEGIES['B4'].checkerRelease.sourceAlreadyReleasedBeforePick).toBe(true);
    });

    it('A3 and A3S (deferSettlement) -> exactly these two (B3 lost this flag in the 2026-08-18 redesign, per PR-1)', () => {
      const defer = Object.values(FUNCTION_STRATEGIES).filter((s) => s.checkerRelease.deferSettlement);
      expect(defer.map((s) => s.code)).toEqual(['A3', 'A3S']);
    });
  });

  describe('selectionFlow', () => {
    it('B5 (settleableBalanceIndex) -> usesSettleableBalanceIndex, only B5', () => {
      const uses = Object.values(FUNCTION_STRATEGIES).filter((s) => s.selectionFlow.usesSettleableBalanceIndex);
      expect(uses.map((s) => s.code)).toEqual(['B5']);
    });
  });

  it('deriveFunctionStrategy is a pure function — calling it twice on the same registry entry yields deep-equal, independent objects', () => {
    const b4 = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].find((f) => f.code === 'B4')!;
    const first = deriveFunctionStrategy(b4);
    const second = deriveFunctionStrategy(b4);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });
});
