import type { BusinessCaseConfig } from './business-case.model';
import type { PaymentInstructionConfirmRequest, PaymentLegInput, SuspenseBridge } from './payment-component.types';

/**
 * PASS cases only — builds the full POST /payment-instructions body (confirm
 * or dryRun). debitLegs/creditLegs come from the two <app-leg-allocator>
 * grids, not from the Formly model (which only carries header fields now —
 * v1.6.0 removed the liability/charge context fields this used to also read,
 * see business-case-fields.ts's doc comment).
 */
export function buildConfirmRequest(
  config: BusinessCaseConfig,
  model: Record<string, any>,
  debitLegs: PaymentLegInput[],
  creditLegs: PaymentLegInput[],
  suspenseBridge?: SuspenseBridge,
): PaymentInstructionConfirmRequest {
  const request: PaymentInstructionConfirmRequest = {
    originModule: config.module,
    mainRef: model['mainRef'],
    sequence: Number(model['sequence']),
    unitCode: model['unitCode'],
    debitLegs,
    creditLegs,
    sourceFunctionCode: config.dualPrefixOptions ? undefined : config.sourceFunctionCode,
    voucherCodePrefixOverride: config.dualPrefixOptions ? model['voucherPrefix'] : undefined,
    // See PaymentInstructionConfirmRequest.debitLegsComponentBridge's doc comment — mirrors the
    // case's own debitLegsBridge flag exactly, undefined (omitted on the wire) for every other case.
    debitLegsComponentBridge: config.debitLegsBridge ? true : undefined,
    // Mirror of the above for creditLegsComponentBridge/creditLegsBridge (2026-08-12).
    creditLegsComponentBridge: config.creditLegsBridge ? true : undefined,
  };
  if (suspenseBridge) {
    request.suspenseBridge = suspenseBridge;
  }
  return request;
}
