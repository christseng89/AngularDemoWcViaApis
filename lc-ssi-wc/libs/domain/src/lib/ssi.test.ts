import { SettlementInstruction } from './ssi';

describe('SSI four-eyes lifecycle', () => {
  it('prevents self approval and permits an independent checker', () => {
    const ssi = SettlementInstruction.create({ id: 'SSI-1', counterpartyId: 'CP-1', scope: 'REUSABLE', maker: 'maker', route: { currency: 'USD', beneficiaryBic: 'CCCCUS44', accountWithBic: 'BBBBUS33' } });
    ssi.submit('maker');
    expect(() => ssi.approve('maker')).toThrow('Maker cannot approve their own SSI');
    ssi.approve('checker');
    ssi.activate('checker');
    expect(ssi.status).toBe('ACTIVE');
  });
});
