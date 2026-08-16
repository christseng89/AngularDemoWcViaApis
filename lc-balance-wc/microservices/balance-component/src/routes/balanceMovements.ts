import { Router } from 'express';
import type { BalanceService } from '../service/balanceService';
import { RequestValidationError } from '../errors';
import type { CreateMovementRequest } from '../service/balanceService';
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
