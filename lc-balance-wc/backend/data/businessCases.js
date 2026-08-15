/**
 * Business Case Registry — Import LC Case 1-5 and Export LC Case #1-#5, as
 * worked through against analysis/COMMON-BalanceComponent-Design-zh.md
 * (v0.6) during design review. Each case is a declarative step list; the
 * generic executor in server.js interprets step `type` — no case has its
 * own bespoke code path.
 *
 * Step types:
 *   createMovement — POST /balance-movements. `captureAs` stores the
 *     response body under that key for later steps to reference via
 *     `*Ref` fields (movementIdRef / balanceContractIdRef /
 *     parentLogicalContractIdRef, the latter resolved through a snapshot
 *     call since createMovement's own response doesn't carry
 *     logicalContractId).
 *   release — POST /balance-movements/:id/release, `movementRef` points at
 *     a captured createMovement step.
 *   snapshot — GET /balance-contracts/:id/balance, `contractRef` points at
 *     a captured createMovement step (its balanceContractId).
 *   note — no API call; an informational line in the trace (e.g. EBL/IBL
 *     funding, which is Loan Component's domain, never a Balance Component
 *     call — see Design doc §1).
 *
 * createdBy/releasedBy are fixed demo users ('maker1'/'checker1') — this
 * prototype does not model real user auth (business instruction 2026-08-14:
 * Maker=Checker segregation is a system-authorization concern, out of
 * Balance Component's own scope).
 */

const MAKER = 'maker1';
const CHECKER = 'checker1';

