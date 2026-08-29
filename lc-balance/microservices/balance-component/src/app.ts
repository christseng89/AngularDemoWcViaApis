import express, { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { Db } from './db';
import { BalanceService } from './service/balanceService';
import { CompoundMovementService } from './service/compoundMovementService';
import { SqliteUnitOfWork } from './service/unitOfWork';
import { balanceContractsRouter } from './routes/balanceContracts';
import { balanceMovementsRouter } from './routes/balanceMovements';
import { deletePendingAuditRouter } from './routes/deletePendingAudit';
import { ApiError } from './errors';

/**
 * F1 (external BA review) — `service` is now an optional param (defaulting to a fresh instance, exactly
 * the prior behavior) so server.ts can construct the BalanceService itself and keep a reference to it
 * for registering the AUTO EXPIRY/AUTO CLOSE background interval — see server.ts's own doc comment.
 * Every existing call site (`createApp(db)`, ~29 in test/unit/app.test.ts) is unaffected.
 */
export function createApp(db: Db, service: BalanceService = new BalanceService(db)): Express {
  const app = express();
  const compound = new CompoundMovementService(service, new SqliteUnitOfWork(db));
  app.use(helmet());
  app.use(express.json());

  app.use(balanceContractsRouter(service));
  // Quality-report-balance.md BAL-104: rate limiting scoped to /balance-movements — the create/release/
  // reject/cancel/maker-submit lifecycle (the actual Maker/Checker write surface) — rather than applied
  // globally, so the read-heavy /balance-contracts catalog/lookup/snapshot endpoints (used heavily by
  // the Business Case Runner's own replay-a-whole-scenario flow and the Transaction Builder's pickers)
  // are unaffected. Generous limit (over a real network, a Maker/Checker workflow is nowhere near this
  // busy) — this is basic abuse protection, not a throughput cap on normal use.
  //
  // Bug fix (reviewer-reported 2026-08-26, "Run All Cases" 500) — 120/60s was sized for the Business
  // Case Registry's original ~10 cases; it now has 27, and a single "Run All Cases" click legitimately
  // fires ~105 sequential /balance-movements calls over localhost (near-zero latency, so they land well
  // within one rate-limit window) — a normal, intended use of this exact endpoint, not abuse. Raised to
  // 1000/60s: still meaningfully caps a genuine flood (this is a local prototype, not internet-facing),
  // comfortably clears a full Run-All-Cases pass with headroom for concurrent manual testing in the same
  // window. See backend/server.js's own resolveLogicalContractId()/createMovement-step doc comments for
  // the companion fix — a 429 mid-run (now much rarer) surfaces a clear error instead of crashing.
  app.use('/balance-movements', rateLimit({ windowMs: 60_000, limit: 1000, standardHeaders: true, legacyHeaders: false }));
  app.use(balanceMovementsRouter(service, compound));
  app.use(deletePendingAuditRouter(service));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  // Dev-only — Business Case Runner's "Cleanup Database Tables" button. Standalone: wipes every
  // balance_movements/balance_contracts row (every table with an FK into either one first, then
  // movements, then contracts) so a fresh sequence of Business Cases can run without natural-key
  // collisions. Deliberately bypasses the append-only store layer (BalanceMovementStore/
  // BalanceContractStore/DeletePendingAuditStore/FixPendingAuditStore never expose a delete) — this is a
  // disclosed, dev-only exception to that invariant, not a new persistence pattern. Both audit tables
  // have FK REFERENCES to balance_movements/balance_contracts with no ON DELETE CASCADE (PRAGMA
  // foreign_keys = ON) — omitting either here throws a foreign key constraint failure the instant any
  // audit row exists (fix_pending_audit's own omission is exactly this same class of bug, found live
  // 2026-08-29 — every new FK-constrained table needs this same check, not just a green test suite for
  // the new feature alone).
  app.post('/admin/reset-database', (_req, res) => {
    db.exec('DELETE FROM delete_pending_audit');
    db.exec('DELETE FROM fix_pending_audit');
    db.exec('DELETE FROM balance_movements');
    db.exec('DELETE FROM balance_contracts');
    res.json({ status: 'ok' });
  });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.httpStatus).json(err.toBody());
      return;
    }
    // Quality-report-balance.md BAL-117: was echoing `err.message` straight into the response body —
    // any caller (this service has no authentication) could read back internal error detail (e.g. a
    // driver-level error, an internal object shape). Log the detail server-side, return a generic
    // message to the client.
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'An internal error occurred.' });
  });

  return app;
}
