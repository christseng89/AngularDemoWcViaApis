import {
  buildSettlementEntries,
  buildChargeVoucherEntry,
  buildLiabilityVoucherEntries,
  type ChargeVoucherContext,
  type LiabilityVoucherContext,
} from '../../../src/domain/accountEntries';
import type { PaymentLeg } from '../../../src/types';

function leg(overrides: Partial<PaymentLeg> = {}): PaymentLeg {
  return {
    accountNo: 'ACC-1',
    accountType: 'CUSTOMER',
    currency: 'USD',
    amountTxCcy: '100',
    legId: 'leg-1',
    legSide: 'DEBIT',
    accountDesc: 'IPLC03NULLNULLNULLC',
    accountCategory: 'CUSTOMER',
    ...overrides,
  };
}

describe('buildSettlementEntries', () => {
  it('produces one D entry per debit leg using amountTxCcy when amountAccountCcy is absent', () => {
    const entries = buildSettlementEntries('instr-1', [leg({ amountTxCcy: '250' })], 'DEBIT');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.drCrIndicator).toBe('D');
    expect(entries[0]!.amount).toBe('250');
    expect(entries[0]!.glAccount).toBe('ACC-1');
    expect(entries[0]!.description).toBe('IPLC03NULLNULLNULLC');
  });

  it('produces C entries for the credit side', () => {
    const entries = buildSettlementEntries('instr-1', [leg()], 'CREDIT');
    expect(entries[0]!.drCrIndicator).toBe('C');
  });

  it('prefers amountAccountCcy over amountTxCcy when present', () => {
    const entries = buildSettlementEntries('instr-1', [leg({ amountTxCcy: '100', amountAccountCcy: '150' })], 'DEBIT');
    expect(entries[0]!.amount).toBe('150');
  });

  it('carries custId from partyId and referenceNumber from accountNo', () => {
    const entries = buildSettlementEntries('instr-1', [leg({ partyId: 'PARTY-9', accountNo: 'ACC-9' })], 'DEBIT');
    expect(entries[0]!.custId).toBe('PARTY-9');
    expect(entries[0]!.referenceNumber).toBe('ACC-9');
  });

  it('maps one entry per leg for multiple legs', () => {
    const entries = buildSettlementEntries('instr-1', [leg({ accountNo: 'A' }), leg({ accountNo: 'B' })], 'DEBIT');
    expect(entries).toHaveLength(2);
  });

  it('returns an empty array for no legs', () => {
    expect(buildSettlementEntries('instr-1', [], 'DEBIT')).toEqual([]);
  });
});

describe('buildChargeVoucherEntry', () => {
  const base: ChargeVoucherContext = {
    isSettleCharges: false,
    localChgCustPayTotalAmt: '10',
    foreignChgCustPayTotalAmt: '20',
    localPayVatTotalAmt: '1',
    chargeAccountNo: 'CHG-ACC',
    currency: 'USD',
  };

  it('isSettleCharges=false: chargeAmount = local + vat', () => {
    const result = buildChargeVoucherEntry('instr-1', base);
    expect(result.chargeAmount.toFixed()).toBe('11');
    expect(result.entry.amount).toBe('11');
    expect(result.entry.drCrIndicator).toBe('D');
    expect(result.entry.voucherType).toBe('CHARGE');
    expect(result.entry.description).toBe('Charge Voucher');
  });

  it('isSettleCharges=true: chargeAmount = MAX(local, foreign) when foreign is larger', () => {
    const result = buildChargeVoucherEntry('instr-1', { ...base, isSettleCharges: true });
    expect(result.chargeAmount.toFixed()).toBe('20');
  });

  it('isSettleCharges=true: chargeAmount = MAX(local, foreign) when local is larger', () => {
    const result = buildChargeVoucherEntry('instr-1', {
      ...base,
      isSettleCharges: true,
      localChgCustPayTotalAmt: '99',
      foreignChgCustPayTotalAmt: '5',
    });
    expect(result.chargeAmount.toFixed()).toBe('99');
  });

  it('chargeDebitAmount is 0 when chargeAccountNo is absent, but chargeAmount is still the full pre-gate amount', () => {
    const result = buildChargeVoucherEntry('instr-1', { ...base, chargeAccountNo: undefined });
    expect(result.chargeAmount.toFixed()).toBe('11');
    expect(result.entry.amount).toBe('0');
    expect(result.entry.glAccount).toBe('');
  });

  it('chargeDebitAmount is 0 when chargeAccountNo is an empty string', () => {
    const result = buildChargeVoucherEntry('instr-1', { ...base, chargeAccountNo: '' });
    expect(result.entry.amount).toBe('0');
  });

  it('carries custId and bookingDate through onto the entry', () => {
    const result = buildChargeVoucherEntry('instr-1', { ...base, custId: 'CUST-9', bookingDate: '2026-01-01' });
    expect(result.entry.custId).toBe('CUST-9');
    expect(result.entry.bookingDate).toBe('2026-01-01');
  });
});

