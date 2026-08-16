import { Router } from 'express';
import type { BalanceService } from '../service/balanceService';
import { RequestValidationError } from '../errors';
import type { CreateMovementRequest } from '../service/balanceService';
import { MONETARY_AMOUNT_PATTERN, describeAmountScaleViolation } from '../money';

export function balanceMovementsRouter(service: BalanceService): Router {
  const router = Router();

  // POST /balance-movements
  router.post('/balance-movements', (req, res) => {
    const body = req.body as CreateMovementRequest;
    if (!body.instrumentType || !body.movementType || body.eventSeq === undefined || !body.amount || !body.currency || !body.createdBy) {
      throw new RequestValidationError('instrumentType, movementType, eventSeq, amount, currency, createdBy are required.');
    }
    // Business requirement 2026-08-16 ("JPY 10000 without cents" -> "must be enforced server-side
    // based on the currency code and its configured currency decimal place"). The pattern check comes
    // first, deliberately — decimalPlaces()/describeAmountScaleViolation() assume an already
    // pattern-valid string, and this also closes a pre-existing gap where a malformed (but non-empty)
    // amount used to fall through unvalidated to computeCeilingAmount()/parseMonetaryAmount() deep in
    // the service layer, surfacing as a generic 500 INTERNAL_ERROR instead of a proper 400 here.
    if (!MONETARY_AMOUNT_PATTERN.test(body.amount)) {
      throw new RequestValidationError(`amount "${body.amount}" is not a valid MonetaryAmount (expected ${MONETARY_AMOUNT_PATTERN}).`);
    }
    const scaleViolation = describeAmountScaleViolation(body.amount, body.currency);
    if (scaleViolation) {
      throw new RequestValidationError(scaleViolation);
    }
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

  // POST /balance-movements/:movementId/acknowledge — B3's own Checker Release on a Present Docs
  // earmark (business instruction 2026-08-15, "Present Docs Earmark (Pending/Approved)"); EPLC_
  // EXAMINATION/CREATE only, never changes status (see service.acknowledge()'s own doc comment).
  router.post('/balance-movements/:movementId/acknowledge', (req, res) => {
    const { acknowledgedBy } = req.body as { acknowledgedBy?: string };
    if (!acknowledgedBy) throw new RequestValidationError('acknowledgedBy is required.');
    res.json(service.acknowledge(req.params.movementId, acknowledgedBy));
  });

  return router;
}
