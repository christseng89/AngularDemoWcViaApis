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

/**
 * §6.1 — Σ (PENDING+RELEASED) SHGT `ISSUE` net of `PARTIAL_REDEEM`/`FULL_REDEEM`, for SHGT contracts
 * under the same parentLogicalContractId. Caller is responsible for having already filtered movements to
 * that SHGT logical contract's own movements.
 *
 * `ISSUE` (occupies capacity) counts from PENDING already — "占用從寬", the same asymmetric-netting rule
 * `computePendingDecreaseTotal` documents elsewhere. `PARTIAL_REDEEM`/`FULL_REDEEM` (releases capacity
 * back — an "increase" in usable capacity, not an occupancy) is the OPPOSITE case and, since 2026-08-20,
 * only counts once genuinely **RELEASED** — "增加從嚴，對 LC Balance 而言" (business-confirmed scoping: the
 * strict "only count once Approved" rule protects the LC's OWN capacity figure from a genuinely SEPARATE,
 * later Checker decision going the other way — it is not about second-guessing a redemption that is
 * itself part of the SAME compound event as the LC-side movement consuming it). A Maker-Submitted-but-
 * not-yet-Checker-approved STANDALONE redemption must not inflate what a DIFFERENT, unrelated submission
 * (a new SG Issue via A8, or a new plain Document Arrival via A3) sees as usable Tight Available Balance.
 * Business-reported scenario (2026-08-20, live-reasoned through by the reviewer): SG G01 (800k) issued
 * and released against LC S01; its own redemption is Maker-Submitted (PENDING, awaiting Checker) once the
 * original B/L arrives; before that Checker approval, a SECOND, unrelated SG Issue (900k) for a different
 * shipment under the SAME LC was checked against Tight Available Balance that had ALREADY been inflated
 * by the first (still unapproved) redemption — if the Checker then rejects that first redemption (wrong
 * SG number, docs incomplete), the bank ends up carrying BOTH the original 800k SG (never actually
 * released) and the new 900k SG at once, over the LC's own real capacity, entirely because the system
 * itself released capacity before Checker approval — not a Maker/Checker process failure.
 *
 * `matchedPendingUtilizeBusinessEventIds` is the ONE deliberate, narrowly-scoped exception: A3S's own
 * compound submission (`maker-submit.service.ts`'s `submitDocumentArrivalWithSg()`) creates the matched
 * SG's own redemption FIRST (still PENDING), then immediately submits the LC's own `UTILIZE` in the SAME
 * logical transaction, sharing one `businessEventId` — from the LC's OWN capacity's point of view, this
 * pair is a single reclassification event (contingent SG exposure becoming direct LC utilization), not an
 * independent "increase" the strict rule above needs to hold back: only the INCREMENTAL amount beyond
 * what the SG already covered (Bill Amount minus SG Outstanding, when Bill Amount is larger — see
 * "Document Arrival w/ Shipping Gtee"'s own hint) is genuinely new LC-side occupancy. Business-confirmed
 * live (2026-08-20, S02/G02: LC 10,000, SG 8,000, Bill Amount 10,000 — Pending Earmark Total should read
 * +8,000 (the SG's own side, still shown as its own PENDING redemption) net −2,000 (the LC's own genuinely
 * NEW occupancy), not −10,000 double-counting the SG's already-reserved 8,000 a second time). A caller
 * passes the set of `businessEventId`s belonging to currently-PENDING `UTILIZE` movements on the SAME
 * parent LC — a redemption only nets if its OWN `businessEventId` is a member; an unrelated standalone
 * redemption (no matching sibling UTILIZE at all) never matches and stays excluded until it, too, is
 * actually Released. `assembleSnapshot()` derives this set automatically from its own `movements` list —
 * see its own doc comment; A8's own new-SG-Issue check and A2's own AMEND_DECREASE check pass an empty
 * set (irrelevant to either) and get the strict, RELEASED-only redemption netting.
 */
