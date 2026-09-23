import { Router, type NextFunction, type Request, type Response } from 'express';
import type { BalanceService, CreateMovementRequest, EditMovementRequest } from '../service/balanceService';
import type { CompoundMovementService } from '../service/compoundMovementService';
import { RequestValidationError } from '../errors';
import type { MovementStatus } from '../types';
import { createMovementRequestSchema, editMovementRequestSchema, firstValidationMessage } from '../validation/requestSchema';
import type { ExportAuthorizationClaim } from '../domain/exportAssetPosting';

function parseExportAuthorization(value: unknown): ExportAuthorizationClaim {
  if (value === undefined) return { claimStatus: 'ABSENT', authorizationValidationResult: 'NOT_CONFIRMED' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RequestValidationError('exportAuthorization must be an object.');
  const claim = value as Record<string, unknown>;
  const allowed = new Set(['claimStatus', 'authorizationReference', 'authorizedAmountOwner', 'authorizedCurrency', 'authorizationValidationResult']);
  if (Object.keys(claim).some((key) => !allowed.has(key))) throw new RequestValidationError('exportAuthorization contains unsupported fields.');
  if (claim.claimStatus !== 'ABSENT' && claim.claimStatus !== 'SUBMITTED') {
    throw new RequestValidationError('exportAuthorization.claimStatus must be ABSENT or SUBMITTED.');
  }
  if (claim.authorizationValidationResult !== 'CONFIRMED' && claim.authorizationValidationResult !== 'NOT_CONFIRMED') {
    throw new RequestValidationError('exportAuthorization.authorizationValidationResult must be CONFIRMED or NOT_CONFIRMED.');
  }
  for (const field of ['authorizationReference', 'authorizedAmountOwner', 'authorizedCurrency'] as const) {
    if (claim[field] !== undefined && typeof claim[field] !== 'string') {
      throw new RequestValidationError(`exportAuthorization.${field} must be a string when provided.`);
    }
  }
  if (claim.claimStatus === 'ABSENT') {
    if (claim.authorizationValidationResult !== 'NOT_CONFIRMED') {
      throw new RequestValidationError('ABSENT export authorization cannot be CONFIRMED.');
    }
    return { claimStatus: 'ABSENT', authorizationValidationResult: 'NOT_CONFIRMED' };
  }
  return {
    claimStatus: 'SUBMITTED',
    authorizationReference: claim.authorizationReference as string | undefined,
    authorizedAmountOwner: claim.authorizedAmountOwner as string | undefined,
    authorizedCurrency: claim.authorizedCurrency as string | undefined,
    authorizationValidationResult: claim.authorizationValidationResult,
  };
}

export function balanceMovementsRouter(service: BalanceService, compound: CompoundMovementService): Router {
  const router = Router();

  router.post('/balance-movements/excess-preview', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as { functionCode?: unknown; request?: unknown; requests?: unknown; excludeMovementId?: unknown };
      if (body.functionCode !== 'A3' && body.functionCode !== 'A3S' && body.functionCode !== 'B3') {
        throw new RequestValidationError('functionCode must be A3, A3S or B3.');
      }
      if (body.excludeMovementId !== undefined && (typeof body.excludeMovementId !== 'string' || !body.excludeMovementId.trim())) {
        throw new RequestValidationError('excludeMovementId must be a non-empty string when provided.');
      }
      const parseRequest = (candidate: unknown): CreateMovementRequest => {
        const parsed = createMovementRequestSchema.safeParse(candidate);
        if (!parsed.success) throw new RequestValidationError(firstValidationMessage(parsed.error));
        return parsed.data as CreateMovementRequest;
      };
      const result = await service.previewExcess({
        functionCode: body.functionCode,
        ...(body.request === undefined ? {} : { request: parseRequest(body.request) }),
        ...(body.requests === undefined
          ? {}
          : {
              requests: Array.isArray(body.requests)
                ? body.requests.map(parseRequest)
                : (() => {
                    throw new RequestValidationError('requests must be an array.');
                  })(),
            }),
        ...(typeof body.excludeMovementId === 'string' ? { excludeMovementId: body.excludeMovementId.trim() } : {}),
        decisionTime: new Date().toISOString(),
      });
      if (!result.ok) {
        res.status(409).json({ code: result.code });
        return;
      }
      res.json(result.preview);
    } catch (error) {
      next(error);
    }
  });

  async function tryMakerExcessSubmit(body: CreateMovementRequest, req: Request, res: Response): Promise<boolean> {
    const isA3FamilyExcessCandidate = body.instrumentType === 'IPLC_LC' && body.movementType === 'UTILIZE';
    const creatingFunctionCode = body.instrumentType === 'EPLC_EXAMINATION' && body.movementType === 'CREATE' ? ('B3' as const) : undefined;
    if (!service.isMakerExcessConfigured() || (!isA3FamilyExcessCandidate && !creatingFunctionCode)) return false;

    const idempotencyKey = req.get('Idempotency-Key')?.trim();
    if (!idempotencyKey) throw new RequestValidationError('Idempotency-Key is required for Maker Excess Submit.');
    const control = { actorContext: body.createdBy, idempotencyKey, decisionTime: new Date().toISOString() };
    const result = creatingFunctionCode
      ? await service.submitCreatingExcessByMaker(body, creatingFunctionCode, control)
      : await service.submitA3ExcessByMaker(body, control);
    if ('httpStatus' in result && !('body' in result)) {
      res.status(result.httpStatus).json({ code: result.code, guidance: result.guidance });
      return true;
    }
    if ('ok' in result && !result.ok) {
      res.status(409).json({ code: result.code });
      return true;
    }
    const legacyContract = body.balanceContractId
      ? service.getContractById(body.balanceContractId)
      : service.resolveContract(body.instrumentType, body.naturalKey!);
    const legacyMovement = legacyContract
      ? service.listMovements(legacyContract.balanceContractId).find((movement) => movement.eventSeq === body.eventSeq)
      : undefined;
    if (!legacyMovement) throw new Error('Legacy Maker Submit completed without a resolvable movement response.');
    // Keep the historical Maker Result contract intact. Excess metadata augments the complete persisted
    // movement; it must not replace status/movementType/amount/account entries with a sparse command DTO.
    // A3 and B3 share this path, so their post-Submit UI remains identical to the original product flow.
    res.status(201).json('body' in result ? { ...legacyMovement, ...result.body } : legacyMovement);
    return true;
  }

  async function tryA3SExcessSubmit(requests: CreateMovementRequest[], req: Request, res: Response): Promise<boolean> {
    const hasArrival = requests.some((request) => request.instrumentType === 'IPLC_LC' && request.movementType === 'UTILIZE');
    const hasRedemption = requests.some(
      (request) => request.instrumentType === 'SHGT' && (request.movementType === 'FULL_REDEEM' || request.movementType === 'PARTIAL_REDEEM'),
    );
    if (!service.isMakerExcessConfigured() || requests.length !== 2 || !hasArrival || !hasRedemption) return false;

    const idempotencyKey = req.get('Idempotency-Key')?.trim();
    if (!idempotencyKey) throw new RequestValidationError('Idempotency-Key is required for Maker Excess Submit.');
    const result = await service.submitA3SExcessByMaker(requests, {
      actorContext: requests[0]!.createdBy,
      idempotencyKey,
      decisionTime: new Date().toISOString(),
    });
    if ('httpStatus' in result && !('body' in result)) {
      const body =
        result.code === 'A3S_RESELECT_ELIGIBLE_SG'
          ? { code: result.code, eligibleAlternatives: result.eligibleAlternatives }
          : { code: result.code, guidance: result.guidance };
      res.status(result.httpStatus).json(body);
      return true;
    }
    if ('ok' in result && !result.ok) {
      res.status(409).json({ code: result.code });
      return true;
    }
    res.status(201).json(service.findByBusinessEventId(requests[0]!.businessEventId!));
    return true;
  }

  async function tryExcessRelease(
    movementId: string,
    releasedBy: string,
    idempotencyKey: string | undefined,
    waiver: { applicantWaiverValidationResult?: 'CONFIRMED' | 'NOT_CONFIRMED'; waiverReference?: string; waiverDate?: string; waiverEvidence?: string },
    res: Response,
  ): Promise<boolean> {
    const hasContext =
      service.resolveExcessReleaseTarget(movementId) ||
      (idempotencyKey ? service.hasCheckerExcessReleaseReplay(movementId, releasedBy, idempotencyKey) : false);
    if (!service.isMakerExcessConfigured() || !hasContext) return false;
    if (!idempotencyKey) throw new RequestValidationError('Idempotency-Key is required for Checker Excess Release.');
    const result = await service.releaseExcessByChecker(movementId, {
      checkerContext: releasedBy,
      idempotencyKey,
      decisionTime: new Date().toISOString(),
      ...waiver,
    });
    if (!result.ok) {
      res.status(409).json({ code: result.code });
      return true;
    }
    res.json(result);
    return true;
  }

  // POST /balance-movements
  router.post('/balance-movements', async (req: Request, res: Response, next: NextFunction) => {
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
      if (await tryMakerExcessSubmit(body, req, res)) return;
      const result = service.createMovement(body);
      res.status(result.created ? 201 : 200).json(result.created ? result.movement : result.existing);
    } catch (error) {
      next(error);
    }
  });

  // A compound business event is one atomic command even when it spans several contracts/ledgers.
  router.post('/balance-movements/compound', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = req.body as { requests?: unknown[] };
      if (!Array.isArray(body.requests)) throw new RequestValidationError('requests is required.');
      const requests = body.requests.map((request) => {
        const parsed = createMovementRequestSchema.safeParse(request);
        if (!parsed.success) throw new RequestValidationError(firstValidationMessage(parsed.error));
        return parsed.data as CreateMovementRequest;
      });
      if (await tryA3SExcessSubmit(requests, req, res)) return;
      res.status(201).json(compound.create(requests));
    } catch (error) {
      next(error);
    }
  });

  router.post('/balance-movements/compound-release', (req, res) => {
    const { movementIds, releasedBy } = req.body as { movementIds?: unknown; releasedBy?: string };
    if (!Array.isArray(movementIds) || !movementIds.every((id): id is string => typeof id === 'string') || !releasedBy) {
      throw new RequestValidationError('movementIds and releasedBy are required.');
    }
    res.json(compound.release(movementIds, releasedBy));
  });

  router.post('/balance-movements/compound-actions', (req, res) => {
    const { actions, actor } = req.body as { actions?: unknown; actor?: string };
    const valid =
      Array.isArray(actions) &&
      actions.every(
        (action): action is { kind: 'release' | 'acknowledge'; movementId: string } =>
          !!action &&
          typeof action === 'object' &&
          'kind' in action &&
          (action.kind === 'release' || action.kind === 'acknowledge') &&
          'movementId' in action &&
          typeof action.movementId === 'string',
      );
    if (!valid || !actor) throw new RequestValidationError('actions and actor are required.');
    res.json(compound.execute(actions, actor));
  });

  // POST /balance-movements/:movementId/release
  router.post('/balance-movements/:movementId/release', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { releasedBy, applicantWaiverValidationResult, waiverReference, waiverDate, waiverEvidence, exportAuthorization } = req.body as {
        releasedBy?: string;
        applicantWaiverValidationResult?: 'CONFIRMED' | 'NOT_CONFIRMED';
        waiverReference?: string;
        waiverDate?: string;
        waiverEvidence?: string;
        exportAuthorization?: unknown;
      };
      const movementId = req.params.movementId;
      if (!releasedBy) throw new RequestValidationError('releasedBy is required.');
      if (!movementId) throw new RequestValidationError('movementId is required.');
      if (applicantWaiverValidationResult && !['CONFIRMED', 'NOT_CONFIRMED'].includes(applicantWaiverValidationResult)) {
        throw new RequestValidationError('applicantWaiverValidationResult must be CONFIRMED or NOT_CONFIRMED.');
      }
      for (const [name, value] of Object.entries({ waiverReference, waiverDate, waiverEvidence })) {
        if (value !== undefined && (typeof value !== 'string' || value.trim().length === 0)) {
          throw new RequestValidationError(`${name} must be a non-empty string when provided.`);
        }
      }
      const idempotencyKey = req.get('Idempotency-Key')?.trim();
      if (service.requiresB4ExportAssetAuthorization(movementId)) {
        const authorization = parseExportAuthorization(exportAuthorization);
        const result = service.releaseB4ExportAssetsByChecker(movementId, {
          checkerContext: releasedBy,
          decisionTime: new Date().toISOString(),
          authorization,
        });
        res.json(result);
        return;
      }
      if (
        await tryExcessRelease(
          movementId,
          releasedBy,
          idempotencyKey,
          {
            applicantWaiverValidationResult,
            waiverReference,
            waiverDate,
            waiverEvidence,
          },
          res,
        )
      )
        return;
      res.json(service.release(movementId, releasedBy));
    } catch (error) {
      next(error);
    }
  });

  // GET /balance-movements/:movementId/balance-as-of — snapshot right after this specific event (business instruction 2026-08-14)
  router.get('/balance-movements/:movementId/excess-release-context', (req, res) => {
    res.json(service.getExcessReleaseContext(req.params.movementId));
  });

  router.get('/balance-movements/:movementId/balance-as-of', (req, res) => {
    res.json(service.getBalanceSnapshotAsOfMovement(req.params.movementId));
  });

  // GET /balance-movements?businessEventId= — bug fixed 2026-08-16 (reviewer-reported, "A1 -> A8 ->
  // A3S -> A4, the related SG entries was not shown"): lets a Checker session independently resolve
  // the linked leg(s) of a compound submission (A3S's SG redemption, B5's Reimbursement Receivable)
  // by their shared businessEventId, instead of requiring the Maker's own in-memory submitResult to
  // still be present — see BalanceMovementStore.findByBusinessEventId's own doc comment.
  // GET /balance-movements?createdBy=&status=&q= — Fix Pending/Delete Pending Phase 2 (analysis/
  // Balance-Component-FixPending-DeletePending-Proposal-zh.md §2.1) — the Maker Queue's own "My Pending/
  // My Rejected" worklist. A second, independent query shape on the same route (mutually exclusive with
  // businessEventId above) rather than a new endpoint — same convention this route already establishes.
  // `status` is a comma-separated list; defaults to PENDING,REJECTED when omitted. `q` (user-directed
  // 2026-08-28, renamed from a prior `lcNumber` exact-match param — "支援 LIKE / Partial Match") is an
  // optional substring filter — see BalanceMovementStore.listByCreatedByAndStatus()'s own doc comment
  // for the sort/filter it drives, and why `page`/`pageSize` were removed from this query shape entirely.
  router.get('/balance-movements', (req, res) => {
    const { businessEventId, createdBy, status, q } = req.query as {
      businessEventId?: string;
      createdBy?: string;
      status?: string;
      q?: string;
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
          q: q || undefined,
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
    if (service.isMakerExcessConfigured() && service.hasExcessLedgerFacts(req.params.movementId)) {
      if (Object.prototype.hasOwnProperty.call(req.body, 'amount')) {
        throw new RequestValidationError('Excess Delete Pending does not accept amount; it withdraws the whole transaction.');
      }
      const idempotencyKey = req.get('Idempotency-Key')?.trim();
      if (!idempotencyKey) throw new RequestValidationError('Idempotency-Key is required for Excess Delete Pending.');
      const result = service.deletePendingExcessByMaker(req.params.movementId, { cancelledBy, reasonCode, remarks }, idempotencyKey);
      if (!result.ok) {
        res.status(409).json({ code: result.code });
        return;
      }
      res.json(result.movement);
      return;
    }
    res.json(service.cancel(req.params.movementId, cancelledBy, reasonCode, remarks));
  });

  // POST /balance-movements/:movementId/edit — Fix Pending (analysis/Balance-Component-FixPending-
  // DeletePending-Proposal-zh.md §2.2/§15/§19, 2026-08-27): corrects and resubmits a PENDING/REJECTED
  // movement in place of a Delete Pending + full re-Submit, reusing the same eventSeq (see
  // service.editPending()'s own doc comment for the full mechanism). editMovementRequestSchema is a
  // `.strict()` allowlist — any locked field (naturalKey/currency/instrumentType/movementType/
  // sourceTransactionRef/etc.) is rejected by zod itself, not by a hand-written check here.
  router.post('/balance-movements/:movementId/edit', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = editMovementRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new RequestValidationError(firstValidationMessage(parsed.error));
      }
      const movementId = req.params.movementId;
      if (!movementId) throw new RequestValidationError('movementId is required.');
      const patch = parsed.data as EditMovementRequest;
      const idempotencyKey = req.get('Idempotency-Key')?.trim();
      const hasExcessFixContext =
        service.hasExcessReservation(movementId) || (idempotencyKey ? service.hasMakerExcessFixReplay(movementId, patch.editedBy, idempotencyKey) : false);
      if (service.isMakerExcessConfigured() && hasExcessFixContext && patch.editMode !== 'REMARKS_ONLY') {
        if (!idempotencyKey) {
          service.assertPostAcknowledgeA3SAmountFixNotAttempted(movementId, patch);
          throw new RequestValidationError('Idempotency-Key is required for Excess Fix Pending.');
        }
        const result = await service.editPendingExcessByMaker(movementId, patch, {
          actorContext: patch.editedBy,
          idempotencyKey,
          decisionTime: new Date().toISOString(),
        });
        if (!result.ok) {
          res.status(409).json('guidance' in result ? { code: result.code, guidance: result.guidance } : { code: result.code });
          return;
        }
        res.json(result.movement);
        return;
      }
      res.json(service.editPending(movementId, patch));
    } catch (error) {
      next(error);
    }
  });

  // POST /balance-movements/:movementId/acknowledge — B3's own former Checker acknowledgment-only path
  // was removed 2026-08-18 (B3 now uses the standard /release route above). Restored 2026-08-20,
  // re-purposed for A3/A3S instead (business instruction, "A3 A3S 交易 Approve 過後 不要再顯示") — sets
  // acknowledgedBy/acknowledgedAt on the LC's own UTILIZE without touching status, so the Checker Queue
  // can filter it out once approved (see service.acknowledgeArrival()'s own doc comment).
  router.post('/balance-movements/:movementId/acknowledge', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { acknowledgedBy } = req.body as { acknowledgedBy?: string };
      const movementId = req.params.movementId;
      if (!acknowledgedBy) throw new RequestValidationError('acknowledgedBy is required.');
      if (!movementId) throw new RequestValidationError('movementId is required.');
      if (service.isMakerExcessConfigured()) {
        const idempotencyKey = req.get('Idempotency-Key')?.trim();
        if (!idempotencyKey) throw new RequestValidationError('Idempotency-Key is required for Checker Excess Acknowledge.');
        const result = await service.acknowledgeA3ExcessByChecker(movementId, {
          checkerContext: acknowledgedBy,
          idempotencyKey,
          decisionTime: new Date().toISOString(),
        });
        if ('ok' in result && !result.ok) {
          res.status(409).json({ code: result.code });
          return;
        }
        res.json('kind' in result ? result.movement : result);
        return;
      }
      res.json(service.acknowledgeArrival(movementId, acknowledgedBy));
    } catch (error) {
      next(error);
    }
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

  // POST /balance-movements/:movementId/withdraw-maker-submit — business-confirmed 2026-08-27 ("做 A4
  // 或 A6 DELETE PENDING 後 交易退回到 A4 或 A6 SUBMIT 前即可"), A4's own Delete Pending: undoes
  // /maker-submit above without cancelling the underlying A3/A3S UTILIZE or its Checker acknowledgment
  // (see service.withdrawMakerSubmit()'s own doc comment).
  router.post('/balance-movements/:movementId/withdraw-maker-submit', (req, res) => {
    const { withdrawnBy } = req.body as { withdrawnBy?: string };
    if (!withdrawnBy) throw new RequestValidationError('withdrawnBy is required.');
    res.json(service.withdrawMakerSubmit(req.params.movementId, withdrawnBy));
  });

  return router;
}
