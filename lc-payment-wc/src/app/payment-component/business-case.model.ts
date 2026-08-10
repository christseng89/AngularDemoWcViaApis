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

  /**
   * Debit Legs Component Bridge Flag (reviewer-confirmed, 2026-08-09; renamed from chargeBridge
   * 2026-08-10 — see lc-payment-wc/CLAUDE.md's dated entry) — true when the Payment Component is
   * being used purely as a funding/settlement bridge to one or more SEPARATE upstream components
   * (see lc-payment-wc/CLAUDE.md, "Charge Component <-> Payment Component boundary"), not to post
   * the final credit legs itself. Originally scoped to just a Charge Component; generalized
   * 2026-08-10 because the same mechanism equally fits a **Customer IBL Payment** (Import Bill
   * Loan funding under a Buyer's Usance LC — a Loan Component concept, distinct from the existing
   * `balanceModule:'IBL'` "Import Bill Liability" tag on SuspenseEntry), or a mix of both sources
   * in one instruction — neither the Charge Component's nor the Loan Component's own books are
   * modeled in this repo. When true:
   *   - business-case-runner.component.ts's `creditLegsRequired` getter reads straight off this
   *     flag (not off `legs`' shape) and hides the Credit Legs <app-leg-allocator> entirely — the
   *     Payment Component never generates the detailed credit postings (Margin, Commission,
   *     Charge 1, Charge 2, IBL, etc.); the separate upstream component(s) consume the Suspense
   *     amount this component posts and generate those themselves.
   *   - `legs` must contain ONLY DEBIT entries (business-case-registry.spec.ts's data invariants
   *     enforce this) — the Debit side (Customer A/C) can still be split across multiple
   *     accounts/currencies via the existing leg-allocator UI, same as any other case; there is
   *     simply no Credit side at all.
   *   - The entire credit side is expected to come from the Suspense Credit bridge
   *     (`suspenseBridge.creditEntries`, itself already multi-entry/multi-currency capable via
   *     <app-suspense-entries>), never a directly-submitted real credit leg.
   *   - business-case-request.ts's `buildConfirmRequest` sends `debitLegsComponentBridge: true`
   *     on the wire (payment-component.types.ts) — the microservice's own zod schema
   *     (validation/requestSchema.ts) relaxes its `creditLegs` minItems:1 rule only when this
   *     flag is true AND `suspenseBridge.creditEntries` is non-empty; otherwise `creditLegs: []`
   *     is a 400, same as any other case.
   *   - Transaction Amount (business-case-runner.component.ts's `baseTotalAmount` getter) is
   *     PROTECTED (read-only in the UI) and derived directly as Σ(Suspense Credit entries' Trx
   *     Ccy Equivalent) — not the usual "registry base ± Suspense adjustment" — matching the
   *     balance principle "Total Debit Legs = Total Suspense Credit" (business-requirement-
   *     confirmed 2026-08-09).
   *   - Suspense Debit is not applicable in this mode and is hidden from the UI entirely
   *     (business-case-runner.component.html) — `suspenseDebitEntries` stays permanently `[]`
   *     for a debitLegsBridge case.
   *   - Suspense Credit entries are entered manually in the Simulator (no live Charge Component
   *     or Loan Component to call yet) as a stand-in for the production flow, where they would be
   *     defaulted automatically from that component's own result.
   * Undefined/false for every other case — unaffected, same behavior as before this flag existed.
   */
  debitLegsBridge?: boolean;

  legs: LegSpec[];

  // N_A only:
  moduleStats?: string;
}

export interface ModuleGroup {
  module: OriginModule;
  moduleLabel: string;
  cases: BusinessCaseConfig[];
}
