import { BUSINESS_CASES, MODULE_GROUPS } from './business-case-registry';

describe('business-case-registry data invariants', () => {
  it('has 17 PASS (15 legacy-traced + 1 debit-legs-bridge + 1 credit-legs-bridge) + 4 GAP + 4 N_A cases (25 total)', () => {
    const byVerdict = (v: string) => BUSINESS_CASES.filter((c) => c.verdict === v).length;
    expect(byVerdict('PASS')).toBe(17);
    expect(byVerdict('GAP')).toBe(4);
    expect(byVerdict('N_A')).toBe(4);
    expect(BUSINESS_CASES).toHaveLength(25);
  });

  it('the two non-legacy-traced PASS cases (the Debit and Credit Payment Bridges) say so explicitly in their own citation, so neither is ever mistaken for one of the 15 source-verified functions', () => {
    const bridgeCases = BUSINESS_CASES.filter((c) => c.verdict === 'PASS' && !/^SYF_|ConfirmBusinessCall/.test(c.citation));
    expect(bridgeCases).toHaveLength(2);
    for (const c of bridgeCases) {
      expect(c.citation).toMatch(/NOT legacy-traced/i);
    }
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

  it('every PASS/GAP case has exactly one DEBIT and one CREDIT leg, except debitLegsBridge:true or creditLegsBridge:true cases (bridge cases — the missing side comes entirely from the Suspense bridge, never a real leg)', () => {
    for (const c of BUSINESS_CASES.filter((c) => c.verdict !== 'N_A' && !c.debitLegsBridge && !c.creditLegsBridge)) {
      const sides = c.legs.map((l) => l.side);
      expect(sides).toEqual(expect.arrayContaining(['DEBIT', 'CREDIT']));
      expect(c.legs).toHaveLength(2);
    }
  });

  it('every debitLegsBridge:true case has ONLY DEBIT legs — no Credit Leg at all (Debit Legs Component Bridge Flag contract, business-case.model.ts)', () => {
    const debitLegsBridgeCases = BUSINESS_CASES.filter((c) => c.debitLegsBridge);
    expect(debitLegsBridgeCases.length).toBeGreaterThan(0); // this invariant would be vacuous otherwise
    for (const c of debitLegsBridgeCases) {
      expect(c.legs.length).toBeGreaterThan(0);
      expect(c.legs.every((l) => l.side === 'DEBIT')).toBe(true);
    }
  });

  it('every creditLegsBridge:true case has ONLY CREDIT legs — no Debit Leg at all (Credit Legs Component Bridge Flag contract, business-case.model.ts, mirror of debitLegsBridge)', () => {
    const creditLegsBridgeCases = BUSINESS_CASES.filter((c) => c.creditLegsBridge);
    expect(creditLegsBridgeCases.length).toBeGreaterThan(0); // this invariant would be vacuous otherwise
    for (const c of creditLegsBridgeCases) {
      expect(c.legs.length).toBeGreaterThan(0);
      expect(c.legs.every((l) => l.side === 'CREDIT')).toBe(true);
    }
  });

  it('no case is flagged both debitLegsBridge:true and creditLegsBridge:true — the two flags are mutually exclusive (the microservice rejects both with a 400)', () => {
    for (const c of BUSINESS_CASES) {
      expect(!!c.debitLegsBridge && !!c.creditLegsBridge).toBe(false);
    }
  });

  it('iplc-issue-charge-bridge is flagged debitLegsBridge:true and has exactly one DEBIT leg', () => {
    const c = BUSINESS_CASES.find((c) => c.id === 'iplc-issue-charge-bridge')!;
    expect(c.debitLegsBridge).toBe(true);
    expect(c.legs.map((l) => l.side)).toEqual(['DEBIT']);
  });

  it('iplc-usance-settlement-credit-bridge is flagged creditLegsBridge:true and has exactly one CREDIT leg', () => {
    const c = BUSINESS_CASES.find((c) => c.id === 'iplc-usance-settlement-credit-bridge')!;
    expect(c.creditLegsBridge).toBe(true);
    expect(c.legs.map((l) => l.side)).toEqual(['CREDIT']);
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
