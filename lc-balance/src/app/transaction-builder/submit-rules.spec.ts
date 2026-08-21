import { SubmitRulesContext, buildSubmitRequest, hasEligibleTargetSelected, validateSubmit } from './submit-rules';
import { BuilderModel } from './function-policy';
import { IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, type TransactionFunction } from './balance-component.model';
import type { BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';
import * as functionStrategyModule from './function-strategy';

/**
 * BAL-003 (God Component) — dedicated unit coverage for `submit-rules.ts`'s pure functions, asserting
 * every guard's order/condition/message directly rather than only indirectly via the component's own
 * suites.
 */

function fn(code: string): TransactionFunction {
  const found = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].find((f) => f.code === code);
  if (!found) throw new Error(`No TransactionFunction with code "${code}" in the registry`);
  return found;
}

function contract(overrides: Partial<BalanceContract> = {}): BalanceContract {
  return {
    balanceContractId: 'bc-1',
    logicalContractId: 'lc-1',
    instrumentType: 'IPLC_LC',
    naturalKey: { lcNumber: 'S001' },
    status: 'ACTIVE',
    currency: 'USD',
    ...overrides,
  };
}

function snapshot(overrides: Partial<BalanceSnapshot> = {}): BalanceSnapshot {
  return {
    balanceContractId: 'bc-1',
    logicalContractId: 'lc-1',
    currency: 'USD',
    confirmedBalance: '100000',
    availableBalance: '80000',
    pendingEarmarkTotal: '20000',
    ...overrides,
  };
}

function movement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: 'mv-1',
    balanceContractId: 'bc-1',
    eventSeq: 1,
    movementType: 'UTILIZE',
    exposureNature: 'CONTINGENT',
    amount: '1000',
    ceilingAmount: '1000',
    currency: 'USD',
    status: 'PENDING',
    createdBy: 'maker1',
    createdAt: '2026-08-16T00:00:00.000Z',
    ...overrides,
  };
}

/** A minimal, fully-valid A1 (LC Issue, Sight) context — every test below overrides only what it needs to reach the guard under test. */
function ctx(overrides: Partial<SubmitRulesContext> = {}): SubmitRulesContext {
  const model: BuilderModel = {
    instrumentType: 'IPLC_LC',
    movementType: 'ISSUE',
    amount: '1000',
    currency: 'USD',
    createdBy: 'maker1',
    tenorType: 'SIGHT',
    ...overrides.model,
  };
  const result: SubmitRulesContext = {
    naturalKey: { lcNumber: 'S001', ibNumber: '', sgNumber: '' },
    selectedFunction: fn('A1'),
    dynamicSecondaryRefLabel: null,
    activeFunctionSide: 'IMPORT',
    selectedPayMovement: null,
    selectedArrivalSg: null,
    arrivalSgSnapshot: null,
    selectedContractSnapshot: null,
    selectedContract: null,
    selectedParent: null,
    exposureNature: 'ACTUAL',
    amendDirection: null,
    ...overrides,
    model,
  };
  // `model` above is the correctly pre-merged local variable (individual BuilderModel fields merged,
  // not a wholesale overrides.model replacement) — assigned last so it always wins over `...overrides`.
  return result;
}

