import { checkAcceptanceTenorConsistency } from '../../../src/domain/tenorRouting';

// desiger-comments.md F-02 — extracted from BalanceService.createMovement()'s own inline "creating a
// new contract" branch (2026-08-19), pure code motion. Direct unit coverage added here since the
// pre-existing indirect coverage (app.test.ts's own "Sight LC" HTTP-integration assertion) never
// isolated the tenor-mismatch branch at all — a genuine gap this extraction closes, not just relocates.
describe('checkAcceptanceTenorConsistency (Design doc §7 Tenor Type Routing, business instruction 2026-08-14)', () => {
  test('OK: parent tenorType matches the requested tenorType', () => {
    const result = checkAcceptanceTenorConsistency({
      parentTenorType: 'BUYERS_USANCE',
      parentBalanceContractId: 'bc-1',
      requestedTenorType: 'BUYERS_USANCE',
    });
    expect(result.ok).toBe(true);
  });

  test('OK: parent has no declared tenorType (legacy) — nothing to compare against', () => {
    const result = checkAcceptanceTenorConsistency({
      parentTenorType: null,
      parentBalanceContractId: 'bc-1',
      requestedTenorType: 'BUYERS_USANCE',
    });
    expect(result.ok).toBe(true);
  });

  test('OK: caller supplied no requestedTenorType — nothing to compare against', () => {
    const result = checkAcceptanceTenorConsistency({
      parentTenorType: 'SELLERS_USANCE',
      parentBalanceContractId: 'bc-1',
      requestedTenorType: undefined,
    });
    expect(result.ok).toBe(true);
  });

  test('ERROR: parent is a Sight LC — a Sight presentation settles via UTILIZE alone, never an Acceptance', () => {
    const result = checkAcceptanceTenorConsistency({
      parentTenorType: 'SIGHT',
      parentBalanceContractId: 'bc-sight-1',
      requestedTenorType: undefined,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Cannot Create Acceptance under a Sight LC \(parent bc-sight-1 was Issued with tenorType=SIGHT\)/);
    expect(result.error).toMatch(/Design doc §7 Tenor Type Routing/);
  });

  test('ERROR: parent is a Sight LC — checked before the tenor-mismatch comparison, regardless of what requestedTenorType is', () => {
    const result = checkAcceptanceTenorConsistency({
      parentTenorType: 'SIGHT',
      parentBalanceContractId: 'bc-sight-2',
      requestedTenorType: 'BUYERS_USANCE',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Cannot Create Acceptance under a Sight LC/);
  });

  test('ERROR: parent tenorType and requested tenorType disagree', () => {
    const result = checkAcceptanceTenorConsistency({
      parentTenorType: 'BUYERS_USANCE',
      parentBalanceContractId: 'bc-2',
      requestedTenorType: 'SELLERS_USANCE',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(
      /Acceptance tenorType \(SELLERS_USANCE\) does not match its parent LC's own declared tenorType \(BUYERS_USANCE, set at Issue\)/,
    );
  });
});
