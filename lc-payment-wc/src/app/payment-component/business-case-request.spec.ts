import { buildConfirmRequest } from './business-case-request';
import type { BusinessCaseConfig } from './business-case.model';
import type { PaymentLegInput } from './payment-component.types';

const debitLegs: PaymentLegInput[] = [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' }];
const creditLegs: PaymentLegInput[] = [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '100' }];

function baseConfig(overrides: Partial<BusinessCaseConfig> = {}): BusinessCaseConfig {
  return {
    id: 'test-case',
    module: 'IPLC',
    functionLabel: 'Test',
    verdict: 'PASS',
    citation: 'test',
    note: 'test',
    sourceFunctionCode: 'PayAccept',
    legs: [],
    ...overrides,
  };
}

const baseModel = { mainRef: 'IPLC-test-0001', sequence: 1, unitCode: 'HQ' };

describe('buildConfirmRequest', () => {
  it('assembles header fields, module, and legs from the model/config/legs inputs', () => {
    const req = buildConfirmRequest(baseConfig(), baseModel, debitLegs, creditLegs);

    expect(req.originModule).toBe('IPLC');
    expect(req.mainRef).toBe('IPLC-test-0001');
    expect(req.sequence).toBe(1);
    expect(req.unitCode).toBe('HQ');
    expect(req.debitLegs).toBe(debitLegs);
    expect(req.creditLegs).toBe(creditLegs);
  });

  it('coerces model.sequence to a number', () => {
    const req = buildConfirmRequest(baseConfig(), { ...baseModel, sequence: '3' }, debitLegs, creditLegs);
    expect(req.sequence).toBe(3);
  });

  describe('voucher prefix resolution', () => {
    it('uses config.sourceFunctionCode when there is no dual-prefix choice', () => {
      const req = buildConfirmRequest(baseConfig({ sourceFunctionCode: 'PayAccept' }), baseModel, debitLegs, creditLegs);
      expect(req.sourceFunctionCode).toBe('PayAccept');
      expect(req.voucherCodePrefixOverride).toBeUndefined();
    });

    it('uses model.voucherPrefix (not config.sourceFunctionCode) when dualPrefixOptions is set', () => {
      const config = baseConfig({
        sourceFunctionCode: 'PayAccept',
        dualPrefixOptions: [
          { label: 'A', value: 'EPLC07NULLNULLNULL' },
          { label: 'B', value: 'EPLC03NULLNULLNULL' },
        ],
      });
      const req = buildConfirmRequest(config, { ...baseModel, voucherPrefix: 'EPLC03NULLNULLNULL' }, debitLegs, creditLegs);

      expect(req.sourceFunctionCode).toBeUndefined();
      expect(req.voucherCodePrefixOverride).toBe('EPLC03NULLNULLNULL');
    });
  });

  describe('liability context inclusion', () => {
    it('is omitted when config.liability is unset, even if the model has liability data', () => {
      const req = buildConfirmRequest(baseConfig(), { ...baseModel, liabilityEnabled: true, liability: { stlAmt: '500' } }, debitLegs, creditLegs);
      expect(req.liabilityContext).toBeUndefined();
    });

    it('is omitted when config.liability is set but liabilityEnabled is false', () => {
      const config = baseConfig({ liability: { kind: 'IPLC_MATURITY' } });
      const req = buildConfirmRequest(config, { ...baseModel, liabilityEnabled: false }, debitLegs, creditLegs);
      expect(req.liabilityContext).toBeUndefined();
    });

    it('is included when both config.liability and model.liabilityEnabled are set', () => {
      const config = baseConfig({ liability: { kind: 'IPLC_MATURITY' } });
      const req = buildConfirmRequest(
        config,
        { ...baseModel, liabilityEnabled: true, liability: { stlAmt: '500', assetAcno: 'A1', liabAcno: 'L1', currency: 'EUR' } },
        debitLegs,
        creditLegs,
      );
      expect(req.liabilityContext).toEqual({
        module: 'IPLC',
        sourceFunctionCode: 'PaymentAtMaturity',
        stlAmt: '500',
        assetAcno: 'A1',
        liabAcno: 'L1',
        currency: 'EUR',
      });
    });

    it('defaults to an empty sub-model when model.liability itself is absent', () => {
      const config = baseConfig({ liability: { kind: 'IPLC_MATURITY' } });
      const req = buildConfirmRequest(config, { ...baseModel, liabilityEnabled: true }, debitLegs, creditLegs);
      expect(req.liabilityContext).toMatchObject({ stlAmt: '0', assetAcno: '', liabAcno: '', currency: 'USD' });
    });
  });

  describe('liability field mapping per kind', () => {
    it('IPLC_PAY_ACCEPT: passes through sourceFunctionCode, coerces sdaFlagIsSight, and turns falsy optionals into undefined', () => {
      const config = baseConfig({ liability: { kind: 'IPLC_PAY_ACCEPT', sourceFunctionCode: 'PayAcceptWithDiscount' } });
      const req = buildConfirmRequest(
        config,
        {
          ...baseModel,
          liabilityEnabled: true,
          liability: { stlAmt: '0', acptAmt: '', sdaFlagIsSight: true, assetAcno: 'A', liabAcno: 'L', tempAssetAcno: '', tempLiabAcno: '' },
        },
        debitLegs,
        creditLegs,
      );
      expect(req.liabilityContext).toEqual({
        module: 'IPLC',
        sourceFunctionCode: 'PayAcceptWithDiscount',
        stlAmt: '0',
        acptAmt: undefined,
        sdaFlagIsSight: true,
        assetAcno: 'A',
        liabAcno: 'L',
        tempAssetAcno: undefined,
        tempLiabAcno: undefined,
        currency: 'USD',
      });
    });

    it('IPLC_PAY_ACCEPT: carries acptAmt/tempAssetAcno/tempLiabAcno through as strings when present', () => {
      const config = baseConfig({ liability: { kind: 'IPLC_PAY_ACCEPT', sourceFunctionCode: 'PayAccept' } });
      const req = buildConfirmRequest(
        config,
        { ...baseModel, liabilityEnabled: true, liability: { acptAmt: '500', tempAssetAcno: 'TA', tempLiabAcno: 'TL' } },
        debitLegs,
        creditLegs,
      );
      expect(req.liabilityContext).toMatchObject({ acptAmt: '500', tempAssetAcno: 'TA', tempLiabAcno: 'TL' });
    });

    it('EPLC: passes through sourceFunctionCode and the replicateEplcVoucherDescDefect flag', () => {
      const config = baseConfig({ module: 'EPLC', liability: { kind: 'EPLC', sourceFunctionCode: 'PayAtMaturity' } });
      const req = buildConfirmRequest(
        config,
        { ...baseModel, liabilityEnabled: true, liability: { stlAmt: '100', assetAcno: 'A', liabAcno: 'L', replicateEplcVoucherDescDefect: true } },
        debitLegs,
        creditLegs,
      );
      expect(req.liabilityContext).toEqual({
        module: 'EPLC',
        sourceFunctionCode: 'PayAtMaturity',
        stlAmt: '100',
        assetAcno: 'A',
        liabAcno: 'L',
        currency: 'USD',
        replicateEplcVoucherDescDefect: true,
      });
    });

    it('EPLC: defaults stlAmt/assetAcno/liabAcno/currency/replicateEplcVoucherDescDefect when the sub-model is empty', () => {
      const config = baseConfig({ module: 'EPLC', liability: { kind: 'EPLC', sourceFunctionCode: 'PayAccept' } });
      const req = buildConfirmRequest(config, { ...baseModel, liabilityEnabled: true, liability: {} }, debitLegs, creditLegs);
      expect(req.liabilityContext).toMatchObject({ stlAmt: '0', assetAcno: '', liabAcno: '', currency: 'USD', replicateEplcVoucherDescDefect: false });
    });

    it('IMCO_SETTLEMENT_DA: maps billAmtFmDrwe with a fixed sourceFunctionCode', () => {
      const config = baseConfig({ module: 'IMCO', liability: { kind: 'IMCO_SETTLEMENT_DA' } });
      const req = buildConfirmRequest(
        config,
        { ...baseModel, liabilityEnabled: true, liability: { billAmtFmDrwe: '700', assetAcno: 'A', liabAcno: 'L' } },
        debitLegs,
        creditLegs,
      );
      expect(req.liabilityContext).toEqual({
        module: 'IMCO',
        sourceFunctionCode: 'SettlementDA',
        billAmtFmDrwe: '700',
        assetAcno: 'A',
        liabAcno: 'L',
        currency: 'USD',
      });
    });

    it('GTEE: maps clmTrxCcyAmt with a fixed sourceFunctionCode', () => {
      const config = baseConfig({ module: 'GTEE', liability: { kind: 'GTEE' } });
      const req = buildConfirmRequest(
        config,
        { ...baseModel, liabilityEnabled: true, liability: { clmTrxCcyAmt: '250', assetAcno: 'A', liabAcno: 'L' } },
        debitLegs,
        creditLegs,
      );
      expect(req.liabilityContext).toEqual({
        module: 'GTEE',
        sourceFunctionCode: 'OutwardClaimSettlement',
        clmTrxCcyAmt: '250',
        assetAcno: 'A',
        liabAcno: 'L',
        currency: 'USD',
      });
    });

    it('IMCO_SETTLEMENT_DA / GTEE: default billAmtFmDrwe/clmTrxCcyAmt/assetAcno/liabAcno/currency when the sub-model is empty', () => {
      const imco = buildConfirmRequest(baseConfig({ module: 'IMCO', liability: { kind: 'IMCO_SETTLEMENT_DA' } }), { ...baseModel, liabilityEnabled: true, liability: {} }, debitLegs, creditLegs);
      expect(imco.liabilityContext).toMatchObject({ billAmtFmDrwe: '0', assetAcno: '', liabAcno: '', currency: 'USD' });

      const gtee = buildConfirmRequest(baseConfig({ module: 'GTEE', liability: { kind: 'GTEE' } }), { ...baseModel, liabilityEnabled: true, liability: {} }, debitLegs, creditLegs);
      expect(gtee.liabilityContext).toMatchObject({ clmTrxCcyAmt: '0', assetAcno: '', liabAcno: '', currency: 'USD' });
    });

    it('IWGT: maps clmTrxCcyAmt and defaults methodOfIssuance to Issue when absent', () => {
      const config = baseConfig({ module: 'IWGT', liability: { kind: 'IWGT' } });
      const req = buildConfirmRequest(
        config,
        { ...baseModel, liabilityEnabled: true, liability: { clmTrxCcyAmt: '150', assetAcno: 'A', liabAcno: 'L' } },
        debitLegs,
        creditLegs,
      );
      expect(req.liabilityContext).toMatchObject({ methodOfIssuance: 'Issue' });
    });

    it('IWGT: defaults clmTrxCcyAmt/assetAcno/liabAcno/currency when the sub-model is empty', () => {
      const config = baseConfig({ module: 'IWGT', liability: { kind: 'IWGT' } });
      const req = buildConfirmRequest(config, { ...baseModel, liabilityEnabled: true, liability: {} }, debitLegs, creditLegs);
      expect(req.liabilityContext).toMatchObject({ clmTrxCcyAmt: '0', assetAcno: '', liabAcno: '', currency: 'USD' });
    });

    it('IWGT: carries an explicit methodOfIssuance=Advice through', () => {
      const config = baseConfig({ module: 'IWGT', liability: { kind: 'IWGT' } });
      const req = buildConfirmRequest(
        config,
        { ...baseModel, liabilityEnabled: true, liability: { clmTrxCcyAmt: '150', assetAcno: 'A', liabAcno: 'L', methodOfIssuance: 'Advice' } },
        debitLegs,
        creditLegs,
      );
      expect(req.liabilityContext).toMatchObject({ methodOfIssuance: 'Advice' });
    });
  });

  describe('charge context inclusion and mapping', () => {
    it('is omitted when config.charge is falsy', () => {
      const req = buildConfirmRequest(baseConfig(), { ...baseModel, chargeEnabled: true }, debitLegs, creditLegs);
      expect(req.chargeContext).toBeUndefined();
    });

    it('is omitted when config.charge is true but chargeEnabled is false', () => {
      const req = buildConfirmRequest(baseConfig({ charge: true }), { ...baseModel, chargeEnabled: false }, debitLegs, creditLegs);
      expect(req.chargeContext).toBeUndefined();
    });

    it('coerces isSettleCharges and turns an empty chargeAccountNo into undefined', () => {
      const req = buildConfirmRequest(
        baseConfig({ charge: true }),
        {
          ...baseModel,
          chargeEnabled: true,
          charge: { isSettleCharges: true, localChgCustPayTotalAmt: '5', foreignChgCustPayTotalAmt: '0', localPayVatTotalAmt: '0', chargeAccountNo: '' },
        },
        debitLegs,
        creditLegs,
      );
      expect(req.chargeContext).toEqual({
        isSettleCharges: true,
        localChgCustPayTotalAmt: '5',
        foreignChgCustPayTotalAmt: '0',
        localPayVatTotalAmt: '0',
        chargeAccountNo: undefined,
        currency: 'USD',
      });
    });

    it('carries a non-empty chargeAccountNo through as a string', () => {
      const req = buildConfirmRequest(
        baseConfig({ charge: true }),
        { ...baseModel, chargeEnabled: true, charge: { chargeAccountNo: 'CHG-1' } },
        debitLegs,
        creditLegs,
      );
      expect(req.chargeContext?.chargeAccountNo).toBe('CHG-1');
    });

    it('defaults every amount field to "0" when the charge sub-model is absent', () => {
      const req = buildConfirmRequest(baseConfig({ charge: true }), { ...baseModel, chargeEnabled: true }, debitLegs, creditLegs);
      expect(req.chargeContext).toMatchObject({ localChgCustPayTotalAmt: '0', foreignChgCustPayTotalAmt: '0', localPayVatTotalAmt: '0' });
    });
  });
});
