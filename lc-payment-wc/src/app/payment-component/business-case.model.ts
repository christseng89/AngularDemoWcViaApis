import type { AccountType, OriginModule } from './payment-component.types';

export type Verdict = 'PASS' | 'GAP' | 'N_A';

/** One fixed leg slot in a business case's scenario. Sized to the FSD's own worked example for that function — not a dynamic add/remove repeater (see business-case-registry.ts header comment for why). */
export interface LegSpec {
  side: 'DEBIT' | 'CREDIT';
  label: string;
  defaultAccountNo: string;
  defaultAccountType: AccountType;
  accountTypeOptions: AccountType[];
  /** RTGS routing flag default — only meaningful when defaultAccountType is 'NOSTRO'; used by the RPFM cases only (v1.3.0 — see payment-component.types.ts). */
  defaultRtgsIndicator?: boolean;
  defaultCurrency: string;
  defaultAmountTxCcy: string;
}

/**
 * The 6 real LiabilityVoucherContext shapes (accountEntries.ts). Each `kind`
 * maps to one fixed Formly field set (business-case-fields.ts) and one fixed
 * mapper (business-case-request.ts) — written once per kind, not per function.
 */
export type LiabilitySpec =
  | { kind: 'IPLC_PAY_ACCEPT'; sourceFunctionCode: 'PayAccept' | 'PayAcceptWithDiscount' }
  | { kind: 'IPLC_MATURITY' }
  | { kind: 'EPLC'; sourceFunctionCode: 'PayAccept' | 'PayAtMaturity' }
  | { kind: 'IMCO_SETTLEMENT_DA' }
  | { kind: 'GTEE' }
  | { kind: 'IWGT' };

export interface BusinessCaseConfig {
  id: string;
  module: OriginModule;
  functionLabel: string;
  verdict: Verdict;
  /** Shown in the UI for traceability — always a file:line or file citation from the verified source research. */
  citation: string;
  /** One-line plain-English note shown under the citation (why PASS/GAP/N_A). */
  note: string;

  // PASS only:
  sourceFunctionCode?: string;
  /** Set only for the two FSD rows with an unresolved dual prefix (EPLC PayAccept, EXCO SettlementAtMaturity) — offered as a user-facing radio instead of guessing. */
  dualPrefixOptions?: { label: string; value: string }[];

  legs: LegSpec[];
  liability?: LiabilitySpec;
  /** Charge Voucher context has one shape for every module (ChargeVoucherContext) — offering it is just a boolean. */
  charge?: boolean;

  // N_A only:
  moduleStats?: string;
}

export interface ModuleGroup {
  module: OriginModule;
  moduleLabel: string;
  cases: BusinessCaseConfig[];
}
