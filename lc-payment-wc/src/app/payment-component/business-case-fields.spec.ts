import type { FormlyFieldConfig } from '@ngx-formly/core';
import { buildHeaderFields, buildTailFields } from './business-case-fields';
import type { BusinessCaseConfig } from './business-case.model';
import type { CurrencyOption } from './currency.service';

const currencyOptions: CurrencyOption[] = [
  { label: 'USD', value: 'USD' },
  { label: 'EUR', value: 'EUR' },
];

function baseConfig(overrides: Partial<BusinessCaseConfig> = {}): BusinessCaseConfig {
  return {
    id: 'pay-accept',
    module: 'IPLC',
    functionLabel: 'Pay/Accept',
    verdict: 'PASS',
    citation: 'test citation',
    note: 'test note',
    sourceFunctionCode: 'PayAccept',
    legs: [],
    ...overrides,
  };
}

function findField(fields: FormlyFieldConfig[], key: string): FormlyFieldConfig | undefined {
  return fields.find((f) => f.key === key);
}

/** `hide` is typed as `string | ((field) => boolean)` by Formly — these fields always author it as a function. */
function evalHide(field: FormlyFieldConfig, model: Record<string, unknown>): boolean {
  const hide = field.expressions!['hide'] as (f: { model: Record<string, unknown> }) => boolean;
  return hide({ model });
}

describe('buildHeaderFields', () => {
  it('returns [] for a non-PASS verdict', () => {
    expect(buildHeaderFields(baseConfig({ verdict: 'GAP' }))).toEqual([]);
    expect(buildHeaderFields(baseConfig({ verdict: 'N_A' }))).toEqual([]);
  });

  it('builds the unitCode/mainRef/sequence row for a PASS case, with mainRef defaulted from module+id', () => {
    const fields = buildHeaderFields(baseConfig());
    expect(fields).toHaveLength(1); // just the row group — no dualPrefixOptions
    const row = fields[0]!.fieldGroup!;
    expect(findField(row, 'unitCode')?.defaultValue).toBe('HQ');
    expect(findField(row, 'mainRef')?.defaultValue).toBe('IPLC-pay-accept-0001');
    expect(findField(row, 'sequence')?.defaultValue).toBe(1);
  });

  it('adds a voucherPrefix select, defaulted to the first option, when dualPrefixOptions is set', () => {
    const config = baseConfig({
      module: 'EPLC',
      dualPrefixOptions: [
        { label: 'Discount leg', value: 'EPLC07NULLNULLNULL' },
        { label: 'Sight leg', value: 'EPLC03NULLNULLNULL' },
      ],
    });
    const fields = buildHeaderFields(config);

    const prefixField = findField(fields, 'voucherPrefix');
    expect(prefixField).toBeDefined();
    expect(prefixField!.type).toBe('select');
    expect(prefixField!.defaultValue).toBe('EPLC07NULLNULLNULL');
    expect(prefixField!.props?.options).toEqual(config.dualPrefixOptions);
    expect(prefixField!.props?.description).toContain('test citation');
  });
});

