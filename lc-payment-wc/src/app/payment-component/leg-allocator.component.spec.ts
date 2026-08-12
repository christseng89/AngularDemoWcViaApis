import { SimpleChange } from '@angular/core';
import { of } from 'rxjs';
import Decimal from 'decimal.js';
import { LegAllocatorComponent } from './leg-allocator.component';
import type { FxRateService } from './fx-rate.service';
import type { CurrencyService } from './currency.service';
import type { PaymentLegInput } from './payment-component.types';

function makeComponent(overrides: Partial<{ crossRate: number | null }> = {}) {
  const mockFx = {
    rates: jest.fn(() => of({ 'USD/TWD': 32.5, 'EUR/TWD': 35.2 })),
    crossRate: jest.fn(() => (overrides.crossRate === undefined ? 2 : overrides.crossRate)),
  } as unknown as FxRateService;

  const mockCurrency = {
    codes: jest.fn(() => of(['USD', 'EUR', 'JPY', 'GBP', 'TWD'])),
    decimals: jest.fn(() => of({ USD: 2, EUR: 2, JPY: 0, GBP: 2, TWD: 0 })),
  } as unknown as CurrencyService;

  const comp = new LegAllocatorComponent(mockFx, mockCurrency);
  comp.side = 'DEBIT';
  comp.accountTypeOptions = ['CUSTOMER', 'NOSTRO', 'VOSTRO', 'SUSPENSE', 'INTERNAL'];
  comp.defaultAccountType = 'CUSTOMER';
  comp.defaultAccountNo = 'CUST-ACC';
  comp.initialTotalAmount = '10000';
  comp.initialCurrency = 'USD';
  comp.caseKey = 'case-1';

  const emittedLegs: PaymentLegInput[][] = [];
  const emittedValid: boolean[] = [];
  comp.legsChange.subscribe((legs) => emittedLegs.push(legs));
  comp.validChange.subscribe((valid) => emittedValid.push(valid));

  return { comp, mockFx, mockCurrency, emittedLegs, emittedValid };
}

