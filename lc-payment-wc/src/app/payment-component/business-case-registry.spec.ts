import { BUSINESS_CASES, MODULE_GROUPS } from './business-case-registry';

describe('business-case-registry data invariants', () => {
  it('has 15 PASS + 4 GAP + 4 N_A cases (23 total)', () => {
    const byVerdict = (v: string) => BUSINESS_CASES.filter((c) => c.verdict === v).length;
    expect(byVerdict('PASS')).toBe(15);
    expect(byVerdict('GAP')).toBe(4);
    expect(byVerdict('N_A')).toBe(4);
    expect(BUSINESS_CASES).toHaveLength(23);
  });

  it('every case has a unique id', () => {
    const ids = BUSINESS_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every PASS case can resolve a voucher prefix — sourceFunctionCode xor dualPrefixOptions', () => {
    for (const c of BUSINESS_CASES.filter((c) => c.verdict === 'PASS')) {
      const hasSource = !!c.sourceFunctionCode;
      const hasDual = !!c.dualPrefixOptions;
      expect(hasSource || hasDual).toBe(true);
    }
  });

  it('every PASS/GAP case has exactly one DEBIT and one CREDIT leg', () => {
    for (const c of BUSINESS_CASES.filter((c) => c.verdict !== 'N_A')) {
      const sides = c.legs.map((l) => l.side);
      expect(sides).toEqual(expect.arrayContaining(['DEBIT', 'CREDIT']));
      expect(c.legs).toHaveLength(2);
    }
  });

  it('every N_A case has no legs and a populated moduleStats summary', () => {
    for (const c of BUSINESS_CASES.filter((c) => c.verdict === 'N_A')) {
      expect(c.legs).toEqual([]);
      expect(c.moduleStats).toBeTruthy();
    }
  });

  it('all 4 GAP cases belong to RPFM', () => {
    for (const c of BUSINESS_CASES.filter((c) => c.verdict === 'GAP')) {
      expect(c.module).toBe('RPFM');
    }
  });

  it('no leg offers RTGS as a selectable AccountType (v1.3.0: RTGS is a flag on NOSTRO, not its own type)', () => {
    for (const c of BUSINESS_CASES) {
      for (const leg of c.legs) {
        expect(leg.accountTypeOptions).not.toContain('RTGS');
      }
    }
  });

  it('every RTGS-flagged leg defaults to accountType NOSTRO (matches leg-allocator\'s own invariant)', () => {
    for (const c of BUSINESS_CASES) {
      for (const leg of c.legs) {
        if (leg.defaultRtgsIndicator) {
          expect(leg.defaultAccountType).toBe('NOSTRO');
        }
      }
    }
  });

  it('every leg has a positive default amount and a 3-letter currency code', () => {
    for (const c of BUSINESS_CASES) {
      for (const leg of c.legs) {
        expect(Number(leg.defaultAmountTxCcy)).toBeGreaterThan(0);
        expect(leg.defaultCurrency).toMatch(/^[A-Z]{3}$/);
      }
    }
  });

  describe('MODULE_GROUPS', () => {
    it('covers all 11 modules in the documented order', () => {
      expect(MODULE_GROUPS.map((g) => g.module)).toEqual(['IPLC', 'EPLC', 'IMCO', 'EXCO', 'GTEE', 'IWGT', 'RPFM', 'CFNC', 'SBLC', 'REIM', 'PYMT']);
    });

    it('every group has a non-empty label', () => {
      for (const g of MODULE_GROUPS) {
        expect(g.moduleLabel).toBeTruthy();
      }
    });

    it('is an exact partition of BUSINESS_CASES — every case appears in its module\'s group exactly once, none dropped or duplicated', () => {
      const flattened = MODULE_GROUPS.flatMap((g) => g.cases);
      expect(flattened).toHaveLength(BUSINESS_CASES.length);
      expect(new Set(flattened.map((c) => c.id))).toEqual(new Set(BUSINESS_CASES.map((c) => c.id)));
      for (const g of MODULE_GROUPS) {
        for (const c of g.cases) {
          expect(c.module).toBe(g.module);
        }
      }
    });
  });
});
