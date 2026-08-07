/**
 * All simulated Payment Component business cases, per the verified findings in
 * analysis/COMMON-PaymentComponent-Cross-Reference.md,
 * microservices/payment-component/src/domain/voucherDescription.ts
 * (VOUCHER_CODE_PREFIXES — the authoritative source for the 15 PASS entries'
 * sourceFunctionCode/prefix), and the source-verification research pass run
 * for RPFM/CFNC/SBLC/REIM/PYMT_IMLCPayment during this simulator's build.
 *
 * Leg defaults are fixed (not a dynamic add/remove repeater — see the plan);
 * where a citation names a specific FSD/regression-verified scenario, the
 * default reproduces it exactly (noted per case). Elsewhere, defaults are an
 * illustrative BA-judgment starting point, not a verbatim FSD scenario — every
 * accountType is editable, which is the actual point (flip it, watch
 * paymentComponentRelated change live).
 */
import type { BusinessCaseConfig, ModuleGroup } from './business-case.model';
import type { AccountType } from './payment-component.types';

const STANDARD_ACCOUNT_TYPES: AccountType[] = ['CUSTOMER', 'NOSTRO', 'VOSTRO', 'SUSPENSE', 'INTERNAL'];

function leg(
  side: 'DEBIT' | 'CREDIT',
  accountType: AccountType,
  accountNo: string,
  currency: string,
  amountTxCcy: string,
  rtgsIndicator = false,
) {
  return {
    side,
    label: side === 'DEBIT' ? 'Debit' : 'Credit',
    defaultAccountNo: accountNo,
    defaultAccountType: accountType,
    accountTypeOptions: STANDARD_ACCOUNT_TYPES,
    defaultRtgsIndicator: rtgsIndicator,
    defaultCurrency: currency,
    defaultAmountTxCcy: amountTxCcy,
  };
}

/** RTGS-routed Nostro leg — accountType is 'NOSTRO' with rtgsIndicator defaulted true (v1.3.0: RTGS is a flag on NOSTRO, not its own AccountType — see payment-component.types.ts). */
function rtgsLeg(side: 'DEBIT' | 'CREDIT', accountNo: string, currency: string, amountTxCcy: string) {
  return leg(side, 'NOSTRO', accountNo, currency, amountTxCcy, true);
}

// ---------------------------------------------------------------------------
// 15 PASS — confirmed Payment Component users, full flow (live dry-run preview + Confirm)
// ---------------------------------------------------------------------------