describe('buildLiabilityVoucherEntries', () => {
  it('EXCO always returns no entries', () => {
    expect(buildLiabilityVoucherEntries('instr-1', { module: 'EXCO' })).toEqual([]);
  });

  it('NONE always returns no entries', () => {
    expect(buildLiabilityVoucherEntries('instr-1', { module: 'NONE' })).toEqual([]);
  });

  describe('IPLC', () => {
    it('PaymentAtMaturity: one Dr/Cr pair with desc IPLC06FIRMNULLNULLI on both legs', () => {
      const ctx: LiabilityVoucherContext = {
        module: 'IPLC',
        sourceFunctionCode: 'PaymentAtMaturity',
        stlAmt: '500',
        assetAcno: 'ASSET-1',
        liabAcno: 'LIAB-1',
        currency: 'USD',
      };
      const entries = buildLiabilityVoucherEntries('instr-1', ctx);
      expect(entries).toHaveLength(2);
      expect(entries[0]!.drCrIndicator).toBe('D');
      expect(entries[0]!.glAccount).toBe('ASSET-1');
      expect(entries[0]!.amount).toBe('500');
      expect(entries[0]!.description).toBe('IPLC06FIRMNULLNULLI');
      expect(entries[1]!.drCrIndicator).toBe('C');
      expect(entries[1]!.glAccount).toBe('LIAB-1');
      expect(entries[1]!.description).toBe('IPLC06FIRMNULLNULLI');
    });

    it('PayAccept with stlAmt > 0: one Dr/Cr pair with desc IPLC03CONTNULLNULLI', () => {
      const ctx: LiabilityVoucherContext = {
        module: 'IPLC',
        sourceFunctionCode: 'PayAccept',
        stlAmt: '800',
        assetAcno: 'ASSET-1',
        liabAcno: 'LIAB-1',
        currency: 'USD',
      };
      const entries = buildLiabilityVoucherEntries('instr-1', ctx);
      expect(entries).toHaveLength(2);
      expect(entries[0]!.description).toBe('IPLC03CONTNULLNULLI');
      expect(entries[0]!.amount).toBe('800');
    });

    it('PayAccept with stlAmt=0 and acptAmt>0 + sdaFlagIsSight: two pairs, pair1 uses stlAmt (source quirk)', () => {
      const ctx: LiabilityVoucherContext = {
        module: 'IPLC',
        sourceFunctionCode: 'PayAcceptWithDiscount',
        stlAmt: '0',
        acptAmt: '500',
        sdaFlagIsSight: true,
        assetAcno: 'ASSET-1',
        liabAcno: 'LIAB-1',
        tempAssetAcno: 'TEMP-ASSET-1',
        tempLiabAcno: 'TEMP-LIAB-1',
        currency: 'USD',
      };
      const entries = buildLiabilityVoucherEntries('instr-1', ctx);
      expect(entries).toHaveLength(4);
      // pair 1: TEMP accounts, amount = stlAmt (0), desc IPLC04CONTNULLNULLI
      expect(entries[0]!.glAccount).toBe('TEMP-ASSET-1');
      expect(entries[0]!.amount).toBe('0');
      expect(entries[0]!.description).toBe('IPLC04CONTNULLNULLI');
      expect(entries[1]!.glAccount).toBe('TEMP-LIAB-1');
      // pair 2: liabAcno/assetAcno (swapped), amount = acptAmt (500), desc IPLC04FIRMNULLNULLI
      expect(entries[2]!.glAccount).toBe('LIAB-1');
      expect(entries[2]!.amount).toBe('500');
      expect(entries[2]!.description).toBe('IPLC04FIRMNULLNULLI');
      expect(entries[3]!.glAccount).toBe('ASSET-1');
    });

    it('PayAccept with stlAmt=0, acptAmt>0, sdaFlagIsSight but missing temp accounts throws', () => {
      const ctx: LiabilityVoucherContext = {
        module: 'IPLC',
        sourceFunctionCode: 'PayAccept',
        stlAmt: '0',
        acptAmt: '500',
        sdaFlagIsSight: true,
        assetAcno: 'ASSET-1',
        liabAcno: 'LIAB-1',
        currency: 'USD',
      };
      expect(() => buildLiabilityVoucherEntries('instr-1', ctx)).toThrow(
        'IPLC PayAccept liability entry requires tempAssetAcno/tempLiabAcno when ACPT_AMT branch applies',
      );
    });

    it('PayAccept with stlAmt=0 and acptAmt=0 returns no entries', () => {
      const ctx: LiabilityVoucherContext = {
        module: 'IPLC',
        sourceFunctionCode: 'PayAccept',
        stlAmt: '0',
        acptAmt: '0',
        assetAcno: 'ASSET-1',
        liabAcno: 'LIAB-1',
        currency: 'USD',
      };
      expect(buildLiabilityVoucherEntries('instr-1', ctx)).toEqual([]);
    });

    it('PayAccept with stlAmt=0 and acptAmt omitted entirely defaults to 0 and returns no entries', () => {
      const ctx: LiabilityVoucherContext = {
        module: 'IPLC',
        sourceFunctionCode: 'PayAccept',
        stlAmt: '0',
        assetAcno: 'ASSET-1',
        liabAcno: 'LIAB-1',
        currency: 'USD',
      };
      expect(buildLiabilityVoucherEntries('instr-1', ctx)).toEqual([]);
    });

    it('PayAccept with stlAmt=0, acptAmt>0 but sdaFlagIsSight false returns no entries', () => {
      const ctx: LiabilityVoucherContext = {
        module: 'IPLC',
        sourceFunctionCode: 'PayAccept',
        stlAmt: '0',
        acptAmt: '500',
        sdaFlagIsSight: false,
        assetAcno: 'ASSET-1',
        liabAcno: 'LIAB-1',
        currency: 'USD',
      };
      expect(buildLiabilityVoucherEntries('instr-1', ctx)).toEqual([]);
    });
  });

  describe('EPLC', () => {
    it('default (replicateEplcVoucherDescDefect unset/false): credit leg description IS set', () => {
      const ctx: LiabilityVoucherContext = {
        module: 'EPLC',
        sourceFunctionCode: 'PayAccept',
        stlAmt: '300',
        assetAcno: 'ASSET-1',
        liabAcno: 'LIAB-1',
        currency: 'USD',
      };
      const entries = buildLiabilityVoucherEntries('instr-1', ctx);
      expect(entries[0]!.description).toBe('EPLC03CONTNULLNULLI');
      expect(entries[1]!.description).toBe('EPLC03CONTNULLNULLI');
    });

    it('replicateEplcVoucherDescDefect=true: credit leg description is left empty (source .valuee typo)', () => {
      const ctx: LiabilityVoucherContext = {
        module: 'EPLC',
        sourceFunctionCode: 'PayAtMaturity',
        stlAmt: '300',
        assetAcno: 'ASSET-1',
        liabAcno: 'LIAB-1',
        currency: 'USD',
        replicateEplcVoucherDescDefect: true,
      };
      const entries = buildLiabilityVoucherEntries('instr-1', ctx);
      expect(entries[0]!.description).toBe('EPLC03CONTNULLNULLI');
      expect(entries[1]!.description).toBe('');
    });
  });

  it('IMCO SettlementDA produces one Dr/Cr pair with desc IMCO03CONTNULLNULLI', () => {
    const ctx: LiabilityVoucherContext = {
      module: 'IMCO',
      sourceFunctionCode: 'SettlementDA',
      billAmtFmDrwe: '700',
      assetAcno: 'ASSET-1',
      liabAcno: 'LIAB-1',
      currency: 'USD',
    };
    const entries = buildLiabilityVoucherEntries('instr-1', ctx);
    expect(entries).toHaveLength(2);
    expect(entries[0]!.amount).toBe('700');
    expect(entries[0]!.description).toBe('IMCO03CONTNULLNULLI');
  });

  it('GTEE OutwardClaimSettlement produces one Dr/Cr pair with desc GTEE04CONTNULLNULLI', () => {
    const ctx: LiabilityVoucherContext = {
      module: 'GTEE',
      sourceFunctionCode: 'OutwardClaimSettlement',
      clmTrxCcyAmt: '250',
      assetAcno: 'ASSET-1',
      liabAcno: 'LIAB-1',
      currency: 'USD',
    };
    const entries = buildLiabilityVoucherEntries('instr-1', ctx);
    expect(entries[0]!.description).toBe('GTEE04CONTNULLNULLI');
    expect(entries[0]!.amount).toBe('250');
  });

  describe('IWGT', () => {
    it('methodOfIssuance=Issue produces a Dr/Cr pair with distinct descs', () => {
      const ctx: LiabilityVoucherContext = {
        module: 'IWGT',
        sourceFunctionCode: 'SettleInwardClaim',
        clmTrxCcyAmt: '150',
        assetAcno: 'ASSET-1',
        liabAcno: 'LIAB-1',
        currency: 'USD',
        methodOfIssuance: 'Issue',
      };
      const entries = buildLiabilityVoucherEntries('instr-1', ctx);
      expect(entries).toHaveLength(2);
      expect(entries[0]!.description).toBe('IWGT04CONTNULLNULLC');
      expect(entries[1]!.description).toBe('IWGT04CONTNULLNULLI');
    });

    it('methodOfIssuance=Advice produces no entries', () => {
      const ctx: LiabilityVoucherContext = {
        module: 'IWGT',
        sourceFunctionCode: 'SettleInwardClaim',
        clmTrxCcyAmt: '150',
        assetAcno: 'ASSET-1',
        liabAcno: 'LIAB-1',
        currency: 'USD',
        methodOfIssuance: 'Advice',
      };
      expect(buildLiabilityVoucherEntries('instr-1', ctx)).toEqual([]);
    });
  });
});
