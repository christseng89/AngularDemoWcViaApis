import { DomainRuleError, SettlementInstruction } from '../../lib/ssi';

const createSsi = () => SettlementInstruction.create({
  id: 'SSI-001', counterpartyId: 'BANK-001', scope: 'REUSABLE', maker: 'maker-a',
  route: { currency: 'USD', beneficiaryBic: 'CCCCUS44', accountWithBic: 'BBBBUS33' },
});

describe('SettlementInstruction', () => {
  it('enforces Maker/Checker separation and activates an approved version', () => {
    const ssi = createSsi();
    ssi.submit('maker-a');
    expect(() => ssi.approve('maker-a')).toThrow(DomainRuleError);
    try {
      ssi.approve('maker-a');
    } catch (error) {
      expect(error).toMatchObject({ code: 'FOUR_EYES_VIOLATION' });
    }
    ssi.approve('checker-b');
    ssi.activate('checker-b');
    expect(ssi.status).toBe('ACTIVE');
    expect(ssi.audit.map((entry) => entry.action)).toEqual(['CREATED', 'SUBMITTED', 'APPROVED', 'ACTIVATED']);
  });

  it('rejects edits after submission', () => {
    const ssi = createSsi();
    ssi.submit('maker-a');
    expect(() => ssi.updateRoute(ssi.route, 'maker-a')).toThrow(DomainRuleError);
  });

  it('requires ISO-like uppercase currency codes', () => {
    const createInvalidCurrency = () => SettlementInstruction.create({
      id: 'SSI-002', counterpartyId: 'BANK-001', scope: 'REUSABLE', maker: 'maker-a',
      route: { currency: 'usd', beneficiaryBic: 'CCCCUS44', accountWithBic: 'BBBBUS33' },
    });
    expect(createInvalidCurrency).toThrow(DomainRuleError);
    try {
      createInvalidCurrency();
    } catch (error) {
      expect(error).toMatchObject({ code: 'INVALID_CURRENCY' });
    }
  });
});
