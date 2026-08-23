import { BuilderFieldsContext, buildFields, toReadOnlyFields } from './builder-fields';
import { CURRENCY_OPTIONS, IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, type TransactionFunction } from './balance-component.model';
import type { BalanceContract, BalanceSnapshot } from './balance-component-api.service';

/**
 * BAL-003 (God Component) — dedicated unit coverage for `builder-fields.ts`'s `buildFields()`, where
 * the Amount/Currency/Tenor "carried forward and protected" rules are actually enforced in the UI.
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

function baseCtx(overrides: Partial<BuilderFieldsContext> = {}): BuilderFieldsContext {
  return {
    model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', currency: 'USD' },
    selectedFunction: fn('A1'),
    selectedPayMovement: null,
    selectedContract: null,
    selectedContractSnapshot: null,
    selectedParent: null,
    dynamicSecondaryRefLabel: null,
    ...overrides,
  };
}

function fieldByKey(fields: ReturnType<typeof buildFields>, key: string) {
  const found = fields.find((f) => f.key === key);
  if (!found) throw new Error(`No field with key "${key}"`);
  return found;
}

describe('builder-fields', () => {
  // secondaryRef must be the first input field on the entry screen.
  // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §1 (2026-08-23) — expiryDate/issueDate added for
  // A1/B1, between tolerancePct and tenorType (UI-only reorder, same date, per user request: Issue Date
  // shown before Expiry Date — an LC is issued, THEN it has an expiry). §2/§3 — documentPresentationDate
  // added right after (hidden for A1, only shown for A3/A3S/B3). originalExpiryDateReference (UI-only,
  // 2026-08-23; widened same day to A3/A3S/B3, and reordered ahead of expiryDate — both user-requested)
  // sits right after issueDate, BEFORE expiryDate — hidden for A1, shown for A2/B2 Extend Expiry and for
  // A3/A3S/B3. parentExpiryDateReference (UI-only, 2026-08-23) added after documentPresentationDate —
  // hidden for A1, only shown for A6/B4-Usance. maturityDateProfile/maturityDateCalendarsReference
  // (2026-08-23, user-directed A6/B4 Calculated Maturity Date) added right after parentExpiryDateReference
  // — so all five reference/config fields are still present in the field ARRAY for every function, just
  // hidden.
  it('returns the 20 fixed field keys, in order, for a plain A1 submission', () => {
    const fields = buildFields(baseCtx());
    expect(fields.map((f) => f.key)).toEqual([
      'secondaryRef',
      'amount',
      'currency',
      'tolerancePct',
      'issueDate',
      'originalExpiryDateReference',
      'expiryDate',
      'documentPresentationDate',
      'parentExpiryDateReference',
      'maturityDateProfile',
      'maturityDateCalendarsReference',
      'tenorType',
      'tenorDays',
      'tenorBasis',
      'fixedMaturityDate',
      'maturityDateStatusReference',
      'contractualMaturityDateReference',
      'operationalPaymentDateReference',
      'eventSeq',
      'createdBy',
    ]);
  });

  describe('Amount field', () => {
    it('is editable with the plain "face-level" label when nothing locks it', () => {
      const amount = fieldByKey(buildFields(baseCtx()), 'amount');
      expect(amount.props?.disabled).toBe(false);
      expect(amount.props?.label).toBe('Amount (face-level, per Design doc §6.2)');
      expect(amount.props?.max).toBeUndefined();
    });

    it('is locked and labeled "carried from the Document Arrival" when settlesDocumentArrival + a picked pay movement (A6-shape)', () => {
      const ctx = baseCtx({ selectedFunction: fn('A6'), selectedPayMovement: { movementId: 'mv-1' } as any });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.props?.disabled).toBe(true);
      expect(amount.props?.label).toBe('Amount (carried from the Document Arrival, protected)');
    });

    it('is locked and labeled "Full Settle — carried..." when movementType is FULL_SETTLE with a resolved snapshot', () => {
      const ctx = baseCtx({ model: { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' }, selectedContractSnapshot: snapshot() });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.props?.disabled).toBe(true);
      expect(amount.props?.label).toBe("Amount (Full Settle — carried from the Acceptance's Available Balance, protected)");
    });

    it('is locked (disabled, no max) to the Available Balance for A9 (amountFromSgRedeem) once a snapshot resolves — BA-confirmed 2026-08-21, Partial Redeem no longer supported', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A9'),
        model: { instrumentType: 'SHGT', movementType: 'FULL_REDEEM' },
        selectedContractSnapshot: snapshot({ availableBalance: '80000' }),
      });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.props?.disabled).toBe(true);
      expect(amount.props?.max).toBeUndefined();
      expect(amount.props?.label).toContain("Shipping Guarantee's Available Balance");
      expect(amount.props?.label).toContain('protected');
    });

    it('is capped at (not disabled by) the Available Balance for B5 (settlesAcceptanceOnMature) once a snapshot resolves', () => {
      const ctx = baseCtx({
        selectedFunction: fn('B5'),
        model: { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' },
        selectedContractSnapshot: snapshot({ availableBalance: '80000' }),
      });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.props?.disabled).toBe(false);
      expect(amount.props?.max).toBe(80000);
      expect(amount.props?.label).toContain("Acceptance's Available Balance");
    });

    it('BAL-135 regression: A7’s own Full Settle subChoice still locks the Amount field (A7 has no settlesAcceptanceOnMature, so the exclusion does not affect it)', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A7'),
        model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' },
        selectedContractSnapshot: snapshot(),
      });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.props?.disabled).toBe(true);
      expect(amount.props?.label).toBe("Amount (Full Settle — carried from the Acceptance's Available Balance, protected)");
    });

    it('BAL-135 regression: B5 stays editable/capped even though its own registry movementType default is the SAME literal ("FULL_SETTLE") A7’s subChoice locks on', () => {
      const ctx = baseCtx({
        selectedFunction: fn('B5'),
        model: { instrumentType: 'EPLC_ACCEPTANCE', movementType: 'FULL_SETTLE' },
        selectedContractSnapshot: snapshot({ availableBalance: '80000' }),
      });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.props?.disabled).toBe(false);
      expect(amount.props?.max).toBe(80000);
      expect(amount.props?.label).toContain('reduce for a Partial Settle');
    });

    it('uses the "Bill Amount" label for documentArrivalWithSg (A3S), even though nothing locks it', () => {
      const amount = fieldByKey(buildFields(baseCtx({ selectedFunction: fn('A3S'), model: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' } })), 'amount');
      expect(amount.props?.disabled).toBe(false);
      expect(amount.props?.label).toBe('Bill Amount (actual document amount — see SG Redemption Amount below)');
    });

    it('is FULLY locked (not merely capped) and labeled "Close — carried..." for A10 once a snapshot resolves — unlike A9/B5, which stay editable/capped', () => {
      const ctx = baseCtx({ selectedFunction: fn('A10'), model: { instrumentType: 'IPLC_LC', movementType: 'CLOSE' }, selectedContractSnapshot: snapshot() });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.props?.disabled).toBe(true);
      expect(amount.props?.label).toBe('Amount (Close — carried from the current Confirmed Balance, protected; writes it off to 0)');
      expect(amount.props?.max).toBeUndefined();
    });

    it('B6 (Close, Export) is also fully locked once a snapshot resolves', () => {
      const ctx = baseCtx({
        selectedFunction: fn('B6'),
        model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'CLOSE' },
        selectedContractSnapshot: snapshot(),
      });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.props?.disabled).toBe(true);
      expect(amount.props?.label).toBe('Amount (Close — carried from the current Confirmed Balance, protected; writes it off to 0)');
    });

    it('A10 stays editable with the plain face-level label before a snapshot resolves (nothing picked yet)', () => {
      const ctx = baseCtx({ selectedFunction: fn('A10'), model: { instrumentType: 'IPLC_LC', movementType: 'CLOSE' }, selectedContractSnapshot: null });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.props?.disabled).toBe(false);
      expect(amount.props?.label).toBe('Amount (face-level, per Design doc §6.2)');
    });

    it('sets the spinner step from the currency’s own decimal places (JPY has none — step 1)', () => {
      const amount = fieldByKey(buildFields(baseCtx({ model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', currency: 'JPY' } })), 'amount');
      expect(amount.props?.step).toBe(1);
    });

    it('sets the spinner step to 0.01 for a 2-decimal currency (USD, the default)', () => {
      const amount = fieldByKey(buildFields(baseCtx()), 'amount');
      expect(amount.props?.step).toBeCloseTo(0.01);
    });

    it('exposes a live expressions.props.step that re-derives step from the Formly field model’s own currency', () => {
      const amount = fieldByKey(buildFields(baseCtx()), 'amount');
      const stepFn = amount.expressions?.['props.step'] as (f: any) => number;
      expect(stepFn({ model: { currency: 'JPY' } })).toBe(1);
      expect(stepFn({ model: { currency: 'USD' } })).toBeCloseTo(0.01);
    });
  });

  describe('Currency field', () => {
    it('is editable when nothing is carried yet (A1/B1)', () => {
      const currency = fieldByKey(buildFields(baseCtx()), 'currency');
      expect(currency.props?.disabled).toBe(false);
      expect(currency.props?.label).toBe('Currency');
    });

    it('is locked and labeled "carried from the existing record" once a Parent or Contract is resolved', () => {
      const currency = fieldByKey(buildFields(baseCtx({ selectedParent: contract({ currency: 'EUR' }) })), 'currency');
      expect(currency.props?.disabled).toBe(true);
      expect(currency.props?.label).toBe('Currency (carried from the existing record, protected)');
    });

    it('is a dropdown (type select, CURRENCY_OPTIONS) for A1', () => {
      const currency = fieldByKey(buildFields(baseCtx({ selectedFunction: fn('A1') })), 'currency');
      expect(currency.type).toBe('select');
      expect(currency.props?.options).toEqual(CURRENCY_OPTIONS);
    });

    it('is a dropdown (type select, CURRENCY_OPTIONS) for B1', () => {
      const currency = fieldByKey(buildFields(baseCtx({ selectedFunction: fn('B1'), model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'ISSUE' } })), 'currency');
      expect(currency.type).toBe('select');
      expect(currency.props?.options).toEqual(CURRENCY_OPTIONS);
    });

    it('stays a plain input (no options) for every other function, even before it becomes locked', () => {
      const currency = fieldByKey(buildFields(baseCtx({ selectedFunction: fn('A6'), model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' } })), 'currency');
      expect(currency.type).toBe('input');
      expect(currency.props?.options).toBeUndefined();
      expect(currency.props?.disabled).toBe(false);
    });
  });

  describe('Tolerance % field', () => {
    it('is visible for a tolerance-applicable instrumentType/movementType (IPLC_LC ISSUE)', () => {
      const tolerance = fieldByKey(buildFields(baseCtx()), 'tolerancePct');
      expect(tolerance.hide).toBe(false);
    });

    it('is hidden otherwise (e.g. IPLC_ACCEPTANCE CREATE)', () => {
      const tolerance = fieldByKey(buildFields(baseCtx({ model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' } })), 'tolerancePct');
      expect(tolerance.hide).toBe(true);
    });
  });

  describe('Reference No. (secondaryRef) field', () => {
    it('is hidden with no dynamicSecondaryRefLabel (A1)', () => {
      const secondaryRef = fieldByKey(buildFields(baseCtx()), 'secondaryRef');
      expect(secondaryRef.hide).toBe(true);
      expect(secondaryRef.props?.required).toBe(false);
    });

    it('is visible, required, and labeled from dynamicSecondaryRefLabel when set', () => {
      const secondaryRef = fieldByKey(buildFields(baseCtx({ dynamicSecondaryRefLabel: 'Amendment No.' })), 'secondaryRef');
      expect(secondaryRef.hide).toBe(false);
      expect(secondaryRef.props?.required).toBe(true);
      expect(secondaryRef.props?.label).toBe('Amendment No.');
    });
  });

  describe('Tenor Type / Tenor Days fields', () => {
    it('are hidden for a function with no tenorTypeOptions (e.g. A2)', () => {
      const ctx = baseCtx({ selectedFunction: fn('A2'), model: { instrumentType: 'IPLC_LC', movementType: 'AMEND' } });
      expect(fieldByKey(buildFields(ctx), 'tenorType').hide).toBe(true);
      expect(fieldByKey(buildFields(ctx), 'tenorDays').hide).toBe(true);
    });

    it('are visible and editable for A1 before a parent/tenor is resolved', () => {
      const fields = buildFields(baseCtx());
      const tenorType = fieldByKey(fields, 'tenorType');
      const tenorDays = fieldByKey(fields, 'tenorDays');
      expect(tenorType.hide).toBe(false);
      expect(tenorType.props?.disabled).toBe(false);
      expect(tenorDays.props?.disabled).toBe(false);
    });

    it('are locked, with "carried from the parent LC" labels, once A6’s own Parent + tenorType options resolve', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A6'),
        model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' },
        selectedParent: contract({ instrumentType: 'IPLC_LC' }),
      });
      const fields = buildFields(ctx);
      const tenorType = fieldByKey(fields, 'tenorType');
      const tenorDays = fieldByKey(fields, 'tenorDays');
      expect(tenorType.props?.disabled).toBe(true);
      expect(tenorType.props?.label).toBe('Tenor Type (carried from the parent LC, protected)');
      expect(tenorDays.props?.disabled).toBe(true);
      expect(tenorDays.props?.label).toBe('Tenor Days (carried from the parent LC, protected)');
    });

    it('does NOT lock Tenor Type/Days for A6 before a Parent is actually picked (boundary — tenorTypeOptions alone isn’t enough)', () => {
      const ctx = baseCtx({ selectedFunction: fn('A6'), model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' }, selectedParent: null });
      const tenorDays = fieldByKey(buildFields(ctx), 'tenorDays');
      expect(tenorDays.props?.disabled).toBe(false);
    });

    it('A1/B1 only: attaches live Sight/Usance expressions to Tenor Days when not locked', () => {
      const tenorDays = fieldByKey(buildFields(baseCtx()), 'tenorDays');
      expect(tenorDays.expressions).toBeDefined();
      const disabledFn = tenorDays.expressions?.['props.disabled'] as (f: any) => boolean;
      const requiredFn = tenorDays.expressions?.['props.required'] as (f: any) => boolean;
      const minFn = tenorDays.expressions?.['props.min'] as (f: any) => number | null;
      const labelFn = tenorDays.expressions?.['props.label'] as (f: any) => string;
      const classNameFn = tenorDays.expressions?.['className'] as (f: any) => string;
      const modelFn = tenorDays.expressions?.['model.tenorDays'] as (f: any) => number | undefined;
      expect(disabledFn({ model: { tenorType: 'SIGHT' } })).toBe(true);
      expect(disabledFn({ model: { tenorType: 'SELLERS_USANCE' } })).toBe(false);
      expect(requiredFn({ model: { tenorType: 'SIGHT' } })).toBe(false);
      expect(requiredFn({ model: { tenorType: 'SELLERS_USANCE' } })).toBe(true);
      expect(minFn({ model: { tenorType: 'SIGHT' } })).toBeNull();
      expect(minFn({ model: { tenorType: 'SELLERS_USANCE' } })).toBe(1);
      expect(labelFn({ model: { tenorType: 'SIGHT' } })).toBe('Tenor Days (Sight — always 0, protected)');
      expect(labelFn({ model: { tenorType: 'SELLERS_USANCE' } })).toBe('Tenor Days');
      expect(classNameFn({ model: { tenorType: 'SIGHT' } })).toBe('');
      expect(classNameFn({ model: { tenorType: 'SELLERS_USANCE' } })).toBe('tb-field--required');
      expect(modelFn({ model: { tenorType: 'SIGHT', tenorDays: 45 } })).toBe(0);
      expect(modelFn({ model: { tenorType: 'SELLERS_USANCE', tenorDays: 45 } })).toBe(45);
    });

    it('does not attach the Sight/Usance expressions on a non-A1/B1 tenor-carrying function (A6), locked or not', () => {
      const ctx = baseCtx({ selectedFunction: fn('A6'), model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' }, selectedParent: null });
      const tenorDays = fieldByKey(buildFields(ctx), 'tenorDays');
      expect(tenorDays.expressions).toBeUndefined();
    });
  });

  // Maturity-Date-Tenor-Basis-Decision-Review.md v31 §3.1 (2026-08-24, business-confirmed) — A1/B1 root
  // ISSUE only; tenorBasis/fixedMaturityDate mirror tenorDays' own reactive Sight/Usance shape.
  describe('tenorBasis / fixedMaturityDate (A1/B1 only)', () => {
    it('is hidden entirely for a non-A1/B1 function (e.g. A6)', () => {
      const ctx = baseCtx({ selectedFunction: fn('A6'), model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' }, selectedParent: null });
      const fields = buildFields(ctx);
      expect(fieldByKey(fields, 'tenorBasis').hide).toBe(true);
      expect(fieldByKey(fields, 'fixedMaturityDate').hide).toBe(true);
    });

    it('is present (not hidden) for A1/B1', () => {
      const fields = buildFields(baseCtx());
      expect(fieldByKey(fields, 'tenorBasis').hide).toBe(false);
      expect(fieldByKey(fields, 'fixedMaturityDate').hide).toBe(false);
    });

    it('offers the 6 business-confirmed TenorBasis options', () => {
      const tenorBasis = fieldByKey(buildFields(baseCtx()), 'tenorBasis');
      expect((tenorBasis.props?.options as { value: string }[]).map((o) => o.value)).toEqual([
        'AFTER_SIGHT',
        'AFTER_BL_DATE',
        'AFTER_INVOICE_DATE',
        'AFTER_SHIPMENT_DATE',
        'AFTER_ACCEPTANCE',
        'FIXED_MATURITY_DATE',
      ]);
    });

    it('tenorBasis: disabled+not-required for Sight, enabled+required for Usance, blanked back to undefined when Sight', () => {
      const tenorBasis = fieldByKey(buildFields(baseCtx()), 'tenorBasis');
      const disabledFn = tenorBasis.expressions?.['props.disabled'] as (f: any) => boolean;
      const requiredFn = tenorBasis.expressions?.['props.required'] as (f: any) => boolean;
      const modelFn = tenorBasis.expressions?.['model.tenorBasis'] as (f: any) => string | undefined;
      expect(disabledFn({ model: { tenorType: 'SIGHT' } })).toBe(true);
      expect(disabledFn({ model: { tenorType: 'SELLERS_USANCE' } })).toBe(false);
      expect(requiredFn({ model: { tenorType: 'SIGHT' } })).toBe(false);
      expect(requiredFn({ model: { tenorType: 'BUYERS_USANCE' } })).toBe(true);
      expect(modelFn({ model: { tenorType: 'SIGHT', tenorBasis: 'AFTER_BL_DATE' } })).toBeUndefined();
      expect(modelFn({ model: { tenorType: 'BUYERS_USANCE', tenorBasis: 'AFTER_BL_DATE' } })).toBe('AFTER_BL_DATE');
    });

    it('tenorBasis label warns when a non-FIXED_MATURITY_DATE basis is picked (only Fixed Maturity Date actually calculates today)', () => {
      const tenorBasis = fieldByKey(buildFields(baseCtx()), 'tenorBasis');
      const labelFn = tenorBasis.expressions?.['props.label'] as (f: any) => string;
      expect(labelFn({ model: { tenorType: 'SIGHT' } })).toBe('Tenor Basis (Sight — not applicable, protected)');
      expect(labelFn({ model: {} })).toBe('Tenor Basis (UCP 600 Art. 3 date-calculation basis)');
      expect(labelFn({ model: { tenorBasis: 'FIXED_MATURITY_DATE' } })).toBe('Tenor Basis (UCP 600 Art. 3 date-calculation basis)');
      expect(labelFn({ model: { tenorBasis: 'AFTER_BL_DATE' } })).toContain('⚠');
    });

    it('fixedMaturityDate: disabled+not-required unless tenorBasis is FIXED_MATURITY_DATE, blanked otherwise', () => {
      const fixedMaturityDate = fieldByKey(buildFields(baseCtx()), 'fixedMaturityDate');
      const disabledFn = fixedMaturityDate.expressions?.['props.disabled'] as (f: any) => boolean;
      const requiredFn = fixedMaturityDate.expressions?.['props.required'] as (f: any) => boolean;
      const modelFn = fixedMaturityDate.expressions?.['model.fixedMaturityDate'] as (f: any) => string | undefined;
      expect(disabledFn({ model: { tenorBasis: 'AFTER_BL_DATE' } })).toBe(true);
      expect(disabledFn({ model: { tenorBasis: 'FIXED_MATURITY_DATE' } })).toBe(false);
      expect(requiredFn({ model: { tenorBasis: 'AFTER_BL_DATE' } })).toBe(false);
      expect(requiredFn({ model: { tenorBasis: 'FIXED_MATURITY_DATE' } })).toBe(true);
      expect(modelFn({ model: { tenorBasis: 'AFTER_BL_DATE', fixedMaturityDate: '2027-01-01' } })).toBeUndefined();
      expect(modelFn({ model: { tenorBasis: 'FIXED_MATURITY_DATE', fixedMaturityDate: '2027-01-01' } })).toBe('2027-01-01');
    });
  });

  // UI-only read-only reference fields (2026-08-24) — see isAcceptanceContractSelected's own doc comment
  // in builder-fields.ts. Values themselves are populated onto `model` by the caller (MakerPanelComponent/
  // InquireEventsService), not derived here — buildFields() only controls hide/disabled.
  describe('maturityDateStatusReference / contractualMaturityDateReference / operationalPaymentDateReference', () => {
    it('is hidden when nothing is selected', () => {
      const fields = buildFields(baseCtx({ selectedContract: null }));
      expect(fieldByKey(fields, 'maturityDateStatusReference').hide).toBe(true);
      expect(fieldByKey(fields, 'contractualMaturityDateReference').hide).toBe(true);
      expect(fieldByKey(fields, 'operationalPaymentDateReference').hide).toBe(true);
    });

    it('is hidden when the selected contract is not an Acceptance (e.g. the parent LC itself)', () => {
      const fields = buildFields(baseCtx({ selectedContract: contract({ instrumentType: 'IPLC_LC' }) }));
      expect(fieldByKey(fields, 'maturityDateStatusReference').hide).toBe(true);
    });

    it('is shown, disabled, for both Acceptance instrumentTypes', () => {
      for (const instrumentType of ['IPLC_ACCEPTANCE', 'EPLC_ACCEPTANCE'] as const) {
        const fields = buildFields(baseCtx({ selectedContract: contract({ instrumentType }) }));
        expect(fieldByKey(fields, 'maturityDateStatusReference').hide).toBe(false);
        expect(fieldByKey(fields, 'maturityDateStatusReference').props?.disabled).toBe(true);
        expect(fieldByKey(fields, 'contractualMaturityDateReference').hide).toBe(false);
        expect(fieldByKey(fields, 'operationalPaymentDateReference').hide).toBe(false);
      }
    });
  });

  describe('required-field className tagging', () => {
    it('tags every props.required field with tb-field--required', () => {
      const required = buildFields(baseCtx({ dynamicSecondaryRefLabel: 'Amendment No.' })).filter((f) => f.props?.required);
      expect(required.length).toBeGreaterThan(0);
      for (const f of required) {
        expect(f.className).toContain('tb-field--required');
      }
    });

    it('does not tag a non-required field', () => {
      const tolerance = fieldByKey(buildFields(baseCtx()), 'tolerancePct');
      expect(tolerance.className ?? '').not.toContain('tb-field--required');
    });
  });

  it('eventSeq and createdBy are always required, regardless of function', () => {
    const fields = buildFields(baseCtx());
    expect(fieldByKey(fields, 'eventSeq').props?.required).toBe(true);
    expect(fieldByKey(fields, 'createdBy').props?.required).toBe(true);
  });

  describe('Protected System-Controlled Fields (Event Seq / Created By)', () => {
    it('are always disabled (read-only), regardless of function — A1 (Import) and B1 (Export)', () => {
      expect(fieldByKey(buildFields(baseCtx()), 'eventSeq').props?.disabled).toBe(true);
      expect(fieldByKey(buildFields(baseCtx()), 'createdBy').props?.disabled).toBe(true);

      const b1Ctx = baseCtx({ selectedFunction: fn('B1'), model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'ISSUE' } });
      expect(fieldByKey(buildFields(b1Ctx), 'eventSeq').props?.disabled).toBe(true);
      expect(fieldByKey(buildFields(b1Ctx), 'createdBy').props?.disabled).toBe(true);
    });

    it('stay disabled even on a function whose own Amount/Tenor fields are NOT locked (boundary — disabled is unconditional here, unlike the carried/protected fields above)', () => {
      const ctx = baseCtx({ selectedFunction: fn('A2'), model: { instrumentType: 'IPLC_LC', movementType: 'AMEND' } });
      const fields = buildFields(ctx);
      expect(fieldByKey(fields, 'eventSeq').props?.disabled).toBe(true);
      expect(fieldByKey(fields, 'createdBy').props?.disabled).toBe(true);
    });

    it('label text marks both fields as system-controlled/protected', () => {
      const fields = buildFields(baseCtx());
      expect(fieldByKey(fields, 'eventSeq').props?.label).toContain('protected');
      expect(fieldByKey(fields, 'createdBy').props?.label).toContain('protected');
    });

    it('being both required and disabled still applies the tb-field--required className (matches the existing carried/protected-field convention, e.g. locked Amount/Tenor Days)', () => {
      const fields = buildFields(baseCtx());
      expect(fieldByKey(fields, 'eventSeq').className).toContain('tb-field--required');
      expect(fieldByKey(fields, 'createdBy').className).toContain('tb-field--required');
    });
  });

  describe('toReadOnlyFields', () => {
    it('forces every field disabled, regardless of its own live-disabled state', () => {
      const fields = toReadOnlyFields(buildFields(baseCtx()));
      expect(fields.every((f) => f.props?.disabled === true)).toBe(true);
      // Sanity check against the un-decorated baseline — the plain A1 Amount field is normally
      // editable, proving this test would fail without the decorator actually forcing it.
      expect(fieldByKey(buildFields(baseCtx()), 'amount').props?.disabled).toBe(false);
    });

    it('strips expressions so a live recompute (e.g. tenorDays\' own props.disabled callback) can never undo the forced disabled state', () => {
      const ctx = baseCtx({ selectedFunction: fn('A1'), model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', tenorType: 'SELLERS_USANCE' } });
      const live = fieldByKey(buildFields(ctx), 'tenorDays');
      expect(live.expressions).toBeDefined();
      const readOnly = fieldByKey(toReadOnlyFields(buildFields(ctx)), 'tenorDays');
      expect(readOnly.expressions).toBeUndefined();
      expect(readOnly.props?.disabled).toBe(true);
    });

    it('does not mutate buildFields()\'s own returned array (each field is a new object)', () => {
      const original = buildFields(baseCtx());
      const decorated = toReadOnlyFields(original);
      expect(fieldByKey(original, 'amount').props?.disabled).toBe(false);
      expect(fieldByKey(decorated, 'amount').props?.disabled).toBe(true);
    });

    it('preserves every field key and its required-ness (className/props.required untouched)', () => {
      const original = buildFields(baseCtx());
      const decorated = toReadOnlyFields(original);
      expect(decorated.map((f) => f.key)).toEqual(original.map((f) => f.key));
      expect(fieldByKey(decorated, 'amount').props?.required).toBe(true);
      expect(fieldByKey(decorated, 'amount').className).toContain('tb-field--required');
    });
  });

  describe('parentExpiryDateReference — UI-only reference field for A6/B4-Usance (2026-08-23, user-requested, ahead of Calculated Maturity Date itself)', () => {
    it('A6: shown, regardless of the parent\'s own tenorType (A6 is Usance-only by definition)', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A6'),
        model: { instrumentType: 'IPLC_ACCEPTANCE', movementType: 'CREATE' },
        selectedParent: contract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE', expiryDate: '2030-06-30' }),
      });
      const field = fieldByKey(buildFields(ctx), 'parentExpiryDateReference');
      expect(field.hide).toBe(false);
      expect(field.props?.disabled).toBe(true);
    });

    it('B4 with a Usance parent Confirmation: shown', () => {
      const ctx = baseCtx({
        selectedFunction: fn('B4'),
        model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'ACCEPT' },
        selectedParent: contract({ instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SELLERS_USANCE', expiryDate: '2031-01-15' }),
      });
      const field = fieldByKey(buildFields(ctx), 'parentExpiryDateReference');
      expect(field.hide).toBe(false);
    });

    it('B4 with a Sight parent Confirmation: hidden — the Sight branch (HONOUR) produces no Acceptance at all', () => {
      const ctx = baseCtx({
        selectedFunction: fn('B4'),
        model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'HONOUR' },
        selectedParent: contract({ instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SIGHT', expiryDate: '2031-01-15' }),
      });
      const field = fieldByKey(buildFields(ctx), 'parentExpiryDateReference');
      expect(field.hide).toBe(true);
    });

    it('B4 with no parent picked yet: hidden, no crash', () => {
      const ctx = baseCtx({ selectedFunction: fn('B4'), model: { instrumentType: 'EPLC_CONFIRMATION' }, selectedParent: null });
      const field = fieldByKey(buildFields(ctx), 'parentExpiryDateReference');
      expect(field.hide).toBe(true);
    });

    it('a function outside A6/B4 (e.g. A2) never shows it, even with a parent-shaped contract present on selectedParent', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A2'),
        model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE' },
        selectedParent: contract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE', expiryDate: '2030-06-30' }),
      });
      const field = fieldByKey(buildFields(ctx), 'parentExpiryDateReference');
      expect(field.hide).toBe(true);
    });
  });

  describe('originalExpiryDateReference — UI-only reference field for A2/B2 Extend Expiry and A3/A3S/B3 Document Presentation (2026-08-23, user-requested; widened + reordered same day)', () => {
    it('A2 with Extend Expiry chosen: shown, disabled, "before this amendment" label, and appears BEFORE expiryDate ("New Expiry Date") in the array', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A2'),
        model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_EXPIRY' },
        selectedContract: contract({ instrumentType: 'IPLC_LC', expiryDate: '2027-03-31' }),
      });
      const fields = buildFields(ctx);
      const field = fieldByKey(fields, 'originalExpiryDateReference');
      expect(field.hide).toBe(false);
      expect(field.props?.disabled).toBe(true);
      expect(field.props?.label).toBe('Current Expiry Date (reference — before this amendment)');
      expect(fields.map((f) => f.key).indexOf('originalExpiryDateReference')).toBeLessThan(fields.map((f) => f.key).indexOf('expiryDate'));
    });

    it('B2 with Extend Expiry chosen: shown', () => {
      const ctx = baseCtx({
        selectedFunction: fn('B2'),
        model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'AMEND_EXPIRY' },
        selectedContract: contract({ instrumentType: 'EPLC_CONFIRMATION', expiryDate: '2027-09-30' }),
      });
      const field = fieldByKey(buildFields(ctx), 'originalExpiryDateReference');
      expect(field.hide).toBe(false);
    });

    it('A2 with Increase/Decrease chosen instead: hidden', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A2'),
        model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE' },
        selectedContract: contract({ instrumentType: 'IPLC_LC', expiryDate: '2027-03-31' }),
      });
      const field = fieldByKey(buildFields(ctx), 'originalExpiryDateReference');
      expect(field.hide).toBe(true);
    });

    it.each(['A3', 'A3S', 'B3'])('%s (Document Presentation): shown, disabled, UCP 6(d)/14(c) label', (code) => {
      const ctx = baseCtx({
        selectedFunction: fn(code),
        model: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' },
        selectedContract: contract({ instrumentType: 'IPLC_LC', expiryDate: '2027-03-31' }),
      });
      const field = fieldByKey(buildFields(ctx), 'originalExpiryDateReference');
      expect(field.hide).toBe(false);
      expect(field.props?.disabled).toBe(true);
      expect(field.props?.label).toBe('Current Expiry Date (reference — UCP 600 Art. 6(d)/14(c))');
    });

    it('a function outside A2/B2/A3/A3S/B3 (e.g. A4) never shows it', () => {
      const ctx = baseCtx({ selectedFunction: fn('A4'), model: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' } });
      const field = fieldByKey(buildFields(ctx), 'originalExpiryDateReference');
      expect(field.hide).toBe(true);
    });

    it('visibility tracks amountFromAmendExpiry exactly the same as the expiryDate field\'s own "New Expiry Date" label — both keyed off model.movementType alone, no function-code check', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A2'),
        model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_EXPIRY' },
        selectedContract: contract({ instrumentType: 'IPLC_LC', expiryDate: '2027-03-31' }),
      });
      const fields = buildFields(ctx);
      expect(fieldByKey(fields, 'originalExpiryDateReference').hide).toBe(fieldByKey(fields, 'expiryDate').props?.label === 'New Expiry Date' ? false : true);
    });
  });

  describe('maturityDateProfile — Clearing Bank Calendar Profile, A1/B1 input + A2/B2 Update Clearing Bank Calendars (2026-08-23, user-directed, widened same day to apply regardless of tenor)', () => {
    it('A1: always shown, with the full profile option list plus a blank option', () => {
      const ctx = baseCtx({ selectedFunction: fn('A1'), model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE' } });
      const field = fieldByKey(buildFields(ctx), 'maturityDateProfile');
      expect(field.hide).toBe(false);
      expect(field.type).toBe('select');
      expect((field.props?.options as { value: string }[]).map((o) => o.value)).toEqual(['', 'USD_FEDWIRE', 'US', 'GB', 'TW', 'HK', 'SG', 'JP', 'CN', 'AE']);
      expect(field.props?.label).toBe('Clearing Bank Calendar Profile');
    });

    it('A1: statically required at build time, regardless of tenorType — no more reactive expressions (widened 2026-08-23, "SIGHT也要有這欄位")', () => {
      const ctx = baseCtx({ selectedFunction: fn('A1'), model: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', tenorType: 'SIGHT' } });
      const field = fieldByKey(buildFields(ctx), 'maturityDateProfile');
      expect(field.props?.required).toBe(true);
      expect(field.expressions).toBeUndefined();
    });

    it('B1: same static required as A1 (isRootIssue covers both)', () => {
      const ctx = baseCtx({ selectedFunction: fn('B1'), model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'ISSUE' } });
      const field = fieldByKey(buildFields(ctx), 'maturityDateProfile');
      expect(field.props?.required).toBe(true);
      expect(field.expressions).toBeUndefined();
    });

    it('A2 with Update Clearing Bank Calendars chosen: shown, statically required, "New..." label, no reactive expressions (movementType alone already gates it)', () => {
      const ctx = baseCtx({ selectedFunction: fn('A2'), model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_MATURITY_CALENDARS' } });
      const field = fieldByKey(buildFields(ctx), 'maturityDateProfile');
      expect(field.hide).toBe(false);
      expect(field.props?.required).toBe(true);
      expect(field.props?.label).toBe('New Clearing Bank Calendar Profile');
      expect(field.expressions).toBeUndefined();
    });

    it('B2 with Update Maturity Date Calendars chosen (movementType still converges on AMEND_MATURITY_CALENDARS): shown', () => {
      const ctx = baseCtx({ selectedFunction: fn('B2'), model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'AMEND_MATURITY_CALENDARS' } });
      const field = fieldByKey(buildFields(ctx), 'maturityDateProfile');
      expect(field.hide).toBe(false);
    });

    it('A2 with Increase/Decrease chosen instead: hidden', () => {
      const ctx = baseCtx({ selectedFunction: fn('A2'), model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE' } });
      const field = fieldByKey(buildFields(ctx), 'maturityDateProfile');
      expect(field.hide).toBe(true);
    });

    it('a function outside A1/B1/A2/B2 (e.g. A3): hidden', () => {
      const ctx = baseCtx({ selectedFunction: fn('A3'), model: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' } });
      const field = fieldByKey(buildFields(ctx), 'maturityDateProfile');
      expect(field.hide).toBe(true);
    });
  });

  describe('maturityDateCalendarsReference — A3/A3S/B3 read-only reference (2026-08-23, user-directed — "A3 A35 B3 只顯示(PROTECTED)"), widened 2026-08-23 to apply regardless of tenor', () => {
    it('A3 with a Usance underlying LC (selectedContract.tenorType): shown, disabled', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A3'),
        model: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' },
        selectedContract: contract({ instrumentType: 'IPLC_LC', tenorType: 'SELLERS_USANCE' }),
      });
      const field = fieldByKey(buildFields(ctx), 'maturityDateCalendarsReference');
      expect(field.hide).toBe(false);
      expect(field.props?.disabled).toBe(true);
    });

    it('A3S: same as A3', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A3S'),
        model: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' },
        selectedContract: contract({ instrumentType: 'IPLC_LC', tenorType: 'BUYERS_USANCE' }),
      });
      const field = fieldByKey(buildFields(ctx), 'maturityDateCalendarsReference');
      expect(field.hide).toBe(false);
    });

    it('B3: shown when selectedContract (aliased from selectedParent, see onSelectParent()) is Usance', () => {
      const ctx = baseCtx({
        selectedFunction: fn('B3'),
        model: { instrumentType: 'EPLC_EXAMINATION', movementType: 'CREATE' },
        selectedContract: contract({ instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SELLERS_USANCE' }),
      });
      const field = fieldByKey(buildFields(ctx), 'maturityDateCalendarsReference');
      expect(field.hide).toBe(false);
    });

    it('A3 with a Sight underlying LC: also shown now (widened 2026-08-23 — a Sight LC still settles through a paying/collecting bank)', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A3'),
        model: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' },
        selectedContract: contract({ instrumentType: 'IPLC_LC', tenorType: 'SIGHT' }),
      });
      const field = fieldByKey(buildFields(ctx), 'maturityDateCalendarsReference');
      expect(field.hide).toBe(false);
    });

    it('A3 with no selectedContract yet (nothing picked): still shown (function-gated only, not data-gated), no crash', () => {
      const ctx = baseCtx({ selectedFunction: fn('A3'), model: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' }, selectedContract: null });
      const field = fieldByKey(buildFields(ctx), 'maturityDateCalendarsReference');
      expect(field.hide).toBe(false);
    });

    it('a function outside A3/A3S/B3 (e.g. A2) never shows it, even with a Usance-shaped selectedContract present', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A2'),
        model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE' },
        selectedContract: contract({ instrumentType: 'IPLC_LC', tenorType: 'SELLERS_USANCE' }),
      });
      const field = fieldByKey(buildFields(ctx), 'maturityDateCalendarsReference');
      expect(field.hide).toBe(true);
    });
  });
});
