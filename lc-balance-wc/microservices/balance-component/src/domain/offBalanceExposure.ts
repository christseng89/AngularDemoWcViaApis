/**
 * Design doc §6.1 (v0.12: hardened from WARNING to ERROR — see below) —
 * off-balance-sheet exposure check for a UTILIZE movement against
 * IPLC_LC/EPLC_LC. Scope is deliberately SHGT only (not Acceptance/
 * Confirmation) — see §6.1's reasoning: Acceptance already reduced LC
 * Balance at UTILIZE time (would double-count), and Confirmation is a
 * percentage overlay that never competes for the same LC capacity.
 */
import Decimal from 'decimal.js';
import { ZERO, parseMonetaryAmount } from '../money';
import type { BalanceMovement, MovementWarning } from '../types';

/** §6.1 — Σ PENDING+RELEASED SHGT ISSUE net of PARTIAL_REDEEM/FULL_REDEEM (v0.6), for SHGT contracts under the same parentLogicalContractId. Caller is responsible for having already filtered movements to that SHGT logical contract's own movements. */
export function computeOffBalanceExposure(
  shgtMovements: readonly Pick<BalanceMovement, 'movementType' | 'ceilingAmount' | 'status'>[],
): Decimal {
  return shgtMovements
    .filter((m) => m.status === 'PENDING' || m.status === 'RELEASED')
    .reduce((acc, m) => {
      if (m.movementType === 'ISSUE') return acc.plus(parseMonetaryAmount(m.ceilingAmount));
      if (m.movementType === 'PARTIAL_REDEEM' || m.movementType === 'FULL_REDEEM') {
        return acc.minus(parseMonetaryAmount(m.ceilingAmount));
      }
      throw new Error(
        `computeOffBalanceExposure: unexpected SHGT movementType "${m.movementType}" (only ISSUE/PARTIAL_REDEEM/FULL_REDEEM are valid for SHGT).`,
      );
    }, ZERO);
}

/**
 * Business-reported gap 2026-08-15 ("Export S001 都超 Present Docs. E01-E04 應該有一個 Present
 * Earmark Amount 控制 B3＋，B4－") — B3's own single-presentation-vs-Available check (Gap Analysis
 * §6.7) individually passed E01 (50,000), E02 (70,000), E03 (100,000) against a 100,000-Available
 * Confirmation because each was checked against the SAME still-100,000 Available Balance in
 * isolation (Present Docs is MEMO_ONLY — none of them had moved the Confirmation's own balance
 * yet) — their SUM (220,000) was never checked. Only PENDING EPLC_EXAMINATION CREATE amounts
 * count: once B4 actually releases a specific presentation (Honour/Accept), that presentation's
 * own contribution to the Confirmation's real Available Balance is already reflected via the
 * Confirmation's own HONOUR/ACCEPT movement — counting a RELEASED EPLC_EXAMINATION here too would
 * double-subtract it ("B4－" — B4 finalizing a presentation is what retires its earmark).
 */
type ExaminationMovement = Pick<BalanceMovement, 'movementType' | 'ceilingAmount' | 'status' | 'acknowledgedAt'>;

function sumExaminationCreates(examinationMovements: readonly ExaminationMovement[]): Decimal {
  return examinationMovements.reduce((acc, m) => {
    if (m.movementType === 'CREATE') return acc.plus(parseMonetaryAmount(m.ceilingAmount));
    throw new Error(`computePresentDocsEarmark: unexpected EPLC_EXAMINATION movementType "${m.movementType}" (only CREATE is valid).`);
  }, ZERO);
}

/** B3's own sufficiency check (createMovement) — Pending + Approved combined, see the two split functions below for what each half means. */
export function computePresentDocsEarmark(examinationMovements: readonly ExaminationMovement[]): Decimal {
  return sumExaminationCreates(examinationMovements.filter((m) => m.status === 'PENDING'));
}

/**
 * Business instruction 2026-08-15 ("Present Docs 須有一個 Present Docs Earmark (Pending/Approved)
 * 來控制 — B3 Summit => Bill Amount + 至 Present Docs Earmark Pending") — presentations the Maker
 * has submitted but the Checker has not yet acknowledged via B3's own Checker Release (still PENDING,
 * acknowledgedAt still null). Reporting-only split of computePresentDocsEarmark above — does not
 * change the sufficiency check itself, which nets Pending+Approved together either way.
 */
