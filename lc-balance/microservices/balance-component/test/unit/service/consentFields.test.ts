/**
 * F1 proposal §13.1 item 2 (BA-ratified 2026-08-25) — end-to-end persistence of the upstream consent
 * passthrough (amendmentApproved/amendmentEffective/consentStatus) on AMEND_EXPIRY_DATE/REOPEN. This
 * service never judges these — it only accepts, shape-validates (see
 * test/unit/validation/requestSchema.test.ts for the zod-level enum tests), and persists them for audit.
 * Same "real in-memory DB, no mocking" convention as closeFunction.test.ts/autoExpirySweep.test.ts.
 */
import { createDb } from '../../../src/db';
import { BalanceService } from '../../../src/service/balanceService';

function issueImportLc(service: BalanceService, lcNumber: string, opts: { expiryDate?: string } = {}) {
  const issue = service.createMovement({
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber },
    movementType: 'ISSUE',
    eventSeq: 1,
    amount: '10000',
    currency: 'USD',
    expiryDate: opts.expiryDate,
    createdBy: 'maker1',
  });
  if (!issue.created) throw new Error('expected a new movement');
  service.release(issue.movement.movementId, 'checker1');
  const lc = service.resolveContract('IPLC_LC', { lcNumber });
  if (!lc) throw new Error('expected the just-issued LC to resolve');
  return lc;
}

describe('Consent passthrough on AMEND_EXPIRY_DATE (plain amendment against an ACTIVE contract)', () => {
  test('persists all three fields as submitted, unchanged, readable straight off the created movement', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'CONSENT-001', { expiryDate: '2026-06-01' });

    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'AMEND_EXPIRY_DATE',
      eventSeq: 2,
      amount: '0',
      currency: 'USD',
      newExpiryDate: '2026-12-31',
      businessDate: '2026-01-01',
      amendmentApproved: true,
      amendmentEffective: '2026-01-02T00:00:00Z',
      consentStatus: 'OBTAINED',
      createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');
    expect(amend.movement.amendmentApproved).toBe(true);
    expect(amend.movement.amendmentEffective).toBe('2026-01-02T00:00:00Z');
    expect(amend.movement.consentStatus).toBe('OBTAINED');

    // Survives the RELEASED round-trip through the store too, not just the in-memory PENDING object.
    const released = service.release(amend.movement.movementId, 'checker1');
    expect(released.amendmentApproved).toBe(true);
    expect(released.amendmentEffective).toBe('2026-01-02T00:00:00Z');
    expect(released.consentStatus).toBe('OBTAINED');
  });

  test('consentStatus NOT_REQUIRED is accepted and persisted as-is (this service never blocks on it)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'CONSENT-002', { expiryDate: '2026-06-01' });

    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'AMEND_EXPIRY_DATE',
      eventSeq: 2,
      amount: '0',
      currency: 'USD',
      newExpiryDate: '2026-12-31',
      businessDate: '2026-01-01',
      consentStatus: 'NOT_REQUIRED',
      createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');
    expect(amend.movement.consentStatus).toBe('NOT_REQUIRED');
    // Never gates Release — this component doesn't judge consent, only accepts/persists it.
    expect(() => service.release(amend.movement.movementId, 'checker1')).not.toThrow();
  });

  test('omitted entirely — all three read back null, and Submit/Release both still succeed (fully optional)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'CONSENT-003', { expiryDate: '2026-06-01' });

    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'AMEND_EXPIRY_DATE',
      eventSeq: 2,
      amount: '0',
      currency: 'USD',
      newExpiryDate: '2026-12-31',
      businessDate: '2026-01-01',
      createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');
    expect(amend.movement.amendmentApproved).toBeNull();
    expect(amend.movement.amendmentEffective).toBeNull();
    expect(amend.movement.consentStatus).toBeNull();
    expect(() => service.release(amend.movement.movementId, 'checker1')).not.toThrow();
  });

  test('amendmentApproved false is preserved (not conflated with null/omitted)', () => {
    const service = new BalanceService(createDb(':memory:'));
    const lc = issueImportLc(service, 'CONSENT-004', { expiryDate: '2026-06-01' });

    const amend = service.createMovement({
      instrumentType: 'IPLC_LC',
      balanceContractId: lc.balanceContractId,
      movementType: 'AMEND_EXPIRY_DATE',
      eventSeq: 2,
      amount: '0',
      currency: 'USD',
      newExpiryDate: '2026-12-31',
      businessDate: '2026-01-01',
      amendmentApproved: false,
      createdBy: 'maker1',
    });
    if (!amend.created) throw new Error('expected a new movement');
    expect(amend.movement.amendmentApproved).toBe(false);
  });

  test('irrelevant movementType (ISSUE) — fields are simply unused/null, no validation applies to them there', () => {
    const service = new BalanceService(createDb(':memory:'));
    const issue = service.createMovement({
      instrumentType: 'IPLC_LC',
      naturalKey: { lcNumber: 'CONSENT-005' },
      movementType: 'ISSUE',
      eventSeq: 1,
      amount: '10000',
      currency: 'USD',
      consentStatus: 'OBTAINED', // harmlessly accepted and stored even though ISSUE has no real use for it
      createdBy: 'maker1',
    });
    if (!issue.created) throw new Error('expected a new movement');
    expect(issue.movement.consentStatus).toBe('OBTAINED');
  });
});
