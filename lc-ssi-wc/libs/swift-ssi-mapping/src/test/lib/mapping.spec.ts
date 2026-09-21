import { SsiMappingEngine, type SsiMapping } from '../../lib/mapping';

const mappings: SsiMapping[] = [
  { standardsRelease: 'SR2026', messageType: 'MT700', direction: 'INCOMING', businessFunction: 'LC_ADVICE', path: '57A', canonicalRole: 'SECOND_ADVISING_BANK', reusableCandidate: false },
  { standardsRelease: 'SR2026', messageType: 'MT742', direction: 'INCOMING', businessFunction: 'REIMBURSEMENT_CLAIM', path: '57A', canonicalRole: 'ACCOUNT_WITH_INSTITUTION', reusableCandidate: true },
  { standardsRelease: 'SR2026', messageType: 'MT742', direction: 'INCOMING', businessFunction: 'REIMBURSEMENT_CLAIM', path: '58A', canonicalRole: 'BENEFICIARY_BANK', reusableCandidate: true },
];

describe('SsiMappingEngine', () => {
  it('resolves the same tag according to message semantics', () => {
    const engine = new SsiMappingEngine(mappings);
    const mt700 = engine.extract({ standardsRelease: 'SR2026', messageType: 'MT700', direction: 'INCOMING', businessFunction: 'LC_ADVICE', fields: { '57A': 'AAAAGB2L' } });
    const mt742 = engine.extract({ standardsRelease: 'SR2026', messageType: 'MT742', direction: 'INCOMING', businessFunction: 'REIMBURSEMENT_CLAIM', fields: { '57A': 'AAAAGB2L' } });
    expect(mt700.roles[0]?.role).toBe('SECOND_ADVISING_BANK');
    expect(mt742.roles[0]?.role).toBe('ACCOUNT_WITH_INSTITUTION');
  });

  it('generates only mapped SSI fields', () => {
    const fields = new SsiMappingEngine(mappings).generate(
      { standardsRelease: 'SR2026', messageType: 'MT742', direction: 'INCOMING', businessFunction: 'REIMBURSEMENT_CLAIM' },
      { ACCOUNT_WITH_INSTITUTION: 'AAAAGB2L', BENEFICIARY_BANK: 'BBBBUS33', UNMAPPED: 'DROP' },
    );
    expect(fields).toEqual({ '57A': 'AAAAGB2L', '58A': 'BBBBUS33' });
  });
});
