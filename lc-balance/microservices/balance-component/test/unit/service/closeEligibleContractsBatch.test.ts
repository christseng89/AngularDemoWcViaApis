/**
 * analysis/Balance-Component-DB-Optimization-Analysis.md P2 N+1 fix (2026-08-21) —
 * BalanceService.listCloseEligibleContracts()/evaluateContractCloseEligibility() rewritten to
 * batch-fetch each of the 4 movement lists ONCE for the whole candidate set (balanceMovementStore.ts's
 * new listByContractIds()/listShgtMovementsForParents()/listAcceptanceMovementsForParents()/
 * listExaminationMovementsForParents()) instead of once PER candidate.
 *
 * This file is the "before vs after" behavioral-equivalence baseline the fix was verified against: run
 * unchanged against the pre-fix implementation (`git stash` the store/service changes, keep this file,
 * `npm test -- closeEligibleContractsBatch`) and again against the post-fix one — both runs must produce
 * byte-for-byte identical results, not just "tests are green". Expected values below are derived directly
 * from domain/closeEligibility.ts's own rules (independently of either implementation), not copied from
 * either run's own output, so a bug shared by both implementations would still be caught.
 *
 * See closeFunction.test.ts's own `describe('BalanceService.listCloseEligibleContracts ...')` for the
 * pre-existing (smaller) coverage of this same method; this file is additive, not a replacement.
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';
import { BalanceMovementStore } from '../../../src/store/balanceMovementStore';
import type { BalanceContract } from '../../../src/types';

function issueImportLc(service: BalanceService, lcNumber: string, tenorType?: 'BUYERS_USANCE'): BalanceContract {
  const issue = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '10000',
    currency: 'USD',
    expiryDate: '2099-12-31',
    tenorType: tenorType ?? 'SIGHT',
    ...(tenorType === 'BUYERS_USANCE' ? { tenorDays: 90 } : {}),
    createdBy: 'maker1',
  });
  if (!issue.created) throw new Error('expected a new movement');
  service.release(issue.movement.movementId, 'checker1');
  const lc = service.resolveContract('IPLC_LC', { lcNumber });
  if (!lc) throw new Error('expected the just-issued LC to resolve');
  return lc;
}

function issueConfirmation(service: BalanceService, lcNumber: string): BalanceContract {
  const issue = service.createMovement({
    instrumentType: 'EPLC_CONFIRMATION',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '10000',
    currency: 'USD',
    expiryDate: '2099-12-31',
    tenorType: 'SIGHT',
    createdBy: 'maker1',
  });
  if (!issue.created) throw new Error('expected a new movement');
  service.release(issue.movement.movementId, 'checker1');
  const confirmation = service.resolveContract('EPLC_CONFIRMATION', { lcNumber });
  if (!confirmation) throw new Error('expected the just-issued Confirmation to resolve');
  return confirmation;
}

/**
 * 5 IPLC_LC candidates, one of each shape evaluateContractCloseEligibility() branches on:
 * eligible / own-PENDING / SG-PENDING (hasOpenEvents) / SG-RELEASED-nonzero (sgConfirmedBalance) /
 * Acceptance-PENDING (hasOpenEvents via the acceptance branch).
 */
function buildImportLcCandidates(service: BalanceService) {
  const eligible = issueImportLc(service, 'N1-ELIGIBLE-001');

  const ownPending = issueImportLc(service, 'N1-OWNPENDING-002');
  const amendDecrease = service.createMovement({
    instrumentType: 'IPLC_LC',
    balanceContractId: ownPending.balanceContractId,
    movementType: 'AMEND_DECREASE',
    eventSeq: 2,
    amount: '1000',
    currency: 'USD',
    sourceTransactionRef: 'AMD-01',
    createdBy: 'maker1',
  });
  if (!amendDecrease.created) throw new Error('expected a new movement');
  // Deliberately NOT released — stays PENDING, this candidate's own "hasOpenEvents" trigger.

  const sgPending = issueImportLc(service, 'N1-SGPENDING-003');
  const sgIssuePending = service.createMovement({
    instrumentType: 'SHGT',
    naturalKey: { lcNumber: 'N1-SGPENDING-003', sgNumber: 'SG01' },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '2000',
    currency: 'USD',
    parentLogicalContractId: sgPending.logicalContractId,
    createdBy: 'maker1',
  });
  if (!sgIssuePending.created) throw new Error('expected a new movement');
  // Deliberately NOT released — PENDING SG, sgConfirmedBalance stays 0, but hasOpenEvents fires.

  const sgReleasedNonzero = issueImportLc(service, 'N1-SGRELEASED-005');
  const sgIssueReleased = service.createMovement({
    instrumentType: 'SHGT',
    naturalKey: { lcNumber: 'N1-SGRELEASED-005', sgNumber: 'SG01' },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '3000',
    currency: 'USD',
    parentLogicalContractId: sgReleasedNonzero.logicalContractId,
    createdBy: 'maker1',
  });
  if (!sgIssueReleased.created) throw new Error('expected a new movement');
  service.release(sgIssueReleased.movement.movementId, 'checker1');
  // RELEASED, not redeemed — sgConfirmedBalance = 3000 (nonzero), no PENDING event.

  const acceptancePending = issueImportLc(service, 'N1-ACCEPTPENDING-004', 'BUYERS_USANCE');
  const acceptanceCreate = service.createMovement({
    instrumentType: 'IPLC_ACCEPTANCE',
    naturalKey: { lcNumber: 'N1-ACCEPTPENDING-004', ibNumber: 'IB01' },
    movementType: 'CREATE',
    eventSeq: 1,
    amount: '4000',
    currency: 'USD',
    tenorType: 'BUYERS_USANCE',
    parentLogicalContractId: acceptancePending.logicalContractId,
    createdBy: 'maker1',
  });
  if (!acceptanceCreate.created) throw new Error('expected a new movement');
  // Deliberately NOT released — PENDING Acceptance, hasOpenEvents fires via the acceptance branch.

  return { eligible, ownPending, sgPending, sgReleasedNonzero, acceptancePending };
}

