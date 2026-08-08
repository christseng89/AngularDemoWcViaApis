import type { FormlyFieldConfig } from '@ngx-formly/core';
import type { BusinessCaseConfig } from './business-case.model';

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

/**
 * Formly fields for a business case's non-leg inputs. GAP cases (RPFM) only
 * ever hit /payment-instructions/classify, which takes just the two leg
 * arrays — no header fields apply, so this returns [].
 *
 * v1.6.0: this file previously also built a second slice of "tail" fields —
 * the checkbox-gated "Include Liability Voucher context (§6.3)" / "Include
 * Charge Voucher context (§6.2)" panels, driven by
 * BusinessCaseConfig.liability/.charge — feeding a second <formly-form> in
 * business-case-runner.component.html. Removed along with the microservice's
 * own §6.2/§6.3 generation: a Balance/Charge Component that needs to bridge
 * a leg through Suspense now tags the relevant <app-suspense-entries> row
 * (Charge/Liability dropdown, suspense-entries.component.ts) instead of
 * filling in a separate context panel.
 */
export function buildHeaderFields(config: BusinessCaseConfig): FormlyFieldConfig[] {
  return config.verdict === 'PASS' ? headerFields(config) : [];
}