export function computeOffBalanceExposure(
  shgtMovements: readonly Pick<BalanceMovement, 'movementType' | 'ceilingAmount' | 'status' | 'businessEventId'>[],
  matchedPendingUtilizeBusinessEventIds: ReadonlySet<string> = new Set(),
): Decimal {
  return shgtMovements
    .filter((m) => {
      if (m.status === 'RELEASED') return true;
      if (m.status !== 'PENDING') return false;
      if (m.movementType === 'ISSUE') return true;
      return !!m.businessEventId && matchedPendingUtilizeBusinessEventIds.has(m.businessEventId);
    })
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

/** Discriminated union (2026-08-20, reviewer-directed) — see AcceptanceTenorCheckResult's own doc comment for why. */
export type ShgtIssueSufficiencyResult = { ok: true } | { ok: false; error: string };

/**
 * Business instruction 2026-08-14 ("SG issue amount should be less than the LC Current Balance" — "For
 * example S001 has 3000 LC Available Balance, the SG Issue should be not greater than 3000... It should
 * be a validation for the Maker Input."), business-confirmed fix 2026-08-14 (v0.11, nets out other
 * already-outstanding SG exposure on the same LC first — see `computeOffBalanceExposure` above, which is
 * how the caller derives `existingShgtExposure`). Extracted from `BalanceService.createMovement()`'s own
 * inline "creating a new contract" branch (desiger-comments.md finding F-02) — pure code motion, same
 * error message/condition as before.
 */
export function checkShgtIssueSufficiency(params: {
  requestedAmount: Decimal;
  parentConfirmedBalance: Decimal;
  parentPendingDecreaseTotal: Decimal;
  existingShgtExposure: Decimal;
}): ShgtIssueSufficiencyResult {
  const { requestedAmount, parentConfirmedBalance, parentPendingDecreaseTotal, existingShgtExposure } = params;
  const tightAvailable = parentConfirmedBalance.minus(parentPendingDecreaseTotal).minus(existingShgtExposure);
  if (requestedAmount.greaterThan(tightAvailable)) {
    return {
      ok: false,
      error:
        `SG Issue amount ${requestedAmount.toFixed()} exceeds parent LC's Tight Available Balance ${tightAvailable.toFixed()} ` +
        `(Confirmed Balance ${parentConfirmedBalance.toFixed()} minus ${parentPendingDecreaseTotal.toFixed()} still-PENDING decrease(s) ` +
        `minus ${existingShgtExposure.toFixed()} already-outstanding Shipping Guarantee exposure on this same LC — only APPROVED amounts ` +
        `count as usable capacity).`,
    };
  }
  return { ok: true };
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
type ExaminationMovement = Pick<BalanceMovement, 'movementId' | 'movementType' | 'ceilingAmount' | 'status' | 'presentDocsConsumedAt'>;

function sumExaminationCreates(examinationMovements: readonly ExaminationMovement[]): Decimal {
  return examinationMovements.reduce((acc, m) => {
    if (m.movementType === 'CREATE') return acc.plus(parseMonetaryAmount(m.ceilingAmount));
    throw new Error(`computePresentDocsEarmark: unexpected EPLC_EXAMINATION movementType "${m.movementType}" (only CREATE is valid).`);
  }, ZERO);
}

/**
 * Export-side sibling of `computeOffBalanceExposure()`'s own `matchedPendingUtilizeBusinessEventIds`
 * derivation — see that function's own doc comment for the full "SG 贖回提早放行" rationale, and B4's own
 * table below for why B3/B4 correlate via `referencedTransactionId` (B3 was created in an EARLIER,
 * separate submission — B4 only picks and references it later, never sharing a `businessEventId`) rather
 * than the `businessEventId` matching A3S's own SAME-request compound pair uses. Returns the `movementId`s
 * of EPLC_EXAMINATION `CREATE` records that a currently-PENDING Confirmation `HONOUR`/`ACCEPT` movement
 * already references — B4's own Maker Submit, before its own Checker Release ever runs the real
 * `markPresentDocsConsumed()` side effect. `computePresentDocsEarmark()` treats these as provisionally
 * consumed for the SAME reason A3S's matched SG redemption nets early: B4's two legs (or three, for
 * Usance) are always released together by one Checker action, so there is no cross-transaction leakage
 * risk in not double-counting the SAME presentation as both "B4's own new occupancy" and "still-open B3
 * earmark" during that Submit-to-Release window.
 */
export function derivePresentDocsProvisionallyConsumedIds(
  confirmationMovements: readonly Pick<BalanceMovement, 'status' | 'referencedTransactionId'>[],
): ReadonlySet<string> {
  return new Set(
    confirmationMovements.filter((m) => m.status === 'PENDING' && m.referencedTransactionId).map((m) => m.referencedTransactionId as string),
  );
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
 *
 * Business-reported scenario 2026-08-20 ("B4 U02 也有類似問題 Tight Available Balance -10000", the
 * Export-side twin of "A35... S02 G02... -8000???" — live-reproduced: B1 Confirm LC 10,000 Usance
 * Approved → B3 Present Docs 10,000 Approved → B4 Acceptance 10,000 Submit): `provisionallyConsumedIds`
 * (see `derivePresentDocsProvisionallyConsumedIds()` above) excludes a B3 record B4's own still-PENDING
 * `HONOUR`/`ACCEPT` already references, for the same "one reclassification event, not an independent
 * double-count" reason A3S's own matched SG redemption nets early — without it, B4's own new 10,000
 * occupancy (via the Confirmation's own `pendingDecreaseTotal`) stacked on TOP of B3's own still-full
 * 10,000 earmark, landing on the same confusing negative Tight Available Balance.
 */
export function computePresentDocsEarmark(
  examinationMovements: readonly ExaminationMovement[],
  provisionallyConsumedIds: ReadonlySet<string> = new Set(),
): Decimal {
  return sumExaminationCreates(
    examinationMovements.filter(
      (m) => !m.presentDocsConsumedAt && (m.status === 'PENDING' || m.status === 'RELEASED') && !provisionallyConsumedIds.has(m.movementId),
    ),
  );
}

/** Discriminated union (2026-08-20, reviewer-directed) — see AcceptanceTenorCheckResult's own doc comment for why. */
export type PresentDocsIssueSufficiencyResult = { ok: true } | { ok: false; error: string };

/**
 * B3's own sufficiency check at CREATE time (business-reported gap 2026-08-15, "B3 沒檢查到單金額超過
 * Balance餘額", hardened the same day per `computePresentDocsEarmark`'s own doc comment). Extracted from
 * `BalanceService.createMovement()`'s own inline "creating a new contract" branch (desiger-comments.md
 * finding F-02) — pure code motion, same error message/condition as before.
 */
export function checkPresentDocsIssueSufficiency(params: {
  requestedAmount: Decimal;
  parentConfirmedBalance: Decimal;
  parentPendingDecreaseTotal: Decimal;
  presentDocsEarmark: Decimal;
  parentConfirmationBalanceContractId: string;
}): PresentDocsIssueSufficiencyResult {
  const { requestedAmount, parentConfirmedBalance, parentPendingDecreaseTotal, presentDocsEarmark, parentConfirmationBalanceContractId } = params;
  const tightAvailable = parentConfirmedBalance.minus(parentPendingDecreaseTotal).minus(presentDocsEarmark);
  if (requestedAmount.greaterThan(tightAvailable)) {
    return {
      ok: false,
      error:
        `Present Docs amount ${requestedAmount.toFixed()} exceeds the parent Confirmation's Present Earmark-adjusted Tight Available Balance ` +
        `${tightAvailable.toFixed()} (Confirmed Balance ${parentConfirmedBalance.toFixed()} minus ${parentPendingDecreaseTotal.toFixed()} ` +
        `still-PENDING decrease(s) minus ${presentDocsEarmark.toFixed()} already-outstanding Present Docs earmark on this same Confirmation, ` +
        `balanceContractId ${parentConfirmationBalanceContractId}) — this presentation could never be Honoured/Accepted in full alongside the ` +
        `other still-open presentations on this LC.`,
    };
  }
  return { ok: true };
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
 *
 * Business-confirmed 2026-08-20 ("Present Docs Earmark (Approved) 10000 減掉10000 -> 0" — B4 U02, Submit
 * not yet Release): `provisionallyConsumedIds` drops a B3 record out of this bucket the moment B4's own
 * still-PENDING `HONOUR`/`ACCEPT` already references it, same as `computePresentDocsEarmark()`'s own
 * combined figure — the Approved SPLIT figure must agree with the combined one, not lag behind it.
 */
export function computePresentDocsEarmarkApproved(
  examinationMovements: readonly ExaminationMovement[],
  provisionallyConsumedIds: ReadonlySet<string> = new Set(),
): Decimal {
  return sumExaminationCreates(
    examinationMovements.filter((m) => m.status === 'RELEASED' && !m.presentDocsConsumedAt && !provisionallyConsumedIds.has(m.movementId)),
  );
}

/**
 * Discriminated union (2026-08-20, reviewer-directed) — see AcceptanceTenorCheckResult's own doc comment
 * for why. `warning` is only ever meaningful on the `ok: true` arm (set when the tighter, off-balance-
 * adjusted threshold was still exceeded — non-blocking); current code never actually populates it (see
 * `checkUtilizeSufficiency`'s own body below), kept only because the OAS/DB schema still carry the field.
 */
export type UtilizeSufficiencyResult = { ok: true; warning?: MovementWarning } | { ok: false; error: string };

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
  confirmedBalance: Decimal;
  pendingDecreaseTotal: Decimal;
  offBalanceExposure: Decimal;
}): UtilizeSufficiencyResult {
  const { requestedAmount, availableBalance, confirmedBalance, pendingDecreaseTotal, offBalanceExposure } = params;

  if (requestedAmount.greaterThan(availableBalance)) {
    return {
      ok: false,
      error: `Requested amount ${requestedAmount.toFixed()} exceeds Available Balance ${availableBalance.toFixed()}.`,
    };
  }

  const tightAvailableBalance = confirmedBalance.minus(pendingDecreaseTotal).minus(offBalanceExposure);
  if (requestedAmount.greaterThan(tightAvailableBalance)) {
    return {
      ok: false,
      error:
        `Requested amount ${requestedAmount.toFixed()} exceeds Tight Available Balance ${tightAvailableBalance.toFixed()} ` +
        `(Confirmed Balance ${confirmedBalance.toFixed()} minus ${pendingDecreaseTotal.toFixed()} still-PENDING decrease(s) minus outstanding ` +
        `off-balance-sheet (SHGT) exposure ${offBalanceExposure.toFixed()} — only APPROVED amounts count as usable capacity). ` +
        `If this Document Arrival is meant to consume a specific outstanding Shipping Guarantee's reserved capacity, use ` +
        `"Document Arrival w/ Shipping Gtee" instead — it nets that SG's own exposure out of this check.`,
    };
  }

  return { ok: true };
}
