import { DomainRuleError, SettlementInstruction } from './ssi';
import { SsiResolutionPolicy } from './resolution';

function activeSsi(): SettlementInstruction {
  const ssi = SettlementInstruction.create({
    id: 'SSI-001', counterpartyId: 'BANK-001', scope: 'REUSABLE', maker: 'maker-a',
    route: { currency: 'USD', beneficiaryBic: 'CCCCUS44', accountWithBic: 'BBBBUS33' },
  });
  ssi.submit('maker-a'); ssi.approve('checker-b'); ssi.activate('checker-b');
  return ssi;
}

describe('SsiResolutionPolicy', () => {
  const request = { counterpartyId: 'BANK-001', currency: 'USD', businessFunction: 'LC_REIMBURSEMENT', transactionReference: 'TX-1' };
  it('returns an immutable traceable snapshot', () => {
    const result = new SsiResolutionPolicy().resolve(request, [activeSsi()]);
    expect(result.ssiId).toBe('SSI-001');
    expect(result.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.resolutionToken).toBeTruthy();
  });
  it('fails closed when no SSI matches', () => {
    const resolveWithoutMatch = () =>
      new SsiResolutionPolicy().resolve({ ...request, currency: 'EUR' }, [activeSsi()]);
    expect(resolveWithoutMatch).toThrow(DomainRuleError);
    try {
      resolveWithoutMatch();
    } catch (error) {
      expect(error).toMatchObject({ code: 'SSI_NOT_FOUND' });
    }
  });

});
