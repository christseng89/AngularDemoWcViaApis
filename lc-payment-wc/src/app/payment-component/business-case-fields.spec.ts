import type { FormlyFieldConfig } from '@ngx-formly/core';
import { buildHeaderFields } from './business-case-fields';
import type { BusinessCaseConfig } from './business-case.model';

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
