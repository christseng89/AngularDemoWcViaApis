import { confirmPaymentInstruction } from '../../../src/domain/confirmPaymentInstruction';
import { createInMemoryPaymentInstructionStore, type PaymentInstructionStore } from '../../../src/store/paymentInstructionStore';
import { BusinessValidationError, RequestValidationError } from '../../../src/errors';
import type { ValidatedConfirmRequest } from '../../../src/validation/requestSchema';

function request(overrides: Partial<ValidatedConfirmRequest> = {}): ValidatedConfirmRequest {
  return {
    originModule: 'IPLC',
    mainRef: 'REF-1',
    sequence: 1,
    unitCode: 'HQ',
    debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' }],
    creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '100' }],
    ...overrides,
  };
}

describe('confirmPaymentInstruction', () => {
  let store: PaymentInstructionStore;

  beforeEach(() => {
    store = createInMemoryPaymentInstructionStore();
  });

  it('happy path: creates a new instruction with classification, settlement entries, and correct voucher descriptions', () => {
    const result = confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept' });
    expect(result.created).toBe(true);
    expect(result.instruction.debitLegs[0]!.accountDesc).toBe('IPLC03NULLNULLNULLC');
    expect(result.instruction.creditLegs[0]!.accountDesc).toBe('IPLC03NULLNULLNULLN');
    expect(result.instruction.classification.paymentComponentRelated).toBe(true);
    expect(result.instruction.accountEntries).toHaveLength(2);
    expect(result.instruction.swiftMessages).toEqual([]);
  });

  it('persists the created instruction so a later confirm with the same natural key replays it (created:false, same instructionId)', () => {
    const first = confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept' });
    const second = confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept' });
    expect(second.created).toBe(false);
    expect(second.instruction.instructionId).toBe(first.instruction.instructionId);
  });

  it('C-2: a DIFFERENT payload on the same natural key is rejected with IDEMPOTENCY_KEY_CONFLICT, not silently replayed', () => {
    const first = confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept' });
    // Same natural key (IPLC/REF-1/1) but different (still-balanced) amounts.
    const changed = request({
      debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '999' }],
      creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '999' }],
    });
    try {
      confirmPaymentInstruction(store, changed, { sourceFunctionCode: 'PayAccept' });
      fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(BusinessValidationError);
      expect((err as BusinessValidationError).code).toBe('IDEMPOTENCY_KEY_CONFLICT');
      expect((err as BusinessValidationError).httpStatus).toBe(409);
    }
    // The originally-stored instruction is untouched.
    expect(store.find('IPLC', 'REF-1', 1)!.instructionId).toBe(first.instruction.instructionId);
  });

  it('C-2: an identical resend still replays; an explicitly-undefined optional field hashes the same as an absent one (canonical)', () => {
    const first = confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept' });
    // Same content as request() (which omits these optionals), but with them present-but-undefined.
    const resend = request({ payInstrFlag: undefined, maturityDate: undefined, tenorType: undefined });
    const second = confirmPaymentInstruction(store, resend, { sourceFunctionCode: 'PayAccept' });
    expect(second.created).toBe(false);
    expect(second.instruction.instructionId).toBe(first.instruction.instructionId);
  });

  it('C-2: an instruction saved WITHOUT a fingerprint (legacy/persisted record) replays rather than conflicting', () => {
    // Seed the store DIRECTLY (no confirm) so there is no stored fingerprint for this key.
    const legacy = {
      instructionId: 'legacy-id',
      sequence: 1,
      originModule: 'IPLC',
      mainRef: 'REF-LEGACY',
      debitLegs: [],
      creditLegs: [],
      classification: {
        instructionId: 'legacy-id',
        debitTypes: [],
        creditTypes: [],
        customerXor: false,
        nostroXor: false,
        vostroXor: false,
        paymentComponentRelated: false,
      },
      accountEntries: [],
      swiftMessages: [],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    store.save(legacy); // no fingerprint
    const differentBody = request({
      mainRef: 'REF-LEGACY',
      debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '777' }],
      creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '777' }],
    });
    const replayed = confirmPaymentInstruction(store, differentBody, { sourceFunctionCode: 'PayAccept' });
    expect(replayed.created).toBe(false);
    expect(replayed.instruction.instructionId).toBe('legacy-id');
  });

  describe('dryRun', () => {
    it('recomputes fresh on every call and is never persisted', () => {
      const first = confirmPaymentInstruction(store, request({ debitLegs: [{ accountNo: 'A', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' }], creditLegs: [{ accountNo: 'B', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '100' }] }), {
        sourceFunctionCode: 'PayAccept',
        dryRun: true,
      });
      const second = confirmPaymentInstruction(store, request({ debitLegs: [{ accountNo: 'A', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '200' }], creditLegs: [{ accountNo: 'B', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '200' }] }), {
        sourceFunctionCode: 'PayAccept',
        dryRun: true,
      });

      expect(first.instruction.debitLegs[0]!.amountTxCcy).toBe('100');
      expect(second.instruction.debitLegs[0]!.amountTxCcy).toBe('200');
      expect(first.instruction.instructionId).not.toBe(second.instruction.instructionId);
      expect(first.created).toBe(false);
      expect(store.find('IPLC', 'REF-1', 1)).toBeUndefined();
    });

    it('a real (non-dryRun) confirm after N dryRuns still creates for real', () => {
      confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept', dryRun: true });
      confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept', dryRun: true });
      const real = confirmPaymentInstruction(store, request(), { sourceFunctionCode: 'PayAccept' });
      expect(real.created).toBe(true);
      expect(store.find('IPLC', 'REF-1', 1)).toBeDefined();
    });
  });

  it('throws BusinessValidationError and does not persist anything when legs are unbalanced', () => {
    const unbalanced = request({ creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '50' }] });
    expect(() => confirmPaymentInstruction(store, unbalanced, { sourceFunctionCode: 'PayAccept' })).toThrow(
      BusinessValidationError,
    );
    expect(store.find('IPLC', 'REF-1', 1)).toBeUndefined();
  });

  it('voucherCodePrefixOverride bypasses sourceFunctionCode resolution entirely', () => {
    const result = confirmPaymentInstruction(store, request(), { voucherCodePrefixOverride: 'EPLC07NULLNULLNULL' });
    expect(result.instruction.debitLegs[0]!.accountDesc).toBe('EPLC07NULLNULLNULLC');
  });

  it('throws RequestValidationError when neither sourceFunctionCode nor an override is supplied', () => {
    expect(() => confirmPaymentInstruction(store, request(), {})).toThrow(RequestValidationError);
  });

  it('never produces CHARGE or LIABILITY entries — §6.2/§6.3 removed v1.6.0', () => {
    const result = confirmPaymentInstruction(store, request({ mainRef: 'REF-NO-CHARGE-LIAB' }), { sourceFunctionCode: 'PayAccept' });
    expect(result.instruction.accountEntries.every((e) => e.voucherType === 'SETTLEMENT')).toBe(true);
  });

  describe('balance tolerance', () => {
    it('M-7: RPFM now also requires EXACT balance — a 0.01 difference is rejected (no automatic ±0.01 slack)', () => {
      const rpfmRequest = request({
        originModule: 'RPFM',
        mainRef: 'REF-RPFM',
        debitLegs: [{ accountNo: 'A', accountType: 'NOSTRO', currency: 'CNY', amountTxCcy: '100' }],
        creditLegs: [{ accountNo: 'B', accountType: 'CUSTOMER', currency: 'CNY', amountTxCcy: '99.99' }],
      });
      expect(() => confirmPaymentInstruction(store, rpfmRequest, { voucherCodePrefixOverride: 'RPFM01NULLNULLNULL' })).toThrow(
        BusinessValidationError,
      );
    });

    it('M-7: RPFM with an EXACTLY balanced voucher still confirms normally', () => {
      const rpfmRequest = request({
        originModule: 'RPFM',
        mainRef: 'REF-RPFM-OK',
        debitLegs: [{ accountNo: 'A', accountType: 'NOSTRO', currency: 'CNY', amountTxCcy: '100' }],
        creditLegs: [{ accountNo: 'B', accountType: 'CUSTOMER', currency: 'CNY', amountTxCcy: '100' }],
      });
      expect(() => confirmPaymentInstruction(store, rpfmRequest, { voucherCodePrefixOverride: 'RPFM01NULLNULLNULL' })).not.toThrow();
    });

    it('requires exact equality by default for a non-RPFM module', () => {
      const iplcRequest = request({
        mainRef: 'REF-STRICT',
        debitLegs: [{ accountNo: 'A', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' }],
        creditLegs: [{ accountNo: 'B', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '99.99' }],
      });
      expect(() => confirmPaymentInstruction(store, iplcRequest, { sourceFunctionCode: 'PayAccept' })).toThrow(
        BusinessValidationError,
      );
    });

    it('an explicit balanceTolerance overrides the default even for a non-RPFM module', () => {
      const iplcRequest = request({
        mainRef: 'REF-OVERRIDE-TOL',
        debitLegs: [{ accountNo: 'A', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' }],
        creditLegs: [{ accountNo: 'B', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '99.5' }],
      });
      expect(() =>
        confirmPaymentInstruction(store, iplcRequest, { sourceFunctionCode: 'PayAccept', balanceTolerance: '1' }),
      ).not.toThrow();
    });
  });

  it('propagates a SWIFT cross-field violation as a BusinessValidationError and never persists', () => {
    const badSwift = request({
      mainRef: 'REF-SWIFT-BAD',
      creditLegs: [
        {
          accountNo: 'NOSTRO-ACC',
          accountType: 'NOSTRO',
          currency: 'USD',
          amountTxCcy: '100',
          payCoverMsgType: 'MT202COV',
          // payAdviceMsgType deliberately omitted -> cross-field violation
        },
      ],
    });
    expect(() => confirmPaymentInstruction(store, badSwift, { sourceFunctionCode: 'PayAccept' })).toThrow(
      BusinessValidationError,
    );
    expect(store.find('IPLC', 'REF-SWIFT-BAD', 1)).toBeUndefined();
  });

  describe('suspenseBridge (v1.4.0)', () => {
    it('expands debitEntries into a Suspense - Debit leg BEFORE the balance check, and includes it in accountEntries', () => {
      // Caller pre-adjusts its own debit total by the same amount (10), per the OAS contract.
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-SB-1',
          debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '110' }],
          suspenseBridge: { debitEntries: [{ amount: '10', currency: 'USD' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );
      expect(result.instruction.creditLegs.some((l) => l.accountNo === 'Suspense - Debit' && l.amountTxCcy === '10')).toBe(true);
      expect(
        result.instruction.accountEntries.some(
          (e) => e.voucherType === 'SETTLEMENT' && e.glAccount === 'Suspense - Debit' && e.amount === '10',
        ),
      ).toBe(true);
    });

    it('a debitEntries bridge WITHOUT the caller pre-adjusting its own debit total is unbalanced -> 409', () => {
      const unadjusted = request({
        mainRef: 'REF-SB-2',
        suspenseBridge: { debitEntries: [{ amount: '10', currency: 'USD' }] },
      });
      expect(() => confirmPaymentInstruction(store, unadjusted, { sourceFunctionCode: 'PayAccept' })).toThrow(
        BusinessValidationError,
      );
    });

    it('creditEntries paired with the matching caller-side credit reduction stays balanced', () => {
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-SB-3',
          creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '90' }],
          suspenseBridge: { creditEntries: [{ amount: '10', currency: 'USD' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );
      expect(result.instruction.creditLegs.some((l) => l.accountNo === 'Suspense - Credit' && l.amountTxCcy === '10')).toBe(true);
    });

    it('a cross-currency entry with no matching leg adds its Suspense-suffixed FX Exchange pair legs and stays balanced (v1.8.0 — always suffixed, even with no leg to disambiguate from)', () => {
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-SB-4',
          debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '111' }],
          suspenseBridge: { debitEntries: [{ amount: '10', currency: 'EUR', crossRate: '1.1' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );
      expect(result.instruction.creditLegs.some((l) => l.accountNo === 'FX Exchange EUR - Suspense')).toBe(true);
      expect(result.instruction.debitLegs.some((l) => l.accountNo === 'FX Exchange USD - Suspense')).toBe(true);
    });

    it('propagates RequestValidationError when a cross-currency entry has no crossRate, before the balance check ever runs', () => {
      const missingRate = request({
        mainRef: 'REF-SB-5',
        suspenseBridge: { debitEntries: [{ amount: '10', currency: 'EUR' }] },
      });
      expect(() => confirmPaymentInstruction(store, missingRate, { sourceFunctionCode: 'PayAccept' })).toThrow(
        RequestValidationError,
      );
      expect(store.find('IPLC', 'REF-SB-5', 1)).toBeUndefined();
    });

    it('omitting suspenseBridge entirely behaves exactly as before (no bridge legs added)', () => {
      const result = confirmPaymentInstruction(store, request({ mainRef: 'REF-SB-6' }), { sourceFunctionCode: 'PayAccept' });
      expect(result.instruction.debitLegs).toHaveLength(1);
      expect(result.instruction.creditLegs).toHaveLength(1);
    });

    it('v1.8.0 per-source pairs: a real EUR debit leg (20) alongside a EUR Suspense Debit entry (17) each get their OWN independent FX pair — the leg pair reuses the leg\'s own amountTxCcy verbatim, the Suspense pair reuses the bridge leg\'s own amountTxCcy verbatim', () => {
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-SB-NET-1',
          debitLegs: [
            { accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' },
            { accountNo: 'EUR-ACC', accountType: 'CUSTOMER', currency: 'EUR', amountTxCcy: '18', amountAccountCcy: '20' },
          ],
          creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '99.3' }],
          suspenseBridge: { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );
      const bridgeLeg = result.instruction.creditLegs.find((l) => l.accountNo === 'Suspense - Debit');
      expect(bridgeLeg?.amountAccountCcy).toBe('17'); // gross, unaffected by the leg pair
      const suspenseFxOtherCcy = result.instruction.debitLegs.find((l) => l.accountNo === 'FX Exchange USD - Suspense');
      expect(suspenseFxOtherCcy?.amountAccountCcy).toBe('17'); // Suspense pair sized to gross Suspense alone
      const legFxTrxCcy = result.instruction.debitLegs.find((l) => l.accountNo === 'FX Exchange EUR');
      expect(legFxTrxCcy?.amountTxCcy).toBe('18'); // leg pair reuses the leg's own amountTxCcy verbatim (not re-derived from 20)

      // Full aggregate V8 (submitted legs + all generated legs) balances exactly.
      const sum = (legs: { amountTxCcy: string }[]) => legs.reduce((s, l) => s + Number(l.amountTxCcy), 0);
      expect(Math.round(sum(result.instruction.debitLegs) * 100)).toBe(Math.round(sum(result.instruction.creditLegs) * 100));
    });

    it('v1.8.0 per-source pairs: a real EUR debit leg (17) exactly matching gross Suspense (17) no longer skips the FX pairs — BOTH still generate independently, netting to the same zero incremental effect once summed', () => {
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-SB-NET-2',
          debitLegs: [
            { accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100' },
            { accountNo: 'EUR-ACC', accountType: 'CUSTOMER', currency: 'EUR', amountTxCcy: '15.45', amountAccountCcy: '17' },
          ],
          creditLegs: [{ accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '96.75' }],
          suspenseBridge: { debitEntries: [{ amount: '17', currency: 'EUR', crossRate: '1.1' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );
      expect(result.instruction.debitLegs.some((l) => l.accountNo === 'FX Exchange EUR')).toBe(true); // leg pair — DOES generate now (v1.8.0)
      expect(result.instruction.debitLegs.some((l) => l.accountNo === 'FX Exchange USD - Suspense')).toBe(true); // Suspense pair's Other-Ccy-site — DOES generate now (CREDIT-anchored, so Other-Ccy-site lands on debit)
      expect(result.instruction.creditLegs.some((l) => l.accountNo === 'Suspense - Debit')).toBe(true);
      const sum = (legs: { amountTxCcy: string }[]) => legs.reduce((s, l) => s + Number(l.amountTxCcy), 0);
      expect(Math.round(sum(result.instruction.debitLegs) * 100)).toBe(Math.round(sum(result.instruction.creditLegs) * 100));
    });

    it('v1.8.0 CREDIT-side per-source pairs (reviewer-confirmed worked example): a real EUR credit leg (100) alongside a EUR Suspense Credit entry (100, gross) each get their OWN independent FX pair — reusing each source\'s own already-computed amountTxCcy verbatim', () => {
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-SB-NET-CREDIT-1',
          debitLegs: [{ accountNo: 'CUST-ACC2', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '10000' }],
          creditLegs: [
            { accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'EUR', amountTxCcy: '108.31', amountAccountCcy: '100' },
            { accountNo: 'NOSTRO-ACC2', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '9783.38' },
          ],
          suspenseBridge: { creditEntries: [{ amount: '100', currency: 'EUR', crossRate: '1.0831' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );
      const bridgeLeg = result.instruction.creditLegs.find((l) => l.accountNo === 'Suspense - Credit');
      expect(bridgeLeg?.amountAccountCcy).toBe('100'); // gross — unaffected by the leg pair
      const suspenseFxOtherCcy = result.instruction.debitLegs.find((l) => l.accountNo === 'FX Exchange USD - Suspense');
      expect(suspenseFxOtherCcy?.amountAccountCcy).toBe('100'); // Suspense pair sized to gross Suspense alone
      const suspenseFxTrxCcy = result.instruction.creditLegs.find((l) => l.accountNo === 'FX Exchange EUR - Suspense');
      expect(suspenseFxTrxCcy?.amountTxCcy).toBe('108.31'); // the bridge leg's OWN amountTxCcy, reused verbatim
      const legFxTrxCcy = result.instruction.creditLegs.find((l) => l.accountNo === 'FX Exchange EUR');
      expect(legFxTrxCcy?.amountTxCcy).toBe('108.31'); // NOSTRO-ACC's OWN amountTxCcy, reused verbatim — NOT re-derived as (100+100)*rate

      // Full aggregate V8 balances exactly — including per-currency: EUR own-currency (Debit 100+100
      // from both Other-Ccy-sites = Credit 100+100 from NOSTRO-ACC + Suspense-Credit) AND USD
      // own-currency (Debit 10000 = Credit 108.31+108.31+9783.38).
      const sum = (legs: { amountTxCcy: string }[]) => legs.reduce((s, l) => s + Number(l.amountTxCcy), 0);
      expect(Math.round(sum(result.instruction.debitLegs) * 100)).toBe(Math.round(sum(result.instruction.creditLegs) * 100));
      const usdCredit = result.instruction.creditLegs.filter((l) => l.currency === 'USD').reduce((s, l) => s + Number(l.amountTxCcy), 0);
      expect(Math.round(usdCredit * 100)).toBe(1000000); // 10000.00 in cents — matches the sole USD debit (CUST-ACC2)
    });

    it('v1.7.1 ordering (accounting-review best practice) still holds with v1.8.0\'s two FX pairs: Normal Debit -> FX Debit(s) -> FX Credit(s) -> Normal Credit -> Suspense Credit', () => {
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-SB-ORDER-1',
          debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '10000' }],
          creditLegs: [
            { accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'EUR', amountTxCcy: '108.31', amountAccountCcy: '100' },
            { accountNo: 'NOSTRO-ACC', accountType: 'NOSTRO', currency: 'USD', amountTxCcy: '9783.38' },
          ],
          suspenseBridge: { creditEntries: [{ amount: '100', currency: 'EUR', crossRate: '1.0831' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );

      // Debit side: [normal debit(s)..., FX Debit(s) last — both the Suspense pair's and the leg
      // pair's Other-Ccy-site legs land here, in that order (Suspense pair built first per bucket)]
      expect(result.instruction.debitLegs.map((l) => l.accountNo)).toEqual(['CUST-ACC', 'FX Exchange USD - Suspense', 'FX Exchange USD']);

      // Credit side: [FX Credit(s) first, normal credit(s)..., Suspense Credit last] — FX Credit
      // (index 0) immediately follows the last FX Debit when the two arrays are read as one
      // continuous Settlement Vouchers table.
      expect(result.instruction.creditLegs.map((l) => l.accountNo)).toEqual([
        'FX Exchange EUR - Suspense',
        'FX Exchange EUR',
        'NOSTRO-ACC',
        'NOSTRO-ACC',
        'Suspense - Credit',
      ]);
    });
  });

  it('a suspenseBridge entry tagged with sourceComponent still only ever produces a SETTLEMENT entry (pure provenance metadata, v1.5.0/v1.6.0)', () => {
    const result = confirmPaymentInstruction(
      store,
      request({
        mainRef: 'REF-SB-TAGGED',
        debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '110' }],
        suspenseBridge: {
          debitEntries: [{ amount: '10', currency: 'USD', sourceComponent: 'BALANCE', balanceModule: 'IBL' }],
        },
      }),
      { sourceFunctionCode: 'PayAccept' },
    );
    expect(result.instruction.accountEntries.every((e) => e.voucherType === 'SETTLEMENT')).toBe(true);
  });

  describe('debitLegsComponentBridge (2026-08-09, business-requirement-confirmed)', () => {
    it('creditLegs may be empty when debitLegsComponentBridge:true and suspenseBridge.creditEntries is populated — the 400 this used to hit at the schema layer is gone, and confirmPaymentInstruction itself needed no change', () => {
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-CCB-1',
          debitLegs: [{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '100', amountAccountCcy: '100' }],
          creditLegs: [],
          debitLegsComponentBridge: true,
          suspenseBridge: { creditEntries: [{ amount: '100', currency: 'USD', sourceComponent: 'CHARGE' }] },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );
      expect(result.instruction.creditLegs.map((l) => l.accountNo)).toEqual(['Suspense - Credit']);
      const debitTotal = result.instruction.debitLegs.reduce((s, l) => s + Number(l.amountTxCcy), 0);
      const creditTotal = result.instruction.creditLegs.reduce((s, l) => s + Number(l.amountTxCcy), 0);
      expect(debitTotal).toBe(creditTotal); // V8
    });

    it('reviewer-confirmed multi-currency worked example: USD 80+20 / EUR 200 debit legs against USD 100 / EUR 200 Suspense Credit — clean Settlement Vouchers, no FX Exchange lines, both currencies balance', () => {
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-CCB-MULTI',
          debitLegs: [
            { accountNo: 'CUST-ACC2', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '80', amountAccountCcy: '80' },
            { accountNo: 'CUST-ACC3', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '20', amountAccountCcy: '20' },
            { accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'EUR', amountTxCcy: '240', amountAccountCcy: '200', drRate: '1.2' },
          ],
          creditLegs: [],
          debitLegsComponentBridge: true,
          suspenseBridge: {
            creditEntries: [
              { amount: '100', currency: 'USD', sourceComponent: 'CHARGE' },
              { amount: '200', currency: 'EUR', crossRate: '1.2', sourceComponent: 'CHARGE' },
            ],
          },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );

      const settlement = result.instruction.accountEntries.map((e) => `${e.drCrIndicator} ${e.glAccount} ${e.currency} ${e.amount}`);
      expect(settlement).toEqual([
        'D CUST-ACC2 USD 80',
        'D CUST-ACC3 USD 20',
        'D CUST-ACC EUR 200',
        'C Suspense - Credit USD 100',
        'C Suspense - Credit EUR 200',
      ]);
      expect(settlement.some((s) => s.includes('FX Exchange'))).toBe(false);
    });

    it('debit exceeds Suspense Credit: a real EUR 210 debit leg against only EUR 200 Suspense Credit (the 10 EUR excess funded by a smaller compensating USD leg) — a DEBIT-anchored FX pair sized to just the 10 EUR / 12 USD excess, balances by currency AND in aggregate', () => {
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-CCB-EXCESS',
          debitLegs: [
            { accountNo: 'CUST-ACC2', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '88', amountAccountCcy: '88' },
            { accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'EUR', amountTxCcy: '252', amountAccountCcy: '210', drRate: '1.2' },
          ],
          creditLegs: [],
          debitLegsComponentBridge: true,
          suspenseBridge: {
            creditEntries: [
              { amount: '100', currency: 'USD', sourceComponent: 'CHARGE' },
              { amount: '200', currency: 'EUR', crossRate: '1.2', sourceComponent: 'CHARGE' },
            ],
          },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );

      const settlement = result.instruction.accountEntries.map((e) => `${e.drCrIndicator} ${e.glAccount} ${e.currency} ${e.amount}`);
      expect(settlement).toEqual([
        'D CUST-ACC2 USD 88',
        'D CUST-ACC EUR 210',
        'D FX Exchange EUR - Suspense USD 12',
        'C FX Exchange USD - Suspense EUR 10',
        'C Suspense - Credit USD 100',
        'C Suspense - Credit EUR 200',
      ]);

      const eurDebit = result.instruction.accountEntries.filter((e) => e.currency === 'EUR' && e.drCrIndicator === 'D').reduce((s, e) => s + Number(e.amount), 0);
      const eurCredit = result.instruction.accountEntries.filter((e) => e.currency === 'EUR' && e.drCrIndicator === 'C').reduce((s, e) => s + Number(e.amount), 0);
      expect(eurDebit).toBe(eurCredit);
      const usdDebit = result.instruction.accountEntries.filter((e) => e.currency === 'USD' && e.drCrIndicator === 'D').reduce((s, e) => s + Number(e.amount), 0);
      const usdCredit = result.instruction.accountEntries.filter((e) => e.currency === 'USD' && e.drCrIndicator === 'C').reduce((s, e) => s + Number(e.amount), 0);
      expect(usdDebit).toBe(usdCredit);
    });

    it('partial coverage: only EUR 150 of the EUR 200 Suspense Credit is matched by a real EUR debit leg, the rest funded by extra USD — the FX pair is sized to just the EUR 50 / USD 60 residual, and the whole instruction still balances by currency AND in aggregate', () => {
      const result = confirmPaymentInstruction(
        store,
        request({
          mainRef: 'REF-CCB-PARTIAL',
          debitLegs: [
            { accountNo: 'CUST-ACC2', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '160', amountAccountCcy: '160' },
            { accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'EUR', amountTxCcy: '180', amountAccountCcy: '150', drRate: '1.2' },
          ],
          creditLegs: [],
          debitLegsComponentBridge: true,
          suspenseBridge: {
            creditEntries: [
              { amount: '100', currency: 'USD', sourceComponent: 'CHARGE' },
              { amount: '200', currency: 'EUR', crossRate: '1.2', sourceComponent: 'CHARGE' },
            ],
          },
        }),
        { sourceFunctionCode: 'PayAccept' },
      );

      const settlement = result.instruction.accountEntries.map((e) => `${e.drCrIndicator} ${e.glAccount} ${e.currency} ${e.amount}`);
      expect(settlement).toEqual([
        'D CUST-ACC2 USD 160',
        'D CUST-ACC EUR 150',
        'D FX Exchange USD - Suspense EUR 50',
        'C FX Exchange EUR - Suspense USD 60',
        'C Suspense - Credit USD 100',
        'C Suspense - Credit EUR 200',
      ]);

      const eurDebit = result.instruction.accountEntries.filter((e) => e.currency === 'EUR' && e.drCrIndicator === 'D').reduce((s, e) => s + Number(e.amount), 0);
      const eurCredit = result.instruction.accountEntries.filter((e) => e.currency === 'EUR' && e.drCrIndicator === 'C').reduce((s, e) => s + Number(e.amount), 0);
      expect(eurDebit).toBe(eurCredit); // per-currency balance, EUR
      const usdDebit = result.instruction.accountEntries.filter((e) => e.currency === 'USD' && e.drCrIndicator === 'D').reduce((s, e) => s + Number(e.amount), 0);
      const usdCredit = result.instruction.accountEntries.filter((e) => e.currency === 'USD' && e.drCrIndicator === 'C').reduce((s, e) => s + Number(e.amount), 0);
      expect(usdDebit).toBe(usdCredit); // per-currency balance, USD
    });

    it('genuine per-currency mismatch (debit EUR 199 vs Suspense Credit EUR 200, no compensating leg elsewhere) still throws LEGS_UNBALANCED — every pair here is self-balancing by construction, so no sizing choice can mask a real aggregate discrepancy', () => {
      expect(() =>
        confirmPaymentInstruction(
          store,
          request({
            mainRef: 'REF-CCB-MISMATCH',
            debitLegs: [
              { accountNo: 'CUST-ACC2', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '80', amountAccountCcy: '80' },
              { accountNo: 'CUST-ACC3', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '20', amountAccountCcy: '20' },
              { accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'EUR', amountTxCcy: '238.80', amountAccountCcy: '199', drRate: '1.2' },
            ],
            creditLegs: [],
            debitLegsComponentBridge: true,
            suspenseBridge: {
              creditEntries: [
                { amount: '100', currency: 'USD', sourceComponent: 'CHARGE' },
                { amount: '200', currency: 'EUR', crossRate: '1.2', sourceComponent: 'CHARGE' },
              ],
            },
          }),
          { sourceFunctionCode: 'PayAccept' },
        ),
      ).toThrow(BusinessValidationError);
    });
  });

  it('generates SWIFT messages when credit legs specify valid message types', () => {
    const result = confirmPaymentInstruction(
      store,
      request({
        mainRef: 'REF-SWIFT-OK',
        creditLegs: [
          {
            accountNo: 'NOSTRO-ACC',
            accountType: 'NOSTRO',
            currency: 'USD',
            amountTxCcy: '100',
            payAdviceMsgType: 'MT103',
          },
        ],
      }),
      { sourceFunctionCode: 'PayAccept' },
    );
    expect(result.instruction.swiftMessages).toHaveLength(1);
    expect(result.instruction.swiftMessages[0]!.messageType).toBe('MT103');
  });
});