function lcNumberFor(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

// ── Import LC ────────────────────────────────────────────────────────────

function importCase1(lc) {
  return {
    id: 'import-case-1',
    title: 'Import Case 1 — USD Sight',
    description: 'LC Issue 100,000 w/ Tolerance 10% -> Amendment +10,000 -> Document Arrival 50,000 -> Accept Pay 50,000',
    steps: [
      { type: 'createMovement', label: 'LC Issue 100,000, Tolerance 10%', captureAs: 'lc',
        request: { instrumentType: 'IPLC_LC', naturalKey: { lcNumber: lc }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tolerancePct: '10', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      { type: 'createMovement', label: 'LC Amendment increase 10,000', captureAs: 'amend',
        request: { instrumentType: 'IPLC_LC', balanceContractIdRef: 'lc', movementType: 'AMEND_INCREASE', eventSeq: 2, amount: '10000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      { type: 'snapshot', label: 'LC Balance after Issue+Amendment (expect 121,000)', contractRef: 'lc' },
      { type: 'createMovement', label: 'Document Arrival 50,000 (Earmark)', captureAs: 'utilize',
        request: { instrumentType: 'IPLC_LC', balanceContractIdRef: 'lc', movementType: 'UTILIZE', eventSeq: 3, amount: '50000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Accept Pay 50,000 (Sight Honour)', movementRef: 'utilize', releasedBy: CHECKER },
      { type: 'snapshot', label: 'LC Balance after Accept Pay (expect 71,000)', contractRef: 'lc' },
    ],
  };
}

function importCase2(lc, ib) {
  return {
    id: 'import-case-2',
    title: 'Import Case 2 — USD Usance 120 days after sight',
    description: 'LC Issue+Amendment -> Document Arrival 50,000 -> Accept 50,000 (LC Liability -> Acceptance Liability) -> Settlement Due Date',
    steps: [
      { type: 'createMovement', label: 'LC Issue 100,000, Tolerance 10%', captureAs: 'lc',
        request: { instrumentType: 'IPLC_LC', naturalKey: { lcNumber: lc }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tolerancePct: '10', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      { type: 'createMovement', label: 'LC Amendment increase 10,000', captureAs: 'amend',
        request: { instrumentType: 'IPLC_LC', balanceContractIdRef: 'lc', movementType: 'AMEND_INCREASE', eventSeq: 2, amount: '10000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      { type: 'createMovement', label: 'Document Arrival 50,000 (Earmark)', captureAs: 'utilize',
        request: { instrumentType: 'IPLC_LC', balanceContractIdRef: 'lc', movementType: 'UTILIZE', eventSeq: 3, amount: '50000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Accept 50,000 (Usance) — LC Liability -> Acceptance Liability', movementRef: 'utilize', releasedBy: CHECKER },
      { type: 'snapshot', label: 'LC Balance after Accept (expect 71,000)', contractRef: 'lc' },
      { type: 'createMovement', label: 'Create Acceptance 50,000 (carved out of the LC, linked call)', captureAs: 'acceptance',
        request: { instrumentType: 'IPLC_ACCEPTANCE', naturalKey: { lcNumber: lc, ibNumber: ib }, parentLogicalContractIdRef: 'lc', movementType: 'CREATE', eventSeq: 1, amount: '50000', currency: 'USD', exposureNature: 'ACTUAL', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Acceptance CREATE', movementRef: 'acceptance', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance Balance (expect 50,000)', contractRef: 'acceptance' },
      { type: 'createMovement', label: 'Settlement Due Date 50,000 (Cr CA)', captureAs: 'settle',
        request: { instrumentType: 'IPLC_ACCEPTANCE', balanceContractIdRef: 'acceptance', movementType: 'FULL_SETTLE', eventSeq: 2, amount: '50000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Settlement', movementRef: 'settle', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance Balance after Settlement (expect 0)', contractRef: 'acceptance' },
      { type: 'snapshot', label: 'LC Balance, untouched by maturity settlement (expect still 71,000)', contractRef: 'lc' },
    ],
  };
}

function importCase3(lc, sg) {
  return {
    id: 'import-case-3',
    title: 'Import Case 3 — USD Sight + Shipping Guarantee 50,000 + IBL',
    description: 'SG amount exactly matches the arrived documents — no WARNING, and SG can be FULL_REDEEM-ed once documents reconcile.',
    steps: [
      { type: 'createMovement', label: 'LC Issue 100,000, Tolerance 10%', captureAs: 'lc',
        request: { instrumentType: 'IPLC_LC', naturalKey: { lcNumber: lc }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tolerancePct: '10', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      { type: 'createMovement', label: 'LC Amendment increase 10,000', captureAs: 'amend',
        request: { instrumentType: 'IPLC_LC', balanceContractIdRef: 'lc', movementType: 'AMEND_INCREASE', eventSeq: 2, amount: '10000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      { type: 'createMovement', label: 'Shipping Guarantee 50,000', captureAs: 'sg',
        request: { instrumentType: 'SHGT', naturalKey: { lcNumber: lc, sgNumber: sg }, parentLogicalContractIdRef: 'lc', movementType: 'ISSUE', eventSeq: 1, amount: '50000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases SG Issue', movementRef: 'sg', releasedBy: CHECKER },
      { type: 'createMovement', label: 'Document Arrival 50,000 (Earmark, off-balance checked against SG)', captureAs: 'utilize',
        request: { instrumentType: 'IPLC_LC', balanceContractIdRef: 'lc', movementType: 'UTILIZE', eventSeq: 3, amount: '50000', currency: 'USD', createdBy: MAKER } },
      { type: 'note', label: 'Expect NO warning here — Tight Available (71,000) still >= 50,000' },
      { type: 'release', label: 'IBL/Pay 50,000 (120 days)', movementRef: 'utilize', releasedBy: CHECKER },
      { type: 'note', label: 'IBL itself is a Loan Component ASSET — no Balance Component call' },
      { type: 'createMovement', label: 'SG matches arrived documents exactly -> FULL_REDEEM 50,000', captureAs: 'redeem',
        request: { instrumentType: 'SHGT', balanceContractIdRef: 'sg', movementType: 'FULL_REDEEM', eventSeq: 2, amount: '50000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases SG Redemption', movementRef: 'redeem', releasedBy: CHECKER },
      { type: 'snapshot', label: 'LC Balance (expect 71,000)', contractRef: 'lc' },
      { type: 'snapshot', label: 'SG Balance (expect 0)', contractRef: 'sg' },
      { type: 'note', label: 'Settlement Due Date 50,000 — pure Loan Component (IBL maturity), no Balance Component call' },
    ],
  };
}

function importCase4(lc, sg) {
  return {
    id: 'import-case-4',
    title: 'Import Case 4 — USD Sight + Shipping Guarantee 100,000 + IBL (only 50,000 documents arrive)',
    description: 'SG covers the full LC but only half the documents arrive — WARNING fires, and SG can only be PARTIAL_REDEEM-ed.',
    steps: [
      { type: 'createMovement', label: 'LC Issue 100,000, Tolerance 10%', captureAs: 'lc',
        request: { instrumentType: 'IPLC_LC', naturalKey: { lcNumber: lc }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tolerancePct: '10', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      { type: 'createMovement', label: 'LC Amendment increase 10,000', captureAs: 'amend',
        request: { instrumentType: 'IPLC_LC', balanceContractIdRef: 'lc', movementType: 'AMEND_INCREASE', eventSeq: 2, amount: '10000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      { type: 'createMovement', label: 'Shipping Guarantee 100,000 (covers full LC)', captureAs: 'sg',
        request: { instrumentType: 'SHGT', naturalKey: { lcNumber: lc, sgNumber: sg }, parentLogicalContractIdRef: 'lc', movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases SG Issue', movementRef: 'sg', releasedBy: CHECKER },
      { type: 'createMovement', label: 'Document Arrival 50,000 (only half the SG-covered goods)', captureAs: 'utilize',
        request: { instrumentType: 'IPLC_LC', balanceContractIdRef: 'lc', movementType: 'UTILIZE', eventSeq: 3, amount: '50000', currency: 'USD', createdBy: MAKER } },
      { type: 'note', label: 'Expect a WARNING here — Tight Available (21,000) < 50,000, but not an ERROR (LC Available itself is 121,000)' },
      { type: 'release', label: 'IBL/Pay 50,000 (120 days)', movementRef: 'utilize', releasedBy: CHECKER },
      { type: 'createMovement', label: 'SG can only be PARTIAL_REDEEM-ed 50,000 (documents for the other half have not arrived)', captureAs: 'redeem',
        request: { instrumentType: 'SHGT', balanceContractIdRef: 'sg', movementType: 'PARTIAL_REDEEM', eventSeq: 2, amount: '50000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases partial SG Redemption', movementRef: 'redeem', releasedBy: CHECKER },
      { type: 'snapshot', label: 'LC Balance (expect 71,000)', contractRef: 'lc' },
      { type: 'snapshot', label: 'SG Balance (expect 50,000 still outstanding)', contractRef: 'sg' },
      { type: 'note', label: 'Settlement Due Date 50,000 — pure Loan Component (IBL maturity), no Balance Component call' },
    ],
  };
}

function importCase5(lc) {
  return {
    id: 'import-case-5',
    title: 'Import Case 5 — USD Sight, Amendment Decrease 120,000 (expect ERROR)',
    description: 'A face-level decrease that would drive the LC face amount negative — must be rejected, not silently clipped.',
    steps: [
      { type: 'createMovement', label: 'LC Issue 100,000, Tolerance 10%', captureAs: 'lc',
        request: { instrumentType: 'IPLC_LC', naturalKey: { lcNumber: lc }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tolerancePct: '10', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      { type: 'createMovement', label: 'LC Amendment DECREASE 120,000 — expect 409 ERROR', captureAs: 'amendDecrease', expectError: true,
        request: { instrumentType: 'IPLC_LC', balanceContractIdRef: 'lc', movementType: 'AMEND_DECREASE', eventSeq: 2, amount: '120000', currency: 'USD', createdBy: MAKER } },
      { type: 'snapshot', label: 'LC Balance unchanged (expect still 110,000 — the rejected Amendment never applied)', contractRef: 'lc' },
    ],
  };
}

// ── Export LC ────────────────────────────────────────────────────────────
// Business-confirmed 2026-08-14: CONF_LIAB only exists once Confirmed
// (Case #1-#3); Case #4/#5 (Unconfirmed) never create Export Bank's own
// liability — Accepted Amount is tracked as exposureNature=MEMO (no
// accountEntries). Tolerance assumed on a Maximum Exposure Basis
// (bank-policy-dependent, per that same discussion).

function exportCase1(lc) {
  return {
    id: 'export-case-1',
    title: 'Export Case #1 — USD Sight + Confirmed',
    description: 'Confirm LC 100,000+10% -> Amendment +10,000 -> Present Docs 80,000 (no entry) -> Issuing Bank Honour 80,000',
    steps: [
      { type: 'createMovement', label: 'Confirm LC 100,000, Tolerance 10% (Maximum Exposure Basis)', captureAs: 'conf',
        request: { instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: lc }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tolerancePct: '10', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Confirmation Issue', movementRef: 'conf', releasedBy: CHECKER },
      { type: 'createMovement', label: 'LC Amendment increase 10,000', captureAs: 'amend',
        request: { instrumentType: 'EPLC_CONFIRMATION', balanceContractIdRef: 'conf', movementType: 'AMEND', eventSeq: 2, amount: '10000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      { type: 'snapshot', label: 'CONF LIAB after Issue+Amendment (expect 121,000)', contractRef: 'conf' },
      { type: 'createMovement', label: 'Present Docs 80,000 (Earmark — mere presentation, no GL entry yet)', captureAs: 'honour',
        request: { instrumentType: 'EPLC_CONFIRMATION', balanceContractIdRef: 'conf', movementType: 'HONOUR', eventSeq: 3, amount: '80000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Issuing Bank Pay/Honour 80,000', movementRef: 'honour', releasedBy: CHECKER },
      { type: 'snapshot', label: 'CONF LIAB after Honour (expect 41,000)', contractRef: 'conf' },
    ],
  };
}

function exportCase2(lc, ib) {
  return {
    id: 'export-case-2',
    title: 'Export Case #2 — USD Usance + Confirmed + No EBL',
    description: 'CONF LIAB -> Acceptance Liability transformation at Issuing Bank Accept; Settlement Due Date pays via Customer A/C.',
    steps: [
      { type: 'createMovement', label: 'Confirm LC 100,000, Tolerance 10%', captureAs: 'conf',
        request: { instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: lc }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tolerancePct: '10', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Confirmation Issue', movementRef: 'conf', releasedBy: CHECKER },
      { type: 'createMovement', label: 'LC Amendment increase 10,000', captureAs: 'amend',
        request: { instrumentType: 'EPLC_CONFIRMATION', balanceContractIdRef: 'conf', movementType: 'AMEND', eventSeq: 2, amount: '10000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      { type: 'createMovement', label: 'Present Docs 80,000 (Earmark)', captureAs: 'accept',
        request: { instrumentType: 'EPLC_CONFIRMATION', balanceContractIdRef: 'conf', movementType: 'ACCEPT', eventSeq: 3, amount: '80000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Issuing Bank Accept Docs 80,000 -> CONF LIAB releases', movementRef: 'accept', releasedBy: CHECKER },
      { type: 'snapshot', label: 'CONF LIAB after Accept (expect 41,000)', contractRef: 'conf' },
      { type: 'createMovement', label: 'Create Acceptance Liability 80,000 (linked call)', captureAs: 'acceptance',
        request: { instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: lc, ibNumber: ib }, parentLogicalContractIdRef: 'conf', movementType: 'CREATE', eventSeq: 1, amount: '80000', currency: 'USD', exposureNature: 'ACTUAL', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Acceptance CREATE', movementRef: 'acceptance', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance Liability (expect 80,000)', contractRef: 'acceptance' },
      { type: 'createMovement', label: 'Due Date Settlement 80,000 (Cr Customer A/C)', captureAs: 'settle',
        request: { instrumentType: 'EPLC_ACCEPTANCE', balanceContractIdRef: 'acceptance', movementType: 'FULL_SETTLE', eventSeq: 2, amount: '80000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Settlement', movementRef: 'settle', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance Liability after Settlement (expect 0)', contractRef: 'acceptance' },
    ],
  };
}

function exportCase3(lc, ib) {
  return {
    id: 'export-case-3',
    title: 'Export Case #3 — USD Usance + Confirmed + EBL',
    description: 'Same as Case #2, plus early EBL financing (Loan Component ASSET, not a Balance Component liability, not double-counted).',
    steps: [
      { type: 'createMovement', label: 'Confirm LC 100,000, Tolerance 10%', captureAs: 'conf',
        request: { instrumentType: 'EPLC_CONFIRMATION', naturalKey: { lcNumber: lc }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tolerancePct: '10', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Confirmation Issue', movementRef: 'conf', releasedBy: CHECKER },
      { type: 'createMovement', label: 'LC Amendment increase 10,000', captureAs: 'amend',
        request: { instrumentType: 'EPLC_CONFIRMATION', balanceContractIdRef: 'conf', movementType: 'AMEND', eventSeq: 2, amount: '10000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      { type: 'createMovement', label: 'Present Docs 80,000 (Earmark)', captureAs: 'accept',
        request: { instrumentType: 'EPLC_CONFIRMATION', balanceContractIdRef: 'conf', movementType: 'ACCEPT', eventSeq: 3, amount: '80000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Issuing Bank Accept Docs 80,000 -> EBL 80,000', movementRef: 'accept', releasedBy: CHECKER },
      { type: 'snapshot', label: 'CONF LIAB after Accept (expect 41,000)', contractRef: 'conf' },
      { type: 'createMovement', label: 'Create Acceptance Liability 80,000 (linked call)', captureAs: 'acceptance',
        request: { instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: lc, ibNumber: ib }, parentLogicalContractIdRef: 'conf', movementType: 'CREATE', eventSeq: 1, amount: '80000', currency: 'USD', exposureNature: 'ACTUAL', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Acceptance CREATE', movementRef: 'acceptance', releasedBy: CHECKER },
      { type: 'note', label: 'Export Bank finances early via EBL 80,000 — Loan Component ASSET (Dr EBL / Cr Customer A/C), no Balance Component call. NOT to be summed with Acceptance Liability for total credit exposure — see Design doc "Accounting Balance vs Risk Exposure".' },
      { type: 'createMovement', label: 'Due Date Settlement 80,000 (Cr EBL — Issuing Bank repays via Nostro)', captureAs: 'settle',
        request: { instrumentType: 'EPLC_ACCEPTANCE', balanceContractIdRef: 'acceptance', movementType: 'FULL_SETTLE', eventSeq: 2, amount: '80000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Settlement', movementRef: 'settle', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance Liability after Settlement (expect 0)', contractRef: 'acceptance' },
    ],
  };
}

function exportCase4(lc, ib) {
  return {
    id: 'export-case-4',
    title: 'Export Case #4 — USD Usance + Unconfirmed + No EBL',
    description: 'No Confirmation exists -> Issuing Bank Accept produces a MEMO receivable-tracking record only, never Export Bank\'s own liability.',
    steps: [
      { type: 'createMovement', label: 'LC Issue 100,000, Tolerance 10% (reference only — no liability, no Confirmation exists)', captureAs: 'lc',
        request: { instrumentType: 'EPLC_LC', naturalKey: { lcNumber: lc }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tolerancePct: '10', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      { type: 'createMovement', label: 'LC Amendment increase 10,000 (still reference only)', captureAs: 'amend',
        request: { instrumentType: 'EPLC_LC', balanceContractIdRef: 'lc', movementType: 'AMEND_INCREASE', eventSeq: 2, amount: '10000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      { type: 'note', label: 'Present Docs — no Confirmation, no earmark, no Balance Component call at all' },
      { type: 'createMovement', label: 'Issuing Bank Accept 80,000 -> MEMO tracking only (no accountEntries, not Export Bank\'s own liability)', captureAs: 'acceptance',
        request: { instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: lc, ibNumber: ib }, parentLogicalContractIdRef: 'lc', movementType: 'CREATE', eventSeq: 1, amount: '80000', currency: 'USD', exposureNature: 'MEMO', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Acceptance CREATE (MEMO)', movementRef: 'acceptance', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance MEMO tracking (expect 80,000, exposureNature=MEMO)', contractRef: 'acceptance' },
      { type: 'createMovement', label: 'Due Date Settlement 80,000 (Cr Customer A/C) — closes the MEMO tracking entry', captureAs: 'settle',
        request: { instrumentType: 'EPLC_ACCEPTANCE', balanceContractIdRef: 'acceptance', movementType: 'FULL_SETTLE', eventSeq: 2, amount: '80000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Settlement', movementRef: 'settle', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance MEMO after Settlement (expect 0)', contractRef: 'acceptance' },
    ],
  };
}

function exportCase5(lc, ib) {
  return {
    id: 'export-case-5',
    title: 'Export Case #5 — USD Usance + Unconfirmed + EBL',
    description: 'Same as Case #4, plus EBL financing (still Loan Component asset, still no Export Bank CONF LIAB).',
    steps: [
      { type: 'createMovement', label: 'LC Issue 100,000, Tolerance 10% (reference only)', captureAs: 'lc',
        request: { instrumentType: 'EPLC_LC', naturalKey: { lcNumber: lc }, movementType: 'ISSUE', eventSeq: 1, amount: '100000', currency: 'USD', tolerancePct: '10', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      { type: 'createMovement', label: 'LC Amendment increase 10,000 (reference only)', captureAs: 'amend',
        request: { instrumentType: 'EPLC_LC', balanceContractIdRef: 'lc', movementType: 'AMEND_INCREASE', eventSeq: 2, amount: '10000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      { type: 'createMovement', label: 'Issuing Bank Accept 80,000 -> MEMO tracking only', captureAs: 'acceptance',
        request: { instrumentType: 'EPLC_ACCEPTANCE', naturalKey: { lcNumber: lc, ibNumber: ib }, parentLogicalContractIdRef: 'lc', movementType: 'CREATE', eventSeq: 1, amount: '80000', currency: 'USD', exposureNature: 'MEMO', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Acceptance CREATE (MEMO)', movementRef: 'acceptance', releasedBy: CHECKER },
      { type: 'note', label: 'Export Bank finances via EBL 80,000 — Loan Component ASSET, no Balance Component call, still NOT Export Bank\'s own CONF LIAB' },
      { type: 'createMovement', label: 'Due Date Settlement 80,000 (Cr EBL)', captureAs: 'settle',
        request: { instrumentType: 'EPLC_ACCEPTANCE', balanceContractIdRef: 'acceptance', movementType: 'FULL_SETTLE', eventSeq: 2, amount: '80000', currency: 'USD', createdBy: MAKER } },
      { type: 'release', label: 'Checker releases Settlement', movementRef: 'settle', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance MEMO after Settlement (expect 0)', contractRef: 'acceptance' },
    ],
  };
}

/** Fresh natural keys per run so the same case can be re-run repeatedly against the same DB without idempotency-key/one-ACTIVE-per-logicalContractId collisions. */
function buildRegistry() {
  return [
    importCase1(lcNumberFor('IMP-C1')),
    importCase2(lcNumberFor('IMP-C2'), 'IB0001'),
    importCase3(lcNumberFor('IMP-C3'), 'SG0001'),
    importCase4(lcNumberFor('IMP-C4'), 'SG0001'),
    importCase5(lcNumberFor('IMP-C5')),
    exportCase1(lcNumberFor('EXP-C1')),
    exportCase2(lcNumberFor('EXP-C2'), 'IB0001'),
    exportCase3(lcNumberFor('EXP-C3'), 'IB0001'),
    exportCase4(lcNumberFor('EXP-C4'), 'IB0001'),
    exportCase5(lcNumberFor('EXP-C5'), 'IB0001'),
  ];
}

module.exports = { buildRegistry };
