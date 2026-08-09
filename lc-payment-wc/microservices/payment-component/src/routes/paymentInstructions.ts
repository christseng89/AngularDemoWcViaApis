/**
 * Express routes for payment-instructions-post.yaml v1.6.0's PaymentInstructions
 * tag: POST /payment-instructions plus the read-only GET endpoints (§6.2 of
 * the FSD — audit/reconciliation only, not part of the confirm flow itself).
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { validateConfirmRequest, validateClassifyRequest } from '../validation/requestSchema';
import { confirmPaymentInstruction } from '../domain/confirmPaymentInstruction';
import { previewClassification } from '../domain/classifyPreview';
import type { PaymentInstructionStore } from '../store/paymentInstructionStore';
import { NotFoundError } from '../errors';
import type { OriginModule } from '../types';
import { ORIGIN_MODULES } from '../types';

/**
 * Extension fields accepted alongside the strict OAS body but NOT validated
 * as part of paymentInstructionConfirmRequestSchema — see domain/voucherDescription.ts's
 * doc comment for why sourceFunctionCode is currently required out-of-band
 * rather than being a formal OAS property. (chargeContext/liabilityContext
 * were here through v1.5.0; removed v1.6.0 along with §6.2/§6.3 generation —
 * see domain/confirmPaymentInstruction.ts's doc comment.)
 *
 * chargeComponentBridge (2026-08-09) is NOT one of these — it's declared directly on
 * paymentInstructionConfirmRequestSchema instead (validation/requestSchema.ts), because it
 * participates in that schema's own cross-field creditLegs rule rather than being a pure
 * pass-through option. See that field's own doc comment for the full contract.
 */
interface RequestExtensions {
  sourceFunctionCode?: string;
  voucherCodePrefixOverride?: string;
  /** Preview mode — see ConfirmPaymentInstructionOptions.dryRun. Never persisted, always HTTP 200. */
  dryRun?: boolean;
}

function isOriginModule(value: unknown): value is OriginModule {
  return typeof value === 'string' && (ORIGIN_MODULES as readonly string[]).includes(value);
}

export function createPaymentInstructionsRouter(store: PaymentInstructionStore): Router {
  const router = Router();

  router.post('/payment-instructions', (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = validateConfirmRequest(req.body);
      // req.body is guaranteed an object here — validateConfirmRequest above
      // already threw (caught below) if it weren't, so no `?? {}` fallback
      // is needed for a condition that can't reach this line.
      const ext = req.body as RequestExtensions;

      const result = confirmPaymentInstruction(store, body, {
        sourceFunctionCode: ext.sourceFunctionCode,
        voucherCodePrefixOverride: ext.voucherCodePrefixOverride,
        dryRun: ext.dryRun,
      });

      res.status(ext.dryRun ? 200 : result.created ? 201 : 200).json(result.instruction);
    } catch (err) {
      next(err);
    }
  });

  // Classify-only preview — see domain/classifyPreview.ts's doc comment. Not
  // part of the official OAS; used by the Business Case Simulator for RPFM's
  // GAP-verdict cases, which have no voucher-assembly routine to run in full.
  router.post('/payment-instructions/classify', (req: Request, res: Response, next: NextFunction) => {
    try {
      const body = validateClassifyRequest(req.body);
      const result = previewClassification(body.debitLegs, body.creditLegs, body.balanceTolerance ?? 0);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/payment-instructions', (req: Request, res: Response) => {
    const originModuleRaw = req.query.originModule;
    const originModule = isOriginModule(originModuleRaw) ? originModuleRaw : undefined;
    const mainRef = typeof req.query.mainRef === 'string' ? req.query.mainRef : undefined;
    res.status(200).json(store.search({ originModule, mainRef }));
  });

  router.get('/payment-instructions/:instructionId', (req: Request, res: Response, next: NextFunction) => {
    // Express guarantees this param is a defined string once a :instructionId
    // route has matched at all — the `!` (not a `?? ''` fallback) reflects
    // that framework contract instead of guarding a condition that can't occur.
    const instructionId = req.params.instructionId!;
    const instruction = store.findById(instructionId);
    if (!instruction) {
      next(new NotFoundError(`No payment instruction with id ${instructionId}`));
      return;
    }
    res.status(200).json(instruction);
  });

  router.get('/payment-instructions/:instructionId/account-entries', (req: Request, res: Response, next: NextFunction) => {
    // Express guarantees this param is a defined string once a :instructionId
    // route has matched at all — the `!` (not a `?? ''` fallback) reflects
    // that framework contract instead of guarding a condition that can't occur.
    const instructionId = req.params.instructionId!;
    const instruction = store.findById(instructionId);
    if (!instruction) {
      next(new NotFoundError(`No payment instruction with id ${instructionId}`));
      return;
    }
    res.status(200).json(instruction.accountEntries);
  });

  router.get('/payment-instructions/:instructionId/swift-messages', (req: Request, res: Response, next: NextFunction) => {
    // Express guarantees this param is a defined string once a :instructionId
    // route has matched at all — the `!` (not a `?? ''` fallback) reflects
    // that framework contract instead of guarding a condition that can't occur.
    const instructionId = req.params.instructionId!;
    const instruction = store.findById(instructionId);
    if (!instruction) {
      next(new NotFoundError(`No payment instruction with id ${instructionId}`));
      return;
    }
    res.status(200).json(instruction.swiftMessages);
  });

  return router;
}