describe('buildTailFields', () => {
  it('returns [] for a non-PASS verdict even if liability/charge are configured', () => {
    const config = baseConfig({ verdict: 'GAP', liability: { kind: 'IPLC_MATURITY' }, charge: true });
    expect(buildTailFields(config, currencyOptions)).toEqual([]);
  });

  it('returns [] when neither liability nor charge is configured', () => {
    expect(buildTailFields(baseConfig(), currencyOptions)).toEqual([]);
  });

  describe('liability block', () => {
    it('adds a liabilityEnabled checkbox and a liability fieldGroup gated by it', () => {
      const config = baseConfig({ liability: { kind: 'IPLC_MATURITY' } });
      const fields = buildTailFields(config, currencyOptions);

      const enabledField = findField(fields, 'liabilityEnabled');
      expect(enabledField?.type).toBe('checkbox');
      expect(enabledField?.defaultValue).toBe(false);

      const liabilityGroup = findField(fields, 'liability');
      expect(liabilityGroup).toBeDefined();
      expect(evalHide(liabilityGroup!, { liabilityEnabled: false })).toBe(true);
      expect(evalHide(liabilityGroup!, { liabilityEnabled: true })).toBe(false);
      expect(evalHide(liabilityGroup!, {})).toBe(true);
    });

    it('IPLC_MATURITY fieldGroup has stlAmt/assetAcno/liabAcno/currency, currency using the given options', () => {
      const config = baseConfig({ liability: { kind: 'IPLC_MATURITY' } });
      const liabilityGroup = findField(buildTailFields(config, currencyOptions), 'liability')!;
      const keys = liabilityGroup.fieldGroup!.map((f) => f.key);
      expect(keys).toEqual(['stlAmt', 'assetAcno', 'liabAcno', 'currency']);

      const currencyField = findField(liabilityGroup.fieldGroup!, 'currency')!;
      expect(currencyField.type).toBe('select');
      expect(currencyField.props?.options).toBe(currencyOptions);
    });

    it('IMCO_SETTLEMENT_DA fieldGroup has billAmtFmDrwe/assetAcno/liabAcno/currency', () => {
      const config = baseConfig({ module: 'IMCO', liability: { kind: 'IMCO_SETTLEMENT_DA' } });
      const liabilityGroup = findField(buildTailFields(config, currencyOptions), 'liability')!;
      const keys = liabilityGroup.fieldGroup!.map((f) => f.key);
      expect(keys).toEqual(['billAmtFmDrwe', 'assetAcno', 'liabAcno', 'currency']);
    });

    it('GTEE fieldGroup has clmTrxCcyAmt/assetAcno/liabAcno/currency', () => {
      const config = baseConfig({ module: 'GTEE', liability: { kind: 'GTEE' } });
      const liabilityGroup = findField(buildTailFields(config, currencyOptions), 'liability')!;
      const keys = liabilityGroup.fieldGroup!.map((f) => f.key);
      expect(keys).toEqual(['clmTrxCcyAmt', 'assetAcno', 'liabAcno', 'currency']);
    });

    it('IPLC_PAY_ACCEPT fieldGroup includes the discount-specific optional fields', () => {
      const config = baseConfig({ liability: { kind: 'IPLC_PAY_ACCEPT', sourceFunctionCode: 'PayAcceptWithDiscount' } });
      const liabilityGroup = findField(buildTailFields(config, currencyOptions), 'liability')!;
      const keys = liabilityGroup.fieldGroup!.map((f) => f.key);
      expect(keys).toEqual(['stlAmt', 'acptAmt', 'sdaFlagIsSight', 'assetAcno', 'liabAcno', 'tempAssetAcno', 'tempLiabAcno', 'currency']);
    });

    it('EPLC fieldGroup includes the replicateEplcVoucherDescDefect checkbox, defaulted off', () => {
      const config = baseConfig({ module: 'EPLC', liability: { kind: 'EPLC', sourceFunctionCode: 'PayAccept' } });
      const liabilityGroup = findField(buildTailFields(config, currencyOptions), 'liability')!;
      const defectField = findField(liabilityGroup.fieldGroup!, 'replicateEplcVoucherDescDefect');
      expect(defectField?.defaultValue).toBe(false);
    });

    it('IWGT fieldGroup includes a methodOfIssuance select defaulted to Issue, with an Advice option', () => {
      const config = baseConfig({ module: 'IWGT', liability: { kind: 'IWGT' } });
      const liabilityGroup = findField(buildTailFields(config, currencyOptions), 'liability')!;
      const methodField = findField(liabilityGroup.fieldGroup!, 'methodOfIssuance')!;
      expect(methodField.defaultValue).toBe('Issue');
      expect(methodField.props?.options).toEqual([
        { label: 'Issue', value: 'Issue' },
        { label: 'Advice', value: 'Advice' },
      ]);
    });

    it('is entirely absent when config.liability is unset', () => {
      const fields = buildTailFields(baseConfig({ charge: true }), currencyOptions);
      expect(findField(fields, 'liabilityEnabled')).toBeUndefined();
      expect(findField(fields, 'liability')).toBeUndefined();
    });
  });

  describe('charge block', () => {
    it('adds a chargeEnabled checkbox and a charge fieldGroup gated by it', () => {
      const config = baseConfig({ charge: true });
      const fields = buildTailFields(config, currencyOptions);

      const enabledField = findField(fields, 'chargeEnabled');
      expect(enabledField?.type).toBe('checkbox');

      const chargeGroup = findField(fields, 'charge')!;
      expect(evalHide(chargeGroup, { chargeEnabled: false })).toBe(true);
      expect(evalHide(chargeGroup, { chargeEnabled: true })).toBe(false);

      const keys = chargeGroup.fieldGroup!.map((f) => f.key);
      expect(keys).toEqual(['isSettleCharges', 'localChgCustPayTotalAmt', 'foreignChgCustPayTotalAmt', 'localPayVatTotalAmt', 'chargeAccountNo', 'currency']);
    });

    it('is entirely absent when config.charge is falsy', () => {
      const fields = buildTailFields(baseConfig({ liability: { kind: 'IPLC_MATURITY' } }), currencyOptions);
      expect(findField(fields, 'chargeEnabled')).toBeUndefined();
      expect(findField(fields, 'charge')).toBeUndefined();
    });
  });

  it('liability fields come before charge fields when both are configured', () => {
    const config = baseConfig({ liability: { kind: 'IPLC_MATURITY' }, charge: true });
    const fields = buildTailFields(config, currencyOptions);
    const keys = fields.map((f) => f.key);
    expect(keys).toEqual(['liabilityEnabled', 'liability', 'chargeEnabled', 'charge']);
  });
});
