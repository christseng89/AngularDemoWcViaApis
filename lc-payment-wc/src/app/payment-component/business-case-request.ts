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
  transactionCurrency: string,
  suspenseBridge?: SuspenseBridge,
): PaymentInstructionConfirmRequest {
  const request: PaymentInstructionConfirmRequest = {
    originModule: config.module,
    mainRef: model['mainRef'],
    sequence: Number(model['sequence']),
    unitCode: model['unitCode'],
    debitLegs,
    creditLegs,
    // v1.10.0 — sent explicitly rather than relying on the server's debitLegs[0].currency
    // fallback, which breaks when a side's legs are all in a currency other than the
    // deal's actual transaction currency (e.g. Full pay in JPY against a USD transaction).
    transactionCurrency,
    sourceFunctionCode: config.dualPrefixOptions ? undefined : config.sourceFunctionCode,
    voucherCodePrefixOverride: config.dualPrefixOptions ? model['voucherPrefix'] : undefined,
  };
  if (suspenseBridge) {
    request.suspenseBridge = suspenseBridge;
  }
  return request;
}