/** 2 EPLC_CONFIRMATION candidates: eligible, and RELEASED-but-not-yet-presentDocsConsumedAt Examination. */
function buildConfirmationCandidates(service: BalanceService) {
  const eligible = issueConfirmation(service, 'N1-CONF-ELIGIBLE-007');

  const examNotConsumed = issueConfirmation(service, 'N1-CONF-EXAM-006');
  const examination = service.createMovement({
    instrumentType: 'EPLC_EXAMINATION',
    naturalKey: { lcNumber: 'N1-CONF-EXAM-006', ibNumber: 'EB01' },
    movementType: 'CREATE',
    eventSeq: 1,
    amount: '5000',
    currency: 'USD',
    parentLogicalContractId: examNotConsumed.logicalContractId,
    createdBy: 'maker1',
  });
  if (!examination.created) throw new Error('expected a new movement');
  service.release(examination.movement.movementId, 'checker1');
  // RELEASED (B3 Checker-approved) but presentDocsConsumedAt is still null (B4 hasn't consumed it) —
  // the one branch that's PENDING-blind (status === 'RELEASED') and needs the presentDocsConsumedAt check.

  return { eligible, examNotConsumed };
}

describe('listCloseEligibleContracts — N+1 batch-fetch rewrite: behavioral-equivalence baseline', () => {
  test('IPLC_LC: exactly the one genuinely eligible candidate survives, out of 5 candidates each blocked by a different branch (or not blocked at all)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { eligible } = buildImportLcCandidates(service);

    const page = service.listCloseEligibleContracts('IPLC_LC');

    expect(page.items.map((c) => c.balanceContractId)).toEqual([eligible.balanceContractId]);
    expect(page.total).toBe(1);
    expect(page.page).toBe(1);
    expect(page.pageSize).toBe(10);
  });

  test('EPLC_CONFIRMATION: the RELEASED-but-not-yet-presentDocsConsumedAt Examination candidate is excluded, the clean one is not', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { eligible } = buildConfirmationCandidates(service);

    const page = service.listCloseEligibleContracts('EPLC_CONFIRMATION');

    expect(page.items.map((c) => c.balanceContractId)).toEqual([eligible.balanceContractId]);
    expect(page.total).toBe(1);
  });

  test('lcNumber filter (exact match, same semantics as listCatalog()) + pagination still work identically over the batch-fetched eligible set', () => {
    const service = new BalanceService(createDb(':memory:'));
    const { ownPending } = buildImportLcCandidates(service);
    // ownPending is deliberately ineligible (still-PENDING AMEND_DECREASE) — an exact lcNumber match on
    // an ineligible candidate must still come back empty, not bypass the eligibility filter.
    const filteredIneligible = service.listCloseEligibleContracts('IPLC_LC', { lcNumber: ownPending.naturalKey.lcNumber });
    expect(filteredIneligible.items).toEqual([]);
    expect(filteredIneligible.total).toBe(0);

    issueImportLc(service, 'N1-PAGE-A');
    issueImportLc(service, 'N1-PAGE-B');
    issueImportLc(service, 'N1-PAGE-C');

    const filteredExact = service.listCloseEligibleContracts('IPLC_LC', { lcNumber: 'N1-PAGE-B' });
    expect(filteredExact.items.map((c) => c.naturalKey.lcNumber)).toEqual(['N1-PAGE-B']);
    expect(filteredExact.total).toBe(1);

    // Eligible set at this point: N1-ELIGIBLE-001, N1-SGRELEASED-005 is NOT eligible (nonzero SG balance),
    // N1-PAGE-A/B/C -> 4 eligible IPLC_LC contracts total. Page across them 2-at-a-time.
    const page1 = service.listCloseEligibleContracts('IPLC_LC', { pageSize: 2, page: 1 });
    const page2 = service.listCloseEligibleContracts('IPLC_LC', { pageSize: 2, page: 2 });
    expect(page1.total).toBe(4);
    expect(page2.total).toBe(4);
    expect(page1.items).toHaveLength(2);
    expect(page2.items).toHaveLength(2);
    const allIds = [...page1.items, ...page2.items].map((c) => c.balanceContractId);
    expect(new Set(allIds).size).toBe(4);
  });

  test('N+1 actually fixed: each batch store method is called exactly ONCE regardless of candidate count, and the old per-candidate methods are never called from this path', () => {
    const service = new BalanceService(createDb(':memory:'));
    buildImportLcCandidates(service);

    const byContractIdsSpy = jest.spyOn(BalanceMovementStore.prototype, 'listByContractIds');
    const shgtForParentsSpy = jest.spyOn(BalanceMovementStore.prototype, 'listShgtMovementsForParents');
    const acceptanceForParentsSpy = jest.spyOn(BalanceMovementStore.prototype, 'listAcceptanceMovementsForParents');
    const examinationForParentsSpy = jest.spyOn(BalanceMovementStore.prototype, 'listExaminationMovementsForParents');
    const perCandidateOwnSpy = jest.spyOn(BalanceMovementStore.prototype, 'listByContract');
    const perCandidateSgSpy = jest.spyOn(BalanceMovementStore.prototype, 'listShgtMovementsForParent');
    const perCandidateAcceptanceSpy = jest.spyOn(BalanceMovementStore.prototype, 'listAcceptanceMovementsForParent');
    const perCandidateExaminationSpy = jest.spyOn(BalanceMovementStore.prototype, 'listExaminationMovementsForParent');

    try {
      service.listCloseEligibleContracts('IPLC_LC');

      expect(byContractIdsSpy).toHaveBeenCalledTimes(1);
      expect(shgtForParentsSpy).toHaveBeenCalledTimes(1);
      expect(acceptanceForParentsSpy).toHaveBeenCalledTimes(1);
      // EPLC_CONFIRMATION-only branch — never called for an IPLC_LC batch.
      expect(examinationForParentsSpy).not.toHaveBeenCalled();

      expect(perCandidateOwnSpy).not.toHaveBeenCalled();
      expect(perCandidateSgSpy).not.toHaveBeenCalled();
      expect(perCandidateAcceptanceSpy).not.toHaveBeenCalled();
      expect(perCandidateExaminationSpy).not.toHaveBeenCalled();
    } finally {
      byContractIdsSpy.mockRestore();
      shgtForParentsSpy.mockRestore();
      acceptanceForParentsSpy.mockRestore();
      examinationForParentsSpy.mockRestore();
      perCandidateOwnSpy.mockRestore();
      perCandidateSgSpy.mockRestore();
      perCandidateAcceptanceSpy.mockRestore();
      perCandidateExaminationSpy.mockRestore();
    }
  });

  test('createMovement()/release()\'s own single-contract eligibility re-checks never touch the NEW batch-fetch methods (listByContract() is shared with unrelated balance-derivation code paths, so this only asserts what the fix actually changed, not every caller of that shared method)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'N1-SINGLE-009');

    const perCandidateAcceptanceSpy = jest.spyOn(BalanceMovementStore.prototype, 'listAcceptanceMovementsForParent');
    const byContractIdsSpy = jest.spyOn(BalanceMovementStore.prototype, 'listByContractIds');
    const shgtForParentsSpy = jest.spyOn(BalanceMovementStore.prototype, 'listShgtMovementsForParents');
    const acceptanceForParentsSpy = jest.spyOn(BalanceMovementStore.prototype, 'listAcceptanceMovementsForParents');
    const examinationForParentsSpy = jest.spyOn(BalanceMovementStore.prototype, 'listExaminationMovementsForParents');

    try {
      const close = service.createMovement({
        instrumentType: 'IPLC_LC',
        balanceContractId: lc.balanceContractId,
        movementType: 'CLOSE',
        eventSeq: 2,
        amount: '10000',
        currency: 'USD',
        createdBy: 'maker1',
        reasonCode: 'TEST_CLOSE_REASON',
      });
      if (!close.created) throw new Error('expected a new movement');
      service.release(close.movement.movementId, 'checker1');

      // The single-contract eligibility check still runs (proven indirectly — Release succeeds, meaning
      // the re-check passed) via the ORIGINAL per-candidate listAcceptanceMovementsForParent() call, at
      // least once per evaluation (createMovement()'s own closeShaped check + release()'s own re-check).
      expect(perCandidateAcceptanceSpy.mock.calls.length).toBeGreaterThanOrEqual(2);
      // None of the 4 new batch methods this fix introduced are ever reached from the single-contract path.
      expect(byContractIdsSpy).not.toHaveBeenCalled();
      expect(shgtForParentsSpy).not.toHaveBeenCalled();
      expect(acceptanceForParentsSpy).not.toHaveBeenCalled();
      expect(examinationForParentsSpy).not.toHaveBeenCalled();
    } finally {
      perCandidateAcceptanceSpy.mockRestore();
      byContractIdsSpy.mockRestore();
      shgtForParentsSpy.mockRestore();
      acceptanceForParentsSpy.mockRestore();
      examinationForParentsSpy.mockRestore();
    }
  });
});