describe('submit-rules', () => {
  describe('validateSubmit — positive path', () => {
    it('passes for a fully-valid A1 (LC Issue, Sight) submission, with tenorDays patched to 0', () => {
      const result = validateSubmit(ctx());
      expect(result.error).toBeNull();
      expect(result.patch).toEqual({ tenorDays: 0 });
    });
  });

  describe('validateSubmit — negative: mandatory-field guards, in order', () => {
    it('fails when amount/currency/createdBy are missing', () => {
      expect(
        validateSubmit(ctx({ model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', amount: undefined, currency: undefined, createdBy: undefined } }))
          .error,
      ).toBe('Fill in amount, currency, createdBy.');
    });

    it('fails when the typed amount exceeds the currency’s decimal places (e.g. "10000.5 JPY")', () => {
      const result = validateSubmit(
        ctx({ model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', amount: '10000.5', currency: 'JPY', createdBy: 'maker1', tenorType: 'SIGHT' } }),
      );
      expect(result.error).toBe('Amount 10000.5 has more decimal places than JPY allows (0).');
    });

    it('fails when a dynamic secondary reference is required but blank (e.g. an Amendment number)', () => {
      const result = validateSubmit(ctx({ dynamicSecondaryRefLabel: 'Amendment No.' }));
      expect(result.error).toBe('Amendment No. is mandatory for A1.');
    });

    it('fails when issuing a Shipping Guarantee (SHGT) without an SG Number', () => {
      const result = validateSubmit(
        ctx({ selectedFunction: fn('A8'), model: { instrumentType: 'SHGT', movementType: 'CREATE', amount: '1000', currency: 'USD', createdBy: 'maker1' } }),
      );
      expect(result.error).toBe('SG Number is mandatory when issuing a Shipping Guarantee.');
    });

    it('fails when the LC Number is meant to come from the Parent picker (A6-shape) but none was picked', () => {
      const result = validateSubmit(
        ctx({
          selectedFunction: fn('A6'),
          model: {
            instrumentType: 'IPLC_ACCEPTANCE',
            movementType: 'CREATE',
            amount: '1000',
            currency: 'USD',
            createdBy: 'maker1',
            tenorType: 'SELLERS_USANCE',
          },
          naturalKey: { lcNumber: '', ibNumber: 'IB01', sgNumber: '' },
        }),
      );
      expect(result.error).toBe("Pick the Parent LC first — that selection supplies this record's LC Number.");
    });

    it('fails for A1/B1 (freely-typed LC Number) when the LC Number is blank — the business-reported gap fix', () => {
      const result = validateSubmit(ctx({ naturalKey: { lcNumber: '', ibNumber: '', sgNumber: '' } }));
      expect(result.error).toBe('LC Number is mandatory.');
    });

    it('fails when a required ibNumber/sgNumber is blank on a creating movement (A6-shape, IB Number)', () => {
      const result = validateSubmit(
        ctx({
          selectedFunction: fn('A6'),
          model: {
            instrumentType: 'IPLC_ACCEPTANCE',
            movementType: 'CREATE',
            amount: '1000',
            currency: 'USD',
            createdBy: 'maker1',
            tenorType: 'SELLERS_USANCE',
          },
          naturalKey: { lcNumber: 'S001', ibNumber: '', sgNumber: '' },
        }),
      );
      expect(result.error).toBe('IB Number is mandatory.');
    });

    it('fails when the function requires a Tenor Type and none was picked', () => {
      // naturalKey.lcNumber is already non-blank here, simulating onSelectParent() having already
      // copied the Parent LC's own lcNumber in — the lcNumberFromParent guard checks THAT copied
      // field, not selectedParent directly, so a blank naturalKey.lcNumber would fail one guard
      // earlier ("Pick the Parent LC first") rather than reaching this one.
      const result = validateSubmit(
        ctx({
          selectedFunction: fn('A6'),
          // tenorType explicitly cleared — ctx()'s own default model otherwise carries `tenorType:
          // 'SIGHT'` forward through the merge, which would satisfy this guard and fall through to a
          // later one (settlesDocumentArrival) instead of the one under test here.
          model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE', amount: '1000', currency: 'USD', createdBy: 'maker1', tenorType: undefined },
          naturalKey: { lcNumber: 'S001', ibNumber: 'IB01', sgNumber: '' },
          selectedParent: contract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S001' } }),
        }),
      );
      expect(result.error).toBe('Tenor Type is mandatory for A6.');
    });
  });

  describe('validateSubmit — A1/B1 Sight/Usance Tenor Days normalization', () => {
    it('Sight: patches tenorDays to 0 regardless of whatever was typed, and passes', () => {
      const result = validateSubmit(
        ctx({
          model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', amount: '1000', currency: 'USD', createdBy: 'maker1', tenorType: 'SIGHT', tenorDays: 45 },
        }),
      );
      expect(result.error).toBeNull();
      expect(result.patch.tenorDays).toBe(0);
    });

    it('Usance: fails when Tenor Days is missing or not greater than 0 (boundary — 0 itself fails)', () => {
      const result = validateSubmit(
        ctx({
          model: {
            instrumentType: 'IPLC_LC',
            movementType: 'ISSUE',
            amount: '1000',
            currency: 'USD',
            createdBy: 'maker1',
            tenorType: 'SELLERS_USANCE',
            tenorDays: 0,
          },
        }),
      );
      expect(result.error).toBe("Tenor Days must be greater than 0 for Seller's/Buyer's Usance.");
    });

    it('Usance: passes with no tenorDays patch when a positive Tenor Days is typed (boundary — 1 is the smallest valid value)', () => {
      const result = validateSubmit(
        ctx({
          model: {
            instrumentType: 'IPLC_LC',
            movementType: 'ISSUE',
            amount: '1000',
            currency: 'USD',
            createdBy: 'maker1',
            tenorType: 'SELLERS_USANCE',
            tenorDays: 1,
          },
        }),
      );
      expect(result.error).toBeNull();
      expect(result.patch).toEqual({});
    });
  });

  describe('validateSubmit — A6/B4 must convert a specific still-PENDING record (settlesDocumentArrival)', () => {
    const a6Ctx = (overrides: Partial<SubmitRulesContext> = {}) =>
      ctx({
        selectedFunction: fn('A6'),
        model: {
          instrumentType: 'IPLC_ACCEPTANCE',
          movementType: 'CREATE',
          amount: '1000',
          currency: 'USD',
          createdBy: 'maker1',
          tenorType: 'SELLERS_USANCE',
          tenorDays: 90,
        },
        // Already-resolved as if onSelectParent() had run (see the Tenor Type test's own comment above).
        naturalKey: { lcNumber: 'S001', ibNumber: 'IB01', sgNumber: '' },
        selectedParent: contract({ instrumentType: 'IPLC_LC', naturalKey: { lcNumber: 'S001' } }),
        ...overrides,
      });

    it('fails, citing the function’s own pendingItemLabel, when no still-PENDING record was picked', () => {
      const result = validateSubmit(a6Ctx({ selectedPayMovement: null }));
      expect(result.error).toBe('Pick the still-PENDING Document Arrival (2ndary Index) to convert first.');
    });

    it('passes once a still-PENDING record is picked', () => {
      const result = validateSubmit(a6Ctx({ selectedPayMovement: movement() }));
      expect(result.error).toBeNull();
    });

    it('falls back to the generic "Document Arrival" label when the function has no pendingItemLabel of its own (defensive fallback — every current registry entry sets one)', () => {
      const result = validateSubmit(a6Ctx({ selectedFunction: { ...fn('A6'), pendingItemLabel: undefined }, selectedPayMovement: null }));
      expect(result.error).toBe('Pick the still-PENDING Document Arrival (2ndary Index) to convert first.');
    });
  });

  describe('validateSubmit — A3S must be tied to a specific Shipping Guarantee (documentArrivalWithSg)', () => {
    const a3sCtx = (overrides: Partial<SubmitRulesContext> = {}) =>
      ctx({
        selectedFunction: fn('A3S'),
        model: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE', amount: '1000', currency: 'USD', createdBy: 'maker1' },
        selectedContract: contract(),
        ...overrides,
      });

    it('fails when no Shipping Guarantee is picked', () => {
      expect(validateSubmit(a3sCtx({ selectedArrivalSg: null, arrivalSgSnapshot: null })).error).toBe(
        'Pick the Shipping Guarantee this Document Arrival is against first.',
      );
    });

    it('fails when the SG is picked but its snapshot has not loaded yet (boundary — half-resolved selection)', () => {
      expect(
        validateSubmit(
          a3sCtx({ selectedArrivalSg: contract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'G01' } }), arrivalSgSnapshot: null }),
        ).error,
      ).toBe('Pick the Shipping Guarantee this Document Arrival is against first.');
    });

    it('passes once both the SG and its snapshot are resolved', () => {
      const result = validateSubmit(
        a3sCtx({ selectedArrivalSg: contract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'G01' } }), arrivalSgSnapshot: snapshot() }),
      );
      expect(result.error).toBeNull();
    });
  });

  describe('validateSubmit — A9 (Shipping Gtee Redemption): locked to Full Redeem only (BA-confirmed 2026-08-21, TF_Balance_Component_Mapping Rule #1)', () => {
    const a9Ctx = (overrides: Partial<SubmitRulesContext> = {}) =>
      ctx({
        selectedFunction: fn('A9'),
        model: { instrumentType: 'SHGT', movementType: 'FULL_REDEEM', amount: '80000', currency: 'USD', createdBy: 'maker1' },
        selectedContract: contract({ instrumentType: 'SHGT', naturalKey: { lcNumber: 'S001', sgNumber: 'G01' } }),
        ...overrides,
      });

    it('fails when no snapshot has been searched for yet', () => {
      expect(validateSubmit(a9Ctx({ selectedContractSnapshot: null })).error).toBe('Search for the Shipping Guarantee to redeem first.');
    });

    it('fails when the (defense-in-depth backstop) amount exceeds the Available Balance', () => {
      const result = validateSubmit(
        a9Ctx({
          model: { instrumentType: 'SHGT', movementType: 'FULL_REDEEM', amount: '90000', currency: 'USD', createdBy: 'maker1' },
          selectedContractSnapshot: snapshot({ availableBalance: '80000' }),
        }),
      );
      expect(result.error).toBe('A Shipping Guarantee Redemption (A9) must be for the FULL Available Balance (80000) — Partial Redeem is no longer supported here.');
    });

    it('submits FULL_REDEEM (boundary — amount exactly equals Available, the only value the UI now permits)', () => {
      const result = validateSubmit(a9Ctx({ selectedContractSnapshot: snapshot({ availableBalance: '80000' }) }));
      expect(result.error).toBeNull();
      expect(result.patch.movementType).toBe('FULL_REDEEM');
    });

    it('fails (defense-in-depth backstop) rather than deriving PARTIAL_REDEEM when amount is below Available — the real UI can no longer produce this, builder-fields.ts locks the field', () => {
      const result = validateSubmit(
        a9Ctx({
          model: { instrumentType: 'SHGT', movementType: 'FULL_REDEEM', amount: '50000', currency: 'USD', createdBy: 'maker1' },
          selectedContractSnapshot: snapshot({ availableBalance: '80000' }),
        }),
      );
      expect(result.error).toBe('A Shipping Guarantee Redemption (A9) must be for the FULL Available Balance (80000) — Partial Redeem is no longer supported here.');
    });
  });

  describe('validateSubmit — B5 (Settlement on Maturity): Full/Partial Settle derived from Amount vs Available', () => {
    const b5Ctx = (overrides: Partial<SubmitRulesContext> = {}) =>
      ctx({
        selectedFunction: fn('B5'),
        activeFunctionSide: 'EXPORT',
        model: { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'FULL_SETTLE', amount: '80000', currency: 'USD', createdBy: 'maker1' },
        selectedContract: contract({ instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: 'S001', ibNumber: 'EB01' } }),
        ...overrides,
      });

    it('fails when no snapshot has been searched for yet', () => {
      expect(validateSubmit(b5Ctx({ selectedContractSnapshot: null })).error).toBe('Search for the Acceptance to settle first.');
    });

    it('fails when the typed amount exceeds the Available Balance', () => {
      const result = validateSubmit(
        b5Ctx({
          model: { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'FULL_SETTLE', amount: '90000', currency: 'USD', createdBy: 'maker1' },
          selectedContractSnapshot: snapshot({ availableBalance: '80000' }),
        }),
      );
      expect(result.error).toBe("Amount must not exceed the Acceptance's Available Balance (80000).");
    });

    it('derives FULL_SETTLE (boundary — amount exactly equals Available)', () => {
      const result = validateSubmit(b5Ctx({ selectedContractSnapshot: snapshot({ availableBalance: '80000' }) }));
      expect(result.error).toBeNull();
      expect(result.patch.movementType).toBe('FULL_SETTLE');
    });

    it('derives PARTIAL_SETTLE when the typed amount is reduced below Available', () => {
      const result = validateSubmit(
        b5Ctx({
          model: { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'FULL_SETTLE', amount: '30000', currency: 'USD', createdBy: 'maker1' },
          selectedContractSnapshot: snapshot({ availableBalance: '80000' }),
        }),
      );
      expect(result.error).toBeNull();
      expect(result.patch.movementType).toBe('PARTIAL_SETTLE');
    });
  });

  describe('validateSubmit — regression: an early guard’s patch survives a later guard’s own failure', () => {
    it('keeps tenorDays: 0 in the returned patch even when a LATER guard in the same call fails', () => {
      // No real registry function combines A1's tenorDays-patching guard with a later guard that can
      // still fail — this test verifies the generic patch-survives-failure invariant (patch must be
      // applied REGARDLESS of `error`) independent of which real function reaches it, by forcing a
      // code='A1' object to also report settlesDocumentArrival via a Strategy spy (Strategy resolution
      // is keyed strictly by `fn.code`, so a plain object spread can't fake a second flag any more).
      const realDeriveFunctionStrategy = functionStrategyModule.deriveFunctionStrategy;
      const strategySpy = jest.spyOn(functionStrategyModule, 'deriveFunctionStrategy').mockImplementation((f) => {
        const real = realDeriveFunctionStrategy(f);
        return f.code === 'A1' ? { ...real, checkerRelease: { ...real.checkerRelease, settlesDocumentArrival: true } } : real;
      });
      try {
        const result = validateSubmit(
          ctx({
            selectedFunction: { ...fn('A1'), pendingItemLabel: fn('A6').pendingItemLabel },
            model: {
              instrumentType: 'IPLC_LC',
              movementType: 'ISSUE',
              amount: '1000',
              currency: 'USD',
              createdBy: 'maker1',
              tenorType: 'SIGHT',
              tenorDays: 999,
            },
            selectedPayMovement: null,
          }),
        );
        expect(result.error).toBe('Pick the still-PENDING Document Arrival (2ndary Index) to convert first.');
        expect(result.patch).toEqual({ tenorDays: 0 });
      } finally {
        strategySpy.mockRestore();
      }
    });
  });

  describe('buildSubmitRequest — assembling the base CreateMovementRequest', () => {
    it('creating movement (A1): assembles naturalKey, normalizing blank ibNumber/sgNumber to null', () => {
      const { request, error } = buildSubmitRequest(ctx({ naturalKey: { lcNumber: 'S001', ibNumber: '', sgNumber: '' } }));
      expect(error).toBeNull();
      expect(request?.naturalKey).toEqual({ lcNumber: 'S001', ibNumber: null, sgNumber: null });
      expect(request?.instrumentType).toBe('IPLC_LC');
      expect(request?.movementType).toBe('ISSUE');
    });

    it('existing contract (non-creating): uses balanceContractId, not naturalKey', () => {
      const { request, error } = buildSubmitRequest(
        ctx({
          selectedFunction: fn('A2'),
          model: { instrumentType: 'IPLC_LC', movementType: 'AMEND', amount: '1000', currency: 'USD', createdBy: 'maker1' },
          selectedContract: contract({ balanceContractId: 'bc-42' }),
        }),
      );
      expect(error).toBeNull();
      expect(request?.balanceContractId).toBe('bc-42');
      expect(request?.naturalKey).toBeUndefined();
    });

    it('fails with "Pick a contract" when non-creating and nothing was selected (boundary)', () => {
      const { request, error } = buildSubmitRequest(
        ctx({
          selectedFunction: fn('A2'),
          model: { instrumentType: 'IPLC_LC', movementType: 'AMEND', amount: '1000', currency: 'USD', createdBy: 'maker1' },
          selectedContract: null,
        }),
      );
      expect(request).toBeNull();
      expect(error).toBe('Pick a contract from the Catalog below.');
    });

    it('hasParent (A6-shape) with a picked Parent: sets parentLogicalContractId', () => {
      const { request } = buildSubmitRequest(
        ctx({
          selectedFunction: fn('A6'),
          model: {
            instrumentType: 'IPLC_ACCEPTANCE',
            movementType: 'CREATE',
            amount: '1000',
            currency: 'USD',
            createdBy: 'maker1',
            tenorType: 'SELLERS_USANCE',
            tenorDays: 90,
          },
          naturalKey: { lcNumber: '', ibNumber: 'IB01', sgNumber: '' },
          selectedParent: contract({ instrumentType: 'IPLC_LC', logicalContractId: 'parent-lc-99' }),
        }),
      );
      expect(request?.parentLogicalContractId).toBe('parent-lc-99');
    });

    it('EPLC_ACCEPTANCE + CREATE: includes exposureNature', () => {
      const { request } = buildSubmitRequest(
        ctx({
          model: { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'CREATE', amount: '1000', currency: 'USD', createdBy: 'maker1' },
          exposureNature: 'MEMO',
        }),
      );
      expect(request?.exposureNature).toBe('MEMO');
    });

    it('any other instrumentType/movementType combination: omits exposureNature', () => {
      const { request } = buildSubmitRequest(ctx());
      expect(request?.exposureNature).toBeUndefined();
    });

    it('settlesDocumentArrival (A6) with a picked pending record: stamps referencedTransactionId', () => {
      const { request } = buildSubmitRequest(
        ctx({
          selectedFunction: fn('A6'),
          model: {
            instrumentType: 'IPLC_ACCEPTANCE',
            movementType: 'CREATE',
            amount: '1000',
            currency: 'USD',
            createdBy: 'maker1',
            tenorType: 'SELLERS_USANCE',
            tenorDays: 90,
          },
          naturalKey: { lcNumber: '', ibNumber: 'IB01', sgNumber: '' },
          selectedParent: contract({ instrumentType: 'IPLC_LC' }),
          selectedPayMovement: movement({ movementId: 'mv-source-1' }),
        }),
      );
      expect(request?.referencedTransactionId).toBe('mv-source-1');
    });

    it('toleranceApplicable with a typed tolerancePct: includes tolerancePct as a string', () => {
      const { request } = buildSubmitRequest(
        ctx({ model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', amount: '1000', currency: 'USD', createdBy: 'maker1', tolerancePct: '10' } }),
      );
      expect(request?.tolerancePct).toBe('10');
    });

    it('a typed secondaryRef: included as sourceTransactionRef', () => {
      const { request } = buildSubmitRequest(
        ctx({ model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', amount: '1000', currency: 'USD', createdBy: 'maker1', secondaryRef: 'AMD-1' } }),
      );
      expect(request?.sourceTransactionRef).toBe('AMD-1');
    });

    it('tenorTypeOptions present with tenorDays > 0: includes both tenorType and tenorDays', () => {
      const { request } = buildSubmitRequest(
        ctx({
          selectedFunction: fn('A6'),
          model: {
            instrumentType: 'IPLC_ACCEPTANCE',
            movementType: 'CREATE',
            amount: '1000',
            currency: 'USD',
            createdBy: 'maker1',
            tenorType: 'SELLERS_USANCE',
            tenorDays: 90,
          },
          naturalKey: { lcNumber: '', ibNumber: 'IB01', sgNumber: '' },
          selectedParent: contract({ instrumentType: 'IPLC_LC' }),
        }),
      );
      expect(request?.tenorType).toBe('SELLERS_USANCE');
      expect(request?.tenorDays).toBe(90);
    });

    it('tenorTypeOptions present with tenorDays 0 (Sight, post-validateSubmit patch): omits tenorDays (boundary — 0 is falsy)', () => {
      const { request } = buildSubmitRequest(
        ctx({
          model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', amount: '1000', currency: 'USD', createdBy: 'maker1', tenorType: 'SIGHT', tenorDays: 0 },
        }),
      );
      expect(request?.tenorType).toBe('SIGHT');
      expect(request?.tenorDays).toBeUndefined();
    });
  });

  describe('validateSubmit — Amount must be > 0 (business requirement 2026-08-19, "A1-A9, B1-B5 Amount figure should > 0")', () => {
    it('rejects Amount "0" for A1 (creating function)', () => {
      const result = validateSubmit(ctx({ model: { amount: '0' } }));
      expect(result.error).toBe('Amount must be greater than 0.');
    });

    it('rejects a negative Amount for A2 (non-creating, generic target)', () => {
      const result = validateSubmit(
        ctx({
          selectedFunction: fn('A2'),
          model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE', amount: '-500', currency: 'USD', createdBy: 'maker1' },
          selectedContract: contract(),
        }),
      );
      expect(result.error).toBe('Amount must be greater than 0.');
    });

    it('passes for a genuinely positive Amount', () => {
      const result = validateSubmit(ctx({ model: { amount: '1' } }));
      expect(result.error).toBeNull();
    });

    it('is checked before the decimal-places guard would otherwise be reached — a zero amount fails with the >0 message, not a decimal-places one', () => {
      // "0" has zero decimal places for any currency, so this test only proves ORDER, not a case the
      // decimal-places guard would itself have caught — the >0 check runs first regardless.
      const result = validateSubmit(ctx({ model: { amount: '0', currency: 'JPY' } }));
      expect(result.error).toBe('Amount must be greater than 0.');
    });

    it('A10/B6 (Close) are exempted — 0 is a legitimate write-off figure for an already fully-utilized LC, not a "no real transaction" signal', () => {
      const result = validateSubmit(
        ctx({
          selectedFunction: fn('A10'),
          model: { instrumentType: 'IPLC_LC', movementType: 'CLOSE', amount: '0', currency: 'USD', createdBy: 'maker1' },
          selectedContract: contract(),
        }),
      );
      expect(result.error).not.toBe('Amount must be greater than 0.');
    });

    it('the CLOSE exemption skips this guard entirely, not just for 0 — a negative Amount also isn\'t caught here (the exact-equals-Confirmed-Balance check that would reject it lives server-side, closeShaped in balanceService.ts, since this pure function has no snapshot to compare against)', () => {
      const result = validateSubmit(
        ctx({
          selectedFunction: fn('A10'),
          model: { instrumentType: 'IPLC_LC', movementType: 'CLOSE', amount: '-1', currency: 'USD', createdBy: 'maker1' },
          selectedContract: contract(),
        }),
      );
      expect(result.error).not.toBe('Amount must be greater than 0.');
    });
  });

  describe('validateSubmit/buildSubmitRequest — B2 Direction / signed Amount (business requirement 2026-08-19, follow-up: "Input the Decrease Amount > 0, then it turns to negative figure to call the APIs"; bug fixed 2026-08-20 — model.amount must NEVER be mutated, only the wire request)', () => {
    const b2Model: Partial<BuilderModel> = { instrumentType: 'EPLC_CONFIRMATION', movementType: 'AMEND', amount: '5000', currency: 'USD', createdBy: 'maker1' };

    it('fails when no Direction is picked, even though every other field is valid', () => {
      const result = validateSubmit(ctx({ selectedFunction: fn('B2'), model: b2Model, selectedContract: contract(), amendDirection: null }));
      expect(result.error).toBe('Pick Increase or Decrease for this Amendment.');
    });

    it('Increase or Decrease — validateSubmit() never patches amount at all (patch is empty), regardless of Direction', () => {
      expect(
        validateSubmit(ctx({ selectedFunction: fn('B2'), model: b2Model, selectedContract: contract(), amendDirection: 'INCREASE' })).patch.amount,
      ).toBeUndefined();
      expect(
        validateSubmit(ctx({ selectedFunction: fn('B2'), model: b2Model, selectedContract: contract(), amendDirection: 'DECREASE' })).patch.amount,
      ).toBeUndefined();
    });

    it('the typed Amount itself must still be > 0 even for a Decrease — a negative typed value is rejected before the Direction guard is ever reached', () => {
      const result = validateSubmit(
        ctx({ selectedFunction: fn('B2'), model: { ...b2Model, amount: '-5000' }, selectedContract: contract(), amendDirection: 'DECREASE' }),
      );
      expect(result.error).toBe('Amount must be greater than 0.');
    });

    it('buildSubmitRequest() computes the signed wire amount directly from ctx.amendDirection, WITHOUT ctx.model.amount ever being mutated — the actual bug fix, reproduced end to end', () => {
      const c = ctx({ selectedFunction: fn('B2'), model: { ...b2Model }, selectedContract: contract(), amendDirection: 'DECREASE' });
      const { request } = buildSubmitRequest(c);
      expect(request?.amount).toBe('-5000');
      expect(c.model.amount).toBe('5000'); // untouched — this is the field the Maker's own Amount input reads
    });

    it('buildSubmitRequest() — Increase produces the same positive magnitude (a no-op sign-wise)', () => {
      const { request } = buildSubmitRequest(ctx({ selectedFunction: fn('B2'), model: b2Model, selectedContract: contract(), amendDirection: 'INCREASE' }));
      expect(request?.amount).toBe('5000');
    });

    it('buildSubmitRequest() — every other function (no amendDirection subChoice) passes model.amount through unchanged', () => {
      const { request } = buildSubmitRequest(
        ctx({ selectedFunction: fn('A2'), model: { ...b2Model, instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE' }, selectedContract: contract() }),
      );
      expect(request?.amount).toBe('5000');
    });
  });

  describe('hasEligibleTargetSelected — business requirement 2026-08-19 ("A2–A9 / B2–B5 — No Eligible Records")', () => {
    it('A1/B1 (creating, no parent) are always exempt — true regardless of any selection state', () => {
      expect(hasEligibleTargetSelected(ctx())).toBe(true); // A1, default ctx()
      expect(
        hasEligibleTargetSelected(
          ctx({
            selectedFunction: fn('B1'),
            model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'ISSUE', amount: '1000', currency: 'USD', createdBy: 'maker1' },
          }),
        ),
      ).toBe(true);
    });

    it('no selectedFunction at all — false', () => {
      expect(hasEligibleTargetSelected(ctx({ selectedFunction: null }))).toBe(false);
    });

    it('A2 (flat Catalog, no special Strategy flags) — false with no selectedContract, true once picked', () => {
      const model: Partial<BuilderModel> = { instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE' };
      const base = ctx({ selectedFunction: fn('A2'), model });
      expect(hasEligibleTargetSelected(base)).toBe(false);
      expect(hasEligibleTargetSelected({ ...base, selectedContract: contract() })).toBe(true);
    });

    it('A7 (flat/two-field target, no special Strategy flags) — same shape as A2', () => {
      const model: Partial<BuilderModel> = { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' };
      const base = ctx({ selectedFunction: fn('A7'), model });
      expect(hasEligibleTargetSelected(base)).toBe(false);
      expect(hasEligibleTargetSelected({ ...base, selectedContract: contract() })).toBe(true);
    });

    it('A8 (creating + hasParent, no other Strategy flags) — false with no selectedParent, true once the Parent LC is picked, no Step-2 needed', () => {
      const model: Partial<BuilderModel> = { instrumentType: 'SHGT', movementType: 'ISSUE' };
      const base = ctx({ selectedFunction: fn('A8'), model });
      expect(hasEligibleTargetSelected(base)).toBe(false);
      expect(hasEligibleTargetSelected({ ...base, selectedParent: contract() })).toBe(true);
    });

    it('B3 (creating + hasParent, no other Strategy flags, post-2026-08-18 redesign) — same shape as A8', () => {
      const model: Partial<BuilderModel> = { instrumentType: 'EPLC_EXAMINATION', movementType: 'CREATE' };
      const base = ctx({ selectedFunction: fn('B3'), model, naturalKey: { lcNumber: 'S001', ibNumber: 'E01', sgNumber: '' } });
      expect(hasEligibleTargetSelected(base)).toBe(false);
      expect(hasEligibleTargetSelected({ ...base, selectedParent: contract() })).toBe(true);
    });

    it('A4 (releasesExistingMovementInPlace) — false without selectedPayMovement even with selectedContract, true once the specific record is picked', () => {
      const model: Partial<BuilderModel> = { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' };
      const base = ctx({ selectedFunction: fn('A4'), model, selectedContract: contract() });
      expect(hasEligibleTargetSelected(base)).toBe(false);
      expect(hasEligibleTargetSelected({ ...base, selectedPayMovement: movement() })).toBe(true);
    });

    it('A6 (settlesDocumentArrival, creating + hasParent) — false without selectedParent, still false with only selectedParent, true once selectedPayMovement is also picked', () => {
      const model: Partial<BuilderModel> = { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' };
      const withParentOnly = ctx({ selectedFunction: fn('A6'), model, selectedParent: contract() });
      expect(hasEligibleTargetSelected(ctx({ selectedFunction: fn('A6'), model }))).toBe(false);
      expect(hasEligibleTargetSelected(withParentOnly)).toBe(false);
      expect(hasEligibleTargetSelected({ ...withParentOnly, selectedPayMovement: movement() })).toBe(true);
    });

    it('B4 (settlesDocumentArrival, NOT creating — flat Catalog target) — false without selectedContract, still false with only selectedContract, true once selectedPayMovement is also picked', () => {
      const model: Partial<BuilderModel> = { instrumentType: 'EPLC_CONFIRMATION', movementType: 'HONOUR' };
      const withContractOnly = ctx({ selectedFunction: fn('B4'), model, selectedContract: contract() });
      expect(hasEligibleTargetSelected(ctx({ selectedFunction: fn('B4'), model }))).toBe(false);
      expect(hasEligibleTargetSelected(withContractOnly)).toBe(false);
      expect(hasEligibleTargetSelected({ ...withContractOnly, selectedPayMovement: movement() })).toBe(true);
    });

    it('A3S (documentArrivalWithSg) — false without selectedArrivalSg/arrivalSgSnapshot even with selectedContract, true once both are also picked', () => {
      const model: Partial<BuilderModel> = { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' };
      const withContractOnly = ctx({ selectedFunction: fn('A3S'), model, selectedContract: contract() });
      expect(hasEligibleTargetSelected(withContractOnly)).toBe(false);
      expect(
        hasEligibleTargetSelected({ ...withContractOnly, selectedArrivalSg: contract({ balanceContractId: 'sg-1' }), arrivalSgSnapshot: snapshot() }),
      ).toBe(true);
    });

    it('A9 (amountVsAvailableDerivation REDEEM) — false without selectedContractSnapshot even with selectedContract, true once the snapshot is resolved', () => {
      const model: Partial<BuilderModel> = { instrumentType: 'SHGT', movementType: 'PARTIAL_REDEEM' };
      const withContractOnly = ctx({ selectedFunction: fn('A9'), model, selectedContract: contract() });
      expect(hasEligibleTargetSelected(withContractOnly)).toBe(false);
      expect(hasEligibleTargetSelected({ ...withContractOnly, selectedContractSnapshot: snapshot() })).toBe(true);
    });

    it('B5 (amountVsAvailableDerivation SETTLE, EPLC_ACCEPTANCE) — false without selectedContractSnapshot even with selectedContract, true once the snapshot is resolved', () => {
      const model: Partial<BuilderModel> = { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'PARTIAL_SETTLE' };
      const withContractOnly = ctx({ selectedFunction: fn('B5'), model, selectedContract: contract() });
      expect(hasEligibleTargetSelected(withContractOnly)).toBe(false);
      expect(hasEligibleTargetSelected({ ...withContractOnly, selectedContractSnapshot: snapshot() })).toBe(true);
    });
  });
});
