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
  it('returns the 8 fixed field keys, in order, for a plain A1 submission', () => {
    const fields = buildFields(baseCtx());
    expect(fields.map((f) => f.key)).toEqual(['secondaryRef', 'amount', 'currency', 'tolerancePct', 'tenorType', 'tenorDays', 'eventSeq', 'createdBy']);
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

    it('is capped at (not disabled by) the Available Balance for A9 (autoRedeemType) once a snapshot resolves', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A9'),
        model: { instrumentType: 'SHGT', movementType: 'FULL_REDEEM' },
        selectedContractSnapshot: snapshot({ availableBalance: '80000' }),
      });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.props?.disabled).toBe(false);
      expect(amount.props?.max).toBe(80000);
      expect(amount.props?.label).toContain("Shipping Guarantee's Available Balance");
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
});