export function computePresentDocsEarmarkPending(examinationMovements: readonly ExaminationMovement[]): Decimal {
  return sumExaminationCreates(examinationMovements.filter((m) => m.status === 'PENDING' && !m.acknowledgedAt));
}

/**
 * ("B3 Release => Present Docs Earmark Pending - Bill Amount, Present Docs Earmark Approved +
 * Bill Amount") — presentations the Checker HAS acknowledged (B3's own Release) but B4 has not yet
 * consumed (still PENDING — B3's acknowledgment never flips status, only B4's own compound Release
 * does that; see acknowledgedAt's own doc comment in types.ts). ("B4 Release Present Docs Earmark
 * Approved - Bill Amount" — once B4 releases it for real, status leaves PENDING and it falls out of
 * this filter on its own, no separate bookkeeping needed.)
 */
export function computePresentDocsEarmarkApproved(examinationMovements: readonly ExaminationMovement[]): Decimal {
  return sumExaminationCreates(examinationMovements.filter((m) => m.status === 'PENDING' && !!m.acknowledgedAt));
}

export interface UtilizeSufficiencyResult {
  ok: boolean;
  /** Set when ok is false — the caller should reject with a 409 InsufficientBalanceError. */
  error?: string;
  /** Set when ok is true but the tighter, off-balance-adjusted threshold was still exceeded — non-blocking. */
  warning?: MovementWarning;
}

/**
 * Design doc §6.1, hardened v0.12 (business-confirmed 2026-08-14, off a live
 * test: a Document Arrival of 50,000 against an LC with confirmedBalance
 * 100,000 and offBalanceExposure 60,000 — tightAvailableBalance 40,000 —
 * was expected to REJECT, not merely warn):
 *   到單金額 > LC Balance(P+A)                    → ERROR (ok=false)
 *   到單金額 > LC Balance(P+A) − 表外餘額(P+A)     → ERROR (ok=false) — was a
 *                                                      non-blocking WARNING
 *                                                      through v0.10/v0.11
 *   else                                           → OK (ok=true)
 *
 * A Document Arrival that is explicitly matched to the specific SHGT record
 * reserving that capacity (the new "Document Arrival w/ Shipping Gtee"
 * function) is NOT penalized by this tightening: the caller creates that
 * SHGT's own FULL_REDEEM movement (still PENDING, not yet Released) BEFORE
 * calling createMovement() for this UTILIZE — computeOffBalanceExposure()
 * above counts PENDING redemptions the same as RELEASED ones, so
 * offBalanceExposure passed in here already has that SG's contribution
 * netted out by the time this check runs. No special-casing needed in this
 * function itself; the caller's ordering does all the work.
 */
export function checkUtilizeSufficiency(params: {
  requestedAmount: Decimal;
  availableBalance: Decimal;
  offBalanceExposure: Decimal;
}): UtilizeSufficiencyResult {
  const { requestedAmount, availableBalance, offBalanceExposure } = params;

  if (requestedAmount.greaterThan(availableBalance)) {
    return {
      ok: false,
      error: `Requested amount ${requestedAmount.toFixed()} exceeds Available Balance ${availableBalance.toFixed()}.`,
    };
  }

  const tightAvailableBalance = availableBalance.minus(offBalanceExposure);
  if (requestedAmount.greaterThan(tightAvailableBalance)) {
    return {
      ok: false,
      error: `Requested amount ${requestedAmount.toFixed()} exceeds Tight Available Balance ${tightAvailableBalance.toFixed()} ` +
        `(Available Balance ${availableBalance.toFixed()} minus outstanding off-balance-sheet (SHGT) exposure ${offBalanceExposure.toFixed()}). ` +
        `If this Document Arrival is meant to consume a specific outstanding Shipping Guarantee's reserved capacity, use ` +
        `"Document Arrival w/ Shipping Gtee" instead — it nets that SG's own exposure out of this check.`,
    };
  }

  return { ok: true };
}
