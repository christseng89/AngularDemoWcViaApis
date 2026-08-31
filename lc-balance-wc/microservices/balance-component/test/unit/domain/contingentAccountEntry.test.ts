import { deriveContingentAccountEntry } from '../../../src/domain/contingentAccountEntry';

describe('deriveContingentAccountEntry (analysis/contingent-liability-ledger.html)', () => {
  describe('Folio 1 — IPLC_LC / EPLC_LC, tenor-suffixed', () => {
    test.each([
      ['ISSUE', 'SIGHT', "Customers' Liability under DC — Sight", 'Documentary Credits Outstanding — Sight'],
      ['AMEND_INCREASE', 'SIGHT', "Customers' Liability under DC — Sight", 'Documentary Credits Outstanding — Sight'],
      ['AMEND_DECREASE', 'SIGHT', 'Documentary Credits Outstanding — Sight', "Customers' Liability under DC — Sight"],
      ['UTILIZE', 'SIGHT', 'Documentary Credits Outstanding — Sight', "Customers' Liability under DC — Sight"],
      ['ISSUE', 'BUYERS_USANCE', "Customers' Liability under DC — Buyer's Usance", "Documentary Credits Outstanding — Buyer's Usance"],
      ['UTILIZE', 'BUYERS_USANCE', "Documentary Credits Outstanding — Buyer's Usance", "Customers' Liability under DC — Buyer's Usance"],
      ['ISSUE', 'SELLERS_USANCE', "Customers' Liability under DC — Seller's Usance", "Documentary Credits Outstanding — Seller's Usance"],
      ['UTILIZE', 'SELLERS_USANCE', "Documentary Credits Outstanding — Seller's Usance", "Customers' Liability under DC — Seller's Usance"],
    ])('%s / %s -> Dr %s, Cr %s', (movementType, tenorType, expectedDr, expectedCr) => {
      const entry = deriveContingentAccountEntry({ instrumentType: 'IPLC_LC', movementType, amount: '50000', currency: 'USD', tenorType: tenorType as any });
      expect(entry).toEqual({ drAccount: expectedDr, crAccount: expectedCr, currency: 'USD', amount: '50000' });
    });

    test('EPLC_LC uses the identical LC family as IPLC_LC (schema-valid, no function creates one today, but the mapping stays correct)', () => {
      const entry = deriveContingentAccountEntry({ instrumentType: 'EPLC_LC', movementType: 'ISSUE', amount: '1000', currency: 'USD', tenorType: 'SIGHT' });
      expect(entry).toEqual({
        drAccount: "Customers' Liability under DC — Sight",
        crAccount: 'Documentary Credits Outstanding — Sight',
        currency: 'USD',
        amount: '1000',
      });
    });

    test('null/undefined tenorType reads as Sight (A1/B1 default, and legacy DP/DA TenorType values no function ever produces)', () => {
      expect(deriveContingentAccountEntry({ instrumentType: 'IPLC_LC', movementType: 'ISSUE', amount: '1', currency: 'USD', tenorType: null })!.drAccount).toBe(
        "Customers' Liability under DC — Sight",
      );
      expect(deriveContingentAccountEntry({ instrumentType: 'IPLC_LC', movementType: 'ISSUE', amount: '1', currency: 'USD' })!.drAccount).toBe(
        "Customers' Liability under DC — Sight",
      );
      expect(
        deriveContingentAccountEntry({ instrumentType: 'IPLC_LC', movementType: 'ISSUE', amount: '1', currency: 'USD', tenorType: 'DP' as any })!.drAccount,
      ).toBe("Customers' Liability under DC — Sight");
    });
  });

  describe('Folio 2 — SHGT, not tenor-suffixed', () => {
    test.each([
      ['ISSUE', "Customers' Liability under Shipping Guarantees", 'Shipping Guarantees Outstanding'],
      ['PARTIAL_REDEEM', 'Shipping Guarantees Outstanding', "Customers' Liability under Shipping Guarantees"],
      ['FULL_REDEEM', 'Shipping Guarantees Outstanding', "Customers' Liability under Shipping Guarantees"],
    ])('%s -> Dr %s, Cr %s', (movementType, expectedDr, expectedCr) => {
      const entry = deriveContingentAccountEntry({ instrumentType: 'SHGT', movementType, amount: '30000', currency: 'USD' });
      expect(entry).toEqual({ drAccount: expectedDr, crAccount: expectedCr, currency: 'USD', amount: '30000' });
    });

    test("SHGT ignores tenorType entirely — same pair regardless of the parent LC's own declared tenor", () => {
      const sight = deriveContingentAccountEntry({ instrumentType: 'SHGT', movementType: 'ISSUE', amount: '1', currency: 'USD', tenorType: 'SIGHT' });
      const usance = deriveContingentAccountEntry({ instrumentType: 'SHGT', movementType: 'ISSUE', amount: '1', currency: 'USD', tenorType: 'SELLERS_USANCE' });
      expect(sight).toEqual(usance);
    });
  });

  describe('Folio 3 — IPLC_ACCEPTANCE shadow memo, not tenor-suffixed', () => {
    test.each([
      ['CREATE', "Acceptances & DPU — Customers' Liability (memo)", 'Acceptances & DPU — Outstanding (memo)'],
      ['FULL_SETTLE', 'Acceptances & DPU — Outstanding (memo)', "Acceptances & DPU — Customers' Liability (memo)"],
      ['PARTIAL_SETTLE', 'Acceptances & DPU — Outstanding (memo)', "Acceptances & DPU — Customers' Liability (memo)"],
    ])('%s -> Dr %s, Cr %s', (movementType, expectedDr, expectedCr) => {
      const entry = deriveContingentAccountEntry({
        instrumentType: 'IPLC_ACCEPTANCE',
        movementType,
        amount: '20000',
        currency: 'USD',
        tenorType: 'BUYERS_USANCE',
      });
      expect(entry).toEqual({ drAccount: expectedDr, crAccount: expectedCr, currency: 'USD', amount: '20000' });
    });

    test("Buyer's and Seller's Usance post the identical pair (the shadow memo account itself is not tenor-suffixed, per the ledger's own Folio 3)", () => {
      const bu = deriveContingentAccountEntry({
        instrumentType: 'IPLC_ACCEPTANCE',
        movementType: 'CREATE',
        amount: '1',
        currency: 'USD',
        tenorType: 'BUYERS_USANCE',
      });
      const su = deriveContingentAccountEntry({
        instrumentType: 'IPLC_ACCEPTANCE',
        movementType: 'CREATE',
        amount: '1',
        currency: 'USD',
        tenorType: 'SELLERS_USANCE',
      });
      expect(bu).toEqual(su);
    });
  });

  describe('Folio 4 — EPLC_CONFIRMATION, tenor-suffixed Sight/Usance only', () => {
    test.each([
      ['ISSUE', 'SIGHT', 'Issuing Bank Confirmation Exposure — Sight', 'Confirmation Undertakings Outstanding — Sight'],
      ['HONOUR', 'SIGHT', 'Confirmation Undertakings Outstanding — Sight', 'Issuing Bank Confirmation Exposure — Sight'],
      ['ISSUE', 'SELLERS_USANCE', 'Issuing Bank Confirmation Exposure — Usance', 'Confirmation Undertakings Outstanding — Usance'],
      ['ACCEPT', 'SELLERS_USANCE', 'Confirmation Undertakings Outstanding — Usance', 'Issuing Bank Confirmation Exposure — Usance'],
      ['ACCEPT', 'BUYERS_USANCE', 'Confirmation Undertakings Outstanding — Usance', 'Issuing Bank Confirmation Exposure — Usance'],
    ])('%s / %s -> Dr %s, Cr %s', (movementType, tenorType, expectedDr, expectedCr) => {
      const entry = deriveContingentAccountEntry({
        instrumentType: 'EPLC_CONFIRMATION',
        movementType,
        amount: '40000',
        currency: 'USD',
        tenorType: tenorType as any,
      });
      expect(entry).toEqual({ drAccount: expectedDr, crAccount: expectedCr, currency: 'USD', amount: '40000' });
    });

    test('AMEND with a positive amount is Establish (Increase) — same direction as ISSUE', () => {
      const entry = deriveContingentAccountEntry({
        instrumentType: 'EPLC_CONFIRMATION',
        movementType: 'AMEND',
        amount: '10000',
        currency: 'USD',
        tenorType: 'SIGHT',
      });
      expect(entry).toEqual({
        drAccount: 'Issuing Bank Confirmation Exposure — Sight',
        crAccount: 'Confirmation Undertakings Outstanding — Sight',
        currency: 'USD',
        amount: '10000',
      });
    });

    test('AMEND with a negative amount flips to Release (Decrease) — Balance Component has no separate AMEND_INCREASE/AMEND_DECREASE for EPLC_CONFIRMATION, so the sign of the typed amount is what distinguishes them', () => {
      const entry = deriveContingentAccountEntry({
        instrumentType: 'EPLC_CONFIRMATION',
        movementType: 'AMEND',
        amount: '-10000',
        currency: 'USD',
        tenorType: 'SIGHT',
      });
      expect(entry).toEqual({
        drAccount: 'Confirmation Undertakings Outstanding — Sight',
        crAccount: 'Issuing Bank Confirmation Exposure — Sight',
        currency: 'USD',
        amount: '10000',
      });
    });

    test('the entry amount is always the absolute value, even for a negative-amount AMEND decrease', () => {
      const entry = deriveContingentAccountEntry({
        instrumentType: 'EPLC_CONFIRMATION',
        movementType: 'AMEND',
        amount: '-2500.50',
        currency: 'USD',
        tenorType: 'SIGHT',
      });
      expect(entry!.amount).toBe('2500.5');
    });
  });

  describe('Folio 5 — EPLC_ACCEPTANCE shadow memo (Export), not tenor-suffixed', () => {
    test.each([
      ['CREATE', "Confirmed Acceptances & DPU — Customers' Liability (memo)", 'Confirmed Acceptances & DPU — Outstanding (memo)'],
      ['FULL_SETTLE', 'Confirmed Acceptances & DPU — Outstanding (memo)', "Confirmed Acceptances & DPU — Customers' Liability (memo)"],
      ['PARTIAL_SETTLE', 'Confirmed Acceptances & DPU — Outstanding (memo)', "Confirmed Acceptances & DPU — Customers' Liability (memo)"],
    ])('%s -> Dr %s, Cr %s', (movementType, expectedDr, expectedCr) => {
      const entry = deriveContingentAccountEntry({ instrumentType: 'EPLC_ACCEPTANCE', movementType, amount: '15000', currency: 'USD' });
      expect(entry).toEqual({ drAccount: expectedDr, crAccount: expectedCr, currency: 'USD', amount: '15000' });
    });
  });

  describe('EPLC_EXAMINATION (B3 Present Docs) — never posts a real account-entry pair (2026-08-17)', () => {
    test('CREATE -> null (B3 never actually posts to the books, per Design Principle D3)', () => {
      const entry = deriveContingentAccountEntry({ instrumentType: 'EPLC_EXAMINATION', movementType: 'CREATE', amount: '5000', currency: 'USD' });
      expect(entry).toBeNull();
    });
  });

  describe('AMEND_EXPIRY_DATE (A2/B2 third subChoice option) — never posts a real account-entry pair (F1, user-reported 2026-08-25 "不牽涉金額 不需要出ACCOUNT ENTRIES")', () => {
    test('-> null for a plain amendment against an ACTIVE contract (amount is always 0 by construction, no balance effect of its own)', () => {
      const entry = deriveContingentAccountEntry({ instrumentType: 'IPLC_LC', movementType: 'AMEND_EXPIRY_DATE', amount: '0', currency: 'USD' });
      expect(entry).toBeNull();
    });

    test('-> null on the Export side too (EPLC_CONFIRMATION) — same rule regardless of which of the two modes (plain amendment vs. the Expiry Extension Amendment path, EXPIRED -> ACTIVE) is in play; the CONTRACT\'s current status distinguishes them, not this pure function, and neither ever has a real balance effect of its own (Extension\'s own restoration is the linked REVERSAL leg\'s own separate entry)', () => {
      const entry = deriveContingentAccountEntry({ instrumentType: 'EPLC_CONFIRMATION', movementType: 'AMEND_EXPIRY_DATE', amount: '0', currency: 'USD' });
      expect(entry).toBeNull();
    });
  });

  describe("out of contingent scope — ledger's own Scope boundary (on-balance-sheet never generated here)", () => {
    test.each(['EPLC_DUE_FROM_ISSUING_BANK', 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE', 'EPLC_EXPORT_BILLS_DISCOUNTED'])(
      '%s -> null, regardless of movementType',
      (instrumentType) => {
        expect(deriveContingentAccountEntry({ instrumentType: instrumentType as any, movementType: 'CREATE', amount: '1', currency: 'USD' })).toBeNull();
        expect(deriveContingentAccountEntry({ instrumentType: instrumentType as any, movementType: 'REIMBURSE', amount: '1', currency: 'USD' })).toBeNull();
      },
    );
  });

  test('an unrecognized movementType returns null rather than throwing or guessing', () => {
    expect(deriveContingentAccountEntry({ instrumentType: 'IPLC_LC', movementType: 'NOT_A_REAL_MOVEMENT_TYPE', amount: '1', currency: 'USD' })).toBeNull();
  });

  test('sign-folding is symmetric: a negative amount on an already-release-direction movementType flips back to establish (defensive — no real caller submits a negative amount for anything other than EPLC_CONFIRMATION AMEND, but the rule itself is sign-agnostic, not AMEND-specific)', () => {
    const entry = deriveContingentAccountEntry({ instrumentType: 'IPLC_LC', movementType: 'UTILIZE', amount: '-5000', currency: 'USD', tenorType: 'SIGHT' });
    expect(entry).toEqual({
      drAccount: "Customers' Liability under DC — Sight",
      crAccount: 'Documentary Credits Outstanding — Sight',
      currency: 'USD',
      amount: '5000',
    });
  });

  test('currency is passed through unchanged', () => {
    const entry = deriveContingentAccountEntry({ instrumentType: 'SHGT', movementType: 'ISSUE', amount: '1000', currency: 'EUR' });
    expect(entry!.currency).toBe('EUR');
  });
});
