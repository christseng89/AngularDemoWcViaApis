import type { FormlyFieldConfig } from '@ngx-formly/core';
import type { BusinessCaseConfig, LiabilitySpec } from './business-case.model';
import type { CurrencyOption } from './currency.service';

/** Same pattern as the OAS's MonetaryAmount / microservices/payment-component/src/money.ts's MONETARY_AMOUNT_PATTERN — catches a malformed amount client-side instead of only surfacing as a 400 from the microservice. */
const MONEY_PATTERN = /^-?\d{1,18}(\.\d{1,3})?$/;
const moneyProps = (label: string, required = true) => ({
  label,
  required,
  pattern: MONEY_PATTERN,
  validation: { messages: { pattern: 'Must be a decimal amount, e.g. 1000 or 1000.50' } },
});

/**
 * Every 'Currency' field in this file resolves its options from the "Get
 * Currency API" (currency.service.ts) rather than a hardcoded list. Takes a
 * plain resolved array, not an Observable — business-case-runner.component
 * resolves CurrencyService.options() once and rebuilds fields when it
 * arrives, rather than handing Formly's props.options an Observable
 * directly: that broke expression re-evaluation for the whole enclosing
 * fieldGroup (confirmed live — see business-case-runner.component's doc
 * comment on `currencyOptions`).
 */
function currencyField(currencyOptions: CurrencyOption[]): FormlyFieldConfig {
  return {
    key: 'currency',
    type: 'select',
    defaultValue: 'USD',
    props: { label: 'Currency', required: true, options: currencyOptions },
  };
}

function headerFields(config: BusinessCaseConfig): FormlyFieldConfig[] {
  const fields: FormlyFieldConfig[] = [
    {
      fieldGroupClassName: 'row',
      fieldGroup: [
        { key: 'unitCode', type: 'input', className: 'col-4', defaultValue: 'HQ', props: { label: 'Unit Code', required: true } },
        {
          key: 'mainRef',
          type: 'input',
          className: 'col-4',
          defaultValue: `${config.module}-${config.id}-0001`,
          props: { label: 'Main Ref', required: true },
        },
        { key: 'sequence', type: 'input', className: 'col-4', defaultValue: 1, props: { label: 'Sequence', type: 'number', required: true } },
      ],
    },
  ];
  if (config.dualPrefixOptions) {
    fields.push({
      key: 'voucherPrefix',
      type: 'select',
      defaultValue: config.dualPrefixOptions[0].value,
      props: {
        label: 'Voucher Prefix (source has two unresolved candidates for this function — pick one)',
        options: config.dualPrefixOptions,
        required: true,
        description: `See ${config.citation} — the FSD records two possible prefixes without stating the selecting condition.`,
      },
    });
  }
  return fields;
}

function liabilityFieldsByKind(kind: LiabilitySpec['kind'], currencyOptions: CurrencyOption[]): FormlyFieldConfig[] {
  switch (kind) {
    case 'IPLC_PAY_ACCEPT':
      return [
        { key: 'stlAmt', type: 'input', props: moneyProps('STL_AMT (Settlement Amount)') },
        { key: 'acptAmt', type: 'input', props: moneyProps('ACPT_AMT (Acceptance Amount, optional)', false) },
        { key: 'sdaFlagIsSight', type: 'checkbox', props: { label: 'SDA_FLAG = Sight' } },
        { key: 'assetAcno', type: 'input', props: { label: 'Asset A/C No', required: true } },
        { key: 'liabAcno', type: 'input', props: { label: 'Liability A/C No', required: true } },
        { key: 'tempAssetAcno', type: 'input', props: { label: 'Temp Asset A/C No (needed if ACPT_AMT > 0 and Sight)' } },
        { key: 'tempLiabAcno', type: 'input', props: { label: 'Temp Liability A/C No (needed if ACPT_AMT > 0 and Sight)' } },
        currencyField(currencyOptions),
      ];
    case 'IPLC_MATURITY':
      return [
        { key: 'stlAmt', type: 'input', props: moneyProps('STL_AMT (Settlement Amount)') },
        { key: 'assetAcno', type: 'input', props: { label: 'Asset A/C No', required: true } },
        { key: 'liabAcno', type: 'input', props: { label: 'Liability A/C No', required: true } },
        currencyField(currencyOptions),
      ];
    case 'EPLC':
      return [
        { key: 'stlAmt', type: 'input', props: moneyProps('STL_AMT (Settlement Amount)') },
        { key: 'assetAcno', type: 'input', props: { label: 'Asset A/C No', required: true } },
        { key: 'liabAcno', type: 'input', props: { label: 'Liability A/C No', required: true } },
        currencyField(currencyOptions),
        {
          key: 'replicateEplcVoucherDescDefect',
          type: 'checkbox',
          defaultValue: false,
          props: {
            label: 'Replicate the EPLC .valuee typo defect (TrxSys.js:5908) — credit-leg description left unset',
            description: 'Off by default (= correct behavior). Only enable for byte-for-byte legacy parity.',
          },
        },
      ];
    case 'IMCO_SETTLEMENT_DA':
      return [
        { key: 'billAmtFmDrwe', type: 'input', props: moneyProps('BILL_AMT_FM_DRWE') },
        { key: 'assetAcno', type: 'input', props: { label: 'Asset A/C No', required: true } },
        { key: 'liabAcno', type: 'input', props: { label: 'Liability A/C No', required: true } },
        currencyField(currencyOptions),
      ];
    case 'GTEE':
      return [
        { key: 'clmTrxCcyAmt', type: 'input', props: moneyProps('CLM_TRX_CCY_AMT (Claim Amount)') },
        { key: 'assetAcno', type: 'input', props: { label: 'Asset A/C No', required: true } },
        { key: 'liabAcno', type: 'input', props: { label: 'Liability A/C No', required: true } },
        currencyField(currencyOptions),
      ];
    case 'IWGT':
      return [
        { key: 'clmTrxCcyAmt', type: 'input', props: moneyProps('CLM_TRX_CCY_AMT (Claim Amount)') },
        { key: 'assetAcno', type: 'input', props: { label: 'Asset A/C No', required: true } },
        { key: 'liabAcno', type: 'input', props: { label: 'Liability A/C No', required: true } },
        currencyField(currencyOptions),
        {
          key: 'methodOfIssuance',
          type: 'select',
          defaultValue: 'Issue',
          props: {
            label: 'MTHD_OF_ISS',
            options: [
              { label: 'Issue', value: 'Issue' },
              { label: 'Advice', value: 'Advice' },
            ],
            required: true,
            description: 'Liability entries are only produced when this is "Issue" — try "Advice" to see the panel return 0 entries.',
          },
        },
      ];
  }
}