const PASS_CASES: BusinessCaseConfig[] = [
  {
    id: 'iplc-pay-accept',
    module: 'IPLC',
    functionLabel: 'Pay/Accept',
    verdict: 'PASS',
    citation: 'SYF_IPLC_IPLC_PayAccept.js:23 (ConfirmBusinessCall) → SYF_IPLC_CAL_PAYMENT_AC_DESC():193',
    note: 'Calls the Payment Component voucher-description routine directly inside ConfirmBusinessCall.',
    sourceFunctionCode: 'PayAccept',
    legs: [leg('DEBIT', 'CUSTOMER', 'CUST-ACC', 'USD', '10000'), leg('CREDIT', 'NOSTRO', 'NOSTRO-ACC', 'USD', '10000')],
    liability: { kind: 'IPLC_PAY_ACCEPT', sourceFunctionCode: 'PayAccept' },
    charge: true,
  },
  {
    id: 'iplc-pay-accept-discount',
    module: 'IPLC',
    functionLabel: 'Pay/Accept With Discount',
    verdict: 'PASS',
    citation: 'SYF_IPLC_IPLC_PayAcceptWithDiscount.js:23 → SYF_IPLC_CAL_PAYMENT_AC_DESC():224',
    note: 'Default legs reproduce test/regression.ts §13.1 scenario 2 (DISCNT_FLG=YES, STL_FLG≠By Loan) exactly.',
    sourceFunctionCode: 'PayAcceptWithDiscount',
    legs: [leg('DEBIT', 'CUSTOMER', 'CUST-ACC', 'EUR', '100'), leg('CREDIT', 'INTERNAL', 'INTERNAL-ACC', 'EUR', '100')],
    liability: { kind: 'IPLC_PAY_ACCEPT', sourceFunctionCode: 'PayAcceptWithDiscount' },
    charge: true,
  },
  {
    id: 'iplc-payment-at-maturity',
    module: 'IPLC',
    functionLabel: 'Payment at Maturity',
    verdict: 'PASS',
    citation: 'SYF_IPLC_IPLC_PaymentAtMaturity.js:20 → SYF_IPLC_CAL_PAYMENT_AC_DESC():137',
    note: 'Default legs reproduce regression scenario 3 (STL_FLG≠By Loan default) — expected false; flip Cr to NOSTRO/VOSTRO to see it flip true.',
    sourceFunctionCode: 'PaymentAtMaturity',
    legs: [leg('DEBIT', 'CUSTOMER', 'CUST-ACC', 'EUR', '100'), leg('CREDIT', 'CUSTOMER', 'CUST-ACC-2', 'EUR', '100')],
    liability: { kind: 'IPLC_MATURITY' },
    charge: true,
  },
  {
    id: 'eplc-pay-accept',
    module: 'EPLC',
    functionLabel: 'Pay/Accept',
    verdict: 'PASS',
    citation: 'SYF_EPLC_EPLC_PayAccept.js:19 → SYF_EPLC_CAL_PAYMENT_AC_DESC() (function-specific)',
    note: 'FSD-documented unresolved dual prefix (EPLC07 discount leg / EPLC03 sight leg) — pick one below; source does not state the selecting condition.',
    dualPrefixOptions: [
      { label: 'EPLC07NULLNULLNULL (discount leg)', value: 'EPLC07NULLNULLNULL' },
      { label: 'EPLC03NULLNULLNULL (sight leg)', value: 'EPLC03NULLNULLNULL' },
    ],
    legs: [leg('DEBIT', 'NOSTRO', 'NOSTRO-ACC', 'USD', '5000'), leg('CREDIT', 'CUSTOMER', 'CUST-ACC', 'USD', '5000')],
    liability: { kind: 'EPLC', sourceFunctionCode: 'PayAccept' },
    charge: true,
  },
  {
    id: 'eplc-pay-at-maturity',
    module: 'EPLC',
    functionLabel: 'Pay at Maturity',
    verdict: 'PASS',
    citation: 'SYF_EPLC_EPLC_PayAtMaturity.js:16 → SYF_EPLC_CAL_PAYMENT_AC_DESC():319',
    note: 'Calls the Payment Component voucher-description routine directly inside ConfirmBusinessCall.',
    sourceFunctionCode: 'PayAtMaturity',
    legs: [leg('DEBIT', 'NOSTRO', 'NOSTRO-ACC', 'USD', '5000'), leg('CREDIT', 'CUSTOMER', 'CUST-ACC', 'USD', '5000')],
    liability: { kind: 'EPLC', sourceFunctionCode: 'PayAtMaturity' },
    charge: true,
  },
  {
    id: 'eplc-discount',
    module: 'EPLC',
    functionLabel: 'Discount',
    verdict: 'PASS',
    citation: 'SYF_EPLC_EPLC_Discount.js:48 → SYF_EPLC_CAL_PAYMENT_AC_DESC():265',
    note: 'No Liability Voucher for this function — accountEntries.ts explicitly excludes Discount from the EPLC liability set.',
    sourceFunctionCode: 'Discount',
    legs: [leg('DEBIT', 'CUSTOMER', 'CUST-ACC', 'USD', '4800'), leg('CREDIT', 'NOSTRO', 'NOSTRO-ACC', 'USD', '4800')],
    charge: true,
  },
  {
    id: 'exco-payment',
    module: 'EXCO',
    functionLabel: 'Payment',
    verdict: 'PASS',
    citation: 'SYF_EXCO_EXCO_Payment.js:43 → SYF_EXCO_CAL_PAYMENT_AC_DESC():302',
    note: 'Default legs are the exact values verified end-to-end in test/regression.ts\'s HTTP smoke test.',
    sourceFunctionCode: 'Payment',
    legs: [leg('DEBIT', 'NOSTRO', 'NOSTRO-ACC', 'EUR', '100.00'), leg('CREDIT', 'CUSTOMER', 'CUST-ACC', 'EUR', '100.00')],
    charge: true,
  },
  {
    id: 'exco-discount',
    module: 'EXCO',
    functionLabel: 'Discount',
    verdict: 'PASS',
    citation: 'SYF_EXCO_EXCO_Discount.js:30 → SYF_EXCO_CAL_PAYMENT_AC_DESC():224',
    note: 'EXCO never produces a Liability Voucher entry (§6.3.6 — confirmed by absence in source).',
    sourceFunctionCode: 'Discount',
    legs: [leg('DEBIT', 'CUSTOMER', 'CUST-ACC', 'EUR', '4800'), leg('CREDIT', 'NOSTRO', 'NOSTRO-ACC', 'EUR', '4800')],
    charge: true,
  },
  {
    id: 'exco-process400',
    module: 'EXCO',
    functionLabel: 'Process 400 (Amendment/Protest Processing)',
    verdict: 'PASS',
    citation: 'SYF_EXCO_EXCO_Process400.js:237 → SYF_EXCO_CAL_PAYMENT_AC_DESC():129',
    note: 'EXCO never produces a Liability Voucher entry (§6.3.6).',
    sourceFunctionCode: 'Process400',
    legs: [leg('DEBIT', 'NOSTRO', 'NOSTRO-ACC', 'EUR', '100'), leg('CREDIT', 'CUSTOMER', 'CUST-ACC', 'EUR', '100')],
    charge: true,
  },
  {
    id: 'exco-settlement-at-maturity',
    module: 'EXCO',
    functionLabel: 'Settlement at Maturity',
    verdict: 'PASS',
    citation: 'SYF_EXCO_EXCO_SettlementAtMaturity.js:52 → SYF_EXCO_CAL_PAYMENT_AC_DESC():329',
    note: 'FSD-documented unresolved dual prefix (EXCO06 usance leg / EXCO01 sight leg) — pick one below. EXCO never produces a Liability Voucher entry.',
    dualPrefixOptions: [
      { label: 'EXCO06NULLNULLNULL (usance leg)', value: 'EXCO06NULLNULLNULL' },
      { label: 'EXCO01NULLNULLNULL (sight leg)', value: 'EXCO01NULLNULLNULL' },
    ],
    legs: [leg('DEBIT', 'NOSTRO', 'NOSTRO-ACC', 'EUR', '100'), leg('CREDIT', 'CUSTOMER', 'CUST-ACC', 'EUR', '100')],
    charge: true,
  },
  {
    id: 'imco-pre-payment',
    module: 'IMCO',
    functionLabel: 'Pre-Payment',
    verdict: 'PASS',
    citation: 'SYF_IMCO_PrePayment.js:184 → SYM_IMCO_SetPaymentVchDesc() (module-common, SYM_IMCO.js:1644-1674)',
    note: 'Correctly produces no Liability Voucher (IMCO Pre-Payment/Payment D/P are liability-free per source).',
    sourceFunctionCode: 'PrePayment',
    legs: [leg('DEBIT', 'CUSTOMER', 'CUST-ACC', 'USD', '8000'), leg('CREDIT', 'NOSTRO', 'NOSTRO-ACC', 'USD', '8000')],
    charge: true,
  },
  {
    id: 'imco-payment-dp',
    module: 'IMCO',
    functionLabel: 'Payment D/P',
    verdict: 'PASS',
    citation: 'SYF_IMCO_PaymentDP.js:187 → SYM_IMCO_SetPaymentVchDesc() (module-common)',
    note: 'Correctly produces no Liability Voucher.',
    sourceFunctionCode: 'PaymentDP',
    legs: [leg('DEBIT', 'CUSTOMER', 'CUST-ACC', 'USD', '8000'), leg('CREDIT', 'NOSTRO', 'NOSTRO-ACC', 'USD', '8000')],
    charge: true,
  },
  {
    id: 'imco-settlement-da',
    module: 'IMCO',
    functionLabel: 'Settlement D/A',
    verdict: 'PASS',
    citation: 'SYF_IMCO_SettlementDA.js:228 → SYM_IMCO_SetPaymentVchDesc() (module-common)',
    note: 'The one IMCO function with a Liability Voucher (§6.3.3).',
    sourceFunctionCode: 'SettlementDA',
    legs: [leg('DEBIT', 'CUSTOMER', 'CUST-ACC', 'USD', '8000'), leg('CREDIT', 'NOSTRO', 'NOSTRO-ACC', 'USD', '8000')],
    liability: { kind: 'IMCO_SETTLEMENT_DA' },
    charge: true,
  },
  {
    id: 'gtee-outward-claim-settlement',
    module: 'GTEE',
    functionLabel: 'Outward Claim Settlement',
    verdict: 'PASS',
    citation: 'SYF_GTEE_OutwardClaimSettlement.js:43 → SYM_GTEE_CAL_PAYMENT_AC_DESC() (module-common, SYM_GTEE.js:518-547)',
    note: 'Only 1 of ~55 non-CE GTEE Confirm functions touches PaymentDebit/PaymentCredit — this is it.',
    sourceFunctionCode: 'OutwardClaimSettlement',
    legs: [leg('DEBIT', 'NOSTRO', 'NOSTRO-ACC', 'USD', '20000'), leg('CREDIT', 'VOSTRO', 'VOSTRO-ACC', 'USD', '20000')],
    liability: { kind: 'GTEE' },
    charge: true,
  },
  {
    id: 'iwgt-settle-inward-claim',
    module: 'IWGT',
    functionLabel: 'Settle Inward Claim',
    verdict: 'PASS',
    citation: 'SYF_IWGT_SettleInwClaim.js:49 → SYM_IWGT_CAL_PAYMENT_AC_DESC() (module-common, SYM_IWGT.js:424-453)',
    note: 'Liability entries only generated when MTHD_OF_ISS = "Issue" — try "Advice" to see the panel return 0 entries.',
    sourceFunctionCode: 'SettleInwardClaim',
    legs: [leg('DEBIT', 'VOSTRO', 'VOSTRO-ACC', 'USD', '15000'), leg('CREDIT', 'CUSTOMER', 'CUST-ACC', 'USD', '15000')],
    liability: { kind: 'IWGT' },
    charge: true,
  },
];

