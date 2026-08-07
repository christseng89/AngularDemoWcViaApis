import type { BusinessCaseConfig, LiabilitySpec } from './business-case.model';
import type {
  ChargeVoucherContext,
  LiabilityVoucherContext,
  PaymentInstructionConfirmRequest,
  PaymentLegInput,
} from './payment-component.types';

function buildLiabilityContext(kind: LiabilitySpec['kind'], sourceFunctionCode: string | undefined, m: Record<string, string | boolean | undefined>): LiabilityVoucherContext {
  switch (kind) {
    case 'IPLC_PAY_ACCEPT':
      return {
        module: 'IPLC',
        sourceFunctionCode: sourceFunctionCode as 'PayAccept' | 'PayAcceptWithDiscount',
        stlAmt: String(m['stlAmt'] ?? '0'),
        acptAmt: m['acptAmt'] ? String(m['acptAmt']) : undefined,
        sdaFlagIsSight: Boolean(m['sdaFlagIsSight']),
        assetAcno: String(m['assetAcno'] ?? ''),
        liabAcno: String(m['liabAcno'] ?? ''),
        tempAssetAcno: m['tempAssetAcno'] ? String(m['tempAssetAcno']) : undefined,
        tempLiabAcno: m['tempLiabAcno'] ? String(m['tempLiabAcno']) : undefined,
        currency: String(m['currency'] ?? 'USD'),
      };
    case 'IPLC_MATURITY':
      return {
        module: 'IPLC',
        sourceFunctionCode: 'PaymentAtMaturity',
        stlAmt: String(m['stlAmt'] ?? '0'),
        assetAcno: String(m['assetAcno'] ?? ''),
        liabAcno: String(m['liabAcno'] ?? ''),
        currency: String(m['currency'] ?? 'USD'),
      };
    case 'EPLC':
      return {
        module: 'EPLC',
        sourceFunctionCode: sourceFunctionCode as 'PayAccept' | 'PayAtMaturity',
        stlAmt: String(m['stlAmt'] ?? '0'),
        assetAcno: String(m['assetAcno'] ?? ''),
        liabAcno: String(m['liabAcno'] ?? ''),
        currency: String(m['currency'] ?? 'USD'),
        replicateEplcVoucherDescDefect: Boolean(m['replicateEplcVoucherDescDefect']),
      };
    case 'IMCO_SETTLEMENT_DA':
      return {
        module: 'IMCO',
        sourceFunctionCode: 'SettlementDA',
        billAmtFmDrwe: String(m['billAmtFmDrwe'] ?? '0'),
        assetAcno: String(m['assetAcno'] ?? ''),
        liabAcno: String(m['liabAcno'] ?? ''),
        currency: String(m['currency'] ?? 'USD'),
      };
    case 'GTEE':
      return {
        module: 'GTEE',
        sourceFunctionCode: 'OutwardClaimSettlement',
        clmTrxCcyAmt: String(m['clmTrxCcyAmt'] ?? '0'),
        assetAcno: String(m['assetAcno'] ?? ''),
        liabAcno: String(m['liabAcno'] ?? ''),
        currency: String(m['currency'] ?? 'USD'),
      };
    case 'IWGT':
      return {
        module: 'IWGT',
        sourceFunctionCode: 'SettleInwardClaim',
        clmTrxCcyAmt: String(m['clmTrxCcyAmt'] ?? '0'),
        assetAcno: String(m['assetAcno'] ?? ''),
        liabAcno: String(m['liabAcno'] ?? ''),
        currency: String(m['currency'] ?? 'USD'),
        methodOfIssuance: (m['methodOfIssuance'] as 'Issue' | 'Advice') ?? 'Issue',
      };
  }
}

function buildChargeContext(m: Record<string, string | boolean | undefined>): ChargeVoucherContext {
  return {
    isSettleCharges: Boolean(m['isSettleCharges']),
    localChgCustPayTotalAmt: String(m['localChgCustPayTotalAmt'] ?? '0'),
    foreignChgCustPayTotalAmt: String(m['foreignChgCustPayTotalAmt'] ?? '0'),
    localPayVatTotalAmt: String(m['localPayVatTotalAmt'] ?? '0'),
    chargeAccountNo: m['chargeAccountNo'] ? String(m['chargeAccountNo']) : undefined,
    currency: String(m['currency'] ?? 'USD'),
  };
}

/**
 * PASS cases only — builds the full POST /payment-instructions body (confirm
 * or dryRun). debitLegs/creditLegs come from the two <app-leg-allocator>
 * grids, not from the Formly model (which only carries header/liability/
 * charge fields now).
 */
export function buildConfirmRequest(
  config: BusinessCaseConfig,
  model: Record<string, any>,
  debitLegs: PaymentLegInput[],
  creditLegs: PaymentLegInput[],
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
  };
  if (config.liability && model['liabilityEnabled']) {
    const liabilitySourceFunctionCode = 'sourceFunctionCode' in config.liability ? config.liability.sourceFunctionCode : undefined;
    request.liabilityContext = buildLiabilityContext(config.liability.kind, liabilitySourceFunctionCode, model['liability'] ?? {});
  }
  if (config.charge && model['chargeEnabled']) {
    request.chargeContext = buildChargeContext(model['charge'] ?? {});
  }
  return request;
}
