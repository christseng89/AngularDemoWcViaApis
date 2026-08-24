import { Router } from 'express';
import type { BalanceService } from '../service/balanceService';
import { NotFoundError, RequestValidationError } from '../errors';
import type { InstrumentType } from '../types';

export function balanceContractsRouter(service: BalanceService): Router {
  const router = Router();

  // GET /balance-contracts?instrumentType=&lcNumber=&ibNumber=&sgNumber=&legSeq=&includeAnyStatus=
  // includeAnyStatus — opt-in (business-reported gap 2026-08-21, "CLOSE LC => Release 後出現 'No Logical
  // Contract exists yet'... LOOKUP也應該看到" — inquiry contexts must still resolve a CLOSED contract).
  // Look Up Current Balance passes true; every transaction-creating caller omits it, same ACTIVE-only
  // behavior as before.
  router.get('/balance-contracts', (req, res) => {
    const { instrumentType, lcNumber, ibNumber, sgNumber, legSeq, includeAnyStatus } = req.query;
    if (!instrumentType || !lcNumber) {
      throw new RequestValidationError('instrumentType and lcNumber are required.');
    }
    const contract = service.resolveContract(
      instrumentType as InstrumentType,
      {
        lcNumber: lcNumber as string,
        ibNumber: (ibNumber as string) ?? null,
        sgNumber: (sgNumber as string) ?? null,
        legSeq: (legSeq as string) ?? null,
      },
      includeAnyStatus === 'true',
    );
    if (!contract) throw new NotFoundError('No Logical Contract exists yet for this natural key.');
    res.json(contract);
  });

  // GET /balance-contracts/catalog?instrumentType=&status=&q=&lcNumber=&tenorFamily=&page=&pageSize=&requireIssueReleased=
  // (business instruction 2026-08-14: ordered by Reference (lc_number), paginated;
  // lcNumber is an exact-match filter for the "LC Index -> IB Index" cascading picker;
  // tenorFamily filters server-side so pagination reflects the Sight/Usance-eligible set,
  // not the raw one — business-reported gap "Why U002 does not shown A5")
  // requireIssueReleased — business-reported gap 2026-08-18 ("S10 still shown in A4 function which is
  // wrong" — S10's own ISSUE was still PENDING), see CatalogFilter's own doc comment for the full rule.
  router.get('/balance-contracts/catalog', (req, res) => {
    const { instrumentType, status, q, lcNumber, tenorFamily, page, pageSize, requireIssueReleased } = req.query;
    if (!instrumentType) throw new RequestValidationError('instrumentType is required.');
    if (tenorFamily && tenorFamily !== 'SIGHT' && tenorFamily !== 'USANCE') {
      throw new RequestValidationError('tenorFamily must be SIGHT or USANCE.');
    }
    res.json(
      service.catalog({
        instrumentType: instrumentType as InstrumentType,
        status: status as any,
        q: q as string | undefined,
        lcNumber: lcNumber as string | undefined,
        tenorFamily: tenorFamily as 'SIGHT' | 'USANCE' | undefined,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
        requireIssueReleased: requireIssueReleased === 'true',
      }),
    );
  });

  // GET /balance-contracts/close-eligible?instrumentType=&lcNumber=&page=&pageSize=
  // A10/B6 Close, Step-1 picker hint (domain/closeEligibility.ts) — every ACTIVE root LC/Confirmation
  // currently eligible to Close (SG Balance = 0, Acceptance Balance = 0, no open Events anywhere in the
  // tree, not already Closed). Deliberately its own route, not a CatalogFilter flag on /catalog — the
  // check spans multiple tables/instrument types per candidate, unlike requireIssueReleased's single
  // EXISTS subquery.
  router.get('/balance-contracts/close-eligible', (req, res) => {
    const { instrumentType, lcNumber, page, pageSize } = req.query;
    if (!instrumentType) throw new RequestValidationError('instrumentType is required.');
    res.json(
      service.listCloseEligibleContracts(instrumentType as InstrumentType, {
        lcNumber: lcNumber as string | undefined,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      }),
    );
  });

  // GET /balance-contracts/:balanceContractId/balance
  router.get('/balance-contracts/:balanceContractId/balance', (req, res) => {
    res.json(service.getBalanceSnapshot(req.params.balanceContractId));
  });

  // GET /balance-contracts/:balanceContractId/movements — event timeline (business instruction 2026-08-14)
  router.get('/balance-contracts/:balanceContractId/movements', (req, res) => {
    res.json(service.listMovements(req.params.balanceContractId));
  });

  return router;
}