// ---------------------------------------------------------------------------
// 4 GAP — RPFM: legs populated in source (incl. RTGS, modeled here as
// accountType='NOSTRO' + rtgsIndicator — v1.3.0, see payment-component.types.ts),
// but no voucher-assembly routine exists (no RPFM##NULLNULLNULL pattern
// anywhere) — classify-only preview. Fixing the RTGS classification treatment
// doesn't change this verdict: it's about a missing voucher-assembly routine,
// unrelated to how RTGS classifies.
//
// Default legs below reflect the real business events per domain-expert
// clarification (2026-08-07), not a source-line trace — the non-Nostro side
// of each event is a sub-ledger account (loan/participation accounting)
// booked out in a different business component than Payment Component, so it
// classifies as SUSPENSE or INTERNAL (either is equivalent here: neither
// participates in any Dr/Cr XOR term). INTERNAL is used below as the more
// specific of the two (a persistent asset/liability/income ledger account,
// not a transient clearing account) — a judgment call, not itself business-
// confirmed, but classification-wise indistinguishable from SUSPENSE.
//
// "No Payment Component voucher call" (the shared GAP-verdict basis for all
// 4, cited per function below) is NOT the same claim as "this event isn't
// posted anywhere in the real system" — a follow-up VCH-template trace
// (2026-08-07, see analysis/RPFM-PaymentComponent-Gap-Analysis.md) found
// Process Grantor's event IS fully posted today, just via RPFM's own real
// (non-Payment-Component) VCH auto-gen mechanism — while Repay Grantor,
// Process Participant, and Settle Participant appear to have NO posting
// mechanism at all for the funded/real-world case. Noted per case below.
// ---------------------------------------------------------------------------

