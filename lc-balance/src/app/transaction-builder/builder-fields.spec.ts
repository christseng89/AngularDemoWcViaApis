import { BuilderFieldsContext, buildFields, reconstructOriginalModel, toReadOnlyFields } from './builder-fields';
import { CURRENCY_OPTIONS, IMPORT_FUNCTIONS, EXPORT_FUNCTIONS, type TransactionFunction } from './balance-component.model';
import type { BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';

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

function movement(overrides: Partial<BalanceMovement> = {}): BalanceMovement {
  return {
    movementId: 'mv-1',
    balanceContractId: 'bc-1',
    eventSeq: 1,
    movementType: 'ISSUE',
    exposureNature: 'CONTINGENT',
    amount: '50000',
    ceilingAmount: '50000',
    currency: 'USD',
    status: 'RELEASED',
    createdBy: 'maker1',
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('builder-fields', () => {
  // secondaryRef must be the first input field on the entry screen. F1 (external BA review, v1.19.0)
  // added newExpiryDate (hidden unless AMEND_EXPIRY_DATE) and expiryDate (A1/B1 only, shown here) as two
  // new fixed fields, always present in the array (hide toggles visibility, not presence). F1 proposal
  // §13.1 (BA-ratified 2026-08-25) added a third, reasonCode (hidden unless A10/B6/A11/B7).
  it('returns the 11 fixed field keys, in order, for a plain A1 submission', () => {
    const fields = buildFields(baseCtx());
    expect(fields.map((f) => f.key)).toEqual([
      'secondaryRef',
      'amount',
      'newExpiryDate',
      'expiryDate',
      'reasonCode',
      'currency',
      'tolerancePct',
      'tenorType',
      'tenorDays',
      'eventSeq',
      'createdBy',
    ]);
  });

  it('A9 Remarks-only Fix Pending exposes Remarks as the sole editable business field', () => {
    const fields = buildFields(baseCtx({
      selectedFunction: fn('A9'),
      fixPendingMode: true,
      model: { instrumentType: 'SHGT', movementType: 'FULL_REDEEM', amount: '10000', currency: 'USD', createdBy: 'maker1', eventSeq: 1 },
    }));
    const remarks = fields.find((field) => field.key === 'remarks');
    expect(remarks).toBeDefined();
    expect(remarks?.hide).toBe(false);
    expect(remarks?.props?.disabled).toBe(false);
    expect(remarks?.props?.maxLength).toBe(500);
    expect(fields.find((field) => field.key === 'amount')?.props?.disabled).toBe(true);
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

    // 2026-08-28 ("A4 銀幕改成配置方式") — A4 (releasesExistingMovementInPlace) shares the exact same
    // "carried from the picked pay movement" shape A6 already has, via the SAME amountFromDocArrival
    // derivation — previously A4 had no equivalent here at all (its own template duplicated this fact in
    // a bespoke, non-Formly readout instead).
    it('is ALSO locked and labeled "carried from the Document Arrival" for A4 (releasesExistingMovementInPlace) once a pay movement is picked', () => {
      const ctx = baseCtx({ selectedFunction: fn('A4'), model: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' }, selectedPayMovement: { movementId: 'mv-1' } as any });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.props?.disabled).toBe(true);
      expect(amount.props?.label).toBe('Amount (carried from the Document Arrival, protected)');
    });

    it('stays editable/face-level for A4 before a pay movement has been picked (boundary — the flag alone is not enough)', () => {
      const ctx = baseCtx({ selectedFunction: fn('A4'), model: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' }, selectedPayMovement: null });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.props?.disabled).toBe(false);
      expect(amount.props?.label).toBe('Amount (face-level, per Design doc §6.2)');
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
      expect(amount.props?.label).toContain("SG's Available Balance");
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

    it('F1, redesigned 2026-08-25: is hidden entirely (not merely locked) for A11, with NO snapshot needed at all — the real restoration amount is computed server-side at Submit, never shown/typed by the Maker', () => {
      const ctx = baseCtx({ selectedFunction: fn('A11'), model: { instrumentType: 'IPLC_LC', movementType: 'REOPEN', amount: '0' }, selectedContractSnapshot: null });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.hide).toBe(true);
      expect(amount.props?.required).toBe(false);
    });

    // Bug fixed 2026-08-26 (user-reported live: "A11 選了 TESTREL01 輸入REASON AAAA後 SUBMIT BUTTON還是暗的").
    // onSelectContract() sets model.amount = '0' then calls rebuildFields() — Formly's default
    // resetOnHide:true wipes that value the moment this freshly-built hidden field initializes, since it
    // has no way to know the '0' was set on purpose. Without resetOnHide: false here, isSubmitReady's
    // mandatory-field check (`!model.amount`) fails silently and the Submit button never enables on a
    // genuine first LC selection — only a coincidental second selection could win the race.
    it('F1 2026-08-26 fix: sets resetOnHide: false on the Amount field for A11, so Formly does not wipe the amountFixed placeholder after rebuildFields()', () => {
      const ctx = baseCtx({ selectedFunction: fn('A11'), model: { instrumentType: 'IPLC_LC', movementType: 'REOPEN', amount: '0' }, selectedContractSnapshot: null });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.resetOnHide).toBe(false);
    });

    it('F1, redesigned 2026-08-25: B7 (Reopen, Export) also hides Amount entirely, no snapshot needed', () => {
      const ctx = baseCtx({
        selectedFunction: fn('B7'),
        model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'REOPEN', amount: '0' },
        selectedContractSnapshot: null,
      });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.hide).toBe(true);
      expect(amount.props?.required).toBe(false);
    });

    it('F1 2026-08-26 fix: sets resetOnHide: false on the Amount field for B7 too — same amountFixed mechanism, same bug, same fix', () => {
      const ctx = baseCtx({
        selectedFunction: fn('B7'),
        model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'REOPEN', amount: '0' },
        selectedContractSnapshot: null,
      });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.resetOnHide).toBe(false);
    });

    it('F1: is hidden entirely (not merely locked) when movementType is AMEND_EXPIRY_DATE — swapped for the new newExpiryDate field instead', () => {
      const ctx = baseCtx({ selectedFunction: fn('A2'), model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_EXPIRY_DATE' } });
      const amount = fieldByKey(buildFields(ctx), 'amount');
      expect(amount.hide).toBe(true);
      expect(amount.props?.required).toBe(false);
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

  describe('F1 (external BA review, v1.19.0) — newExpiryDate / expiryDate fields', () => {
    it('newExpiryDate is hidden and not required for a plain A1 (ISSUE)', () => {
      const newExpiryDate = fieldByKey(buildFields(baseCtx()), 'newExpiryDate');
      expect(newExpiryDate.hide).toBe(true);
      expect(newExpiryDate.props?.required).toBe(false);
      expect(newExpiryDate.props?.type).toBe('date');
    });

    it('newExpiryDate is shown and required once A2\'s third subChoice option resolves movementType to AMEND_EXPIRY_DATE', () => {
      const ctx = baseCtx({ selectedFunction: fn('A2'), model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_EXPIRY_DATE' } });
      const newExpiryDate = fieldByKey(buildFields(ctx), 'newExpiryDate');
      expect(newExpiryDate.hide).toBe(false);
      expect(newExpiryDate.props?.required).toBe(true);
    });

    it('newExpiryDate is shown and required for B2\'s AMEND_EXPIRY_DATE too (reached via its movementTypeOverride, not the amendDirection indirection)', () => {
      const ctx = baseCtx({ selectedFunction: fn('B2'), model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'AMEND_EXPIRY_DATE' } });
      const newExpiryDate = fieldByKey(buildFields(ctx), 'newExpiryDate');
      expect(newExpiryDate.hide).toBe(false);
      expect(newExpiryDate.props?.required).toBe(true);
    });

    it('expiryDate is shown and mandatory only for A1/B1, hidden for every other function (mandatory since 2026-08-26 — see BalanceService.assertExpiryDateRequired\'s own doc comment)', () => {
      const a1 = fieldByKey(buildFields(baseCtx({ selectedFunction: fn('A1') })), 'expiryDate');
      expect(a1.hide).toBe(false);
      expect(a1.props?.required).toBe(true);
      expect(a1.props?.type).toBe('date');

      const b1 = fieldByKey(buildFields(baseCtx({ selectedFunction: fn('B1'), model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'ISSUE' } })), 'expiryDate');
      expect(b1.hide).toBe(false);

      const a2 = fieldByKey(buildFields(baseCtx({ selectedFunction: fn('A2'), model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE' } })), 'expiryDate');
      expect(a2.hide).toBe(true);
    });
  });

  describe('F1 proposal §13.1 item 4/3(a) (BA-ratified 2026-08-25) — reasonCode field', () => {
    it('is hidden and not required for a plain A1 (ISSUE)', () => {
      const reasonCode = fieldByKey(buildFields(baseCtx()), 'reasonCode');
      expect(reasonCode.hide).toBe(true);
      expect(reasonCode.props?.required).toBe(false);
    });

    it('is shown and required for A10 (Close)', () => {
      const ctx = baseCtx({ selectedFunction: fn('A10'), model: { instrumentType: 'IPLC_LC', movementType: 'CLOSE' } });
      const reasonCode = fieldByKey(buildFields(ctx), 'reasonCode');
      expect(reasonCode.hide).toBe(false);
      expect(reasonCode.props?.required).toBe(true);
    });

    it('is shown and required for A11 (Reopen)', () => {
      const ctx = baseCtx({ selectedFunction: fn('A11'), model: { instrumentType: 'IPLC_LC', movementType: 'REOPEN' } });
      const reasonCode = fieldByKey(buildFields(ctx), 'reasonCode');
      expect(reasonCode.hide).toBe(false);
      expect(reasonCode.props?.required).toBe(true);
    });

    it('is shown and required for B6/B7 too (Export side)', () => {
      const b6 = fieldByKey(buildFields(baseCtx({ selectedFunction: fn('B6'), model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'CLOSE' } })), 'reasonCode');
      expect(b6.hide).toBe(false);
      const b7 = fieldByKey(buildFields(baseCtx({ selectedFunction: fn('B7'), model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'REOPEN' } })), 'reasonCode');
      expect(b7.hide).toBe(false);
    });

    it('stays hidden for every other function, e.g. a plain A2 amendment', () => {
      const reasonCode = fieldByKey(buildFields(baseCtx({ selectedFunction: fn('A2'), model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE' } })), 'reasonCode');
      expect(reasonCode.hide).toBe(true);
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

    // 2026-08-28: deliberate exception to the shared contractLevelEditable Fix Pending lock — see
    // deriveFixPendingLockFlags()'s own doc comment. A patched tolerancePct on a non-creating edit
    // (A2/B2 Increase/Decrease) only affects THIS movement's own ceiling/contingentAccountEntry, never
    // the contract's own stored tolerancePct (buildEditedRequest()'s updateIssueFields() write-back
    // stays gated to creating edits only) — so it's safe to unlock even though tenorType/tenorDays/
    // expiryDate stay locked for the exact same A2 context.
    it('stays editable during Fix Pending for a non-creating, tolerance-applicable movement (A2 AMEND_INCREASE)', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A2'),
        model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE' },
        fixPendingMode: true,
      });
      const tolerance = fieldByKey(buildFields(ctx), 'tolerancePct');
      expect(tolerance.props?.disabled).toBe(false);
      expect(tolerance.props?.label).toBe('Tolerance % (Maximum Exposure Basis, only on ISSUE/AMEND*)');
    });

    it('stays editable during Fix Pending for A2 AMEND_DECREASE too', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A2'),
        model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_DECREASE' },
        fixPendingMode: true,
      });
      const tolerance = fieldByKey(buildFields(ctx), 'tolerancePct');
      expect(tolerance.props?.disabled).toBe(false);
    });

    it('stays LOCKED during Fix Pending when tolerance is not applicable to this movement (A3 UTILIZE, boundary — also Fix-Pending-enabled, unlike A6)', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A3'),
        model: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' },
        fixPendingMode: true,
      });
      const tolerance = fieldByKey(buildFields(ctx), 'tolerancePct');
      expect(tolerance.props?.disabled).toBe(true);
    });

    it('stays editable during Fix Pending for a CREATING tolerance-applicable movement too (A1 ISSUE, unaffected by the exception)', () => {
      const ctx = baseCtx({ fixPendingMode: true });
      const tolerance = fieldByKey(buildFields(ctx), 'tolerancePct');
      expect(tolerance.props?.disabled).toBe(false);
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

    // Widened 2026-08-29 (user-directed, "A3 交易 2NDARY REF加大加粗明顯 並檢查所有交易 2NDARY REF
    // 加大加粗明顯") from review-mode-only to unconditional — every Function sharing this field gets the
    // same bold/enlarged treatment as the protected LC Number readout, any time it's genuinely shown.
    it('gains the tb-natural-key--emphasized class whenever visible — a normal Submit (A3/A2/etc.), not just Fix/Delete Pending review', () => {
      const secondaryRef = fieldByKey(buildFields(baseCtx({ dynamicSecondaryRefLabel: 'IB Number' })), 'secondaryRef');
      expect(secondaryRef.className).toContain('tb-natural-key--emphasized');
    });

    it('gains the tb-natural-key--emphasized class during Fix Pending review too', () => {
      const secondaryRef = fieldByKey(
        buildFields(baseCtx({ dynamicSecondaryRefLabel: 'Amendment No.', fixPendingMode: true })),
        'secondaryRef',
      );
      expect(secondaryRef.className).toContain('tb-natural-key--emphasized');
    });

    it('has no tb-natural-key--emphasized class when hidden (no dynamicSecondaryRefLabel)', () => {
      const secondaryRef = fieldByKey(buildFields(baseCtx({ fixPendingMode: true })), 'secondaryRef');
      expect(secondaryRef.className ?? '').not.toContain('tb-natural-key--emphasized');
    });
  });

  describe('Tenor Type / Tenor Days fields', () => {
    it('are hidden for a function with no tenorTypeOptions (e.g. A2)', () => {
      const ctx = baseCtx({ selectedFunction: fn('A2'), model: { instrumentType: 'IPLC_LC', movementType: 'AMEND' } });
      expect(fieldByKey(buildFields(ctx), 'tenorType').hide).toBe(true);
      expect(fieldByKey(buildFields(ctx), 'tenorDays').hide).toBe(true);
    });

    // 2026-08-28, "Tenor Type 改的不對 應該跟Currency欄位一樣 是輸入欄位但是PROTECTED for B2-B7 A2 - A11" —
    // supersedes an earlier, incorrect read-only-card-only attempt at the same requirement. Tenor Days is
    // deliberately NOT part of this — only Tenor Type itself was requested, and Tenor Days has no
    // equivalent "genuinely carried, once shown always meaningful" story for non-tenorTypeOptions
    // functions (it stays hidden here, same as before).
    it('shows Tenor Type as a carried, protected select once MakerPanelComponent.applyCarriedContractFields() has written model.tenorType, for a function with no tenorTypeOptions of its own (A2)', () => {
      const ctx = baseCtx({
        selectedFunction: fn('A2'),
        model: { instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE', tenorType: 'SELLERS_USANCE' },
        selectedContract: contract({ instrumentType: 'IPLC_LC', tenorType: 'SELLERS_USANCE' }),
      });
      const tenorType = fieldByKey(buildFields(ctx), 'tenorType');
      expect(tenorType.hide).toBe(false);
      expect(tenorType.type).toBe('select');
      expect(tenorType.props?.disabled).toBe(true);
      expect(tenorType.props?.label).toBe('Tenor Type (carried from the existing record, protected)');
      expect(tenorType.props?.options).toEqual([{ value: 'SELLERS_USANCE', label: "Seller's Usance" }]);
      // Tenor Days stays hidden/untouched — this requirement is Tenor Type only.
      expect(fieldByKey(buildFields(ctx), 'tenorDays').hide).toBe(true);
    });

    it('formats the carried Tenor Type via the Export-side label table for a B-series function (B2)', () => {
      const ctx = baseCtx({
        selectedFunction: fn('B2'),
        model: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'AMEND', tenorType: 'SELLERS_USANCE' },
        selectedContract: contract({ instrumentType: 'EPLC_CONFIRMATION', tenorType: 'SELLERS_USANCE' }),
      });
      const tenorType = fieldByKey(buildFields(ctx), 'tenorType');
      expect(tenorType.props?.options).toEqual([{ value: 'SELLERS_USANCE', label: 'Usance' }]); // Export side labels SELLERS_USANCE as plain "Usance"
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

  describe('reconstructOriginalModel (Generic Requirement, reviewer-reported 2026-08-26 — "Original Transaction Screen Must Display All Saved Fields")', () => {
    it('carries every BuilderModel field through from a fully-populated movement/contract, not a hand-picked subset', () => {
      const c = contract({
        instrumentType: 'IPLC_LC',
        tolerancePct: '10',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
        expiryDate: '2026-12-31',
      });
      const m = movement({
        movementType: 'CLOSE',
        amount: '0',
        currency: 'USD',
        eventSeq: 7,
        createdBy: 'maker-7',
        sourceTransactionRef: 'AMD-02',
        newExpiryDate: '2027-06-30',
        reasonCode: 'NATURAL_EXPIRY_ALL_BALANCES_CLEARED',
      });

      const model = reconstructOriginalModel(m, c);

      expect(model).toEqual({
        instrumentType: 'IPLC_LC',
        movementType: 'CLOSE',
        amount: '0',
        currency: 'USD',
        tolerancePct: '10',
        eventSeq: 7,
        createdBy: 'maker-7',
        secondaryRef: 'AMD-02',
        tenorType: 'SELLERS_USANCE',
        tenorDays: 90,
        expiryDate: '2026-12-31',
        newExpiryDate: '2027-06-30',
        reasonCode: 'NATURAL_EXPIRY_ALL_BALANCES_CLEARED',
      });
    });

    it('leaves every optional field undefined (never null) when the source movement/contract never had one', () => {
      const c = contract({ tolerancePct: null, tenorType: null, tenorDays: null, expiryDate: null });
      const m = movement({ sourceTransactionRef: null, newExpiryDate: null, reasonCode: null });

      const model = reconstructOriginalModel(m, c);

      expect(model.tolerancePct).toBeUndefined();
      expect(model.tenorType).toBeUndefined();
      expect(model.tenorDays).toBeUndefined();
      expect(model.expiryDate).toBeUndefined();
      expect(model.secondaryRef).toBeUndefined();
      expect(model.newExpiryDate).toBeUndefined();
      expect(model.reasonCode).toBeUndefined();
    });

    it('every field buildFields() can ever render ends up populated in the reconstructed model whenever the source data has a value — no field is silently dropped', () => {
      const c = contract({ tolerancePct: '5', tenorType: 'SIGHT', tenorDays: 0, expiryDate: '2026-01-01' });
      const m = movement({ sourceTransactionRef: 'REF-1', newExpiryDate: '2026-02-02', reasonCode: 'RC-1' });

      const model = reconstructOriginalModel(m, c);
      const allFieldKeys = buildFields(baseCtx({ model, selectedContract: c })).map((f) => f.key as string);

      for (const key of allFieldKeys) {
        expect((model as Record<string, unknown>)[key]).not.toBeUndefined();
      }
    });
  });
});
