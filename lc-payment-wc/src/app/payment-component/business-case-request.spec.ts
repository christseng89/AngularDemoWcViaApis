import { buildConfirmRequest } from './business-case-request';
import type { BusinessCaseConfig } from './business-case.model';
import type { PaymentLegInput, SuspenseBridge } from './payment-component.types';

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
    const req = buildConfirmRequest(baseConfig(), baseModel, debitLegs, creditLegs, 'USD');

    expect(req.originModule).toBe('IPLC');
    expect(req.mainRef).toBe('IPLC-test-0001');
    expect(req.sequence).toBe(1);
    expect(req.unitCode).toBe('HQ');
    expect(req.debitLegs).toBe(debitLegs);
    expect(req.creditLegs).toBe(creditLegs);
  });

  it('coerces model.sequence to a number', () => {
    const req = buildConfirmRequest(baseConfig(), { ...baseModel, sequence: '3' }, debitLegs, creditLegs, 'USD');
    expect(req.sequence).toBe(3);
  });

  describe('voucher prefix resolution', () => {
    it('uses config.sourceFunctionCode when there is no dual-prefix choice', () => {
      const req = buildConfirmRequest(baseConfig({ sourceFunctionCode: 'PayAccept' }), baseModel, debitLegs, creditLegs, 'USD');
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
      const req = buildConfirmRequest(config, { ...baseModel, voucherPrefix: 'EPLC03NULLNULLNULL' }, debitLegs, creditLegs, 'USD');

      expect(req.sourceFunctionCode).toBeUndefined();
      expect(req.voucherCodePrefixOverride).toBe('EPLC03NULLNULLNULL');
    });
  });

  describe('transactionCurrency (v1.10.0)', () => {
    it('is sent explicitly, independent of any leg currency', () => {
      const req = buildConfirmRequest(baseConfig(), baseModel, debitLegs, creditLegs, 'USD');
      expect(req.transactionCurrency).toBe('USD');
    });

    it('can diverge from every leg\'s own currency — e.g. Full pay in JPY against a USD transaction', () => {
      const jpyDebitLegs: PaymentLegInput[] = [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'JPY', amountTxCcy: '10000.00' }];
      const req = buildConfirmRequest(baseConfig(), baseModel, jpyDebitLegs, creditLegs, 'USD');
      expect(req.transactionCurrency).toBe('USD');
      expect(req.debitLegs[0]!.currency).toBe('JPY');
    });
  });

  describe('suspenseBridge passthrough (v1.4.0)', () => {
    it('is omitted from the request when not supplied', () => {
      const req = buildConfirmRequest(baseConfig(), baseModel, debitLegs, creditLegs, 'USD');
      expect(req.suspenseBridge).toBeUndefined();
    });

    it('is included verbatim when supplied', () => {
      const suspenseBridge: SuspenseBridge = { debitEntries: [{ amount: '10', currency: 'USD', sourceComponent: 'CHARGE' }] };
      const req = buildConfirmRequest(baseConfig(), baseModel, debitLegs, creditLegs, 'USD', suspenseBridge);
      expect(req.suspenseBridge).toBe(suspenseBridge);
    });
  });

});
