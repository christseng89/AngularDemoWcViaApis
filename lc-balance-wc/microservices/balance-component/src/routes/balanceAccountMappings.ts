import { Router, type Response } from 'express';
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

const familyUpdateSchema = z.object({
  updatedBy: z.string(),
  mappings: z.array(z.object({
    mappingKey: z.string().min(1),
    expectedVersion: z.number().int().positive(),
    accountA: z.object({ accountNumber: z.string(), accountDescription: z.string() }).strict(),
    accountB: z.object({ accountNumber: z.string(), accountDescription: z.string() }).strict(),
  }).strict()).min(1),
}).strict();

function handleVersionConflict(error: unknown, res: Response): boolean {
  if (!(error instanceof BalanceAccountMappingVersionConflictError)) return false;
  res.status(409).json({ code: 'ACCOUNT_MAPPING_VERSION_CONFLICT', message: error.message });
  return true;
}

export function balanceAccountMappingsRouter(service: BalanceAccountMappingService): Router {
  const router = Router();
  router.get('/balance-account-mappings', (_req, res) => res.json(service.list()));
  router.post('/balance-account-mappings/reload-configuration', (_req, res) => res.json(service.reloadConfiguration()));
  router.put('/balance-account-mappings/families/:familyKey', (req, res, next) => {
    const parsed = familyUpdateSchema.safeParse(req.body);
    if (!parsed.success) return next(new RequestValidationError(parsed.error.issues[0]?.message ?? 'Invalid account family request.'));
    try {
      res.json(service.updateFamily({ familyKey: req.params.familyKey, ...parsed.data }));
    } catch (error) {
      if (handleVersionConflict(error, res)) return;
      next(error);
    }
  });
  router.put('/balance-account-mappings/:mappingKey', (req, res, next) => {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return next(new RequestValidationError(parsed.error.issues[0]?.message ?? 'Invalid account mapping request.'));
    try {
      res.json(service.update({ mappingKey: req.params.mappingKey, ...parsed.data }));
    } catch (error) {
      if (handleVersionConflict(error, res)) return;
      next(error);
    }
  });
  return router;
}