const GAP_CASES: BusinessCaseConfig[] = [
  {
    id: 'rpfm-process-grantor',
    module: 'RPFM',
    functionLabel: 'Process Grantor',
    verdict: 'GAP',
    citation: 'SYF_RPFM_ProcessGrantor.js — ConfirmBusinessCall:11-49 calls no Payment/voucher routine of any kind',
    note: 'Legs populated by SYF_RPFM_set_chg_fee_to_PAYMENT_CREDIT/_DEBIT (355-535, incl. RTGS at 419/456) at screen-lifecycle time — never inside ConfirmBusinessCall. Business event: Grantor receives Participant funds — Dr Nostro (GL 12011101) / Cr liability GL 23611301 ("Participant Funding Payable"). GAP is Payment-Component-specific only — this event IS fully posted today via vch_F05030704057.js -> RPFM_ReceivingParticipationFund.xml, a real, working, non-Payment-Component mechanism.',
    legs: [rtgsLeg('DEBIT', 'RTGS-ACC', 'IDR', '5000000'), leg('CREDIT', 'INTERNAL', '23611301', 'IDR', '5000000')],
  },
  {
    id: 'rpfm-repay-grantor',
    module: 'RPFM',
    functionLabel: 'Repay Grantor',
    verdict: 'GAP',
    citation: 'SYF_RPFM_RepayGrantor.js — ConfirmBusinessCall:19-50 calls no Payment/voucher routine',
    note: 'Legs populated by SYF_RPFM_set_repayamt_to_PAYMENT_DEBIT/_CREDIT (137-360, incl. RTGS at 326). ConfirmBusinessCheck (361-412) reads CPYT_CR_AC_TYPE for RTGS/SKN validation only — not a voucher call. Two business events, same Dr/Cr shape mirrored: (1, shown below) Grantor receives Borrower repayment — Dr Nostro / Cr Suspense-or-Internal; (2) Grantor pays Participant — Dr Suspense-or-Internal / Cr Nostro. Unlike Process Grantor, vch_F05030704058.js only fires a voucher for an unrelated unfunded/collateral scenario — no template posts either event above for the funded/loan-repayment case; this looks like a genuine posting gap in the baseline, independent of Payment Component.',
    legs: [rtgsLeg('DEBIT', 'RTGS-ACC', 'IDR', '5000000'), leg('CREDIT', 'INTERNAL', 'INTERNAL-ACC', 'IDR', '5000000')],
  },
  {
    id: 'rpfm-process-participant',
    module: 'RPFM',
    functionLabel: 'Process Participant',
    verdict: 'GAP',
    citation: 'SYF_RPFM_ProcessParticipant.js:59 — ConfirmBusinessCall calls generic SYT_CHG_VOUCHER() (charge, not Payment-specific)',
    note: 'Its Payment-leg population code (SYF_RPFM_set_chg_fee_to_PAYMENT_*, 376-481, incl. RTGS at 469) is dead — sole caller SYF_RPFM_loadDoDataComplete is entirely commented out. Business event: Participant remits funds — Dr Suspense-or-Internal / Cr Nostro. vch_F05030704062.js only posts a fixed-GL off-balance-sheet contingent-liability memo plus the fee voucher — no template posts this Dr/Cr pair; looks like a genuine posting gap in the baseline, independent of Payment Component.',
    legs: [leg('DEBIT', 'INTERNAL', 'INTERNAL-ACC', 'IDR', '2000000'), rtgsLeg('CREDIT', 'RTGS-ACC', 'IDR', '2000000')],
  },
  {
    id: 'rpfm-settle-participant',
    module: 'RPFM',
    functionLabel: 'Settle Participant',
    verdict: 'GAP',
    citation: 'SYF_RPFM_SettleParticipant.js:583 — ConfirmBusinessCall calls generic SYT_CHG_VOUCHER() (charge, not Payment-specific)',
    note: 'Legs populated live via LoadDODataOnInit/onchange (283-474, 687-723, incl. RTGS at 325) — never a Payment Component voucher call at Confirm. Two alternate business events, same Dr/Cr shape (only the interest-computation method differs, which this simulator does not model): Participant receives principal + interest (advance method), or Participant receives interest only (arrears method) — both Dr Nostro / Cr Suspense-or-Internal. The one template that could plausibly carry this (RPFM_FincSinglePayment.xml) is commented out in vch_F05030704063.js and malformed even if re-enabled — looks like a genuine posting gap in the baseline, independent of Payment Component.',
    legs: [rtgsLeg('DEBIT', 'RTGS-ACC', 'IDR', '3000000'), leg('CREDIT', 'INTERNAL', 'INTERNAL-ACC', 'IDR', '3000000')],
  },
];

