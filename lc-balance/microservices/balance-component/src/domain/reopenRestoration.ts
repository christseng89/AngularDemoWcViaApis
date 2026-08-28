/**
 * F1 (external BA review) §9, redesigned 2026-08-25 after live UAT ("Checker要看交易出的帳 再決定 APPROVE
 * 或 REJECT" — the original design's own REOPEN-then-linked-REVERSAL two-movement shape meant a Checker
 * approving REOPEN itself saw a zero-amount, no-entry movement; the REAL restoration only appeared as a
 * SEPARATE movement generated as release()'s own side effect, after approval, with no chance to review
 * it first — and the two rows also cluttered Inquire Events/Look Up for what is conceptually one event).
 *
 * REOPEN now carries its own real, positive restoration amount from the moment it is Maker-Submitted —
 * computed here, not typed by the Maker (there is nothing for a human to type: the correct figure is a
 * pure function of this contract's own history). service/balanceService.ts calls this both at Submit
 * (to set the movement's own amount/ceilingAmount and generate a real contingentAccountEntry the Checker
 * reviews BEFORE approving) and again at Release (to re-verify nothing shifted the figure in between,
 * same "re-verify against the THEN-current state" posture CLOSE/EXPIRE already use for their own exact-
 * amount checks).
 *
 * The amount to restore is the contract's own trailing run of RELEASED EXPIRE/CLOSE write-offs — walking
 * from the most RECENT movement backward and summing consecutive EXPIRE/CLOSE ceilingAmounts, stopping at
 * the first movement that is neither (§9.7: a contract reaches CLOSED via one direct human CLOSE — one
 * movement in the run — or via AUTO EXPIRY followed by AUTO CLOSE — two movements in the run, EXPIRE then
 * CLOSE, restoring their SUM since CLOSE's own write-off amount is already 0 by the time it runs). A
 * contract already reopened once and re-closed again is handled correctly by the same walk with no extra
 * bookkeeping: the intervening REOPEN movement itself is neither EXPIRE nor CLOSE, so the walk naturally
 * stops there rather than double-counting the earlier chain.
 *
 * A11/B7 Fix Pending §19 (redesigned 2026-08-29) corrects a REOPEN's own row IN PLACE (same
 * movementId/eventSeq, no second row) — this walk never sees a stale duplicate, no filtering needed.
 */
import Decimal from 'decimal.js';
import { parseMonetaryAmount, ZERO } from '../money';
import type { BalanceMovement } from '../types';

export function computeReopenRestoreAmount(movements: readonly Pick<BalanceMovement, 'eventSeq' | 'movementType' | 'status' | 'ceilingAmount'>[]): Decimal {
  const sorted = [...movements].sort((a, b) => a.eventSeq - b.eventSeq);
  let total = ZERO;
  for (const m of [...sorted].reverse()) {
    if (m.status === 'RELEASED' && (m.movementType === 'EXPIRE' || m.movementType === 'CLOSE')) {
      total = total.plus(parseMonetaryAmount(m.ceilingAmount));
      continue;
    }
    break;
  }
  return total;
}
