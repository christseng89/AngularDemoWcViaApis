import { Router } from 'express';
import { z } from 'zod';
import type { BalanceAccountMappingService } from '../service/balanceAccountMappingService';
import { BalanceAccountMappingVersionConflictError } from '../service/balanceAccountMappingService';
import { RequestValidationError } from '../errors';

const updateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  updatedBy: z.string(),
  accountA: z.object({ accountNumber: z.string(), accountDescription: z.string() }).strict(),
  accountB: z.object({ accountNumber: z.string(), accountDescription: z.string() }).strict(),
}).strict();

export function balanceAccountMappingsRouter(service: BalanceAccountMappingService): Router {
  const router = Router();
  router.get('/balance-account-mappings', (_req, res) => res.json(service.list()));
  router.put('/balance-account-mappings/:mappingKey', (req, res, next) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return next(new RequestValidationError(parsed.error.issues[0]?.message ?? 'Invalid account mapping request.'));
    try {
      res.json(service.update({ mappingKey: req.params.mappingKey, ...parsed.data }));
    } catch (error) {
      if (error instanceof BalanceAccountMappingVersionConflictError) {
        res.status(409).json({ code: 'ACCOUNT_MAPPING_VERSION_CONFLICT', message: error.message });
        return;
      }
      next(error);
    }
  });
  return router;
}
