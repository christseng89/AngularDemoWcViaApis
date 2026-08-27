import { Router } from 'express';
import type { BalanceService } from '../service/balanceService';
import { RequestValidationError } from '../errors';
import type { CreateMovementRequest } from '../service/balanceService';
import type { MovementStatus } from '../types';
import { createMovementRequestSchema, firstValidationMessage } from '../validation/requestSchema';

export function balanceMovementsRouter(service: BalanceService): Router {
  const router = Router();

  // POST /balance-movements
  router.post('/balance-movements', (req, res) => {
    // Quality-report-balance.md BAL-116: was a sequence of hand-rolled `if` checks (presence, the
    // MONETARY_AMOUNT_PATTERN shape, the currency-decimal-scale rule) — now one declarative schema. See
    // requestSchema.ts's own doc comment for exactly what's validated here vs. passed through untouched
    // (`.passthrough()` — every other CreateMovementRequest field is unchanged from before this fix).
    const parsed = createMovementRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new RequestValidationError(firstValidationMessage(parsed.error));
    }
    const body = parsed.data as CreateMovementRequest;
    const result = service.createMovement(body);
    res.status(result.created ? 201 : 200).json(result.created ? result.movement : result.existing);
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
  // GET /balance-movements?createdBy=&status=&page=&pageSize= — Fix Pending/Delete Pending Phase 2
  // (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §2.1) — the Maker Queue's own
  // "My Pending/My Rejected" worklist. A second, independent query shape on the same route (mutually
  // exclusive with businessEventId above) rather than a new endpoint — same convention this route
  // already establishes. `status` is a comma-separated list; defaults to PENDING,REJECTED when omitted.
  router.get('/balance-movements', (req, res) => {
    const { businessEventId, createdBy, status, page, pageSize } = req.query as {
      businessEventId?: string;
      createdBy?: string;
      status?: string;
      page?: string;
      pageSize?: string;
    };
    if (businessEventId) {
      res.json(service.findByBusinessEventId(businessEventId));
      return;
    }
    if (createdBy) {
      res.json(
        service.listMyMovements({
          createdBy,
          statuses: status ? (status.split(',') as MovementStatus[]) : undefined,
          page: page ? Number(page) : undefined,
          pageSize: pageSize ? Number(pageSize) : undefined,
        }),
      );
      return;
    }
    throw new RequestValidationError('businessEventId or createdBy query parameter is required.');
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