function chargeFieldConfigs(currencyOptions: CurrencyOption[]): FormlyFieldConfig[] {
  return [
    { key: 'isSettleCharges', type: 'checkbox', defaultValue: false, props: { label: 'isSettleCharges (SYS_ORG_FUNCTION_NAME indexOf "_SettleCharges" > -1)' } },
    { key: 'localChgCustPayTotalAmt', type: 'input', defaultValue: '0', props: moneyProps('Local Charge Cust Pay Total Amt') },
    { key: 'foreignChgCustPayTotalAmt', type: 'input', defaultValue: '0', props: moneyProps('Foreign Charge Cust Pay Total Amt') },
    { key: 'localPayVatTotalAmt', type: 'input', defaultValue: '0', props: moneyProps('Local Pay VAT Total Amt') },
    { key: 'chargeAccountNo', type: 'input', props: { label: 'Charge Debit A/C No (blank = chargeDebitAmount forced to 0)' } },
    currencyField(currencyOptions),
  ];
}

function liabilityFields(config: BusinessCaseConfig, currencyOptions: CurrencyOption[]): FormlyFieldConfig[] {
  if (!config.liability) return [];
  return [
    {
      key: 'liabilityEnabled',
      type: 'checkbox',
      defaultValue: false,
      props: { label: 'Include Liability Voucher context (§6.3)' },
    },
    {
      key: 'liability',
      fieldGroup: liabilityFieldsByKind(config.liability.kind, currencyOptions),
      expressions: { hide: (field) => !field.model?.liabilityEnabled },
    },
  ];
}

function chargeFields(config: BusinessCaseConfig, currencyOptions: CurrencyOption[]): FormlyFieldConfig[] {
  if (!config.charge) return [];
  return [
    { key: 'chargeEnabled', type: 'checkbox', defaultValue: false, props: { label: 'Include Charge Voucher context (§6.2)' } },
    { key: 'charge', fieldGroup: chargeFieldConfigs(currencyOptions), expressions: { hide: (field) => !field.model?.chargeEnabled } },
  ];
}

/**
 * Formly fields for a business case's non-leg inputs, split into two slices
 * so the two <app-leg-allocator> grids (percentage/amount/currency split —
 * see business-case-runner.component) can render between them: header first,
 * then Debit/Credit legs, then Liability/Charge Voucher context. Both slices
 * bind to the same shared model/form. GAP cases (RPFM) only ever hit
 * /payment-instructions/classify, which takes just the two leg arrays — no
 * header/liability/charge fields apply, so both return [].
 *
 * currencyOptions is threaded in from business-case-runner.component (which
 * holds the CurrencyService) rather than fetched here — this module stays a
 * pure config builder, no Angular DI of its own.
 */
export function buildHeaderFields(config: BusinessCaseConfig): FormlyFieldConfig[] {
  return config.verdict === 'PASS' ? headerFields(config) : [];
}

export function buildTailFields(config: BusinessCaseConfig, currencyOptions: CurrencyOption[]): FormlyFieldConfig[] {
  return config.verdict === 'PASS' ? [...liabilityFields(config, currencyOptions), ...chargeFields(config, currencyOptions)] : [];
}
