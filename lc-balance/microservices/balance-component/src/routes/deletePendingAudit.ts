import { Router } from 'express';
import type { BalanceService } from '../service/balanceService';
import { RequestValidationError } from '../errors';
import type { InstrumentType } from '../types';

export function deletePendingAuditRouter(service: BalanceService): Router {
  const router = Router();

  // GET /delete-pending-audit/lc-catalog?instrumentType=&q=&page=&pageSize=
  // Inquire Delete Pending's own LC Catalog step (§11, business-directed 2026-08-27, "只有被 DELETE
  // PENDING 過的才顯示") — registered BEFORE the bare GET /delete-pending-audit below only for readability
  // (different segment count, so route-registration order doesn't actually matter here — see
  // BalanceContractStore.listWithDeletePendingHistory()'s own doc comment for the query itself).
  router.get('/delete-pending-audit/lc-catalog', (req, res) => {
    const { instrumentType, q, page, pageSize } = req.query;
    if (!instrumentType) throw new RequestValidationError('instrumentType is required.');
    res.json(
      service.catalogWithDeletePendingHistory({
        instrumentType: instrumentType as InstrumentType,
        q: q as string | undefined,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      }),
    );
  });

  // GET /delete-pending-audit?lcNumber=&deletedBy=&from=&to=&page=&pageSize=
  // Inquire Delete Pending (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §11, BA &
  // business-directed 2026-08-27) — a dedicated, read-only audit query surface over delete_pending_audit,
  // independent of Inquire Events ("只查所有曾經發生過的 Delete Pending 操作，不混入 Resubmit/Fix/
  // Approve/Reject"). All query params are optional filters; every response row is paired with its own
  // contract's natural key (instrumentType/lcNumber/ibNumber/sgNumber) so the Angular client can derive
  // Function/Secondary Reference client-side (same convention as GET /balance-movements?createdBy= for
  // Maker Queue) — Function is deliberately not a query param here, see the store method's own doc
  // comment for why.
  router.get('/delete-pending-audit', (req, res) => {
    const { lcNumber, deletedBy, from, to, page, pageSize } = req.query;
    res.json(
      service.listDeletePendingAudit({
        lcNumber: lcNumber as string | undefined,
        deletedBy: deletedBy as string | undefined,
        from: from as string | undefined,
        to: to as string | undefined,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      }),
    );
  });

  return router;
}
