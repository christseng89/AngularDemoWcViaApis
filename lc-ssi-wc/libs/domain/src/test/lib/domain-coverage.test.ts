import { DomainRuleError, SettlementInstruction } from '../../lib/ssi';
import { SsiResolutionPolicy } from '../../lib/resolution';

const route = { currency: 'USD', beneficiaryBic: 'CCCCUS44', accountWithBic: 'BBBBUS33' };
const make = (id = 'S1', cp = 'CP1') => SettlementInstruction.create({ id, counterpartyId: cp, scope: 'REUSABLE', maker: 'maker', route });
const active = (id = 'S1') => { const s = make(id); s.updateRoute({ ...route, intermediaryBic: 'AAAAGB2L' }, 'maker'); s.submit('maker'); s.approve('checker'); s.activate('checker'); return s; };

describe('SSI domain coverage', () => {
  it('covers creation validation and immutable getters', () => {
    expect(() => SettlementInstruction.create({ id: '', counterpartyId: 'CP', scope: 'REUSABLE', maker: 'm', route })).toThrow('required');
    expect(() => SettlementInstruction.create({ id: 'S', counterpartyId: '', scope: 'REUSABLE', maker: 'm', route })).toThrow('required');
    expect(() => SettlementInstruction.create({ id: 'S', counterpartyId: 'CP', scope: 'REUSABLE', maker: '', route })).toThrow('required');
    expect(() => SettlementInstruction.create({ id: 'S', counterpartyId: 'CP', scope: 'REUSABLE', maker: 'm', route: { ...route, currency: 'usd' } })).toThrow('Currency');
    const s = make(); expect(s.status).toBe('DRAFT'); expect(s.version).toBe(1); expect(s.checker).toBeUndefined();
    const copy = s.route as { currency: string }; copy.currency = 'EUR'; expect(s.route.currency).toBe('USD'); expect(s.audit).toHaveLength(1);
  });
  it('covers valid and invalid lifecycle paths', () => {
    const s = make(); expect(() => s.submit('other')).toThrow('Only the maker');
    s.updateRoute({ ...route, accountId: 'N1' }, 'maker'); expect(s.version).toBe(2); s.submit('maker');
    expect(() => s.updateRoute(route, 'maker')).toThrow('Only a draft'); expect(() => s.activate('x')).toThrow('Expected APPROVED');
    expect(() => s.approve('maker')).toThrow('Maker cannot'); s.approve('checker'); expect(s.checker).toBe('checker'); s.activate('ops');
    expect(() => s.suspend('ops', '')).toThrow('reason'); s.suspend('ops', 'callback mismatch'); expect(s.status).toBe('SUSPENDED');
    expect(s.audit.at(-1)?.detail).toBe('callback mismatch'); expect(() => s.submit('maker')).toThrow('Expected DRAFT');
  });
  it('covers resolution success, missing and ambiguity', () => {
    const policy = new SsiResolutionPolicy(); const request = { counterpartyId: 'CP1', currency: 'USD', businessFunction: 'FX', transactionReference: 'T1' };
    const result = policy.resolve(request, [active()]); expect(result.snapshotHash).toHaveLength(64); expect(result.route.currency).toBe('USD');
    expect(() => policy.resolve({ ...request, currency: 'EUR' }, [active()])).toThrow('No active');
    expect(() => policy.resolve(request, [active('S1'), active('S2')])).toThrow('More than one');
    const draft = make('D'); expect(() => policy.resolve(request, [draft])).toThrow(DomainRuleError);
  });
  it('fails closed when an inconsistent candidate collection omits its selected item', () => {
    const policy = new SsiResolutionPolicy(); const request = { counterpartyId: 'CP1', currency: 'USD', businessFunction: 'FX', transactionReference: 'T1' };
    const inconsistentCandidates = {
      filter: () => ({ length: 1, 0: undefined }),
    } as unknown as readonly SettlementInstruction[];

    expect(() => policy.resolve(request, inconsistentCandidates)).toThrow('No active SSI matches the request');
  });
});
