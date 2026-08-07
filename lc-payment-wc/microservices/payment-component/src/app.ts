import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { createPaymentInstructionsRouter } from './routes/paymentInstructions';
import { createInMemoryPaymentInstructionStore, type PaymentInstructionStore } from './store/paymentInstructionStore';
import { ApiError } from './errors';

/** OAS `servers[0].url` path suffix: https://api.bank.example/payment-component/v1 */
export const API_BASE_PATH = '/payment-component/v1';

export function createApp(store: PaymentInstructionStore = createInMemoryPaymentInstructionStore()): Express {
  const app = express();
  app.use(express.json());

  app.use(API_BASE_PATH, createPaymentInstructionsRouter(store));

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // Central error handler — maps every ApiError subclass onto the OAS Error
  // schema { code, message } with the matching HTTP status (400/404/409).
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ApiError) {
      res.status(err.httpStatus).json(err.toBody());
      return;
    }
    // eslint-disable-next-line no-console
    console.error('Unhandled error in Payment Component service:', err);
    res.status(500).json({ code: 'INTERNAL_ERROR', message: 'Unexpected server error' });
  });

  return app;
}
