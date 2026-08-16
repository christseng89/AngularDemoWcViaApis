import express, { Express, NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import type { Db } from './db';
import { BalanceService } from './service/balanceService';
import { balanceContractsRouter } from './routes/balanceContracts';
import { balanceMovementsRouter } from './routes/balanceMovements';
import { ApiError } from './errors';

export function createApp(db: Db): Express {
  const app = express();
  app.use(helmet());
  app.use(express.json());

  const service = new BalanceService(db);
  app.use(balanceContractsRouter(service));
  // Quality-report-balance.md BAL-104: rate limiting scoped to /balance-movements — the create/release/
  // reject/cancel/acknowledge lifecycle (the actual Maker/Checker write surface) — rather than applied
  // globally, so the read-heavy /balance-contracts catalog/lookup/snapshot endpoints (used heavily by
  // the Business Case Runner's own replay-a-whole-scenario flow and the Transaction Builder's pickers)
  // are unaffected. Generous limit (over a real network, a Maker/Checker workflow is nowhere near this
  // busy) — this is basic abuse protection, not a throughput cap on normal use.
  app.use('/balance-movements', rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false }));
  app.use(balanceMovementsRouter(service));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

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
