import express, { Express, NextFunction, Request, Response } from 'express';
import type { Db } from './db';
import { BalanceService } from './service/balanceService';
import { balanceContractsRouter } from './routes/balanceContracts';
import { balanceMovementsRouter } from './routes/balanceMovements';
import { ApiError } from './errors';

export function createApp(db: Db): Express {
  const app = express();
  app.use(express.json());

  const service = new BalanceService(db);
  app.use(balanceContractsRouter(service));
  app.use(balanceMovementsRouter(service));

  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.httpStatus).json(err.toBody());
      return;
    }
    // eslint-disable-next-line no-console
    console.error(err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : 'Unknown error' });
  });

  return app;
}