describe('LegAllocatorComponent', () => {
  describe('initial reset (ngOnInit)', () => {
    it('starts with a single 100% remainder row matching the inputs', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.ngOnInit();

      expect(comp.rows).toHaveLength(1);
      expect(comp.rows[0]!.pct.toNumber()).toBe(100);
      expect(comp.rows[0]!.isRemainder).toBe(true);
      expect(comp.rows[0]!.accountType).toBe('CUSTOMER');
      expect(comp.rows[0]!.accountNo).toBe('CUST-ACC');
      expect(comp.rows[0]!.currency).toBe('USD');
      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(10000);

      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit).toEqual([{ accountNo: 'CUST-ACC', accountType: 'CUSTOMER', currency: 'USD', amountTxCcy: '10000.00' }]);
    });

    it('seeds the RTGS indicator from defaultRtgsIndicator when the default account type is NOSTRO', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.defaultAccountType = 'NOSTRO';
      comp.defaultRtgsIndicator = true;
      comp.ngOnInit();

      expect(comp.rows[0]!.rtgsIndicator).toBe(true);
      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit[0]!.rtgsIndicator).toBe(true);
    });
  });

  describe('remainder rounding (regression: total=0.35, 30/70 split must sum to exactly 0.35)', () => {
    it('derives the remainder amount as total-minus-fixed, not an independently rounded percentage', () => {
      const { comp } = makeComponent();
      comp.initialTotalAmount = '0.35';
      comp.ngOnInit();

      comp.onPctInput(comp.rows[0]!, 30);

      expect(comp.rows).toHaveLength(2);
      const [fixedRow, remainderRow] = comp.rows;
      expect(fixedRow!.pct.toNumber()).toBe(30);
      expect(fixedRow!.amountTxCcy.toNumber()).toBe(0.11); // 0.35 * 30% = 0.105 -> rounds to 0.11
      expect(remainderRow!.isRemainder).toBe(true);
      // NOT 0.25 (0.35 * 70% independently rounded) — must be 0.35 - 0.11 = 0.24 exactly.
      expect(remainderRow!.amountTxCcy.toNumber()).toBe(0.24);

      const sum = fixedRow!.amountTxCcy.plus(remainderRow!.amountTxCcy);
      expect(sum.toNumber()).toBe(0.35);
    });

    it("a newly-spawned remainder row (the ordinary split path — NOT rule 3's last-row-decrease new row) defaults its Account No. to the account TYPE's own placeholder, not blank — same DEFAULT_ACCOUNT_NO_BY_TYPE convention v1.12.2 already applied to rule 3's new row (reviewer-reported: this far-more-common spawn path, e.g. the very first % or Amount split, was still left blank)", () => {
      const { comp } = makeComponent();
      comp.ngOnInit(); // row0 @ 100%/10000.00, accountNo = defaultAccountNo ('CUST-ACC')

      comp.onPctInput(comp.rows[0]!, 30); // row0 -> 30% fixed; row1 spawns as a brand-new remainder row @ 70%

      expect(comp.rows).toHaveLength(2);
      const remainderRow = comp.rows[1]!;
      expect(remainderRow.isRemainder).toBe(true);
      expect(remainderRow.accountNo).toBe('CUST-ACC'); // DEFAULT_ACCOUNT_NO_BY_TYPE['CUSTOMER'] — was '' before this fix
    });

    it('with TWO independently-fixed NON-last rows — one same-currency-different-account, one foreign-currency, EACH refined via the amount waterfall (v1.12.3: every non-last row offsets directly against the LAST row) — the last row absorbs both differences exact to the cent, and neither non-last row ever touches the other', () => {
      const { comp } = makeComponent({ crossRate: 2 });
      comp.ngOnInit(); // row0: 100% remainder, USD, total=10000

      // Pre-carve THREE rows via %-editing (untouched by the waterfall — that rule is Amount-
      // only). addRow() freezes a row (fixes it at its current %/amount, isRemainder:false)
      // WITHOUT itself being a waterfall-affecting amount edit — used here purely so the NEXT
      // onPctInput's fixRow() doesn't fall back to re-promoting an already-fixed earlier row (a
      // pre-existing fixRow quirk, orthogonal to this rule: with exactly one non-remainder row,
      // fixing the sole remainder falls back to promoting whichever OTHER row exists, even an
      // already-fixed one).
      comp.addRow(); // row0 fixed @ 100% / 10000.00, no remainder anywhere
      comp.onPctInput(comp.rows[0]!, 50); // row0 -> 50%/5000.00 fixed; row1 spawns as remainder @ 50%/5000.00
      comp.addRow(); // row1 fixed @ 50%/5000.00 too, no remainder anywhere
      comp.onPctInput(comp.rows[1]!, 20); // row1 -> 20%/2000.00 fixed; row2 spawns as remainder @ 30%/3000.00
      expect(comp.rows).toHaveLength(3);
      const [row0, row1, row2] = comp.rows;

      // Row 0: "Other Trx Amount (Same Currency, different account)" — refined to its final exact
      // value via onAmountInput. A decrease (5000.00 -> 333.33) on row0 — NOT the last row —
      // waterfalls the freed 4666.67 straight to row2 (the last row), NOT row1 (its positional
      // neighbor): row1 is untouched.
      comp.onAmountInput(row0!, 333.33);
      expect(row0!.amountTxCcy.toNumber()).toBe(333.33);
      expect(row1!.amountTxCcy.toNumber()).toBe(2000); // untouched — rule 2 targets the LAST row only, never the neighbor
      expect(row2!.amountTxCcy.toNumber()).toBe(7666.67); // 3000.00 + 4666.67 — temporary, refined next

      // Row 1: "SUM(Trx Equivalent)" — foreign currency, refined via onAccountAmountInput ("this
      // leg pays EUR 250"). A decrease (2000 -> 125.00, rate 2) on row1 — also NOT the last row —
      // likewise waterfalls its own freed 1875 straight to row2. row0 is never touched by this
      // second edit either: EVERY non-last row's edit targets the last row directly.
      comp.onRowCurrencyChange(row1!, 'EUR');
      comp.onAccountAmountInput(row1!, 250); // amountTxCcy = money(250 / rate) = money(250 / 2) = 125.00
      expect(row1!.amountTxCcy.toNumber()).toBe(125);
      expect(row0!.amountTxCcy.toNumber()).toBe(333.33); // untouched by row1's own edit

      // row2 absorbed BOTH decreases in sequence (3000.00 + 4666.67 + 1875) —
      // Total(10000) - Other Trx Amount(333.33) - SUM(Trx Equivalent)(125.00) = 9541.67, exactly.
      expect(row2!.amountTxCcy.toNumber()).toBe(9541.67);
      expect(row2!.currency).toBe('USD');
      // No longer literally "the remainder" — the waterfall fixes every row it touches, same as
      // a directly-typed amount (see applyAmountWaterfall's own doc comment) — but its VALUE is
      // exactly what the old remainder-recompute formula would have produced.
      expect(row2!.isRemainder).toBe(false);

      const total = row0!.amountTxCcy.plus(row1!.amountTxCcy).plus(row2!.amountTxCcy);
      expect(total.toNumber()).toBe(10000);
    });
  });

  describe("last-row % exact-complement (v1.12.1 — reviewer: 100% − Σ(every row before the last), so amount-driven splits never display a .01% drift)", () => {
    it('a three-way 1/3 split (the classic repeating-fraction case) reads Total Allocated as exactly 100.00%, not 99.99% — each row independently rounds to 33.33%, but the LAST row absorbs the exact complement (33.34%) instead', () => {
      const { comp } = makeComponent();
      comp.initialTotalAmount = '3';
      comp.ngOnInit(); // row0 @ 100%/3.00
      comp.addRow(); // freeze row0 @ 100%/3.00 (still 1 row — neutral, no waterfall involved)
      comp.onAmountInput(comp.rows[0]!, 1); // rows.length was 1 at call time -> bypass path -> row0=1.00 fixed; row1 spawns remainder @ 2.00
      const row1 = comp.rows[1]!;

      comp.onAmountInput(row1, 1); // NOW rows.length=2>1 -> waterfall; row1 is last -> decrease opens row2 @ 1.00 (the freed difference)

      expect(comp.rows).toHaveLength(3); // no phantom 4th "remainder" row for the amount-exact-but-%-drifted 0.01
      const [row0, row1b, row2] = comp.rows;
      expect(row0.amountTxCcy.toNumber()).toBe(1);
      expect(row1b.amountTxCcy.toNumber()).toBe(1);
      expect(row2.amountTxCcy.toNumber()).toBe(1);
      expect(row0.pct.toNumber()).toBe(33.33); // independently rounded — unchanged, matches its own amount
      expect(row1b.pct.toNumber()).toBe(33.33); // independently rounded too — only the LAST row gets the correction
      expect(row2.pct.toNumber()).toBe(33.34); // 100 - 33.33 - 33.33, NOT the independently-rounded 33.33
      const pctSum = row0.pct.plus(row1b.pct).plus(row2.pct);
      expect(pctSum.toNumber()).toBe(100); // exact — this is the actual bug being fixed (would be 99.99 without it)
      expect(comp.totalPct).toBe(100);
    });

    it("does NOT mask a genuine over-allocation by force-correcting the last row's % — the Total Allocated warning must still fire", () => {
      const { comp } = makeComponent(); // total = 10000
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 60); // row0=60% fixed; row1 spawns remainder @ 40%
      comp.addRow(); // freeze row1 @ 40% (neutral — avoids fixRow's sole-remainder fallback complicating this setup)
      // Direct field assignment, not a second onPctInput — the % waterfall (2026-08-12) itself
      // conserves Σ% = 100 by construction (an increase on the last row draws from row0 instead of
      // over-allocating), so genuine over-allocation is no longer reachable through the input
      // handler alone; see the equivalent notes in the 'addRow / removeRow' and 'validChange'
      // describe blocks above. This isolates the isOverAllocated/%-complement-skip WARNING logic
      // under test here from the waterfall's own conservation behavior.
      comp.rows[1]!.pct = new Decimal(60); // fixedPct now 120%, genuinely over-allocated by AMOUNT (12000 > 10000)
      comp.onFieldChange();

      const [row0, row1] = comp.rows;
      expect(row1!.pct.toNumber()).toBe(60); // NOT force-corrected to 40 (100 - 60) — that would hide the real over-allocation
      expect(row0!.pct.toNumber()).toBe(60);
      expect(comp.totalPct).toBe(120);
      expect(comp.isOverAllocated).toBe(true); // the warning still fires — unmasked
    });

    it('a genuine (non-drift) leftover still correctly spawns a real remainder row, unaffected by switching the routing decision from %-based to amount-based', () => {
      const { comp } = makeComponent(); // total = 10000
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 30); // row0=30% fixed; row1 spawns remainder — a REAL 70%/7000 leftover, not drift

      expect(comp.rows).toHaveLength(2);
      const row1 = comp.rows[1]!;
      expect(row1.isRemainder).toBe(true);
      expect(row1.pct.toNumber()).toBe(70);
      expect(row1.amountTxCcy.toNumber()).toBe(7000);
    });
  });

  describe('row array stability (regression: *ngFor DOM-relocation/focus-loss bug)', () => {
    it('never reorders existing rows in the array when editing the fixed row', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();

      comp.onPctInput(comp.rows[0]!, 30); // creates rows[1] as the new remainder
      const [firstId, secondId] = comp.rows.map((r) => r.id);

      // Editing the first (now-fixed) row again must NOT move it in the array,
      // and must not move the remainder row either.
      comp.onPctInput(comp.rows[0]!, 45);
      expect(comp.rows.map((r) => r.id)).toEqual([firstId, secondId]);
      expect(comp.rows[1]!.pct.toNumber()).toBe(55);
    });

    it('editing the current remainder (LAST) row via % opens a new trailing row for the freed difference — the % waterfall (2026-08-12) applies to it exactly like any other last-row edit, superseding the old fixRow fallback-promotion (role-swap) behavior', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 30); // rows = [row0 30% fixed, row1 70% remainder]
      const [firstId, secondId] = comp.rows.map((r) => r.id);

      comp.onPctInput(comp.rows[1]!, 20); // decrease on the LAST row, which still happens to be the remainder

      expect(comp.rows).toHaveLength(3); // a NEW row was appended — not a role-swap back to rows[0]
      expect(comp.rows[0]!.id).toBe(firstId);
      expect(comp.rows[1]!.id).toBe(secondId);
      expect(comp.rows[0]!.pct.toNumber()).toBe(30); // untouched
      expect(comp.rows[1]!.pct.toNumber()).toBe(20);
      expect(comp.rows[1]!.isRemainder).toBe(false); // no longer floating — this edit made it explicit
      const row2 = comp.rows[2]!;
      expect(row2.pct.toNumber()).toBe(50); // 70 - 20 freed
      expect(row2.isRemainder).toBe(false);
      // No OTHER row was silently reassigned to "remainder" — the old fixRow fallback-promotion
      // this test used to rely on is deliberately bypassed now (same rationale as the Amount
      // waterfall's own analogous fix).
      expect(comp.rows.filter((r) => r.isRemainder)).toHaveLength(0);
    });
  });

  describe('RTGS indicator threading', () => {
    it('includes rtgsIndicator:true on the emitted leg only for a NOSTRO row with the flag set', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.defaultAccountType = 'NOSTRO';
      comp.ngOnInit();
      comp.rows[0]!.rtgsIndicator = true;
      comp.onFieldChange();

      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit[0]!.rtgsIndicator).toBe(true);
    });

    it('omits rtgsIndicator entirely (not false) when unset', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.defaultAccountType = 'NOSTRO';
      comp.ngOnInit();

      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit[0]!.rtgsIndicator).toBeUndefined();
    });

    it('onAccountTypeChange resets rtgsIndicator to false when switching away from NOSTRO', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.defaultAccountType = 'NOSTRO';
      comp.defaultRtgsIndicator = true;
      comp.ngOnInit();
      expect(comp.rows[0]!.rtgsIndicator).toBe(true);

      comp.onAccountTypeChange(comp.rows[0]!, 'CUSTOMER');

      expect(comp.rows[0]!.rtgsIndicator).toBe(false);
      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit[0]!.rtgsIndicator).toBeUndefined();
    });

    it('onAccountTypeChange resets Account No. to the new type\'s own default placeholder, replacing whatever the prior type left behind — avoids a stale "CUST-ACC" surviving a switch to NOSTRO', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.ngOnInit();
      expect(comp.rows[0]!.accountNo).toBe('CUST-ACC'); // seeded from defaultAccountNo

      comp.onAccountTypeChange(comp.rows[0]!, 'NOSTRO');
      expect(comp.rows[0]!.accountNo).toBe('NOSTRO-ACC');

      comp.onAccountTypeChange(comp.rows[0]!, 'VOSTRO');
      expect(comp.rows[0]!.accountNo).toBe('VOSTRO-ACC');

      comp.onAccountTypeChange(comp.rows[0]!, 'INTERNAL');
      expect(comp.rows[0]!.accountNo).toBe('INTERNAL-ACC');

      comp.onAccountTypeChange(comp.rows[0]!, 'SUSPENSE');
      expect(comp.rows[0]!.accountNo).toBe('SUSPENSE-ACC');

      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit[0]!.accountNo).toBe('SUSPENSE-ACC'); // reflected on the wire too
    });

    it('onAccountTypeChange overwrites a manually-edited Account No. too — the reset is unconditional on any real type switch, not just when the field was untouched', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.accountNo = 'MY-CUSTOM-ACC-123'; // user hand-typed something before switching type

      comp.onAccountTypeChange(comp.rows[0]!, 'NOSTRO');

      expect(comp.rows[0]!.accountNo).toBe('NOSTRO-ACC');
    });

    it('makeRow forces rtgsIndicator false for a non-NOSTRO row even if a truthy default was passed', () => {
      const { comp } = makeComponent();
      comp.defaultAccountType = 'CUSTOMER';
      comp.defaultRtgsIndicator = true; // meaningless for CUSTOMER — must not leak through
      comp.ngOnInit();

      expect(comp.rows[0]!.rtgsIndicator).toBe(false);
    });
  });

  describe('onTotalChange', () => {
    it('rescales every row amount to match its existing percentage', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 40); // rows[0]=40%, rows[1]=60% remainder

      comp.onTotalChange(2000);

      expect(comp.totalAmount.toNumber()).toBe(2000);
      expect(comp.rows[0]!.pct.toNumber()).toBe(40);
      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(800);
      expect(comp.rows[1]!.amountTxCcy.toNumber()).toBe(1200);
    });

    it('regression (B-Tree driver XOR): a SAME-currency row driven by a directly-typed Amount (onAmountInput) keeps that amount EXACT — not rescaled by its derived % — when the total later changes for an unrelated reason', () => {
      const { comp } = makeComponent();
      comp.ngOnInit(); // total = 10000, USD
      comp.onAmountInput(comp.rows[0]!, 500); // user types "USD 500" directly — Amount-driven, pct(5%) is DERIVED, not the source of truth
      const fixedRow = comp.rows.find((r) => !r.isRemainder)!;
      expect(fixedRow.driver).toBe('amount');

      comp.onTotalChange(20000); // e.g. a Suspense entry reseeds the total — totally unrelated to this row

      expect(fixedRow.amountTxCcy.toNumber()).toBe(500); // unchanged — NOT rescaled to 5% of 20000 (=1000)
      const remainderRow = comp.rows.find((r) => r.isRemainder)!;
      expect(remainderRow.amountTxCcy.toNumber()).toBe(19500); // EXACT: 20000 - 500
    });

    it('a Percentage-driven row (onPctInput) still rescales normally — the XOR default, unaffected by the amount-driven fix above', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 5); // Percentage-driven — 5% is the source of truth
      expect(comp.rows[0]!.driver).toBe('pct');

      comp.onTotalChange(20000);

      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(1000); // DOES rescale: 5% of 20000
    });

    it('regression: a fixed foreign-currency row keeps its own-currency amount EXACT — not rescaled by % — when the seeded total later changes for an unrelated reason (e.g. a Suspense entry)', () => {
      const { comp } = makeComponent({ crossRate: 1 }); // rate=1 so accountCcyAmount === amountTxCcy, isolating this test from FX-conversion arithmetic
      comp.ngOnInit(); // total = 10000, USD
      comp.onPctInput(comp.rows[0]!, 99); // rows[0]=99% fixed (driver:'pct'), rows[1]=1% remainder appears — % is integer-only (2026-08-12), so an exact value is used instead of the prior 99.56

      // Directly construct "rows[0] is the remainder, eurRow is a fixed EUR 40 leg" rather than
      // reaching it via onAccountAmountInput — since v1.12.0's amount waterfall now applies to a
      // remainder row exactly like any other (see finishAmountEdit's doc comment), decreasing the
      // remainder here (44 -> 40, and it's the last row) would correctly open a THIRD row for the
      // freed 4 instead of promoting rows[0] back to remainder — genuinely different, equally
      // correct behavior, just not what THIS test is about. This test's own concern — onTotalChange
      // skipping a remainder row entirely (exact total-minus-fixed subtraction) vs. rescaling a
      // pct-driven row by its stale % — is unrelated to the waterfall and unchanged by it.
      const eurRow = comp.rows.find((r) => r.isRemainder)!;
      const usdRow = comp.rows.find((r) => r !== eurRow)!;
      eurRow.currency = 'EUR';
      eurRow.rate = new Decimal(1);
      eurRow.amountTxCcy = new Decimal(40);
      eurRow.driver = 'amount';
      eurRow.isRemainder = false;
      usdRow.isRemainder = true;

      comp.onTotalChange(10110); // e.g. a Suspense Debit entry reseeds the total from 10000 to 10110

      expect(comp.accountCcyAmount(eurRow)).toBe(40); // unchanged — NOT rescaled to a stale-%-based drift
      expect(usdRow.amountTxCcy.toNumber()).toBe(10070); // EXACT: 10110 - 40 (EUR row's own amountTxCcy), not a %-rescale
    });

    it('a foreign-currency row\'s pct is refreshed to 0 (not NaN/Infinity) when the new total is 0', () => {
      const { comp } = makeComponent({ crossRate: 1.5 });
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 99); // % is integer-only (2026-08-12)
      const eurRow = comp.rows.find((r) => r.isRemainder)!;
      comp.onRowCurrencyChange(eurRow, 'EUR');
      comp.onAccountAmountInput(eurRow, 40);

      comp.onTotalChange(0);

      expect(eurRow.pct.toNumber()).toBe(0);
    });
  });

  describe('onTotalChange absorbs into the LAST row when fully amount-driven (v1.12.2 — reviewer-confirmed: increase adds directly, decrease cascades backward, no drawing needed for an increase since it is new money)', () => {
    /**
     * Builds `pcts.length` explicit, AMOUNT-DRIVEN rows (driver:'amount', which is what
     * absorbTotalDeltaIntoLastRow actually requires — a purely %-driven row still rescales via
     * onTotalChange's own pre-existing, unrelated logic). Seeds each row's value via %
     * (addRow()+onPctInput, the same neutral-freeze pattern used in the "amount waterfall"
     * describe block above, avoiding fixRow's sole-remainder fallback quirk), then immediately
     * re-types the SAME amount via onAmountInput to flip driver to 'amount' — a zero-delta edit,
     * so it never cascades into any other row. No trailing remainder — pcts must sum to 100.
     */
    function buildFixedRows(comp: LegAllocatorComponent, pcts: number[]): void {
      comp.ngOnInit();
      for (const pct of pcts) {
        comp.addRow();
        const row = comp.rows[comp.rows.length - 1]!;
        comp.onPctInput(row, pct);
        comp.onAmountInput(row, row.amountTxCcy.toNumber());
      }
    }

    it('an INCREASE adds the entire delta directly to the last row — every other row is untouched, no cascading', () => {
      const { comp } = makeComponent();
      buildFixedRows(comp, [30, 30, 40]); // row0=3000, row1=3000, row2=4000 — all fixed, no remainder
      const [row0, row1, row2] = comp.rows;

      comp.onTotalChange(13000); // +3000

      expect(comp.totalAmount.toNumber()).toBe(13000);
      expect(row0!.amountTxCcy.toNumber()).toBe(3000); // untouched
      expect(row1!.amountTxCcy.toNumber()).toBe(3000); // untouched
      expect(row2!.amountTxCcy.toNumber()).toBe(7000); // 4000 + 3000, absorbed directly
      expect(row2!.driver).toBe('amount');
      const total = comp.rows.reduce((s, r) => s.plus(r.amountTxCcy), new Decimal(0));
      expect(total.toNumber()).toBe(13000);
    });

    it('a DECREASE the last row alone can cover subtracts only from the last row', () => {
      const { comp } = makeComponent();
      buildFixedRows(comp, [30, 30, 40]); // row0=3000, row1=3000, row2=4000
      const [row0, row1, row2] = comp.rows;

      comp.onTotalChange(8500); // -1500, less than row2's own 4000

      expect(row0!.amountTxCcy.toNumber()).toBe(3000); // untouched
      expect(row1!.amountTxCcy.toNumber()).toBe(3000); // untouched
      expect(row2!.amountTxCcy.toNumber()).toBe(2500); // 4000 - 1500
      const total = comp.rows.reduce((s, r) => s.plus(r.amountTxCcy), new Decimal(0));
      expect(total.toNumber()).toBe(8500);
    });

    it('a DECREASE exceeding the last row cascades backward into the row(s) before it, capped at 0 — never negative', () => {
      const { comp } = makeComponent();
      buildFixedRows(comp, [30, 30, 40]); // row0=3000, row1=3000, row2=4000
      const [row0, row1, row2] = comp.rows;

      comp.onTotalChange(1500); // -8500: drains row2 (4000) and row1 (3000) fully, then takes 1500 from row0

      expect(row2!.amountTxCcy.toNumber()).toBe(0);
      expect(row1!.amountTxCcy.toNumber()).toBe(0);
      expect(row0!.amountTxCcy.toNumber()).toBe(1500); // 3000 - 1500
      const total = comp.rows.reduce((s, r) => s.plus(r.amountTxCcy), new Decimal(0));
      expect(total.toNumber()).toBe(1500);
    });

    it('a DECREASE larger than every row combined drains everything to 0 and stops there — capped, not negative', () => {
      const { comp } = makeComponent();
      buildFixedRows(comp, [30, 30, 40]); // row0=3000, row1=3000, row2=4000 — sum 10000
      const [row0, row1, row2] = comp.rows;

      comp.onTotalChange(0); // -10000: every row drains to exactly 0

      expect(row0!.amountTxCcy.toNumber()).toBe(0);
      expect(row1!.amountTxCcy.toNumber()).toBe(0);
      expect(row2!.amountTxCcy.toNumber()).toBe(0);
    });

    it('is skipped entirely when a genuine remainder row still exists — the pre-existing exact-subtraction handling applies unchanged, no row is touched by this new logic', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 40); // rows[0]=40% fixed, rows[1]=60% remainder — genuine leftover, not drift
      const [row0, row1] = comp.rows;

      comp.onTotalChange(20000); // total doubles

      expect(comp.rows).toHaveLength(2); // no new row appended
      expect(row0!.amountTxCcy.toNumber()).toBe(8000); // rescaled via its own 40% — pct-driven row, unaffected by v1.12.2
      expect(row1!.isRemainder).toBe(true);
      expect(row1!.amountTxCcy.toNumber()).toBe(12000); // exact: 20000 - 8000, via ensureRemainderRow's existing mechanism
    });
  });

  describe('onCurrencyChange', () => {
    it('updates rows that do not have their own differing currency, and fetches FX rates for rows that do', () => {
      const { comp, mockFx } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR'; // now differs from transactionCurrency (USD)

      comp.onCurrencyChange('GBP');

      expect(comp.transactionCurrency).toBe('GBP');
      expect(comp.rows[0]!.currency).toBe('EUR'); // untouched — still needs its own rate
      expect(mockFx.rates).toHaveBeenCalled();
    });

    it('syncs a row currency that matched the old transaction currency to the new one', () => {
      const { comp } = makeComponent();
      comp.ngOnInit(); // rows[0].currency === 'USD' === transactionCurrency

      comp.onCurrencyChange('GBP');

      expect(comp.rows[0]!.currency).toBe('GBP');
    });
  });

  describe('onRowCurrencyChange', () => {
    it('applies a fetched FX rate when the row currency now differs from the transaction currency', () => {
      const { comp, mockFx } = makeComponent({ crossRate: 1.5 });
      comp.ngOnInit();

      comp.onRowCurrencyChange(comp.rows[0]!, 'EUR');

      expect(comp.rows[0]!.currency).toBe('EUR');
      expect(mockFx.rates).toHaveBeenCalled();
      expect(comp.rows[0]!.rate.toNumber()).toBe(1.5);
      expect(comp.rows[0]!.exchangeAccountNo).toBe('FX Exchange USD');
    });

    it('leaves the existing rate untouched when the backend has no rate for the pair', () => {
      const { comp } = makeComponent({ crossRate: null });
      comp.ngOnInit();
      comp.rows[0]!.rate = new Decimal(3);

      comp.onRowCurrencyChange(comp.rows[0]!, 'EUR');

      expect(comp.rows[0]!.rate.toNumber()).toBe(3);
    });

    it('resets rate to 1 and clears exchangeAccountNo when set back to the transaction currency', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.rate = new Decimal(1.5);
      comp.rows[0]!.exchangeAccountNo = 'FX Exchange USD';

      comp.onRowCurrencyChange(comp.rows[0]!, 'USD');

      expect(comp.rows[0]!.rate.toNumber()).toBe(1);
      expect(comp.rows[0]!.exchangeAccountNo).toBe('');
    });
  });

  describe('addRow / removeRow', () => {
    it('converts the sole 100% remainder into a plain fixed row, with no new row yet (nothing left to leave a remainder for)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();

      comp.addRow();

      // No row is left marked remainder — this is the "manual multi-row control"
      // escape hatch: the auto-balance-to-100% safety net (fixRow's fallback
      // promotion) only re-engages once some OTHER row is the sole remainder.
      expect(comp.rows).toHaveLength(1);
      expect(comp.rows[0]!.isRemainder).toBe(false);
      expect(comp.rows[0]!.pct.toNumber()).toBe(100);
    });

    it('a subsequent edit to the now-unmarked row creates a new row for the leftover, since nothing absorbs it automatically', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.addRow(); // rows[0] is now fixed at 100%, no remainder marked anywhere

      comp.onPctInput(comp.rows[0]!, 60);

      expect(comp.rows).toHaveLength(2);
      expect(comp.rows[1]!.isRemainder).toBe(true);
      expect(comp.rows[1]!.pct.toNumber()).toBe(40);
    });

    it('a genuinely over-allocated state still surfaces the Total Allocated warning (constructed by direct field assignment — the %/Amount waterfalls themselves now conserve Σ% = 100 by construction, per the 2026-08-12 % waterfall rule "總比例不得超過100%", so over-allocation is no longer reachable through onPctInput/onAmountInput alone)', () => {
      const { comp, emittedValid } = makeComponent();
      comp.ngOnInit();
      comp.addRow(); // rows[0] fixed 100%, no remainder
      comp.onPctInput(comp.rows[0]!, 50); // rows[0] fixed 50%, rows[1] 50% remainder (auto-created)
      comp.addRow(); // rows[1] converted to fixed too — neither row is remainder now
      comp.rows[1]!.pct = new Decimal(80); // bypasses the waterfall's own conservation — isolates the warning logic
      comp.onFieldChange();

      expect(comp.totalPct).toBe(130);
      expect(comp.isOverAllocated).toBe(true);
      expect(emittedValid[emittedValid.length - 1]).toBe(false);
    });

    it('removeRow removes the given row and rebalances the remainder', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 30); // rows[0]=30% fixed, rows[1]=70% remainder
      const secondRowId = comp.rows[1]!.id;

      comp.removeRow(comp.rows[0]!);

      expect(comp.rows).toHaveLength(1);
      expect(comp.rows[0]!.id).toBe(secondRowId);
      expect(comp.rows[0]!.pct.toNumber()).toBe(100);
    });

    it('removeRow is a no-op when only one row remains', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      const onlyRow = comp.rows[0]!;

      comp.removeRow(onlyRow);

      expect(comp.rows).toHaveLength(1);
      expect(comp.rows[0]).toBe(onlyRow);
    });
  });

  describe('fxPairs', () => {
    it('is empty when every row shares the transaction currency', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      expect(comp.fxPairs).toEqual([]);
    });

    it('produces a Trx-Ccy-site and Other-Ccy-site pair for a mismatched-currency row, direction per side', () => {
      const { comp } = makeComponent();
      comp.side = 'DEBIT';
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(1.1);

      const pairs = comp.fxPairs;

      expect(pairs).toHaveLength(2);
      expect(pairs[0]).toMatchObject({ drCr: 'D', site: 'Trx Ccy', currency: 'USD', account: 'FX Exchange EUR' });
      expect(pairs[1]).toMatchObject({ drCr: 'C', site: 'Other Ccy', currency: 'EUR', account: 'FX Exchange USD', rate: 1.1 });
    });

    it('flips direction for the CREDIT side', () => {
      const { comp } = makeComponent();
      comp.side = 'CREDIT';
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';

      const pairs = comp.fxPairs;

      expect(pairs[0]!.drCr).toBe('C');
      expect(pairs[1]!.drCr).toBe('D');
    });
  });

  describe('validChange', () => {
    it('is false when a row has no account number', () => {
      const { comp, emittedValid } = makeComponent();
      comp.defaultAccountNo = '';
      comp.ngOnInit();
      expect(emittedValid[emittedValid.length - 1]).toBe(false);
    });

    it('is false when over-allocated', () => {
      const { comp, emittedValid } = makeComponent();
      comp.ngOnInit();
      comp.addRow(); // rows[0] fixed 100%, no remainder
      comp.onPctInput(comp.rows[0]!, 50); // rows[0] fixed 50%, rows[1] 50% remainder
      comp.addRow(); // rows[1] converted to fixed too
      // Direct field assignment, not onPctInput — the % waterfall (2026-08-12) itself conserves
      // Σ% = 100 by construction, so over-allocation is no longer reachable through the input
      // handler alone; see the equivalent note in the 'addRow / removeRow' describe block above.
      comp.rows[1]!.pct = new Decimal(80);
      comp.onFieldChange();

      expect(comp.isOverAllocated).toBe(true);
      expect(emittedValid[emittedValid.length - 1]).toBe(false);
    });

    it('is true for a single fully-allocated row with a positive amount and account number', () => {
      const { comp, emittedValid } = makeComponent();
      comp.ngOnInit();
      expect(emittedValid[emittedValid.length - 1]).toBe(true);
    });
  });

  describe('ngOnChanges', () => {
    it('does not reset on the very first binding (ngOnInit already did)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      const rowIdBefore = comp.rows[0]!.id;

      comp.ngOnChanges({
        caseKey: new SimpleChange(undefined, 'case-1', true),
      });

      expect(comp.rows[0]!.id).toBe(rowIdBefore);
    });

    it('resets on a later change to caseKey (parent switched business cases)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      const rowIdBefore = comp.rows[0]!.id;
      comp.initialTotalAmount = '5000';
      comp.caseKey = 'case-2';

      comp.ngOnChanges({
        caseKey: new SimpleChange('case-1', 'case-2', false),
      });

      expect(comp.rows[0]!.id).not.toBe(rowIdBefore);
      expect(comp.totalAmount.toNumber()).toBe(5000);
    });

    it('ignores unrelated input changes', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      const rowIdBefore = comp.rows[0]!.id;

      comp.ngOnChanges({
        defaultAccountNo: new SimpleChange('CUST-ACC', 'CUST-ACC-2', false),
      });

      expect(comp.rows[0]!.id).toBe(rowIdBefore);
    });

    it('treats a blank/invalid same-case initialTotalAmount as 0 (not NaN) when rescaling', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.initialTotalAmount = '';

      comp.ngOnChanges({
        initialTotalAmount: new SimpleChange('10000', '', false),
      });

      expect(comp.totalAmount.toNumber()).toBe(0);
      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(0);
    });

    it('regression: a same-case initialTotalAmount change (e.g. a Suspense entry reseed) rescales the existing split in place instead of reset()ing it — must not revert an in-progress per-row currency edit', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 40); // rows[0]=40% fixed, rows[1]=60% remainder
      comp.onRowCurrencyChange(comp.rows[1]!, 'EUR'); // user gives the second leg its own currency
      const rowIdsBefore = comp.rows.map((r) => r.id);
      comp.initialTotalAmount = '12000'; // e.g. Suspense entries changed the live seed total

      comp.ngOnChanges({
        initialTotalAmount: new SimpleChange('10000', '12000', false),
      });

      expect(comp.rows.map((r) => r.id)).toEqual(rowIdsBefore); // no reset — same rows
      expect(comp.rows[0]!.pct.toNumber()).toBe(40);
      expect(comp.rows[1]!.currency).toBe('EUR'); // the user's currency edit survives
      expect(comp.totalAmount.toNumber()).toBe(12000);
      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(4800); // rescaled to the new total, same %
    });

    it('regression: a same-case initialCurrency change resyncs non-diverged rows without reset()ing the split', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 40); // rows[0]=40% fixed, rows[1]=60% remainder, both USD
      const rowIdsBefore = comp.rows.map((r) => r.id);
      comp.initialCurrency = 'GBP';

      comp.ngOnChanges({
        initialCurrency: new SimpleChange('USD', 'GBP', false),
      });

      expect(comp.rows.map((r) => r.id)).toEqual(rowIdsBefore); // no reset — same rows
      expect(comp.rows[0]!.currency).toBe('GBP');
      expect(comp.rows[1]!.currency).toBe('GBP');
    });
  });

  describe('needsRate / accountCcyAmount / isSplit', () => {
    it('needsRate is false when the row currency matches the transaction currency', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      expect(comp.needsRate(comp.rows[0]!)).toBe(false);
    });

    it('isSplit reflects whether there is more than one row', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      expect(comp.isSplit).toBe(false);
      comp.onPctInput(comp.rows[0]!, 30);
      expect(comp.isSplit).toBe(true);
    });

    it('accountCcyAmount multiplies amountTxCcy by rate, rounded to the row\'s own currency scale (2dp for USD)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.amountTxCcy = new Decimal(100);
      comp.rows[0]!.rate = new Decimal(1.234);
      expect(comp.accountCcyAmount(comp.rows[0]!)).toBe(123.4);
    });

    it('accountCcyAmount rounds to the ROW\'s own currency scale, not a hardcoded 2dp — JPY (0dp) shows no fractional yen', () => {
      const { comp } = makeComponent();
      comp.ngOnInit(); // transaction currency USD, total 10000
      comp.rows[0]!.currency = 'JPY';
      comp.rows[0]!.amountTxCcy = new Decimal(100);
      comp.rows[0]!.rate = new Decimal(149.0825); // 100 * 149.0825 = 14908.25 -> rounds to 14908 (0dp, ROUND_HALF_UP)
      expect(comp.accountCcyAmount(comp.rows[0]!)).toBe(14908);
    });

    it('accountCcyAmount falls back to 2dp for a currency absent from the Currency master (unknown/not yet loaded) — same fallback as the rest of the app', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.currency = 'BHD'; // not in mockCurrency's decimals map
      comp.rows[0]!.amountTxCcy = new Decimal(100);
      comp.rows[0]!.rate = new Decimal(1.2345);
      expect(comp.accountCcyAmount(comp.rows[0]!)).toBe(123.45);
    });
  });

  describe('emit() currency-scale formatting (JPY decimal precision fix — reviewer-reported)', () => {
    it('amountAccountCcy on the wire is formatted to the ROW\'s own currency scale, not a hardcoded 2dp — a JPY row emits a whole-number string with no decimal point', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.ngOnInit(); // transaction currency USD, total 10000
      comp.rows[0]!.currency = 'JPY';
      comp.rows[0]!.amountTxCcy = new Decimal(100);
      comp.rows[0]!.rate = new Decimal(149.0825);
      comp.onFieldChange(); // re-emit with the manually-set row state above

      const lastLeg = emittedLegs[emittedLegs.length - 1]![0]!;
      expect(lastLeg.amountAccountCcy).toBe('14908'); // 100 * 149.0825 = 14908.25 -> 0dp ROUND_HALF_UP -> 14908, no ".xx"
    });

    it('amountTxCcy on the wire is formatted to the TRANSACTION currency scale — a JPY transaction currency emits a whole-number string, no ".00"', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.initialCurrency = 'JPY';
      comp.initialTotalAmount = '10000';
      comp.ngOnInit();

      const lastLeg = emittedLegs[emittedLegs.length - 1]![0]!;
      expect(lastLeg.currency).toBe('JPY');
      expect(lastLeg.amountTxCcy).toBe('10000'); // not '10000.00' — JPY has 0 decimal places
    });

    it('a USD row alongside a JPY transaction currency still gets its OWN 2dp scale for amountAccountCcy — the two currencies are never conflated', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.initialCurrency = 'JPY';
      comp.initialTotalAmount = '10000';
      comp.ngOnInit();
      comp.rows[0]!.currency = 'USD';
      comp.rows[0]!.amountTxCcy = new Decimal(24908); // JPY amount
      comp.rows[0]!.rate = new Decimal(0.006708); // JPY -> USD
      comp.onFieldChange();

      const lastLeg = emittedLegs[emittedLegs.length - 1]![0]!;
      expect(lastLeg.currency).toBe('USD');
      expect(lastLeg.amountAccountCcy).toBe('167.08'); // 24908 * 0.006708 = 167.082864 -> 2dp ROUND_HALF_UP -> 167.08 (USD's own scale, unaffected by the JPY transaction currency)
    });
  });

  describe('onAmountInput', () => {
    it('derives pct from the typed amount against the total', () => {
      const { comp } = makeComponent();
      comp.ngOnInit(); // total = 10000

      comp.onPctInput(comp.rows[0]!, 100); // no-op split-wise, just to reach a stable single-row state
      comp.onAmountInput(comp.rows[0]!, 2500);

      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(2500);
      expect(comp.rows[0]!.pct.toNumber()).toBe(25);
    });

    it('clamps a negative typed amount to 0', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, -500);
      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(0);
    });

    it('sets pct to 0 (not NaN/Infinity) when totalAmount is 0', () => {
      const { comp } = makeComponent();
      comp.initialTotalAmount = '0';
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, 500);
      expect(comp.rows[0]!.pct.toNumber()).toBe(0);
    });

    it('creates a remainder row for the leftover, same as onPctInput', () => {
      const { comp } = makeComponent();
      comp.ngOnInit(); // total = 10000
      comp.onAmountInput(comp.rows[0]!, 4000);

      expect(comp.rows).toHaveLength(2);
      expect(comp.rows[1]!.isRemainder).toBe(true);
      expect(comp.rows[1]!.amountTxCcy.toNumber()).toBe(6000);
    });
  });

  describe('onAccountAmountInput', () => {
    it('derives amountTxCcy by dividing the typed account-currency amount by the row rate', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(1.5);

      comp.onAccountAmountInput(comp.rows[0]!, 30); // EUR 30 / 1.5 = USD 20

      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(20);
      expect(comp.accountCcyAmount(comp.rows[0]!)).toBe(30);
    });

    it('derives pct from the resulting amountTxCcy against the total', () => {
      const { comp } = makeComponent(); // total = 10000
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(2);

      comp.onAccountAmountInput(comp.rows[0]!, 5000); // EUR 5000 / 2 = USD 2500 = 25%

      expect(comp.rows[0]!.pct.toNumber()).toBe(25);
    });

    it('sets pct to 0 (not NaN/Infinity) when totalAmount is 0', () => {
      const { comp } = makeComponent();
      comp.initialTotalAmount = '0';
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(1.5);

      comp.onAccountAmountInput(comp.rows[0]!, 30);

      expect(comp.rows[0]!.pct.toNumber()).toBe(0);
    });

    it('clamps a negative typed account amount to 0', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(1.5);

      comp.onAccountAmountInput(comp.rows[0]!, -30);

      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(0);
    });

    it('treats a falsy typed account amount (0) as 0, not NaN', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(1.5);

      comp.onAccountAmountInput(comp.rows[0]!, 0);

      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(0);
    });

    it('treats a zero rate as amountTxCcy 0 rather than dividing by zero', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(0);

      comp.onAccountAmountInput(comp.rows[0]!, 30);

      expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(0);
    });

    it('creates a remainder row for the leftover, same as onAmountInput', () => {
      const { comp } = makeComponent(); // total = 10000
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';
      comp.rows[0]!.rate = new Decimal(1);

      comp.onAccountAmountInput(comp.rows[0]!, 4000);

      expect(comp.rows).toHaveLength(2);
      expect(comp.rows[1]!.isRemainder).toBe(true);
      expect(comp.rows[1]!.amountTxCcy.toNumber()).toBe(6000);
    });

    describe('accountCcyOverride round-trip fix (reviewer-reported: typing JPY 20000 at rate 149.0825 read back as 19999)', () => {
      it("reproduces the exact reported bug WITHOUT the fix — 20000 / 149.0825 rounds to amountTxCcy 134.15 (not the exact 134.15389…), and re-deriving 134.15 × 149.0825 rounds DOWN to 19999, not 20000 — this is the failure mode accountCcyOverride exists to prevent", () => {
        const derivedAmountTxCcy = new Decimal(20000).dividedBy(149.0825).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        expect(derivedAmountTxCcy.toNumber()).toBe(134.15);
        const derivedBack = derivedAmountTxCcy.times(149.0825).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
        expect(derivedBack.toNumber()).toBe(19999); // the bug, absent the override
      });

      it('typing JPY 20000 (rate 149.0825) round-trips back to EXACTLY 20000 via accountCcyAmount(), not the derived 19999', () => {
        const { comp } = makeComponent();
        comp.ngOnInit();
        comp.rows[0]!.currency = 'JPY';
        comp.rows[0]!.rate = new Decimal('149.0825');

        comp.onAccountAmountInput(comp.rows[0]!, 20000);

        expect(comp.rows[0]!.amountTxCcy.toNumber()).toBe(134.15); // unchanged — still the rounded Tx Ccy figure
        expect(comp.accountCcyAmount(comp.rows[0]!)).toBe(20000); // was 19999 before the fix
      });

      it('the same round-trip holds on the wire (emit -> amountAccountCcy), not just the display getter', () => {
        const { comp, emittedLegs } = makeComponent();
        comp.ngOnInit();
        comp.rows[0]!.currency = 'JPY';
        comp.rows[0]!.rate = new Decimal('149.0825');

        comp.onAccountAmountInput(comp.rows[0]!, 20000);

        // Only 134.15 of the 10000 USD total was allocated by this edit — the rest spawns a
        // second (USD, transaction-currency-matching) remainder leg that sorts FIRST on the wire
        // (see emit()'s own sort comment), so look up the JPY leg by currency, not by index.
        const jpyLeg = emittedLegs[emittedLegs.length - 1]!.find((l) => l.currency === 'JPY');
        expect(jpyLeg!.amountAccountCcy).toBe('20000');
      });

      it('a SUBSEQUENT plain Amount (Tx Ccy) edit (onAmountInput) drops the override — accountCcyAmount() goes back to the ordinary amountTxCcy × rate derivation', () => {
        const { comp } = makeComponent();
        comp.ngOnInit();
        comp.rows[0]!.currency = 'JPY';
        comp.rows[0]!.rate = new Decimal('149.0825');
        comp.onAccountAmountInput(comp.rows[0]!, 20000);
        expect(comp.accountCcyAmount(comp.rows[0]!)).toBe(20000); // override active

        comp.onAmountInput(comp.rows[0]!, 134.15); // re-typing the SAME Tx Ccy figure directly

        expect(comp.rows[0]!.accountCcyOverride).toBeNull();
        expect(comp.accountCcyAmount(comp.rows[0]!)).toBe(19999); // back to the ordinary (lossy) derivation — expected once the user is editing Amount (Tx Ccy) directly instead
      });

      it('a waterfall edit that CAPS the requested amount (rule 1, non-last row increase beyond what the last row holds) does NOT set an override — the actual amountTxCcy differs from what the raw account-ccy figure implies', () => {
        const { comp } = makeComponent();
        comp.ngOnInit();
        comp.addRow(); // row0 fixed @ 100%/10000, no remainder
        comp.onPctInput(comp.rows[0]!, 50); // row0 -> 5000 fixed; row1 spawns remainder @ 5000 (LAST)
        const [row0, row1] = comp.rows;
        row0!.currency = 'JPY';
        row0!.rate = new Decimal('149.0825');

        // row0 wants to grow to JPY equivalent of USD 20000 (needs +15000 Tx Ccy), but row1 (last) only holds 5000 — capped.
        comp.onAccountAmountInput(row0!, new Decimal(20000).times(149.0825).toNumber());

        expect(row0!.amountTxCcy.toNumber()).toBe(10000); // capped: 5000 + 5000 drawn from row1, not the full request
        expect(row1!.amountTxCcy.toNumber()).toBe(0);
        expect(row0!.accountCcyOverride).toBeNull(); // NOT set — the request was capped
      });

      it('a % edit (onPctInput) on a row that previously had an override clears it', () => {
        const { comp } = makeComponent();
        comp.ngOnInit();
        comp.rows[0]!.currency = 'JPY';
        comp.rows[0]!.rate = new Decimal('149.0825');
        comp.onAccountAmountInput(comp.rows[0]!, 20000);
        expect(comp.rows[0]!.accountCcyOverride).not.toBeNull();

        comp.onPctInput(comp.rows[0]!, 50);

        expect(comp.rows[0]!.accountCcyOverride).toBeNull();
      });

      it("changing the row's OWN currency clears a stale override (it was denominated in the OLD currency)", () => {
        const { comp } = makeComponent();
        comp.ngOnInit();
        comp.rows[0]!.currency = 'JPY';
        comp.rows[0]!.rate = new Decimal('149.0825');
        comp.onAccountAmountInput(comp.rows[0]!, 20000);
        expect(comp.rows[0]!.accountCcyOverride).not.toBeNull();

        comp.onRowCurrencyChange(comp.rows[0]!, 'EUR');

        expect(comp.rows[0]!.accountCcyOverride).toBeNull();
      });

      it("changing the shared Transaction Currency clears every row's override", () => {
        const { comp } = makeComponent();
        comp.ngOnInit();
        comp.rows[0]!.currency = 'JPY';
        comp.rows[0]!.rate = new Decimal('149.0825');
        comp.onAccountAmountInput(comp.rows[0]!, 20000);
        expect(comp.rows[0]!.accountCcyOverride).not.toBeNull();

        comp.onCurrencyChange('EUR');

        expect(comp.rows[0]!.accountCcyOverride).toBeNull();
      });

      it('a row touched by the waterfall as the LAST-row counterparty (rule 1/2, via markCascaded) has its own override cleared even if it had one', () => {
        const { comp } = makeComponent();
        comp.ngOnInit();
        comp.addRow();
        comp.onPctInput(comp.rows[0]!, 30);
        comp.addRow();
        comp.onPctInput(comp.rows[1]!, 30); // row0=3000, row1=3000, row2=4000 (remainder, LAST)
        const [row0, row1, row2] = comp.rows;
        row2!.currency = 'JPY';
        row2!.rate = new Decimal('149.0825');
        comp.onAccountAmountInput(row2!, new Decimal(4000).times(149.0825).toNumber()); // fix row2's own account-ccy figure, giving it an override
        expect(row2!.accountCcyOverride).not.toBeNull();

        comp.onAmountInput(row0!, 1000); // decrease 3000 -> 1000 on row0 (non-last) — freed 2000 flows to row2 (last)

        expect(row2!.accountCcyOverride).toBeNull();
      });
    });
  });

  describe('amount waterfall (v1.12.0 — decrease flows forward, increase draws backward)', () => {
    /**
     * Builds `pcts.length` explicit, independently-fixed rows via DIRECT field assignment +
     * addRow() — NOT via onPctInput, since % editing now has its own waterfall (this session's
     * change) that would otherwise fire the moment a later iteration's addRow() collapses the
     * split to "no remainder" (amountRemaining exactly 0) before the loop's final entry, silently
     * mutating this fixture instead of leaving it neutral. addRow() alone is still always neutral
     * — it only flips isRemainder and runs ensureRemainderRow()'s pre-existing exact-amount
     * bookkeeping — so this produces the identical end state the old onPctInput-based version did
     * (traced step-for-step: pcts summing to exactly 100 leave every row fixed with no remainder;
     * summing to < 100 leave the final row as the floating, positionally-LAST remainder). Same
     * "neutral freeze before each fix" pattern as the % waterfall's own buildPctFixture below.
     * Total = 10000 USD unless the caller overrides initialTotalAmount first.
     */
    function buildRows(comp: LegAllocatorComponent, pcts: number[]): void {
      comp.ngOnInit();
      for (const pct of pcts) {
        const row = comp.rows[comp.rows.length - 1]!;
        row.pct = new Decimal(pct);
        row.amountTxCcy = comp.totalAmount.times(pct).dividedBy(100);
        row.driver = 'pct';
        comp.addRow();
      }
    }

    it('a decrease on a NON-last row flows the exact freed difference straight to the LAST row — never the row positionally next to it', () => {
      const { comp } = makeComponent();
      buildRows(comp, [30, 30]); // row0=3000 fixed, row1=3000 fixed, row2=4000 remainder (LAST)
      const [row0, row1, row2] = comp.rows;

      comp.onAmountInput(row0!, 1000); // decrease 3000 -> 1000

      expect(row0!.amountTxCcy.toNumber()).toBe(1000);
      expect(row1!.amountTxCcy.toNumber()).toBe(3000); // untouched — NOT the target under v1.12.3 (it's not the last row)
      expect(row2!.amountTxCcy.toNumber()).toBe(6000); // 4000 + 2000 freed, straight to the LAST row
      expect(row2!.driver).toBe('amount');
      expect(row2!.isRemainder).toBe(false);
    });

    it("an increase on a NON-last row decreases the LAST row by the same amount, capped at what it has — a single direct offset, never the row positionally before it", () => {
      const { comp } = makeComponent();
      buildRows(comp, [30, 30]); // row0=3000, row1=3000, row2=4000 (remainder, LAST)
      const [row0, row1, row2] = comp.rows;

      comp.onAmountInput(row1!, 5000); // increase 3000 -> 5000, needs 2000

      expect(row1!.amountTxCcy.toNumber()).toBe(5000);
      expect(row2!.amountTxCcy.toNumber()).toBe(2000); // 4000 - 2000 — the LAST row absorbs it
      expect(row0!.amountTxCcy.toNumber()).toBe(3000); // untouched — not drawn from, even though it's positionally before row1
      expect(row2!.driver).toBe('amount');
      expect(row2!.isRemainder).toBe(false);
    });

    it('an increase on the LAST row itself (rule 4, unchanged since v1.12.0) cascades through MULTIPLE earlier rows when the immediately preceding one alone cannot cover it — draining each to exactly 0, never negative', () => {
      const { comp } = makeComponent();
      buildRows(comp, [5, 5, 5, 5]); // row0..row3=500 each fixed, row4=8000 remainder (LAST)
      const [row0, row1, row2, row3, row4] = comp.rows;

      comp.onAmountInput(row4!, 9300); // increase 8000 -> 9300, needs 1300: row3 covers 500, row2 covers 500, row1 covers the remaining 300

      expect(row4!.amountTxCcy.toNumber()).toBe(9300);
      expect(row3!.amountTxCcy.toNumber()).toBe(0);
      expect(row2!.amountTxCcy.toNumber()).toBe(0);
      expect(row1!.amountTxCcy.toNumber()).toBe(200); // 500 - 300
      expect(row0!.amountTxCcy.toNumber()).toBe(500); // untouched — cascade stopped once fully covered
      const total = comp.rows.reduce((s, r) => s.plus(r.amountTxCcy), new Decimal(0));
      expect(total.toNumber()).toBe(10000);
    });

    it('an increase on the LAST row needing more than every earlier row combined (even fully drained) is silently CAPPED to whatever was actually available (rule 4)', () => {
      const { comp } = makeComponent();
      buildRows(comp, [5, 5, 5]); // row0=500, row1=500, row2=500 fixed, row3=8500 remainder (LAST)
      const [row0, row1, row2, row3] = comp.rows;

      comp.onAmountInput(row3!, 10500); // wants +2000, but row0+row1+row2 together only have 1500

      expect(row0!.amountTxCcy.toNumber()).toBe(0);
      expect(row1!.amountTxCcy.toNumber()).toBe(0);
      expect(row2!.amountTxCcy.toNumber()).toBe(0);
      expect(row3!.amountTxCcy.toNumber()).toBe(10000); // 8500 + 1500 (capped), NOT 10500
      const total = comp.rows.reduce((s, r) => s.plus(r.amountTxCcy), new Decimal(0));
      expect(total.toNumber()).toBe(10000); // invariant holds even when the request was capped
    });

    it("an increase on a NON-last row is capped at just the LAST row's own balance (rule 1) — never cascades further back into other rows, even when they hold more", () => {
      const { comp } = makeComponent();
      buildRows(comp, [5, 5, 5]); // row0=500, row1=500, row2=500 fixed, row3=8500 remainder (LAST)
      const [row0, row1, row2, row3] = comp.rows;

      comp.onAmountInput(row0!, 9000); // increase row0 500 -> requests +8500, exactly what row3 (the target) has

      expect(row0!.amountTxCcy.toNumber()).toBe(9000); // fully covered — exactly matches what row3 had
      expect(row3!.amountTxCcy.toNumber()).toBe(0); // drained
      expect(row1!.amountTxCcy.toNumber()).toBe(500); // untouched — rule 1 never reaches back to row1/row2
      expect(row2!.amountTxCcy.toNumber()).toBe(500); // untouched
      const total = comp.rows.reduce((s, r) => s.plus(r.amountTxCcy), new Decimal(0));
      expect(total.toNumber()).toBe(10000);
    });

    it("an increase on a NON-last row exceeding even the LAST row's full balance is capped there (rule 1) — no cascading into other rows to make up the rest", () => {
      const { comp } = makeComponent();
      buildRows(comp, [5, 5, 5]); // row0=500, row1=500, row2=500 fixed, row3=8500 remainder (LAST)
      const [row0, row1, row2, row3] = comp.rows;

      comp.onAmountInput(row0!, 20000); // wants +19500, but row3 only has 8500

      expect(row0!.amountTxCcy.toNumber()).toBe(9000); // 500 + 8500 (capped to what row3 had), NOT 20000
      expect(row3!.amountTxCcy.toNumber()).toBe(0);
      expect(row1!.amountTxCcy.toNumber()).toBe(500); // untouched
      expect(row2!.amountTxCcy.toNumber()).toBe(500); // untouched
    });

    it('decreasing the LAST row (fully allocated, no remainder) opens a brand-new trailing row to hold exactly the freed difference — earlier rows are untouched', () => {
      const { comp } = makeComponent();
      buildRows(comp, [30, 30, 40]); // row0=3000, row1=3000, row2=4000 — ALL fixed, no remainder (100% exactly covered)
      const [row0, row1, row2] = comp.rows;
      expect(comp.rows).toHaveLength(3);

      comp.onAmountInput(row2!, 1000); // decrease on the last row: 4000 -> 1000, freed = 3000

      expect(comp.rows).toHaveLength(4);
      expect(row2!.amountTxCcy.toNumber()).toBe(1000);
      expect(row0!.amountTxCcy.toNumber()).toBe(3000); // untouched
      expect(row1!.amountTxCcy.toNumber()).toBe(3000); // untouched
      const row3 = comp.rows[3]!;
      expect(row3.amountTxCcy.toNumber()).toBe(3000); // exactly the freed difference
      expect(row3.accountNo).toBe('CUST-ACC'); // v1.12.2: defaultAccountType's own placeholder, not blank — same convention as onAccountTypeChange
      expect(row3.currency).toBe('USD'); // transaction currency, same convention as makeRow's other callers
      expect(row3.driver).toBe('amount');
      expect(row3.isRemainder).toBe(false);
      const total = comp.rows.reduce((s, r) => s.plus(r.amountTxCcy), new Decimal(0));
      expect(total.toNumber()).toBe(10000);
    });

    it('decreasing the (now-last) newly-created row cascades again, opening yet another trailing row — the chain keeps working, not just a one-shot escape hatch', () => {
      const { comp } = makeComponent();
      buildRows(comp, [30, 30, 40]); // row0=3000, row1=3000, row2=4000
      const [row0, row1, row2] = comp.rows;
      comp.onAmountInput(row2!, 1000); // row2 -> 1000, row3 spawns @ 3000 (LAST now)
      const row3 = comp.rows[3]!;

      comp.onAmountInput(row3, 500); // decrease on the NEW last row: 3000 -> 500, freed = 2500

      expect(comp.rows).toHaveLength(5);
      expect(row3.amountTxCcy.toNumber()).toBe(500);
      const row4 = comp.rows[4]!;
      expect(row4.amountTxCcy.toNumber()).toBe(2500);
      expect(row0!.amountTxCcy.toNumber()).toBe(3000); // still untouched two edits later
      expect(row1!.amountTxCcy.toNumber()).toBe(3000);
      expect(row2!.amountTxCcy.toNumber()).toBe(1000);
      const total = comp.rows.reduce((s, r) => s.plus(r.amountTxCcy), new Decimal(0));
      expect(total.toNumber()).toBe(10000);
    });

    it('increasing the FIRST row now SUCCEEDS under v1.12.3 (superseding the old "REJECTED, no previous row" boundary) — it decreases the LAST row directly, exactly like any other non-last row (rule 1)', () => {
      const { comp } = makeComponent();
      buildRows(comp, [30, 30, 40]); // row0=3000, row1=3000, row2=4000 — ALL fixed
      const [row0, row1, row2] = comp.rows;

      comp.onAmountInput(row0!, 5000); // increase on the first row: 3000 -> 5000, needs 2000

      expect(row0!.amountTxCcy.toNumber()).toBe(5000); // took effect — no longer blocked
      expect(row1!.amountTxCcy.toNumber()).toBe(3000); // untouched — row1 is neither the edited row nor the last row
      expect(row2!.amountTxCcy.toNumber()).toBe(2000); // 4000 - 2000 — the LAST row absorbs it, per rule 1
      const total = comp.rows.reduce((s, r) => s.plus(r.amountTxCcy), new Decimal(0));
      expect(total.toNumber()).toBe(10000);
    });

    it('decreasing a row that is STILL the current remainder goes through the SAME waterfall as any other row — this is the reviewer-reported fix (regression: an earlier, overly-broad `!row.isRemainder` gate made this silently fall back to fixRow\'s fallback-promotion instead, so decreasing "the last leg" while it was still marked remainder — the common case, since the remainder is normally last — never created a new leg, contrary to the confirmed rule)', () => {
      const { comp } = makeComponent();
      buildRows(comp, [30, 30]); // row0=3000, row1=3000 fixed; row2=4000 REMAINDER (LAST)
      const row2 = comp.rows[2]!;
      expect(row2.isRemainder).toBe(true);

      comp.onAmountInput(row2, 1000); // a decrease on the last row, which still happens to be the remainder

      expect(comp.rows).toHaveLength(4); // a NEW row was appended — same as decreasing an already-fixed last row
      expect(row2.amountTxCcy.toNumber()).toBe(1000);
      expect(row2.isRemainder).toBe(false); // no longer floating — this edit made it explicit
      const row3 = comp.rows[3]!;
      expect(row3.amountTxCcy.toNumber()).toBe(3000); // 4000 - 1000 freed
      expect(row3.isRemainder).toBe(false);
      // No OTHER row was silently reassigned to "remainder" — the pre-existing fixRow fallback-
      // promotion this test used to rely on (before this session's fix) is deliberately bypassed now.
      expect(comp.rows.filter((r) => r.isRemainder)).toHaveLength(0);
      const total = comp.rows.reduce((s, r) => s.plus(r.amountTxCcy), new Decimal(0));
      expect(total.toNumber()).toBe(10000);
    });

    it('onAccountAmountInput (foreign-currency Account Ccy Equiv. edit) triggers the identical waterfall — same underlying amountTxCcy field, just a different input surface', () => {
      const { comp } = makeComponent({ crossRate: 2 });
      buildRows(comp, [30, 30]); // row0=3000, row1=3000 fixed; row2=4000 remainder
      const [row0, row1] = comp.rows;
      comp.onRowCurrencyChange(row1!, 'EUR'); // rate=2

      comp.onAccountAmountInput(row1!, 2000); // EUR 2000 / 2 = USD 1000 — a decrease from 3000

      expect(row1!.amountTxCcy.toNumber()).toBe(1000);
      expect(row0!.amountTxCcy.toNumber()).toBe(3000); // untouched — row1 isn't row0's own neighbor for a decrease
      const row2 = comp.rows[2]!;
      expect(row2.amountTxCcy.toNumber()).toBe(6000); // 4000 + 2000 freed
    });

    it('onAccountAmountInput on the LAST row also opens a new trailing leg on a decrease, same as onAmountInput', () => {
      const { comp } = makeComponent({ crossRate: 2 });
      buildRows(comp, [30, 30, 40]); // row0=3000, row1=3000, row2=4000 — ALL fixed, row2 is last
      const row2 = comp.rows[2]!;
      comp.onRowCurrencyChange(row2, 'EUR'); // rate=2

      comp.onAccountAmountInput(row2, 2000); // EUR 2000 / 2 = USD 1000 — a decrease from 4000

      expect(comp.rows).toHaveLength(4);
      expect(row2.amountTxCcy.toNumber()).toBe(1000);
      const row3 = comp.rows[3]!;
      expect(row3.amountTxCcy.toNumber()).toBe(3000); // 4000 - 1000 freed
      expect(row3.currency).toBe('USD');
    });

    it("the cascade transfer works correctly when the DONOR and RECEIVER legs are both foreign currencies — different from the transaction currency AND from each other. The common amountTxCcy (transaction-currency) field is what actually moves between rows; each leg's own Account Ccy Equiv. is a pure derived scale of it via ITS OWN rate, so both legs' own-currency displays update correctly with no separate conversion step needed (reviewer-confirmed worked example: 1000 USD-equivalent freed shows up as exactly 850 EUR on the receiving EUR leg)", () => {
      const { comp } = makeComponent();
      buildRows(comp, [60, 40]); // row0=6000 (60%), row1=4000 (40%) — both fixed, no remainder, total 10000 USD (Tx Ccy)
      const [row0, row1] = comp.rows;
      row0!.currency = 'JPY';
      row0!.rate = new Decimal(150); // 1 USD (Tx Ccy) = 150 JPY
      row1!.currency = 'EUR';
      row1!.rate = new Decimal(0.85); // 1 USD (Tx Ccy) = 0.85 EUR
      expect(comp.accountCcyAmount(row0!)).toBe(900000); // 6000 * 150
      expect(comp.accountCcyAmount(row1!)).toBe(3400); // 4000 * 0.85

      comp.onAmountInput(row0!, 5000); // decrease the JPY leg by 1000 USD-equivalent

      expect(row0!.amountTxCcy.toNumber()).toBe(5000);
      expect(comp.accountCcyAmount(row0!)).toBe(750000); // down 150000 JPY = 1000 * 150 — donor's own currency correctly reflects the freed amount
      expect(row1!.amountTxCcy.toNumber()).toBe(5000); // 4000 + 1000 freed (transaction-currency terms)
      expect(comp.accountCcyAmount(row1!)).toBe(4250); // up 850 EUR = 1000 * 0.85 — receiver's own currency correctly reflects it too
      const total = comp.rows.reduce((s, r) => s.plus(r.amountTxCcy), new Decimal(0));
      expect(total.toNumber()).toBe(10000); // Total Allocated invariant holds regardless of either leg's own currency
    });

    it('a zero-delta edit (retyping the same amount) is a no-op — no row is touched, applied stays true', () => {
      const { comp } = makeComponent();
      buildRows(comp, [30, 30]);
      const [row0, row1] = comp.rows;

      comp.onAmountInput(row0!, 3000); // same value already there

      expect(row0!.amountTxCcy.toNumber()).toBe(3000);
      expect(row1!.amountTxCcy.toNumber()).toBe(3000); // untouched
    });

    describe('auto-delete a row once it settles at 0 amount AND 0% (reviewer-confirmed 2026-08-12: "如果單筆比例為0%＆金額=0 就直接刪除該筆", mirrors the identical % waterfall rule)', () => {
      it("a donor row fully drained to 0 by the LAST row's backward cascade (rule 4) is removed from the grid entirely, not just left showing 0", () => {
        const { comp } = makeComponent();
        buildRows(comp, [5, 5, 5, 5]); // row0..row3=500 each, row4=8000 (LAST)
        const [row0, row1, row2, row3, row4] = comp.rows;

        comp.onAmountInput(row4!, 9000); // increase 8000 -> 9000, needs 1000: row3 covers 500, row2 covers the remaining 500 — both drained to exactly 0

        expect(comp.rows).toHaveLength(3); // row2 and row3 vanished, not just zeroed
        expect(comp.rows).not.toContain(row2);
        expect(comp.rows).not.toContain(row3);
        expect(comp.rows).toEqual([row0, row1, row4]);
        expect(row1!.amountTxCcy.toNumber()).toBe(500); // untouched — cascade stopped once fully covered
        expect(row4!.amountTxCcy.toNumber()).toBe(9000);
      });

      it("the LAST row, when a non-last row's increase (rule 1) caps it down to exactly 0, is removed — the row before it becomes the new LAST row", () => {
        const { comp } = makeComponent();
        buildRows(comp, [40, 60]); // row0=4000 fixed, row1=6000 fixed, no remainder — row1 is LAST
        const [row0, row1] = comp.rows;

        comp.onAmountInput(row0!, 10000); // increase 4000 -> requests 10000, needs 6000 — exactly what row1 (LAST) has

        expect(row1!.amountTxCcy.toNumber()).toBe(0);
        expect(comp.rows).toHaveLength(1); // row1 was drained to exactly 0 and removed
        expect(comp.rows).toEqual([row0]);
        expect(row0!.amountTxCcy.toNumber()).toBe(10000);
      });

      it('the edited row itself is removed once a decrease settles it at exactly 0 (rule 2: a non-last row decreased to 0 hands its full amount to the LAST row)', () => {
        const { comp } = makeComponent();
        buildRows(comp, [30, 30]); // row0=3000, row1=3000, row2=4000 (remainder, LAST)
        const [row0, row1, row2] = comp.rows;

        comp.onAmountInput(row0!, 0); // decrease 3000 -> 0, freed 3000 flows to the LAST row

        expect(comp.rows).toHaveLength(2);
        expect(comp.rows).not.toContain(row0);
        expect(comp.rows).toEqual([row1, row2]);
        expect(row1!.amountTxCcy.toNumber()).toBe(3000); // untouched
        expect(row2!.amountTxCcy.toNumber()).toBe(7000); // 4000 + 3000 freed
      });

      it('is scoped to the multi-row waterfall only — the single-row (not-yet-split) bypass keeps showing a typed 0 on that row instead of vanishing it in favor of the freshly-spawned remainder', () => {
        const { comp } = makeComponent();
        comp.ngOnInit(); // sole row @ 100%/10000, not yet split
        const solo = comp.rows[0]!;

        comp.onAmountInput(solo, 0);

        expect(comp.rows).toHaveLength(2);
        expect(comp.rows[0]).toBe(solo); // NOT pruned — still the same row, showing 0
        expect(solo.amountTxCcy.toNumber()).toBe(0);
        expect(comp.rows[1]!.amountTxCcy.toNumber()).toBe(10000); // freshly-spawned remainder holds the rest
      });
    });
  });

  describe('amountInputTitle (Amount (Tx Ccy) input tooltip)', () => {
    it('describes the remainder-spawn behavior for the sole row (not yet split)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      expect(comp.amountInputTitle(comp.rows[0]!)).toContain('Remainder');
    });

    it('is blank for a non-remainder single row (defensive — not reachable via the UI today, since a lone row is always the remainder)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.isRemainder = false;
      expect(comp.amountInputTitle(comp.rows[0]!)).toBe('');
    });

    it('gets the ordinary last-leg message, NOT the old "Remainder" message, for a row that is the current remainder in a genuine multi-row split — it goes through the same waterfall as any other row now (v1.12.0 fix)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 30); // spawns rows[1] as remainder, LAST
      expect(comp.amountInputTitle(comp.rows[1]!)).toContain('Last leg');
      expect(comp.amountInputTitle(comp.rows[1]!)).not.toContain('Remainder');
    });

    // Each test below calls addRow() right before every onPctInput that fixes the row currently
    // holding sole-remainder status — a NEUTRAL freeze (fixes it at its current %/amount without
    // touching any other row) that sidesteps a pre-existing fixRow() quirk: fixing the sole
    // remainder without this falls back to re-promoting whichever OTHER row exists, even an
    // already-fixed one, corrupting its remainder status out from under it. Same pattern as the
    // "amount waterfall" describe block's own buildRows() helper above.
    it('describes the last-leg behavior (decrease creates a new leg) for a fixed row with no next neighbor', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.addRow();
      comp.onPctInput(comp.rows[0]!, 30); // row0 -> 30% fixed; row1 spawns remainder @ 70%
      comp.addRow();
      comp.onPctInput(comp.rows[1]!, 70); // row1 -> 70% fixed too — both fixed now, rows[1] is last, non-remainder
      expect(comp.amountInputTitle(comp.rows[1]!)).toContain('Last leg');
      expect(comp.amountInputTitle(comp.rows[1]!)).toContain('creates a new leg');
    });

    it('describes the direct-to-last-leg waterfall for any NON-last fixed row (v1.12.3 — superseding the old "First leg" boundary message, since a non-last row no longer has a rejected/special first-row case)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.addRow();
      comp.onPctInput(comp.rows[0]!, 30);
      comp.addRow();
      comp.onPctInput(comp.rows[1]!, 70);
      expect(comp.amountInputTitle(comp.rows[0]!)).toContain('LAST leg');
    });

    it('describes the same direct-to-last-leg waterfall for a genuine middle row (v1.12.3 — superseding the old "Decreasing pushes [to adjacent neighbor]" message)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.addRow();
      comp.onPctInput(comp.rows[0]!, 30);
      comp.addRow();
      comp.onPctInput(comp.rows[1]!, 30);
      comp.addRow();
      comp.onPctInput(comp.rows[2]!, 40); // all three fixed; rows[1] is a genuine middle row
      expect(comp.amountInputTitle(comp.rows[1]!)).toContain('LAST leg');
    });
  });

  describe('% waterfall (business-requirement-confirmed 2026-08-12, "同 Amount調整規則" — same 4-rule model as the Amount waterfall above, applied to row.pct)', () => {
    /**
     * Builds `pcts.length` explicit, integer-%, fixed rows via DIRECT field assignment + addRow()
     * — never via onPctInput/onAmountInput — a neutral fixture that bypasses BOTH the % and
     * Amount waterfalls entirely (which is the whole point: applyPctWaterfall is what's under
     * test here, so setup must not itself invoke it). addRow() alone never triggers either
     * waterfall — it only flips isRemainder and runs ensureRemainderRow()'s pre-existing exact-
     * amount bookkeeping. Traced step-for-step against the pre-existing 'amount waterfall'
     * describe block's own buildRows() helper (which used onPctInput, back when % editing had no
     * waterfall of its own) to confirm this produces an IDENTICAL end state: pcts summing to
     * exactly 100 leave every row fixed (no floating remainder); pcts summing to < 100 leave the
     * final row as the floating (but positionally LAST) remainder. Only the final entry in `pcts`
     * may bring the running total to exactly 100 — an earlier entry doing so would leave no
     * "current remainder" row for the next iteration to grab. Total = 10000 USD (makeComponent's
     * default) unless initialTotalAmount is overridden before calling.
     */
    function buildPctFixture(comp: LegAllocatorComponent, pcts: number[]): void {
      comp.ngOnInit();
      for (const pct of pcts) {
        const row = comp.rows[comp.rows.length - 1]!;
        row.pct = new Decimal(pct);
        row.amountTxCcy = comp.totalAmount.times(pct).dividedBy(100);
        row.driver = 'pct';
        comp.addRow();
      }
    }

    it("a decrease on a NON-last row's % flows the exact freed % straight to the LAST row — never the row positionally next to it", () => {
      const { comp } = makeComponent();
      buildPctFixture(comp, [30, 30]); // row0=30% fixed, row1=30% fixed, row2=40% remainder (LAST)
      const [row0, row1, row2] = comp.rows;

      comp.onPctInput(row0!, 10); // decrease 30% -> 10%

      expect(row0!.pct.toNumber()).toBe(10);
      expect(row0!.amountTxCcy.toNumber()).toBe(1000);
      expect(row1!.pct.toNumber()).toBe(30); // untouched — not the target under this rule
      expect(row2!.pct.toNumber()).toBe(60); // 40 + 20 freed, straight to the LAST row
      expect(row2!.amountTxCcy.toNumber()).toBe(6000);
      expect(row2!.driver).toBe('pct');
      expect(row2!.isRemainder).toBe(false);
    });

    it("an increase on a NON-last row decreases the LAST row's % by the same amount, capped at what it has — a single direct offset, never the row positionally before it", () => {
      const { comp } = makeComponent();
      buildPctFixture(comp, [30, 30]); // row0=30%, row1=30%, row2=40% (remainder, LAST)
      const [row0, row1, row2] = comp.rows;

      comp.onPctInput(row1!, 50); // increase 30% -> 50%, needs 20%

      expect(row1!.pct.toNumber()).toBe(50);
      expect(row1!.amountTxCcy.toNumber()).toBe(5000);
      expect(row2!.pct.toNumber()).toBe(20); // 40 - 20 — the LAST row absorbs it
      expect(row0!.pct.toNumber()).toBe(30); // untouched
    });

    it('an increase on the LAST row cascades through MULTIPLE earlier rows when the immediately preceding one alone cannot cover it — draining each to exactly 0%, never negative', () => {
      const { comp } = makeComponent();
      buildPctFixture(comp, [5, 5, 5, 5]); // row0..row3=5% each fixed, row4=80% remainder (LAST)
      const [row0, row1, row2, row3, row4] = comp.rows;

      comp.onPctInput(row4!, 93); // increase 80% -> 93%, needs 13%: row3 covers 5, row2 covers 5, row1 covers the remaining 3

      expect(row4!.pct.toNumber()).toBe(93);
      expect(row3!.pct.toNumber()).toBe(0);
      expect(row2!.pct.toNumber()).toBe(0);
      expect(row1!.pct.toNumber()).toBe(2); // 5 - 3
      expect(row0!.pct.toNumber()).toBe(5); // untouched — cascade stopped once fully covered
      const total = comp.rows.reduce((s, r) => s.plus(r.pct), new Decimal(0));
      expect(total.toNumber()).toBe(100);
    });

    it('an increase on the LAST row all the way to the maximum valid % (100) still fully succeeds via the backward cascade — unlike the Amount rule this mirrors, % can never be under-supplied: the donor pool is every OTHER row, and Σ% = 100 by construction guarantees it always holds exactly enough for any request in [0, 100]', () => {
      const { comp } = makeComponent();
      buildPctFixture(comp, [5, 5, 5]); // row0=5%, row1=5%, row2=5% fixed, row3=85% remainder (LAST)
      const [row0, row1, row2, row3] = comp.rows;

      comp.onPctInput(row3!, 100); // increase 85% -> 100%, needs 15% — exactly what row0+row1+row2 hold combined

      expect(row0!.pct.toNumber()).toBe(0);
      expect(row1!.pct.toNumber()).toBe(0);
      expect(row2!.pct.toNumber()).toBe(0);
      expect(row3!.pct.toNumber()).toBe(100);
      const total = comp.rows.reduce((s, r) => s.plus(r.pct), new Decimal(0));
      expect(total.toNumber()).toBe(100);
    });

    it("an increase on a NON-last row is capped at just the LAST row's own %, even when an untouched MIDDLE row holds far more — never cascades further back or draws from the middle row", () => {
      const { comp } = makeComponent();
      buildPctFixture(comp, [5, 90]); // row0=5% fixed, row1=90% fixed (middle), row2=5% remainder (LAST)
      const [row0, row1, row2] = comp.rows;

      comp.onPctInput(row0!, 50); // increase 5% -> requests 50% (needs +45%), but the LAST row (row2) only has 5%

      expect(row0!.pct.toNumber()).toBe(10); // 5 + 5 (capped to what row2 had), NOT 50
      expect(row2!.pct.toNumber()).toBe(0); // drained
      expect(row1!.pct.toNumber()).toBe(90); // untouched — rule never reaches into the middle row
    });

    it('an increase on a NON-last row when the LAST row is already at 0% is a full no-op — nothing to take, capped at 0', () => {
      const { comp } = makeComponent();
      buildPctFixture(comp, [40, 60]); // row0=40% fixed, row1=60% fixed, no remainder
      const [row0, row1] = comp.rows;
      // Simulate a last row already drained by a prior edit (e.g. a previous rule-1 cap) — direct
      // field assignment isolates just this no-op case from any earlier cascade.
      row1!.pct = new Decimal(0);
      row1!.amountTxCcy = new Decimal(0);

      comp.onPctInput(row0!, 80); // increase 40% -> requests 80%, but the LAST row has 0% to give

      expect(row0!.pct.toNumber()).toBe(40); // unchanged
      expect(row1!.pct.toNumber()).toBe(0);
    });

    it('decreasing the LAST row (fully allocated, no remainder) opens a brand-new trailing row to hold exactly the freed % difference, Account No. defaulting to the account TYPE\'s own placeholder — earlier rows are untouched', () => {
      const { comp } = makeComponent();
      buildPctFixture(comp, [30, 30, 40]); // row0=30%, row1=30%, row2=40% — ALL fixed, no remainder
      const [row0, row1, row2] = comp.rows;
      expect(comp.rows).toHaveLength(3);

      comp.onPctInput(row2!, 10); // decrease on the last row: 40% -> 10%, freed = 30%

      expect(comp.rows).toHaveLength(4);
      expect(row2!.pct.toNumber()).toBe(10);
      expect(row2!.amountTxCcy.toNumber()).toBe(1000);
      expect(row0!.pct.toNumber()).toBe(30); // untouched
      expect(row1!.pct.toNumber()).toBe(30); // untouched
      const row3 = comp.rows[3]!;
      expect(row3.pct.toNumber()).toBe(30); // exactly the freed difference
      expect(row3.amountTxCcy.toNumber()).toBe(3000);
      expect(row3.accountNo).toBe('CUST-ACC'); // DEFAULT_ACCOUNT_NO_BY_TYPE['CUSTOMER'], same convention as the Amount rule
      expect(row3.currency).toBe('USD');
      expect(row3.driver).toBe('pct');
      expect(row3.isRemainder).toBe(false);
      const total = comp.rows.reduce((s, r) => s.plus(r.pct), new Decimal(0));
      expect(total.toNumber()).toBe(100);
    });

    it('decreasing the (now-last) newly-created row cascades again, opening yet another trailing row — the chain keeps working, not just a one-shot escape hatch', () => {
      const { comp } = makeComponent();
      buildPctFixture(comp, [30, 30, 40]); // row0=30%, row1=30%, row2=40%
      const [row0, row1, row2] = comp.rows;
      comp.onPctInput(row2!, 10); // row2 -> 10%, row3 spawns @ 30% (LAST now)
      const row3 = comp.rows[3]!;

      comp.onPctInput(row3, 5); // decrease on the NEW last row: 30% -> 5%, freed = 25%

      expect(comp.rows).toHaveLength(5);
      expect(row3.pct.toNumber()).toBe(5);
      const row4 = comp.rows[4]!;
      expect(row4.pct.toNumber()).toBe(25);
      expect(row0!.pct.toNumber()).toBe(30); // still untouched two edits later
      expect(row1!.pct.toNumber()).toBe(30);
      expect(row2!.pct.toNumber()).toBe(10);
      const total = comp.rows.reduce((s, r) => s.plus(r.pct), new Decimal(0));
      expect(total.toNumber()).toBe(100);
    });

    it('increasing the FIRST row succeeds — decreases the LAST row directly, exactly like any other non-last row', () => {
      const { comp } = makeComponent();
      buildPctFixture(comp, [30, 30, 40]); // row0=30%, row1=30%, row2=40% — ALL fixed
      const [row0, row1, row2] = comp.rows;

      comp.onPctInput(row0!, 50); // increase on the first row: 30% -> 50%, needs 20%

      expect(row0!.pct.toNumber()).toBe(50);
      expect(row1!.pct.toNumber()).toBe(30); // untouched — neither the edited row nor the last row
      expect(row2!.pct.toNumber()).toBe(20); // 40 - 20 — the LAST row absorbs it
      const total = comp.rows.reduce((s, r) => s.plus(r.pct), new Decimal(0));
      expect(total.toNumber()).toBe(100);
    });

    it('a fractional typed % is rounded to the nearest whole percentage point (ROUND_HALF_UP) before the waterfall runs — reviewer-confirmed 2026-08-12: "輸入比例保留 但以整數輸入％為主"; a split needing finer precision must use Amount instead', () => {
      const { comp } = makeComponent();
      buildPctFixture(comp, [30, 30]); // row0=30%, row1=30%, row2=40% (remainder, LAST)
      const [row0, , row2] = comp.rows;

      comp.onPctInput(row0!, 12.6); // rounds to 13 first, THEN the waterfall sees a decrease of 17

      expect(row0!.pct.toNumber()).toBe(13);
      expect(row2!.pct.toNumber()).toBe(57); // 40 + 17 freed
    });

    it('a zero-delta % edit (retyping the same %) is a no-op — no row is touched', () => {
      const { comp } = makeComponent();
      buildPctFixture(comp, [30, 30]); // row0=30%, row1=30%, row2=40% (remainder, LAST)
      const [row0, row1, row2] = comp.rows;

      comp.onPctInput(row0!, 30); // same value already there

      expect(row0!.pct.toNumber()).toBe(30);
      expect(row1!.pct.toNumber()).toBe(30); // untouched
      expect(row2!.pct.toNumber()).toBe(40); // untouched
    });

    describe('auto-delete a row once it settles at 0% AND 0 amount (reviewer-confirmed 2026-08-12: "如果單筆比例為0%＆金額=0 就直接刪除該筆")', () => {
      it("a donor row fully drained to 0% by the LAST row's backward cascade (rule 4) is removed from the grid entirely, not just left showing 0%", () => {
        const { comp } = makeComponent();
        buildPctFixture(comp, [5, 5, 5, 5]); // row0..row3=5% each, row4=80% (LAST)
        const [row0, row1, row2, row3, row4] = comp.rows;

        comp.onPctInput(row4!, 90); // increase 80% -> 90%, needs 10%: row3 covers 5, row2 covers the remaining 5 — both drained to exactly 0

        expect(comp.rows).toHaveLength(3); // row2 and row3 vanished, not just zeroed
        expect(comp.rows).not.toContain(row2);
        expect(comp.rows).not.toContain(row3);
        expect(comp.rows).toEqual([row0, row1, row4]);
        expect(row1!.pct.toNumber()).toBe(5); // untouched — cascade stopped once fully covered
        expect(row4!.pct.toNumber()).toBe(90);
      });

      it("the LAST row, when a non-last row's increase (rule 1) caps it down to exactly 0%, is removed — the row before it becomes the new LAST row", () => {
        const { comp } = makeComponent();
        buildPctFixture(comp, [40, 60]); // row0=40% fixed, row1=60% fixed, no remainder — row1 is LAST
        const [row0, row1] = comp.rows;

        comp.onPctInput(row0!, 100); // increase 40% -> requests 100%, needs 60% — exactly what row1 (LAST) has

        expect(row1!.pct.toNumber()).toBe(0);
        expect(comp.rows).toHaveLength(1); // row1 was drained to exactly 0% and removed
        expect(comp.rows).toEqual([row0]);
        expect(row0!.pct.toNumber()).toBe(100);
      });

      it('the edited row itself is removed once a decrease settles it at exactly 0% (rule 2: a non-last row decreased to 0 hands its full % to the LAST row)', () => {
        const { comp } = makeComponent();
        buildPctFixture(comp, [30, 30]); // row0=30%, row1=30%, row2=40% (remainder, LAST)
        const [row0, row1, row2] = comp.rows;

        comp.onPctInput(row0!, 0); // decrease 30% -> 0%, freed 30% flows to the LAST row

        expect(comp.rows).toHaveLength(2);
        expect(comp.rows).not.toContain(row0);
        expect(comp.rows).toEqual([row1, row2]);
        expect(row1!.pct.toNumber()).toBe(30); // untouched
        expect(row2!.pct.toNumber()).toBe(70); // 40 + 30 freed
      });

      it('never prunes below 1 row — draining every OTHER row to 0 via a maximal last-row increase still leaves exactly one row standing', () => {
        const { comp } = makeComponent();
        buildPctFixture(comp, [50, 50]); // row0=50%, row1=50% (LAST), no remainder
        const [row0, row1] = comp.rows;

        comp.onPctInput(row1!, 100); // increase 50% -> 100%, drains row0 to exactly 0%

        expect(comp.rows).toHaveLength(1);
        expect(comp.rows).toEqual([row1]);
        expect(row0!.pct.toNumber()).toBe(0); // drained, but not removed since only 1 row would remain — guard holds
        expect(row1!.pct.toNumber()).toBe(100);
      });

      it('is scoped to the multi-row waterfall only — the single-row (not-yet-split) bypass keeps showing a typed 0% on that row instead of vanishing it in favor of the freshly-spawned remainder', () => {
        const { comp } = makeComponent();
        comp.ngOnInit(); // sole row @ 100%, not yet split
        const solo = comp.rows[0]!;

        comp.onPctInput(solo, 0);

        expect(comp.rows).toHaveLength(2);
        expect(comp.rows[0]).toBe(solo); // NOT pruned — still the same row, showing 0%
        expect(solo.pct.toNumber()).toBe(0);
        expect(comp.rows[1]!.pct.toNumber()).toBe(100); // freshly-spawned remainder holds the rest
      });
    });

    it('the single-row (not-yet-split) case is unaffected by the waterfall — still the original fixRow/ensureRemainderRow spawn-a-remainder behavior, integer-rounded', () => {
      const { comp } = makeComponent();
      comp.ngOnInit(); // sole row @ 100%, not yet split

      comp.onPctInput(comp.rows[0]!, 64.3); // rounds to 64 first

      expect(comp.rows).toHaveLength(2);
      expect(comp.rows[0]!.pct.toNumber()).toBe(64);
      expect(comp.rows[1]!.isRemainder).toBe(true);
      expect(comp.rows[1]!.pct.toNumber()).toBe(36);
    });
  });

  describe('pctInputTitle (% input tooltip)', () => {
    it('describes the remainder-spawn behavior for the sole row (not yet split)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      expect(comp.pctInputTitle(comp.rows[0]!)).toContain('Remainder');
    });

    it('is blank for a non-remainder single row (defensive — not reachable via the UI today, since a lone row is always the remainder)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.isRemainder = false;
      expect(comp.pctInputTitle(comp.rows[0]!)).toBe('');
    });

    it('gets the ordinary last-leg message, NOT the old "Remainder" message, for a row that is the current remainder in a genuine multi-row split — it goes through the same waterfall as any other row now', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 30); // spawns rows[1] as remainder, LAST
      expect(comp.pctInputTitle(comp.rows[1]!)).toContain('Last leg');
      expect(comp.pctInputTitle(comp.rows[1]!)).not.toContain('Remainder');
    });

    it('describes the last-leg behavior (decrease creates a new leg) for a fixed row with no next neighbor, and mentions the whole-percentage-point rule', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.addRow();
      comp.onPctInput(comp.rows[0]!, 30);
      comp.addRow();
      comp.onPctInput(comp.rows[1]!, 70); // both fixed now, rows[1] is last, non-remainder
      expect(comp.pctInputTitle(comp.rows[1]!)).toContain('Last leg');
      expect(comp.pctInputTitle(comp.rows[1]!)).toContain('creates a new leg');
      expect(comp.pctInputTitle(comp.rows[1]!)).toContain('Whole percentage points');
    });

    it('describes the direct-to-last-leg waterfall for any NON-last fixed row, including a genuine middle row', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.addRow();
      comp.onPctInput(comp.rows[0]!, 30);
      comp.addRow();
      comp.onPctInput(comp.rows[1]!, 30);
      comp.addRow();
      comp.onPctInput(comp.rows[2]!, 40); // all three fixed; rows[1] is a genuine middle row
      expect(comp.pctInputTitle(comp.rows[0]!)).toContain('LAST leg');
      expect(comp.pctInputTitle(comp.rows[1]!)).toContain('LAST leg');
    });
  });

  describe('emit — transaction-currency leg ordering (regression)', () => {
    it('a transaction-currency-matching leg is always emitted FIRST, even when the user recolors the SOLE row to a foreign currency directly (instead of splitting off a new row first)', () => {
      const { comp, emittedLegs } = makeComponent({ crossRate: 1 });
      comp.ngOnInit(); // rows[0] = sole 100% row, USD (this.transactionCurrency stays 'USD' — onRowCurrencyChange never touches it)

      // User recolors the ONLY existing row to EUR directly (Leg Currency dropdown on that
      // row), rather than adding a second row for the foreign leg. Per the row-array-stability
      // invariant, this row keeps array position 0 for the rest of its life.
      comp.onRowCurrencyChange(comp.rows[0]!, 'EUR');
      comp.onAccountAmountInput(comp.rows[0]!, 100); // types "EUR 100" — this has no OTHER row to
      // promote as remainder yet, so ensureRemainderRow() appends a FRESH USD row at index 1.

      expect(comp.rows[0]!.currency).toBe('EUR'); // internal array order is untouched — EUR is still rows[0]
      expect(comp.rows[1]!.currency).toBe('USD');

      const emitted = emittedLegs[emittedLegs.length - 1]!;
      // The EMITTED order must NOT mirror internal array order here — kept as a
      // display/readability nicety (see emit()'s own doc comment): a leg whose OWN currency
      // matches the shared Transaction Currency reads more naturally first in the array.
      expect(emitted[0]!.currency).toBe('USD');
      expect(emitted[1]!.currency).toBe('EUR');
    });

    it('a same-currency leg stays first when the transaction currency has no foreign row at all', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.ngOnInit();
      comp.onPctInput(comp.rows[0]!, 40); // both rows stay USD — no reordering should occur

      const emitted = emittedLegs[emittedLegs.length - 1]!;
      expect(emitted.map((l) => l.currency)).toEqual(['USD', 'USD']);
    });

    it('regression, full pipeline: after the SOLE row is recolored to EUR and a Suspense-driven total reseed follows, the transaction-currency leg both stays first AND lands on the exact netted amount', () => {
      const { comp, emittedLegs } = makeComponent({ crossRate: 1 }); // rate=1 isolates the ordering/exact-subtraction fix from FX-conversion arithmetic (covered elsewhere)
      comp.ngOnInit(); // total = 10000, USD

      comp.onRowCurrencyChange(comp.rows[0]!, 'EUR');
      comp.onAccountAmountInput(comp.rows[0]!, 100); // "EUR 100" — creates a fresh USD remainder row at index 1

      // Suspense Debit = EUR 100 (gross) reseeds the total: 10000 + 100 (rate=1) = 10100
      comp.initialTotalAmount = '10100';
      comp.ngOnChanges({ initialTotalAmount: new SimpleChange('10000', '10100', false) });

      const eurRow = comp.rows.find((r) => r.currency === 'EUR')!;
      const usdRow = comp.rows.find((r) => r.currency === 'USD')!;
      expect(comp.accountCcyAmount(eurRow)).toBe(100); // EUR leg unchanged — matches gross Suspense exactly (Net = 0)
      expect(usdRow.amountTxCcy.toNumber()).toBe(10000); // EXACT: 10100 - 100, not a %-rescale artifact

      const emitted = emittedLegs[emittedLegs.length - 1]!;
      expect(emitted[0]!).toMatchObject({ currency: 'USD', amountTxCcy: '10000.00' });
      expect(emitted[1]!).toMatchObject({ currency: 'EUR', amountAccountCcy: '100.00' });
    });
  });

  describe('onRateInput', () => {
    it('sets the row rate from the typed value', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR'; // needsRate -> rate/drBuyRate actually gets emitted

      comp.onRateInput(comp.rows[0]!, 1.25);

      expect(comp.rows[0]!.rate.toNumber()).toBe(1.25);
      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit[0]!.drBuyRate).toBe('1.250000');
    });

    it('clamps a negative typed rate to 0', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onRateInput(comp.rows[0]!, -2);
      expect(comp.rows[0]!.rate.toNumber()).toBe(0);
    });

    it('emits crBuyRate (not drBuyRate) for the CREDIT side', () => {
      const { comp, emittedLegs } = makeComponent();
      comp.side = 'CREDIT';
      comp.ngOnInit();
      comp.rows[0]!.currency = 'EUR';

      comp.onRateInput(comp.rows[0]!, 1.5);

      const lastEmit = emittedLegs[emittedLegs.length - 1]!;
      expect(lastEmit[0]!.crBuyRate).toBe('1.500000');
      expect(lastEmit[0]!.drBuyRate).toBeUndefined();
    });
  });

  describe('label / toNum / trackById', () => {
    it('label reflects the side', () => {
      const { comp } = makeComponent();
      comp.side = 'DEBIT';
      expect(comp.label).toBe('Debit');
      comp.side = 'CREDIT';
      expect(comp.label).toBe('Credit');
    });

    it('toNum converts a Decimal to a plain number', () => {
      const { comp } = makeComponent();
      expect(comp.toNum(new Decimal('12.5'))).toBe(12.5);
    });

    it('trackById returns the row id', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      expect(comp.trackById(0, comp.rows[0]!)).toBe(comp.rows[0]!.id);
    });
  });

  describe('amountScaleErrors (H-2: leg amount over-precision vs Currency API decimals)', () => {
    it('flags an Amount (Tx Ccy) typed with more decimals than the transaction currency allows (USD = 2)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, 9999.112);
      expect(comp.amountScaleErrors).toHaveLength(1);
      expect(comp.amountScaleErrors[0]).toContain('DEBIT leg amount 9999.112');
      expect(comp.amountScaleErrors[0]).toContain('USD allows at most 2');
    });

    it('emits the scale errors via scaleErrorsChange so the parent can block', () => {
      const { comp } = makeComponent();
      const emitted: string[][] = [];
      comp.scaleErrorsChange.subscribe((e) => emitted.push(e));
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, 100.123);
      expect(emitted[emitted.length - 1]).toEqual([expect.stringContaining('USD allows at most 2')]);
    });

    it('does not flag an amount that fits the currency (2dp for USD)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, 100.12);
      expect(comp.amountScaleErrors).toEqual([]);
    });

    it('flags ANY decimals for a 0-dp transaction currency (JPY)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onCurrencyChange('JPY');
      comp.onAmountInput(comp.rows[0]!, 10.5);
      expect(comp.amountScaleErrors[0]).toContain('JPY allows at most 0');
    });

    it('flags an over-precise Account Ccy Equiv. against the ROW currency (EUR = 2)', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onRowCurrencyChange(comp.rows[0]!, 'EUR'); // row becomes foreign -> needsRate, account-ccy input editable
      comp.onAccountAmountInput(comp.rows[0]!, 12.123);
      expect(comp.amountScaleErrors[0]).toContain('EUR allows at most 2');
    });

    it('clears a row error once its amount is re-driven by a clean % edit', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, 100.123);
      expect(comp.amountScaleErrors).toHaveLength(1);
      comp.onPctInput(comp.rows[0]!, 50);
      expect(comp.amountScaleErrors).toEqual([]);
    });

    it('SKIPS a currency absent from the Currency master (source of truth) — no false rejection', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onRowCurrencyChange(comp.rows[0]!, 'BHD'); // not in the decimals map
      comp.onAccountAmountInput(comp.rows[0]!, 1.234);
      expect(comp.amountScaleErrors).toEqual([]);
    });

    it('clears stale errors when the transaction currency changes', () => {
      const { comp } = makeComponent();
      comp.ngOnInit();
      comp.onAmountInput(comp.rows[0]!, 100.123);
      expect(comp.amountScaleErrors).toHaveLength(1);
      comp.onCurrencyChange('EUR');
      expect(comp.amountScaleErrors).toEqual([]);
    });
  });
});
