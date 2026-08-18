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
export function computeOffBalanceExposure(shgtMovements: readonly Pick<BalanceMovement, 'movementType' | 'ceilingAmount' | 'status'>[]): Decimal {
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
type ExaminationMovement = Pick<BalanceMovement, 'movementType' | 'ceilingAmount' | 'status' | 'presentDocsConsumedAt'>;

function sumExaminationCreates(examinationMovements: readonly ExaminationMovement[]): Decimal {
  return examinationMovements.reduce((acc, m) => {
    if (m.movementType === 'CREATE') return acc.plus(parseMonetaryAmount(m.ceilingAmount));
    throw new Error(`computePresentDocsEarmark: unexpected EPLC_EXAMINATION movementType "${m.movementType}" (only CREATE is valid).`);
  }, ZERO);
}

/**
 * B3's own sufficiency check (createMovement) — Pending + Approved combined, see the two split
 * functions below for what each half means.
 *
 * Basis changed 2026-08-18 (business instruction, "所有交易要RELEASE過後 才能根據流程走下一個交易" — B3
 * must genuinely RELEASE before B4, the next step in the flow, can act on it — superseding the prior
 * "B3 stays PENDING forever, acknowledgedAt is a reporting-only split" design). A presentation now
 * occupies capacity from Maker Submit (PENDING) all the way through B3's own real Checker Release
 * (RELEASED) — it drops out ONLY once `presentDocsConsumedAt` is set, i.e. once B4 actually consumes it
 * (releases its own linked HONOUR/ACCEPT — see BalanceService.release()'s own auto-consume side effect).
 * This preserves the ORIGINAL commitment-control intent (E01+E02+E03 must never exceed Available
 * Balance) across the now-real PENDING->RELEASED transition B3 undergoes on its own — without this
 * `presentDocsConsumedAt` gate, a genuinely-RELEASED-but-not-yet-B4-consumed presentation would
 * incorrectly stop being counted the instant its own Checker approved it, opening a window where the
 * bank could over-commit beyond the LC's real capacity before B4 ever decides Honour/Accept.
 */
export function computePresentDocsEarmark(examinationMovements: readonly ExaminationMovement[]): Decimal {
  return sumExaminationCreates(examinationMovements.filter((m) => !m.presentDocsConsumedAt && (m.status === 'PENDING' || m.status === 'RELEASED')));
}

/**
 * Business instruction 2026-08-15 ("Present Docs 須有一個 Present Docs Earmark (Pending/Approved)
 * 來控制 — B3 Summit => Bill Amount + 至 Present Docs Earmark Pending") — presentations the Maker has
 * submitted but the Checker has not yet genuinely Released (B3's own real Checker Release, see
 * computePresentDocsEarmark's own doc comment for the 2026-08-18 basis change). A movement in this
 * bucket can never also be `presentDocsConsumedAt` (consumption only ever happens after RELEASE), so no
 * separate check is needed here.
 */
export function computePresentDocsEarmarkPending(examinationMovements: readonly ExaminationMovement[]): Decimal {
  return sumExaminationCreates(examinationMovements.filter((m) => m.status === 'PENDING'));
}

/**
 * ("B3 Release => Present Docs Earmark Pending - Bill Amount, Present Docs Earmark Approved +
 * Bill Amount") — presentations the Checker HAS genuinely Released (B3's own real Checker Release,
 * status RELEASED) but B4 has not yet consumed (`presentDocsConsumedAt` still null). ("B4 Release
 * Present Docs Earmark Approved - Bill Amount" — once B4 releases its own linked HONOUR/ACCEPT,
 * `presentDocsConsumedAt` is set and it falls out of this filter, no separate bookkeeping needed.)
 */
export function computePresentDocsEarmarkApproved(examinationMovements: readonly ExaminationMovement[]): Decimal {
  return sumExaminationCreates(examinationMovements.filter((m) => m.status === 'RELEASED' && !m.presentDocsConsumedAt));
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
      error:
        `Requested amount ${requestedAmount.toFixed()} exceeds Tight Available Balance ${tightAvailableBalance.toFixed()} ` +
        `(Available Balance ${availableBalance.toFixed()} minus outstanding off-balance-sheet (SHGT) exposure ${offBalanceExposure.toFixed()}). ` +
        `If this Document Arrival is meant to consume a specific outstanding Shipping Guarantee's reserved capacity, use ` +
        `"Document Arrival w/ Shipping Gtee" instead — it nets that SG's own exposure out of this check.`,
    };
  }

  return { ok: true };
}