// ---------------------------------------------------------------------------
// 4 N_A — confirmed non-users. One card per module (not per function — the
// verdict/reason is identical across every Confirm function in these modules).
// ---------------------------------------------------------------------------

const NA_CASES: BusinessCaseConfig[] = [
  {
    id: 'cfnc-non-user',
    module: 'CFNC',
    functionLabel: 'All CFNC Confirm Functions',
    verdict: 'N_A',
    citation: 'SYF_CFNC_Overdue.js:32-39 (the only CFNC file that even defines ConfirmBusinessCall)',
    note: 'Strongest non-user of the 4: CFNC never calls any voucher routine at all, not even the generic SYT_CHG_VOUCHER().',
    moduleStats: '8 FUNCLEVEL files checked; only 1 (Overdue) defines ConfirmBusinessCall; 0 call any voucher routine; 0 touch PaymentDebit/PaymentCredit. (SYM_CFNC_Set_AMT_toPaymentDebit() exists but only writes CPYT_*_TTL_AMT_TTLCCY summary fields from DO-screen level, never CPYT_*_AC_TYPE, and is never called from a FUNCLEVEL ConfirmBusinessCall.)',
    legs: [],
  },
  {
    id: 'sblc-non-user',
    module: 'SBLC',
    functionLabel: 'All SBLC Confirm Functions',
    verdict: 'N_A',
    citation: 'e.g. SYF_SBLC_SBLCIssue.js:334-346, SYF_SBLC_SBLC_ProcessClaim.js:295-303',
    note: 'Several SBLC functions call the generic charge-voucher routine, but none touch PaymentDebit/PaymentCredit.',
    moduleStats: '9 Confirm functions checked; 5 (CollectPeriodComm, SBLCIssue, SBLC_Amendment, SBLC_ProcessClaim, SBLC_Update) call the generic SYT_CHG_VOUCHER() charge routine, 4 (AutoRenewal, Auto_Increase, Beneficiary_Reply, SBLC_Register_Claim) call none; 0 touch PaymentDebit/PaymentCredit.',
    legs: [],
  },
  {
    id: 'reim-non-user',
    module: 'REIM',
    functionLabel: 'All REIM Confirm Functions',
    verdict: 'N_A',
    citation: 'e.g. SYF_REIM_SettleClaim.js:183-207, SYF_REIM_ReimbursementAmendment.js:191-239',
    note: 'REIM handles reimbursement-bank correspondence and charges, but never the Payment Component Dr/Cr classification.',
    moduleStats: '17 Confirm functions checked; 9 call the generic SYT_CHG_VOUCHER() charge routine, 8 call none; 0 touch PaymentDebit/PaymentCredit.',
    legs: [],
  },
  {
    id: 'pymt-imlcpayment-non-user',
    module: 'PYMT',
    functionLabel: 'IMLC Payment (PYMT_IMLCPayment)',
    verdict: 'N_A',
    citation: 'PYMT_IMLCPayment ConfirmBusinessCall:136-144',
    note: 'Legacy "pay a documentary presentation" screen — calls only SYF_PYMT_genNewMainRef() + the generic SYT_CHG_VOUCHER(). No account-type classification, no Liability Voucher, no SWIFT trigger.',
    moduleStats: 'Single function verified; 0 touch PaymentDebit/PaymentCredit.',
    legs: [],
  },
];

