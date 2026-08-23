import { Router } from 'express';
import type { BalanceService } from '../service/balanceService';
import { RequestValidationError } from '../errors';
import type { CreateMovementRequest } from '../service/balanceService';
import type { StandingCalendarRef, AdjustBusinessDayRequest } from '../clients/standingClient';
import { createMovementRequestSchema, firstValidationMessage } from '../validation/requestSchema';

export function balanceMovementsRouter(service: BalanceService): Router {
  const router = Router();

  // POST /balance-movements
  //
  // Async ONLY because of the A6/B4 Calculated Maturity Date pre-step below — every other route handler
  // in this file stays synchronous, matching `node:sqlite`'s own synchronous DB layer (see
  // `db/index.ts`'s doc comment) and `BalanceService.createMovement()`'s own doc comment on why that
  // method itself was deliberately NOT made async. Express 4 does not auto-forward a rejected Promise
  // from an async handler to the error middleware (unlike a synchronous `throw`, which it does catch
  // automatically) — the try/catch + `next(err)` here exists specifically to preserve that same
  // catch-all error handling for this one now-async handler.
  router.post('/balance-movements', async (req, res, next) => {
    try {
      // Quality-report-balance.md BAL-116: was a sequence of hand-rolled `if` checks (presence, the
      // MONETARY_AMOUNT_PATTERN shape, the currency-decimal-scale rule) — now one declarative schema. See
      // requestSchema.ts's own doc comment for exactly what's validated here vs. passed through untouched
      // (`.passthrough()` — every other CreateMovementRequest field is unchanged from before this fix).
      const parsed = createMovementRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new RequestValidationError(firstValidationMessage(parsed.error));
      }
      const body = parsed.data as CreateMovementRequest;

      // Risk Containment Gate (Maturity-Date-Tenor-Basis-Decision-Review.md v29 §8, P0) — REPLACES the
      // former "unconditionally use today as Base Date, regardless of tenorBasis" auto-calc (a real,
      // confirmed bug: it silently produced a wrong Contractual Maturity Date for any tenorBasis whose
      // Base Date isn't coincidentally "today", with no warning — see CLAUDE.md's own decision log for
      // the full incident writeup). A caller-supplied `maturityDate` on an Acceptance CREATE is no longer
      // trusted at all — there is no way to verify it against a tenorBasis/Base Date, so it is REJECTED
      // outright rather than silently accepted (v29's own repeated finding: "PENDING_APPROVAL" requires a
      // basis that's actually been verified, and an unverified passthrough value does not qualify).
      // Today's ONLY verified Base Date source is `tenorBasis === 'FIXED_MATURITY_DATE'` (uses
      // `fixedMaturityDate` directly, no Tenor Days arithmetic) — every other tenorBasis (AFTER_SIGHT/
      // AFTER_BL_DATE/AFTER_INVOICE_DATE/AFTER_SHIPMENT_DATE/AFTER_ACCEPTANCE) has no Base Date source
      // wired yet (sightDate/blDate/invoiceDate/shipmentDate/Acceptance-Date-operational-definition are
      // all still pending business confirmation) and is left at the safe default: `maturityDateStatus:
      // 'PENDING_BASE_DATE'`, no Contractual/Operational Maturity Date computed. This is an ACCEPTED
      // interim consequence, not a bug — see v29 §8's own "Risk Containment Gate ≠ Business Go-Live Gate"
      // framing: no wrong date is ever produced, but most Usance Acceptances cannot reach A7/B5
      // Settlement until a real Base Date source is wired for their own tenorBasis.
      const isAcceptanceCreate = (body.instrumentType === 'IPLC_ACCEPTANCE' || body.instrumentType === 'EPLC_ACCEPTANCE') && body.movementType === 'CREATE';
      if (isAcceptanceCreate && body.maturityDate != null) {
        throw new RequestValidationError(
          'A caller-supplied maturityDate is no longer accepted on an Acceptance CREATE — there is no way to verify it against a tenorBasis/Base Date. ' +
            "Omit it entirely; the contract stays at maturityDateStatus='PENDING_BASE_DATE' until a verified Base Date source (currently only tenorBasis='FIXED_MATURITY_DATE') is available.",
        );
      }
      if (isAcceptanceCreate && body.parentLogicalContractId) {
        const parentCalendars = service.getMaturityDateCalendarsFromParent(body.parentLogicalContractId);
        if (parentCalendars?.tenorBasis === 'FIXED_MATURITY_DATE' && parentCalendars.fixedMaturityDate) {
          const sourceDate = parentCalendars.fixedMaturityDate;
          const { operationalPaymentDate, standingCalculationId, calendarSnapshotId } = await service.calculateAcceptanceMaturityDate({
            sourceDate,
            currency: body.currency,
            calendars: parentCalendars.calendars as StandingCalendarRef[],
            combinationRule: (parentCalendars.combinationRule ?? undefined) as AdjustBusinessDayRequest['combinationRule'] | undefined,
            convention: (parentCalendars.convention ?? undefined) as AdjustBusinessDayRequest['convention'] | undefined,
          });
          body.contractualMaturityDate = sourceDate;
          body.operationalPaymentDate = operationalPaymentDate;
          body.standingCalculationId = standingCalculationId;
          body.calendarSnapshotId = calendarSnapshotId;
        }
        // Every other tenorBasis (including none on file) is deliberately left uncalculated here —
        // createMovement()/createContract() default a new Acceptance to maturityDateStatus:
        // 'PENDING_BASE_DATE' whenever contractualMaturityDate is absent from the request.
      }

      const result = service.createMovement(body);
      res.status(result.created ? 201 : 200).json(result.created ? result.movement : result.existing);
    } catch (err) {
      next(err);
    }
  });

  // POST /balance-movements/:movementId/release
  router.post('/balance-movements/:movementId/release', (req, res) => {
    const { releasedBy } = req.body as { releasedBy?: string };
    if (!releasedBy) throw new RequestValidationError('releasedBy is required.');
    res.json(service.release(req.params.movementId, releasedBy));
  });

  // GET /balance-movements/:movementId/balance-as-of — snapshot right after this specific event (business instruction 2026-08-14)
  router.get('/balance-movements/:movementId/balance-as-of', (req, res) => {
    res.json(service.getBalanceSnapshotAsOfMovement(req.params.movementId));
  });

  // GET /balance-movements?businessEventId= — bug fixed 2026-08-16 (reviewer-reported, "A1 -> A8 ->
  // A3S -> A4, the related SG entries was not shown"): lets a Checker session independently resolve
  // the linked leg(s) of a compound submission (A3S's SG redemption, B5's Reimbursement Receivable)
  // by their shared businessEventId, instead of requiring the Maker's own in-memory submitResult to
  // still be present — see BalanceMovementStore.findByBusinessEventId's own doc comment.
  router.get('/balance-movements', (req, res) => {
    const { businessEventId } = req.query as { businessEventId?: string };
    if (!businessEventId) throw new RequestValidationError('businessEventId query parameter is required.');
    res.json(service.findByBusinessEventId(businessEventId));
  });

  // POST /balance-movements/:movementId/reject
  router.post('/balance-movements/:movementId/reject', (req, res) => {
    const { releasedBy, reasonCode, remarks } = req.body as { releasedBy?: string; reasonCode?: string; remarks?: string };
    if (!releasedBy || !reasonCode) throw new RequestValidationError('releasedBy and reasonCode are required.');
    res.json(service.reject(req.params.movementId, releasedBy, reasonCode, remarks));
  });

  // POST /balance-movements/:movementId/cancel — Maker-initiated EC (Error Correction) on their own
  // still-PENDING entry (business instruction 2026-08-15), distinct from /reject (a Checker's decline).
  router.post('/balance-movements/:movementId/cancel', (req, res) => {
    const { cancelledBy, reasonCode, remarks } = req.body as { cancelledBy?: string; reasonCode?: string; remarks?: string };
    if (!cancelledBy) throw new RequestValidationError('cancelledBy is required.');
    res.json(service.cancel(req.params.movementId, cancelledBy, reasonCode, remarks));
  });

  // POST /balance-movements/:movementId/acknowledge — B3's own former Checker acknowledgment-only path
  // was removed 2026-08-18 (B3 now uses the standard /release route above). Restored 2026-08-20,
  // re-purposed for A3/A3S instead (business instruction, "A3 A3S 交易 Approve 過後 不要再顯示") — sets
  // acknowledgedBy/acknowledgedAt on the LC's own UTILIZE without touching status, so the Checker Queue
  // can filter it out once approved (see service.acknowledgeArrival()'s own doc comment).
  router.post('/balance-movements/:movementId/acknowledge', (req, res) => {
    const { acknowledgedBy } = req.body as { acknowledgedBy?: string };
    if (!acknowledgedBy) throw new RequestValidationError('acknowledgedBy is required.');
    res.json(service.acknowledgeArrival(req.params.movementId, acknowledgedBy));
  });

  // POST /balance-movements/:movementId/maker-submit — A4's own real Maker Submit (business
  // instruction 2026-08-16, "Add real Maker Submit, then have Checker to Release it. Exactly the
  // same as A1."); IPLC_LC/UTILIZE only, never changes status (see service.submitByMaker()'s own
  // doc comment).
  router.post('/balance-movements/:movementId/maker-submit', (req, res) => {
    const { makerSubmittedBy } = req.body as { makerSubmittedBy?: string };
    if (!makerSubmittedBy) throw new RequestValidationError('makerSubmittedBy is required.');
    res.json(service.submitByMaker(req.params.movementId, makerSubmittedBy));
  });

  return router;
}
