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
 *     logicalContractId; `referencedTransactionIdRef` — added 2026-08-16
 *     for Export Case #6/#7's own B3->B4 compound shape — resolves to an
 *     earlier captureAs step's own movementId, same as balanceContractIdRef
 *     but targeting movementId instead of balanceContractId).
 *   release / makerSubmit / acknowledge — all POST /balance-movements/:id/<sub-path>
 *     with one body key, `movementRef` pointing at a captured createMovement
 *     step; server.js's own RELEASE_SHAPED_STEP_TYPES dispatch table drives
 *     all three through one shared handler (Quality-report-balance.md
 *     BAL-124). `release` — Checker releases a PENDING movement.
 *     `makerSubmit` (added 2026-08-16 for Import Case #6's own A4 real-
 *     Maker-Submit step — IPLC_LC/UTILIZE only) — `movementRef` +
 *     `makerSubmittedBy`. `acknowledge` (added 2026-08-17, BAL-131 — B3's
 *     own Present-Docs Checker acknowledgment; EPLC_EXAMINATION/CREATE
 *     only, never transitions status) — `movementRef` + `acknowledgedBy`.
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
      {
        type: 'createMovement',
        label: 'LC Issue 100,000, Tolerance 10%',
        captureAs: 'lc',
        request: {
          instrumentType: 'IPLC_LC',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tolerancePct: '10',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'LC Amendment increase 10,000',
        captureAs: 'amend',
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'AMEND_INCREASE',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      { type: 'snapshot', label: 'LC Balance after Issue+Amendment (expect 121,000)', contractRef: 'lc' },
      {
        type: 'createMovement',
        label: 'Document Arrival 50,000 (Earmark)',
        captureAs: 'utilize',
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'UTILIZE',
          eventSeq: 3,
          amount: '50000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
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
      {
        type: 'createMovement',
        label: 'LC Issue 100,000, Tolerance 10%',
        captureAs: 'lc',
        request: {
          instrumentType: 'IPLC_LC',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tolerancePct: '10',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'LC Amendment increase 10,000',
        captureAs: 'amend',
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'AMEND_INCREASE',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Document Arrival 50,000 (Earmark)',
        captureAs: 'utilize',
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'UTILIZE',
          eventSeq: 3,
          amount: '50000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Accept 50,000 (Usance) — LC Liability -> Acceptance Liability', movementRef: 'utilize', releasedBy: CHECKER },
      { type: 'snapshot', label: 'LC Balance after Accept (expect 71,000)', contractRef: 'lc' },
      {
        type: 'createMovement',
        label: 'Create Acceptance 50,000 (carved out of the LC, linked call)',
        captureAs: 'acceptance',
        request: {
          instrumentType: 'IPLC_ACCEPTANCE',
          naturalKey: { lcNumber: lc, ibNumber: ib },
          parentLogicalContractIdRef: 'lc',
          movementType: 'CREATE',
          eventSeq: 1,
          amount: '50000',
          currency: 'USD',
          exposureNature: 'ACTUAL',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Acceptance CREATE', movementRef: 'acceptance', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance Balance (expect 50,000)', contractRef: 'acceptance' },
      {
        type: 'createMovement',
        label: 'Settlement Due Date 50,000 (Cr CA)',
        captureAs: 'settle',
        request: {
          instrumentType: 'IPLC_ACCEPTANCE',
          balanceContractIdRef: 'acceptance',
          movementType: 'FULL_SETTLE',
          eventSeq: 2,
          amount: '50000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
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
      {
        type: 'createMovement',
        label: 'LC Issue 100,000, Tolerance 10%',
        captureAs: 'lc',
        request: {
          instrumentType: 'IPLC_LC',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tolerancePct: '10',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'LC Amendment increase 10,000',
        captureAs: 'amend',
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'AMEND_INCREASE',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Shipping Guarantee 50,000',
        captureAs: 'sg',
        request: {
          instrumentType: 'SHGT',
          naturalKey: { lcNumber: lc, sgNumber: sg },
          parentLogicalContractIdRef: 'lc',
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '50000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases SG Issue', movementRef: 'sg', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Document Arrival 50,000 (Earmark, off-balance checked against SG)',
        captureAs: 'utilize',
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'UTILIZE',
          eventSeq: 3,
          amount: '50000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'note', label: 'Expect NO warning here — Tight Available (71,000) still >= 50,000' },
      { type: 'release', label: 'IBL/Pay 50,000 (120 days)', movementRef: 'utilize', releasedBy: CHECKER },
      { type: 'note', label: 'IBL itself is a Loan Component ASSET — no Balance Component call' },
      {
        type: 'createMovement',
        label: 'SG matches arrived documents exactly -> FULL_REDEEM 50,000',
        captureAs: 'redeem',
        request: {
          instrumentType: 'SHGT',
          balanceContractIdRef: 'sg',
          movementType: 'FULL_REDEEM',
          eventSeq: 2,
          amount: '50000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases SG Redemption', movementRef: 'redeem', releasedBy: CHECKER },
      { type: 'snapshot', label: 'LC Balance (expect 71,000)', contractRef: 'lc' },
      { type: 'snapshot', label: 'SG Balance (expect 0)', contractRef: 'sg' },
      { type: 'note', label: 'Settlement Due Date 50,000 — pure Loan Component (IBL maturity), no Balance Component call' },
    ],
  };
}

// Business instruction 2026-08-17 ("Fix BAL-134 too" — Quality-report-balance.md): this case's own
// scenario predated Design doc §6.1 v0.12 ("A3 now hard-rejects past Tight Available" — see
// domain/offBalanceExposure.ts's own checkUtilizeSufficiency doc comment) and, run live, now fails on
// its own "Document Arrival 50,000" step with a genuine 409 INSUFFICIENT_AVAILABLE_BALANCE — not a
// false positive, the v0.12 rule is correctly rejecting an UNMATCHED plain-A3-style Document Arrival
// past Tight Available, exactly as designed. The case's own original premise (a plain UTILIZE past
// Tight Available producing a non-blocking WARNING) is now architecturally impossible:
// checkUtilizeSufficiency() no longer has a warning branch at all (v0.12 removed it, hardening WARNING
// to ERROR). Rewritten below to demonstrate the CURRENT, correct way to handle this exact scenario
// instead: create the SG's own PARTIAL_REDEEM movement FIRST (still PENDING, matching the SAME
// businessEventId as the Document Arrival that follows — the real "Document Arrival w/ Shipping Gtee"
// (A3S) ordering) — computeOffBalanceExposure() counts PENDING redemptions the same as RELEASED ones,
// so by the time the Document Arrival's own sufficiency check runs, this SG's contribution is already
// netted out and the SAME 50,000 presentation succeeds cleanly, no warning and no error. Final balances
// (LC 71,000, SG 50,000 outstanding) are UNCHANGED from the original case — only the ordering/mechanism
// that gets there is fixed, since those numbers were never wrong, just reached via a call sequence the
// current design no longer permits.
function importCase4(lc, sg) {
  return {
    id: 'import-case-4',
    title: 'Import Case 4 — USD Sight + Shipping Guarantee 100,000, partial match via Document Arrival w/ SG (A3S)',
    description:
      "SG covers the full LC but only half the documents arrive — Document Arrival w/ Shipping Gtee (A3S) nets the SG's own reserved capacity out of the Tight Available check BEFORE the Document Arrival's own sufficiency check runs, so the partial presentation succeeds cleanly (no warning, no error); SG itself can only be PARTIAL_REDEEM-ed for the matched amount, leaving the rest outstanding.",
    steps: [
      {
        type: 'createMovement',
        label: 'LC Issue 100,000, Tolerance 10%',
        captureAs: 'lc',
        request: {
          instrumentType: 'IPLC_LC',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tolerancePct: '10',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'LC Amendment increase 10,000',
        captureAs: 'amend',
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'AMEND_INCREASE',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Shipping Guarantee 100,000 (covers full LC)',
        captureAs: 'sg',
        request: {
          instrumentType: 'SHGT',
          naturalKey: { lcNumber: lc, sgNumber: sg },
          parentLogicalContractIdRef: 'lc',
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases SG Issue', movementRef: 'sg', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'SG Redemption Amount = MIN(Bill 50,000, SG Outstanding 100,000) -> PARTIAL_REDEEM 50,000 (created FIRST — still PENDING, nets out of the Document Arrival\'s own Tight Available check below)',
        captureAs: 'redeem',
        request: {
          instrumentType: 'SHGT',
          balanceContractIdRef: 'sg',
          movementType: 'PARTIAL_REDEEM',
          eventSeq: 2,
          amount: '50000',
          currency: 'USD',
          businessEventId: `${lc}-arrival`,
          createdBy: MAKER,
        },
      },
      {
        type: 'createMovement',
        label: 'Document Arrival w/ SG 50,000 (A3S — matches the SG\'s own reserved capacity; only half the SG-covered goods have arrived)',
        captureAs: 'utilize',
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'UTILIZE',
          eventSeq: 3,
          amount: '50000',
          currency: 'USD',
          businessEventId: `${lc}-arrival`,
          createdBy: MAKER,
        },
      },
      {
        type: 'note',
        label:
          "No warning and no error here — the SG Redemption above (still PENDING) already nets its own 50,000 out of Off-Balance Exposure before this check runs, so Tight Available is correctly 71,000 (121,000 Available minus 50,000 remaining SG exposure), comfortably covering this 50,000 Document Arrival. An UNMATCHED plain Document Arrival for the same 50,000 against the same LC would instead hard-reject (Design doc §6.1 v0.12) — that's exactly the case this scenario used to (incorrectly) demonstrate as a warning; matching against the SG via A3S is the current, correct way to handle it.",
      },
      { type: 'release', label: 'Checker releases SG Redemption', movementRef: 'redeem', releasedBy: CHECKER },
      { type: 'release', label: 'IBL/Pay 50,000 (120 days)', movementRef: 'utilize', releasedBy: CHECKER },
      { type: 'note', label: 'IBL itself is a Loan Component ASSET — no Balance Component call' },
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
      {
        type: 'createMovement',
        label: 'LC Issue 100,000, Tolerance 10%',
        captureAs: 'lc',
        request: {
          instrumentType: 'IPLC_LC',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tolerancePct: '10',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'LC Amendment DECREASE 120,000 — expect 409 ERROR',
        captureAs: 'amendDecrease',
        expectError: true,
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'AMEND_DECREASE',
          eventSeq: 2,
          amount: '120000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'snapshot', label: 'LC Balance unchanged (expect still 110,000 — the rejected Amendment never applied)', contractRef: 'lc' },
    ],
  };
}

// Business instruction 2026-08-16 ("DB裡面 IMPORT LC => S01 & U01 all test events 加入測試案例" —
// "add the S01/U01 test events already run against the DB as registry cases"): transcribed field-for-
// field from a direct SQLite dump of the user's own live S01 (Sight)/U01 (Sellers Usance) runs, same
// convention as Export Case #6/#7's own top comment. Case #6 exercises A4's own real Maker Submit
// (2026-08-16 redesign — "Add real Maker Submit, then have Checker to Release it") on THREE Document
// Arrivals, two of them A3S-matched against a Shipping Guarantee (one exact/FULL_REDEEM, one
// partial/PARTIAL_REDEEM). Case #7 exercises A6/A7 (Usance Acceptance + Settlement) instead, since a
// Usance LC's own UTILIZE settles via A6, never A4 — makerSubmit is IPLC_LC/UTILIZE-scoped at the
// SERVICE layer, but A6's own referencedTransactionId-based compound release (not a maker-submit gate)
// is what actually finalizes a Usance Document Arrival, matching the live data exactly (no
// makerSubmittedBy on either UTILIZE under U01).

function importCase6(lc) {
  return {
    id: 'import-case-6',
    title: 'Import Case 6 — USD Sight + two Shipping Guarantees (full + partial redeem) + A4 real Maker Submit',
    description:
      'LC Issue 100,000 (Sight) -> SG1 10,000 + SG2 20,000 -> Document Arrival w/ SG 12,000 (B01, matches SG1 exactly -> FULL_REDEEM) -> Document Arrival w/ SG 12,000 (B02, partially matches SG2 -> PARTIAL_REDEEM) -> plain Document Arrival 30,000 (B03, no SG) -> A4 Sight Settlement (real Maker Submit + Checker Release) on all three',
    steps: [
      {
        type: 'createMovement',
        label: 'LC Issue 100,000 (Sight)',
        captureAs: 'lc',
        request: {
          instrumentType: 'IPLC_LC',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tenorType: 'SIGHT',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Shipping Guarantee 10,000 (G01)',
        captureAs: 'sg1',
        request: {
          instrumentType: 'SHGT',
          naturalKey: { lcNumber: lc, sgNumber: 'G01' },
          parentLogicalContractIdRef: 'lc',
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '10000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases SG1 Issue', movementRef: 'sg1', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Shipping Guarantee 20,000 (G02)',
        captureAs: 'sg2',
        request: {
          instrumentType: 'SHGT',
          naturalKey: { lcNumber: lc, sgNumber: 'G02' },
          parentLogicalContractIdRef: 'lc',
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '20000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases SG2 Issue', movementRef: 'sg2', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Document Arrival w/ SG 12,000 (B01 — A3S, matches SG1 exactly)',
        captureAs: 'utilizeB01',
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'UTILIZE',
          eventSeq: 2,
          amount: '12000',
          currency: 'USD',
          sourceTransactionRef: 'B01',
          businessEventId: `${lc}-b01`,
          createdBy: MAKER,
        },
      },
      {
        type: 'createMovement',
        label: 'SG1 Redemption Amount = MIN(Bill 12,000, SG Outstanding 10,000) -> FULL_REDEEM 10,000',
        captureAs: 'redeemSg1',
        request: {
          instrumentType: 'SHGT',
          balanceContractIdRef: 'sg1',
          movementType: 'FULL_REDEEM',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          sourceTransactionRef: 'B01',
          businessEventId: `${lc}-b01`,
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases SG1 Redemption', movementRef: 'redeemSg1', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Document Arrival w/ SG 12,000 (B02 — A3S, partially matches SG2)',
        captureAs: 'utilizeB02',
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'UTILIZE',
          eventSeq: 3,
          amount: '12000',
          currency: 'USD',
          sourceTransactionRef: 'B02',
          businessEventId: `${lc}-b02`,
          createdBy: MAKER,
        },
      },
      {
        type: 'createMovement',
        label: 'SG2 Redemption Amount = MIN(Bill 12,000, SG Outstanding 20,000) -> PARTIAL_REDEEM 12,000',
        captureAs: 'redeemSg2',
        request: {
          instrumentType: 'SHGT',
          balanceContractIdRef: 'sg2',
          movementType: 'PARTIAL_REDEEM',
          eventSeq: 2,
          amount: '12000',
          currency: 'USD',
          sourceTransactionRef: 'B02',
          businessEventId: `${lc}-b02`,
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases SG2 partial Redemption', movementRef: 'redeemSg2', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Document Arrival 30,000 (B03 — plain A3, no Shipping Guarantee)',
        captureAs: 'utilizeB03',
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'UTILIZE',
          eventSeq: 4,
          amount: '30000',
          currency: 'USD',
          sourceTransactionRef: 'B03',
          createdBy: MAKER,
        },
      },
      {
        type: 'snapshot',
        label:
          'LC Balance before any A4 Sight Settlement (expect Confirmed 100,000, Available 46,000 — 54,000 still Pending across all three Document Arrivals)',
        contractRef: 'lc',
      },
      { type: 'makerSubmit', label: 'A4 real Maker Submit — B01', movementRef: 'utilizeB01', makerSubmittedBy: MAKER },
      { type: 'release', label: 'A4 Checker Release — B01 (Sight Settlement finalizes)', movementRef: 'utilizeB01', releasedBy: CHECKER },
      { type: 'makerSubmit', label: 'A4 real Maker Submit — B02', movementRef: 'utilizeB02', makerSubmittedBy: MAKER },
      { type: 'release', label: 'A4 Checker Release — B02 (Sight Settlement finalizes)', movementRef: 'utilizeB02', releasedBy: CHECKER },
      { type: 'makerSubmit', label: 'A4 real Maker Submit — B03', movementRef: 'utilizeB03', makerSubmittedBy: MAKER },
      { type: 'release', label: 'A4 Checker Release — B03 (Sight Settlement finalizes)', movementRef: 'utilizeB03', releasedBy: CHECKER },
      { type: 'snapshot', label: 'LC Balance after all three A4 Settlements (expect Confirmed 46,000, Available 46,000)', contractRef: 'lc' },
      { type: 'snapshot', label: 'SG1 Balance (expect 0, fully redeemed)', contractRef: 'sg1' },
      { type: 'snapshot', label: 'SG2 Balance (expect 8,000 still outstanding)', contractRef: 'sg2' },
    ],
  };
}

function importCase7(lc) {
  return {
    id: 'import-case-7',
    title: 'Import Case 7 — USD Sellers Usance 120 days + Shipping Guarantee + two Acceptances (A6/A7)',
    description:
      'LC Issue 100,000 (Sellers Usance 120d) -> plain Document Arrival 20,000 (B01) -> SG1 20,000 -> Document Arrival w/ SG 25,000 (B02, matches SG1 exactly -> FULL_REDEEM) -> A6 Acceptance (Usance) for B01/B02 (compound: releases the source Document Arrival, then the Acceptance) -> A7 Acceptance Settlement (Due Date) for both',
    steps: [
      {
        type: 'createMovement',
        label: 'LC Issue 100,000 (Sellers Usance, 120 days)',
        captureAs: 'lc',
        request: {
          instrumentType: 'IPLC_LC',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tenorType: 'SELLERS_USANCE',
          tenorDays: 120,
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Document Arrival 20,000 (B01 — plain A3, no Shipping Guarantee)',
        captureAs: 'utilizeB01',
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'UTILIZE',
          eventSeq: 2,
          amount: '20000',
          currency: 'USD',
          sourceTransactionRef: 'B01',
          createdBy: MAKER,
        },
      },
      {
        type: 'createMovement',
        label: 'Shipping Guarantee 20,000 (G01)',
        captureAs: 'sg1',
        request: {
          instrumentType: 'SHGT',
          naturalKey: { lcNumber: lc, sgNumber: 'G01' },
          parentLogicalContractIdRef: 'lc',
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '20000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases SG1 Issue', movementRef: 'sg1', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Document Arrival w/ SG 25,000 (B02 — A3S, matches SG1 exactly)',
        captureAs: 'utilizeB02',
        request: {
          instrumentType: 'IPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'UTILIZE',
          eventSeq: 3,
          amount: '25000',
          currency: 'USD',
          sourceTransactionRef: 'B02',
          businessEventId: `${lc}-b02`,
          createdBy: MAKER,
        },
      },
      {
        type: 'createMovement',
        label: 'SG1 Redemption Amount = MIN(Bill 25,000, SG Outstanding 20,000) -> FULL_REDEEM 20,000',
        captureAs: 'redeemSg1',
        request: {
          instrumentType: 'SHGT',
          balanceContractIdRef: 'sg1',
          movementType: 'FULL_REDEEM',
          eventSeq: 2,
          amount: '20000',
          currency: 'USD',
          sourceTransactionRef: 'B02',
          businessEventId: `${lc}-b02`,
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases SG1 Redemption', movementRef: 'redeemSg1', releasedBy: CHECKER },
      {
        type: 'snapshot',
        label: 'LC Balance before Acceptance (expect Confirmed 100,000, Available 55,000 — 45,000 still Pending across both Document Arrivals)',
        contractRef: 'lc',
      },
      {
        type: 'createMovement',
        label: 'Create Acceptance 20,000 for B01 (A6 — references the Document Arrival)',
        captureAs: 'acceptanceB01',
        request: {
          instrumentType: 'IPLC_ACCEPTANCE',
          naturalKey: { lcNumber: lc, ibNumber: 'B01' },
          parentLogicalContractIdRef: 'lc',
          movementType: 'CREATE',
          eventSeq: 1,
          amount: '20000',
          currency: 'USD',
          tenorType: 'SELLERS_USANCE',
          tenorDays: 120,
          exposureNature: 'ACTUAL',
          referencedTransactionIdRef: 'utilizeB01',
          createdBy: MAKER,
        },
      },
      {
        type: 'release',
        label: "Checker releases B01's own Document Arrival (resolved via referencedTransactionId, released first)",
        movementRef: 'utilizeB01',
        releasedBy: CHECKER,
      },
      { type: 'release', label: 'Checker releases Acceptance CREATE — B01', movementRef: 'acceptanceB01', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Create Acceptance 25,000 for B02 (A6 — references the Document Arrival)',
        captureAs: 'acceptanceB02',
        request: {
          instrumentType: 'IPLC_ACCEPTANCE',
          naturalKey: { lcNumber: lc, ibNumber: 'B02' },
          parentLogicalContractIdRef: 'lc',
          movementType: 'CREATE',
          eventSeq: 1,
          amount: '25000',
          currency: 'USD',
          tenorType: 'SELLERS_USANCE',
          tenorDays: 120,
          exposureNature: 'ACTUAL',
          referencedTransactionIdRef: 'utilizeB02',
          createdBy: MAKER,
        },
      },
      {
        type: 'release',
        label: "Checker releases B02's own Document Arrival (resolved via referencedTransactionId, released first)",
        movementRef: 'utilizeB02',
        releasedBy: CHECKER,
      },
      { type: 'release', label: 'Checker releases Acceptance CREATE — B02', movementRef: 'acceptanceB02', releasedBy: CHECKER },
      { type: 'snapshot', label: 'LC Balance after both Acceptances (expect Confirmed 55,000, Available 55,000)', contractRef: 'lc' },
      { type: 'snapshot', label: 'Acceptance B01 Balance (expect 20,000)', contractRef: 'acceptanceB01' },
      { type: 'snapshot', label: 'Acceptance B02 Balance (expect 25,000)', contractRef: 'acceptanceB02' },
      {
        type: 'createMovement',
        label: 'Acceptance Settlement (A7) — FULL_SETTLE 20,000 (B01)',
        captureAs: 'settleB01',
        request: {
          instrumentType: 'IPLC_ACCEPTANCE',
          balanceContractIdRef: 'acceptanceB01',
          movementType: 'FULL_SETTLE',
          eventSeq: 2,
          amount: '20000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Settlement — B01', movementRef: 'settleB01', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Acceptance Settlement (A7) — FULL_SETTLE 25,000 (B02)',
        captureAs: 'settleB02',
        request: {
          instrumentType: 'IPLC_ACCEPTANCE',
          balanceContractIdRef: 'acceptanceB02',
          movementType: 'FULL_SETTLE',
          eventSeq: 2,
          amount: '25000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Settlement — B02', movementRef: 'settleB02', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance B01 Balance after Settlement (expect 0)', contractRef: 'acceptanceB01' },
      { type: 'snapshot', label: 'Acceptance B02 Balance after Settlement (expect 0)', contractRef: 'acceptanceB02' },
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
      {
        type: 'createMovement',
        label: 'Confirm LC 100,000, Tolerance 10% (Maximum Exposure Basis)',
        captureAs: 'conf',
        request: {
          instrumentType: 'EPLC_CONFIRMATION',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tolerancePct: '10',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Confirmation Issue', movementRef: 'conf', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'LC Amendment increase 10,000',
        captureAs: 'amend',
        request: {
          instrumentType: 'EPLC_CONFIRMATION',
          balanceContractIdRef: 'conf',
          movementType: 'AMEND',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      { type: 'snapshot', label: 'CONF LIAB after Issue+Amendment (expect 121,000)', contractRef: 'conf' },
      {
        type: 'createMovement',
        label: 'Present Docs 80,000 (Earmark — mere presentation, no GL entry yet)',
        captureAs: 'honour',
        request: {
          instrumentType: 'EPLC_CONFIRMATION',
          balanceContractIdRef: 'conf',
          movementType: 'HONOUR',
          eventSeq: 3,
          amount: '80000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
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
      {
        type: 'createMovement',
        label: 'Confirm LC 100,000, Tolerance 10%',
        captureAs: 'conf',
        request: {
          instrumentType: 'EPLC_CONFIRMATION',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tolerancePct: '10',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Confirmation Issue', movementRef: 'conf', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'LC Amendment increase 10,000',
        captureAs: 'amend',
        request: {
          instrumentType: 'EPLC_CONFIRMATION',
          balanceContractIdRef: 'conf',
          movementType: 'AMEND',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Present Docs 80,000 (Earmark)',
        captureAs: 'accept',
        request: {
          instrumentType: 'EPLC_CONFIRMATION',
          balanceContractIdRef: 'conf',
          movementType: 'ACCEPT',
          eventSeq: 3,
          amount: '80000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Issuing Bank Accept Docs 80,000 -> CONF LIAB releases', movementRef: 'accept', releasedBy: CHECKER },
      { type: 'snapshot', label: 'CONF LIAB after Accept (expect 41,000)', contractRef: 'conf' },
      {
        type: 'createMovement',
        label: 'Create Acceptance Liability 80,000 (linked call)',
        captureAs: 'acceptance',
        request: {
          instrumentType: 'EPLC_ACCEPTANCE',
          naturalKey: { lcNumber: lc, ibNumber: ib },
          parentLogicalContractIdRef: 'conf',
          movementType: 'CREATE',
          eventSeq: 1,
          amount: '80000',
          currency: 'USD',
          exposureNature: 'ACTUAL',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Acceptance CREATE', movementRef: 'acceptance', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance Liability (expect 80,000)', contractRef: 'acceptance' },
      {
        type: 'createMovement',
        label: 'Due Date Settlement 80,000 (Cr Customer A/C)',
        captureAs: 'settle',
        request: {
          instrumentType: 'EPLC_ACCEPTANCE',
          balanceContractIdRef: 'acceptance',
          movementType: 'FULL_SETTLE',
          eventSeq: 2,
          amount: '80000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
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
      {
        type: 'createMovement',
        label: 'Confirm LC 100,000, Tolerance 10%',
        captureAs: 'conf',
        request: {
          instrumentType: 'EPLC_CONFIRMATION',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tolerancePct: '10',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Confirmation Issue', movementRef: 'conf', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'LC Amendment increase 10,000',
        captureAs: 'amend',
        request: {
          instrumentType: 'EPLC_CONFIRMATION',
          balanceContractIdRef: 'conf',
          movementType: 'AMEND',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Present Docs 80,000 (Earmark)',
        captureAs: 'accept',
        request: {
          instrumentType: 'EPLC_CONFIRMATION',
          balanceContractIdRef: 'conf',
          movementType: 'ACCEPT',
          eventSeq: 3,
          amount: '80000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Issuing Bank Accept Docs 80,000 -> EBL 80,000', movementRef: 'accept', releasedBy: CHECKER },
      { type: 'snapshot', label: 'CONF LIAB after Accept (expect 41,000)', contractRef: 'conf' },
      {
        type: 'createMovement',
        label: 'Create Acceptance Liability 80,000 (linked call)',
        captureAs: 'acceptance',
        request: {
          instrumentType: 'EPLC_ACCEPTANCE',
          naturalKey: { lcNumber: lc, ibNumber: ib },
          parentLogicalContractIdRef: 'conf',
          movementType: 'CREATE',
          eventSeq: 1,
          amount: '80000',
          currency: 'USD',
          exposureNature: 'ACTUAL',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Acceptance CREATE', movementRef: 'acceptance', releasedBy: CHECKER },
      {
        type: 'note',
        label:
          'Export Bank finances early via EBL 80,000 — Loan Component ASSET (Dr EBL / Cr Customer A/C), no Balance Component call. NOT to be summed with Acceptance Liability for total credit exposure — see Design doc "Accounting Balance vs Risk Exposure".',
      },
      {
        type: 'createMovement',
        label: 'Due Date Settlement 80,000 (Cr EBL — Issuing Bank repays via Nostro)',
        captureAs: 'settle',
        request: {
          instrumentType: 'EPLC_ACCEPTANCE',
          balanceContractIdRef: 'acceptance',
          movementType: 'FULL_SETTLE',
          eventSeq: 2,
          amount: '80000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Settlement', movementRef: 'settle', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance Liability after Settlement (expect 0)', contractRef: 'acceptance' },
    ],
  };
}

function exportCase4(lc, ib) {
  return {
    id: 'export-case-4',
    title: 'Export Case #4 — USD Usance + Unconfirmed + No EBL',
    description: "No Confirmation exists -> Issuing Bank Accept produces a MEMO receivable-tracking record only, never Export Bank's own liability.",
    steps: [
      {
        type: 'createMovement',
        label: 'LC Issue 100,000, Tolerance 10% (reference only — no liability, no Confirmation exists)',
        captureAs: 'lc',
        request: {
          instrumentType: 'EPLC_LC',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tolerancePct: '10',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'LC Amendment increase 10,000 (still reference only)',
        captureAs: 'amend',
        request: {
          instrumentType: 'EPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'AMEND_INCREASE',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      { type: 'note', label: 'Present Docs — no Confirmation, no earmark, no Balance Component call at all' },
      {
        type: 'createMovement',
        label: "Issuing Bank Accept 80,000 -> MEMO tracking only (no accountEntries, not Export Bank's own liability)",
        captureAs: 'acceptance',
        request: {
          instrumentType: 'EPLC_ACCEPTANCE',
          naturalKey: { lcNumber: lc, ibNumber: ib },
          parentLogicalContractIdRef: 'lc',
          movementType: 'CREATE',
          eventSeq: 1,
          amount: '80000',
          currency: 'USD',
          exposureNature: 'MEMO',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Acceptance CREATE (MEMO)', movementRef: 'acceptance', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance MEMO tracking (expect 80,000, exposureNature=MEMO)', contractRef: 'acceptance' },
      {
        type: 'createMovement',
        label: 'Due Date Settlement 80,000 (Cr Customer A/C) — closes the MEMO tracking entry',
        captureAs: 'settle',
        request: {
          instrumentType: 'EPLC_ACCEPTANCE',
          balanceContractIdRef: 'acceptance',
          movementType: 'FULL_SETTLE',
          eventSeq: 2,
          amount: '80000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
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
      {
        type: 'createMovement',
        label: 'LC Issue 100,000, Tolerance 10% (reference only)',
        captureAs: 'lc',
        request: {
          instrumentType: 'EPLC_LC',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tolerancePct: '10',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases LC Issue', movementRef: 'lc', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'LC Amendment increase 10,000 (reference only)',
        captureAs: 'amend',
        request: {
          instrumentType: 'EPLC_LC',
          balanceContractIdRef: 'lc',
          movementType: 'AMEND_INCREASE',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Amendment', movementRef: 'amend', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Issuing Bank Accept 80,000 -> MEMO tracking only',
        captureAs: 'acceptance',
        request: {
          instrumentType: 'EPLC_ACCEPTANCE',
          naturalKey: { lcNumber: lc, ibNumber: ib },
          parentLogicalContractIdRef: 'lc',
          movementType: 'CREATE',
          eventSeq: 1,
          amount: '80000',
          currency: 'USD',
          exposureNature: 'MEMO',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Acceptance CREATE (MEMO)', movementRef: 'acceptance', releasedBy: CHECKER },
      { type: 'note', label: "Export Bank finances via EBL 80,000 — Loan Component ASSET, no Balance Component call, still NOT Export Bank's own CONF LIAB" },
      {
        type: 'createMovement',
        label: 'Due Date Settlement 80,000 (Cr EBL)',
        captureAs: 'settle',
        request: {
          instrumentType: 'EPLC_ACCEPTANCE',
          balanceContractIdRef: 'acceptance',
          movementType: 'FULL_SETTLE',
          eventSeq: 2,
          amount: '80000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Settlement', movementRef: 'settle', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance MEMO after Settlement (expect 0)', contractRef: 'acceptance' },
    ],
  };
}

// Business instruction 2026-08-16 ("DB裡面 EXPORT LC => S01 & U01 all test events 加入測試案例" —
// "add the S01/U01 test events already run against the DB as registry cases"): Case #1-#5 above model
// "Present Docs" as directly creating the Confirmation's own HONOUR/ACCEPT movement, with no separate
// earmark step — this predates the B3 (Present Docs, EPLC_EXAMINATION memo earmark) / B4 (unified
// Honour/Accept legal event, absorbing the old split B3/B4) redesign the Transaction Builder's own
// Export tab has used since (see this file's own lc-balance-wc/CLAUDE.md decision log, "B4 REBUILT as
// the unified legal-event step for BOTH tenors"). Case #6/#7 below reproduce that CURRENT architecture
// instead, transcribed from the user's own live S01 (Sight)/U01 (Usance) runs against the microservice
// — left as NEW cases rather than rewriting #1-#5 in place, since #1-#5 are still internally consistent
// (self-contained, no B3/B4 split) and this session's own instruction was to ADD, not replace.

function exportCase6(lc) {
  return {
    id: 'export-case-6',
    title: 'Export Case #6 — USD Sight + Confirmed + Present Docs (B3) -> Honour (B4) -> Due From Issuing Bank',
    description:
      'Confirm LC 100,000 (Sight) -> Present Docs 10,000 (B3 memo earmark, no GL effect) -> Issuing Bank Honour 10,000 (B4 unified legal event, references the B3 earmark) -> Due From Issuing Bank 10,000 (linked asset leg, same compound submission as Honour)',
    steps: [
      {
        type: 'createMovement',
        label: 'Confirm LC 100,000 (Sight)',
        captureAs: 'conf',
        request: {
          instrumentType: 'EPLC_CONFIRMATION',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tenorType: 'SIGHT',
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Confirmation Issue', movementRef: 'conf', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Present Docs 10,000 (B3 — EPLC_EXAMINATION memo earmark; Design Principle D3, no GL/contingent effect on the Confirmation itself)',
        captureAs: 'examination',
        request: {
          instrumentType: 'EPLC_EXAMINATION',
          naturalKey: { lcNumber: lc, ibNumber: 'E01' },
          parentLogicalContractIdRef: 'conf',
          movementType: 'CREATE',
          eventSeq: 1,
          amount: '10000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      {
        type: 'acknowledge',
        label: "Checker acknowledges Present Docs (B3 — acknowledgment-only, stays PENDING; B4's own compound Release below still resolves and releases this earmark directly via referencedTransactionId)",
        movementRef: 'examination',
        acknowledgedBy: CHECKER,
      },
      {
        type: 'createMovement',
        label: 'Issuing Bank Honour 10,000 (B4 — unified legal event; references the Present Docs earmark)',
        captureAs: 'honour',
        request: {
          instrumentType: 'EPLC_CONFIRMATION',
          balanceContractIdRef: 'conf',
          movementType: 'HONOUR',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          referencedTransactionIdRef: 'examination',
          businessEventId: `${lc}-honour`,
          createdBy: MAKER,
        },
      },
      {
        type: 'createMovement',
        label: 'Due From Issuing Bank 10,000 (linked asset leg, same compound submission as Honour — shares businessEventId)',
        captureAs: 'dueFromIssuingBank',
        request: {
          instrumentType: 'EPLC_DUE_FROM_ISSUING_BANK',
          naturalKey: { lcNumber: lc, ibNumber: 'E01' },
          parentLogicalContractIdRef: 'conf',
          movementType: 'CREATE',
          eventSeq: 1,
          amount: '10000',
          currency: 'USD',
          businessEventId: `${lc}-honour`,
          createdBy: MAKER,
        },
      },
      {
        type: 'release',
        label: "Checker releases Present Docs' own earmark (resolved via referencedTransactionId, released first)",
        movementRef: 'examination',
        releasedBy: CHECKER,
      },
      { type: 'release', label: 'Checker releases Honour (the primary compound leg)', movementRef: 'honour', releasedBy: CHECKER },
      { type: 'release', label: 'Checker releases Due From Issuing Bank (the linked compound leg)', movementRef: 'dueFromIssuingBank', releasedBy: CHECKER },
      { type: 'snapshot', label: 'CONF LIAB after Honour (expect 90,000)', contractRef: 'conf' },
      { type: 'snapshot', label: 'Due From Issuing Bank Balance (expect 10,000)', contractRef: 'dueFromIssuingBank' },
    ],
  };
}

function exportCase7(lc, ib) {
  return {
    id: 'export-case-7',
    title:
      'Export Case #7 — USD Sellers Usance 120 days + Confirmed + Present Docs (B3) -> Accept (B4) -> Acceptance + Reimbursement Receivable -> Settlement (B5)',
    description:
      'Confirm LC 100,000 (Sellers Usance 120d) -> Present Docs 10,000 (B3 memo earmark) -> Issuing Bank Accept 10,000 (B4 unified legal event; compound-creates Acceptance Liability + Acceptance Reimbursement Receivable) -> Acceptance Settlement (B5; compound-releases FULL_SETTLE + REIMBURSE)',
    steps: [
      {
        type: 'createMovement',
        label: 'Confirm LC 100,000 (Sellers Usance, 120 days)',
        captureAs: 'conf',
        request: {
          instrumentType: 'EPLC_CONFIRMATION',
          naturalKey: { lcNumber: lc },
          movementType: 'ISSUE',
          eventSeq: 1,
          amount: '100000',
          currency: 'USD',
          tenorType: 'SELLERS_USANCE',
          tenorDays: 120,
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Confirmation Issue', movementRef: 'conf', releasedBy: CHECKER },
      {
        type: 'createMovement',
        label: 'Present Docs 10,000 (B3 — EPLC_EXAMINATION memo earmark; Design Principle D3, no GL/contingent effect on the Confirmation itself)',
        captureAs: 'examination',
        request: {
          instrumentType: 'EPLC_EXAMINATION',
          naturalKey: { lcNumber: lc, ibNumber: ib },
          parentLogicalContractIdRef: 'conf',
          movementType: 'CREATE',
          eventSeq: 1,
          amount: '10000',
          currency: 'USD',
          createdBy: MAKER,
        },
      },
      {
        type: 'acknowledge',
        label: "Checker acknowledges Present Docs (B3 — acknowledgment-only, stays PENDING; B4's own compound Release below still resolves and releases this earmark directly via referencedTransactionId)",
        movementRef: 'examination',
        acknowledgedBy: CHECKER,
      },
      {
        type: 'createMovement',
        label: 'Issuing Bank Accept 10,000 (B4 — unified legal event; references the Present Docs earmark)',
        captureAs: 'accept',
        request: {
          instrumentType: 'EPLC_CONFIRMATION',
          balanceContractIdRef: 'conf',
          movementType: 'ACCEPT',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          referencedTransactionIdRef: 'examination',
          businessEventId: `${lc}-accept`,
          createdBy: MAKER,
        },
      },
      {
        type: 'createMovement',
        label: 'Create Acceptance Liability 10,000 (linked compound leg, same submission as Accept — shares businessEventId)',
        captureAs: 'acceptance',
        request: {
          instrumentType: 'EPLC_ACCEPTANCE',
          naturalKey: { lcNumber: lc, ibNumber: ib },
          parentLogicalContractIdRef: 'conf',
          movementType: 'CREATE',
          eventSeq: 1,
          amount: '10000',
          currency: 'USD',
          tenorType: 'SELLERS_USANCE',
          tenorDays: 120,
          exposureNature: 'ACTUAL',
          businessEventId: `${lc}-accept`,
          createdBy: MAKER,
        },
      },
      {
        type: 'createMovement',
        label: 'Create Acceptance Reimbursement Receivable 10,000 (linked compound leg, same submission as Accept — shares businessEventId)',
        captureAs: 'reimbReceivable',
        request: {
          instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE',
          naturalKey: { lcNumber: lc, ibNumber: ib },
          parentLogicalContractIdRef: 'conf',
          movementType: 'CREATE',
          eventSeq: 1,
          amount: '10000',
          currency: 'USD',
          businessEventId: `${lc}-accept`,
          createdBy: MAKER,
        },
      },
      {
        type: 'release',
        label: "Checker releases Present Docs' own earmark (resolved via referencedTransactionId, released first)",
        movementRef: 'examination',
        releasedBy: CHECKER,
      },
      { type: 'release', label: 'Checker releases Accept (the primary compound leg)', movementRef: 'accept', releasedBy: CHECKER },
      { type: 'release', label: 'Checker releases Acceptance CREATE (linked compound leg)', movementRef: 'acceptance', releasedBy: CHECKER },
      { type: 'release', label: 'Checker releases Reimbursement Receivable CREATE (linked compound leg)', movementRef: 'reimbReceivable', releasedBy: CHECKER },
      { type: 'snapshot', label: 'CONF LIAB after Accept (expect 90,000)', contractRef: 'conf' },
      { type: 'snapshot', label: 'Acceptance Liability (expect 10,000)', contractRef: 'acceptance' },
      { type: 'snapshot', label: 'Acceptance Reimbursement Receivable (expect 10,000)', contractRef: 'reimbReceivable' },
      {
        type: 'createMovement',
        label: 'Acceptance Settlement (B5) — FULL_SETTLE 10,000',
        captureAs: 'settle',
        request: {
          instrumentType: 'EPLC_ACCEPTANCE',
          balanceContractIdRef: 'acceptance',
          movementType: 'FULL_SETTLE',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          businessEventId: `${lc}-settle`,
          createdBy: MAKER,
        },
      },
      {
        type: 'createMovement',
        label: 'Reimbursement Receivable REIMBURSE 10,000 (linked compound leg, same submission as Settlement — shares businessEventId)',
        captureAs: 'reimburse',
        request: {
          instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE',
          balanceContractIdRef: 'reimbReceivable',
          movementType: 'REIMBURSE',
          eventSeq: 2,
          amount: '10000',
          currency: 'USD',
          businessEventId: `${lc}-settle`,
          createdBy: MAKER,
        },
      },
      { type: 'release', label: 'Checker releases Settlement (Acceptance FULL_SETTLE)', movementRef: 'settle', releasedBy: CHECKER },
      { type: 'release', label: 'Checker releases Reimbursement Receivable REIMBURSE (linked compound leg)', movementRef: 'reimburse', releasedBy: CHECKER },
      { type: 'snapshot', label: 'Acceptance Liability after Settlement (expect 0)', contractRef: 'acceptance' },
      { type: 'snapshot', label: 'Acceptance Reimbursement Receivable after Reimburse (expect 0)', contractRef: 'reimbReceivable' },
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
    importCase6(lcNumberFor('IMP-C6')),
    importCase7(lcNumberFor('IMP-C7')),
    exportCase1(lcNumberFor('EXP-C1')),
    exportCase2(lcNumberFor('EXP-C2'), 'IB0001'),
    exportCase3(lcNumberFor('EXP-C3'), 'IB0001'),
    exportCase4(lcNumberFor('EXP-C4'), 'IB0001'),
    exportCase5(lcNumberFor('EXP-C5'), 'IB0001'),
    exportCase6(lcNumberFor('EXP-C6')),
    exportCase7(lcNumberFor('EXP-C7'), 'IB0001'),
  ];
}

module.exports = { buildRegistry };