export const BUSINESS_CASES: BusinessCaseConfig[] = [...PASS_CASES, ...GAP_CASES, ...NA_CASES];

const MODULE_LABELS: Record<string, string> = {
  IPLC: 'IPLC — Import Letter of Credit',
  EPLC: 'EPLC — Export Letter of Credit',
  IMCO: 'IMCO — Import Collection',
  EXCO: 'EXCO — Export Collection',
  GTEE: 'GTEE — Outward Guarantee',
  IWGT: 'IWGT — Inward Guarantee',
  RPFM: 'RPFM — Risk Participation Finance (Partial Integration)',
  CFNC: 'CFNC — Central Finance (Non-User)',
  SBLC: 'SBLC — Standby Letter of Credit (Non-User)',
  REIM: 'REIM — Reimbursement (Non-User)',
  PYMT: 'PYMT — Clean Payment (Non-User)',
};

const MODULE_ORDER = ['IPLC', 'EPLC', 'IMCO', 'EXCO', 'GTEE', 'IWGT', 'RPFM', 'CFNC', 'SBLC', 'REIM', 'PYMT'];

export const MODULE_GROUPS: ModuleGroup[] = MODULE_ORDER.map((module) => ({
  module: module as ModuleGroup['module'],
  moduleLabel: MODULE_LABELS[module],
  cases: BUSINESS_CASES.filter((c) => c.module === module),
}));
