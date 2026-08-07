import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import Decimal from 'decimal.js';
import { FxRateService } from './fx-rate.service';
import { CurrencyService } from './currency.service';
import type { AccountType, LegSide, PaymentLegInput } from './payment-component.types';

interface Row {
  id: number;
  accountType: AccountType;
  /** Only meaningful when accountType === 'NOSTRO' — see payment-component.types.ts (v1.3.0: RTGS is a flag on NOSTRO, not its own AccountType). */
  rtgsIndicator: boolean;
  accountNo: string;
  currency: string;
  pct: Decimal;
  /** Amount in the TRANSACTION currency — the figure %/amount editing actually controls, per PaymentLegInput.amountTxCcy. */
  amountTxCcy: Decimal;
  /** Only meaningful when currency !== transaction currency. Maps to drBuyRate (debit legs) / crBuyRate (credit legs). */
  rate: Decimal;
  /**
   * Reference-only, matching DO_PaymentDealer.xml's CPYT_DR/CR_EXNG_AC
   * ("Exchange Account No.") and CPYT_DR/CR_DEAL ("Deal Number") — present in
   * the original screens but source-verified to never drive any amount/
   * account calculation there (SSSS_PaymentDebit.js/SSSS_PaymentCredit.js
   * only toggle their mandatory/protected UI state via SYT_ChangeFldClass()).
   * Carried here purely for parity with the original screens; never sent to
   * the microservice (not part of PaymentLegInput/the OAS).
   */
  exchangeAccountNo: string;
  dealNumber: string;
  /**
   * True for the single auto-computed "what's left" row (pct = 100 − every
   * other row's pct). Editing a remainder row's own %/amount converts it into
   * a fixed row and a fresh 0% remainder row is appended after it — this is
   * what makes typing a smaller % into the only row "add another column"
   * rather than snapping back to 100.
   */
  isRemainder: boolean;
}

let rowIdCounter = 0;

export interface FxPairEntry {
  drCr: 'D' | 'C';
  account: string;
  currency: string;
  amount: number;
  site: 'Trx Ccy' | 'Other Ccy';
}

/** Rounds to 2dp, ROUND_HALF_UP — matches microservices/payment-component/src/money.ts's convention for the same reason: this feeds MonetaryAmount fields on the wire (pattern ^-?\d{1,18}(\.\d{1,3})?$), and split percentages (e.g. 33.33/33.33/33.34 over a large total) can genuinely drift under binary-float math, which is exactly why the sibling microservice uses decimal.js instead of native numbers for this class of arithmetic. */
function money(value: Decimal.Value): Decimal {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function clampPct(value: Decimal.Value): Decimal {
  const d = new Decimal(value || 0);
  return Decimal.min(Decimal.max(d, 0), 100);
}

/**
 * Mixed-Payment-LC-style leg splitter (CLAUDE.md "Mixed Payment LC":
 * Payment Amount = Transaction Amount × Payment Percentage ÷ 100) for one
 * side (Debit or Credit) of a Payment Component business case.
 *
 * A protected total + transaction currency anchors every row's amount. Every
 * row is editable by % or by amount (kept in sync); exactly one row is always
 * the auto-computed remainder (100% − every fixed row), so the side's rows
 * always sum to exactly 100% of the total by construction. Editing any row
 * (including the remainder) fixes it at that value and reflows the leftover
 * into a (possibly new) remainder row — "add another column" from the user's
 * spec. A row's currency may differ from the transaction currency; when it
 * does, an exchange rate becomes editable and the settlement-currency
 * equivalent is shown (amountAccountCcy = amountTxCcy × rate, mirroring
 * money.ts's convertTxCcyToAccountCcy).
 */
@Component({
  selector: 'app-leg-allocator',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './leg-allocator.component.html',
  styleUrls: ['./leg-allocator.component.scss'],
})
export class LegAllocatorComponent implements OnInit, OnChanges {
  @Input({ required: true }) side!: LegSide;
  @Input({ required: true }) accountTypeOptions!: AccountType[];
  @Input({ required: true }) defaultAccountType!: AccountType;
  @Input() defaultRtgsIndicator = false;
  @Input({ required: true }) defaultAccountNo!: string;
  @Input({ required: true }) initialTotalAmount!: string;
  @Input({ required: true }) initialCurrency!: string;

  @Output() legsChange = new EventEmitter<PaymentLegInput[]>();
  /** True once every row has an account number and (when split) a valid rate — parent gates preview calls on this. */
  @Output() validChange = new EventEmitter<boolean>();

  totalAmount = new Decimal(0);
  transactionCurrency = '';
  rows: Row[] = [];

  /** "Get Currency API" (currency.service.ts) — populates the Transaction/Leg Currency dropdowns below. */
  readonly currencies$: Observable<string[]>;

  constructor(private readonly fx: FxRateService, currency: CurrencyService) {
    this.currencies$ = currency.codes();
  }

  ngOnInit(): void {
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    // A fresh business case was selected (new defaults) — rebuild from scratch.
    const relevantInputChanged = !!(
      changes['initialTotalAmount'] ||
      changes['initialCurrency'] ||
      changes['defaultAccountType'] ||
      changes['defaultRtgsIndicator']
    );
    if (!relevantInputChanged) return;

    // ngOnInit's reset() already ran for the very first binding — only re-reset on a LATER change
    // (i.e. the parent switched to a different business case and pushed new defaults into this instance).
    const isFirstBinding = changes['initialTotalAmount']?.firstChange && changes['initialCurrency']?.firstChange;
    if (!isFirstBinding) {
      this.reset();
    }
  }

  private reset(): void {
    this.totalAmount = new Decimal(this.initialTotalAmount || 0);
    this.transactionCurrency = this.initialCurrency;
    this.rows = [this.makeRow(100, this.defaultAccountType, this.defaultAccountNo, true, this.defaultRtgsIndicator)];
    this.emit();
  }

  private makeRow(
    pct: Decimal.Value,
    accountType: AccountType,
    accountNo: string,
    isRemainder: boolean,
    rtgsIndicator = false,
  ): Row {
    rowIdCounter += 1;
    const pctDecimal = new Decimal(pct);
    return {
      id: rowIdCounter,
      accountType,
      rtgsIndicator: accountType === 'NOSTRO' ? rtgsIndicator : false,
      accountNo,
      currency: this.transactionCurrency,
      pct: pctDecimal,
      amountTxCcy: money(this.totalAmount.times(pctDecimal).dividedBy(100)),
      rate: new Decimal(1),
      exchangeAccountNo: '',
      dealNumber: '',
      isRemainder,
    };
  }

  get label(): string {
    return this.side === 'DEBIT' ? 'Debit' : 'Credit';
  }

  get isSplit(): boolean {
    return this.rows.length > 1;
  }

  get totalPct(): number {
    return this.rows.reduce((sum, r) => sum.plus(r.pct), new Decimal(0)).toDecimalPlaces(2).toNumber();
  }

  get isOverAllocated(): boolean {
    return this.totalPct > 100.001;
  }

  /** Template display helpers — native number inputs need plain numbers, not Decimal instances. */
  toNum(value: Decimal): number {
    return value.toNumber();
  }

  trackById(_index: number, row: Row): number {
    return row.id;
  }

  needsRate(row: Row): boolean {
    return !!row.currency && row.currency !== this.transactionCurrency;
  }

  accountCcyAmount(row: Row): number {
    return money(row.amountTxCcy.times(row.rate)).toNumber();
  }

  onTotalChange(value: number): void {
    this.totalAmount = new Decimal(value || 0);
    // Rescale every row's amount to match its existing %, keep % fixed.
    for (const row of this.rows) {
      row.amountTxCcy = money(this.totalAmount.times(row.pct).dividedBy(100));
    }
    this.emit();
  }

  onCurrencyChange(value: string): void {
    // Bug fixed here: needsRate(row) must be evaluated against the OLD
    // transactionCurrency to tell "was already following the transaction
    // currency" apart from "was already diverged" — checking it AFTER
    // reassigning transactionCurrency below made every row's own currency
    // compare against the NEW value, so a row that was correctly in sync
    // (e.g. a fresh single 100% row) would permanently stick at its old
    // currency and incorrectly start needing a cross rate, instead of
    // following the transaction currency change like it should.
    const alreadyDivergedIds = new Set(this.rows.filter((row) => this.needsRate(row)).map((row) => row.id));
    this.transactionCurrency = value;
    for (const row of this.rows) {
      if (!alreadyDivergedIds.has(row.id)) row.currency = value;
    }
    this.emit();
    // Transaction currency moved — every row still quoted in a different currency needs a fresh cross rate.
    for (const row of this.rows) {
      if (this.needsRate(row)) this.applyFxRate(row);
    }
  }

  /** Called when a row's OWN currency is edited (as opposed to the shared transaction currency above). */
  onRowCurrencyChange(row: Row, value: string): void {
    row.currency = value;
    if (this.needsRate(row)) {
      this.applyFxRate(row);
    } else {
      row.rate = new Decimal(1);
      row.exchangeAccountNo = '';
      this.emit();
    }
  }

  /**
   * Auto-fills row.rate from GET /api/fx/rates (FxRateService) — "same as the
   * original Angular Project" per the user's request, rather than leaving the
   * exchange rate as a bare manually-typed number. Still freely editable
   * afterward (this only sets a starting value); silently leaves the
   * existing rate untouched if the pair isn't in the backend's table (demo
   * covers USD/EUR/JPY/GBP/TWD only).
   *
   * Also defaults the row's own Exchange Account No. to `FX Exchange
   * <transactionCurrency>` — the "Other Ccy site" half of the FX pair
   * formula (this row's own posting is in its own/foreign currency, so its
   * counterpart reference is named after the transaction currency it's being
   * converted from). The matching "Trx Ccy site" half (`FX Exchange
   * <row.currency>`, booked in the transaction currency) has no input field
   * of its own — it's a derived entry, shown in the fxPairs table below.
   */
  private applyFxRate(row: Row): void {
    row.exchangeAccountNo = `FX Exchange ${this.transactionCurrency}`;
    this.fx.rates().subscribe((rates) => {
      const cross = this.fx.crossRate(rates, this.transactionCurrency, row.currency);
      if (cross !== null) {
        row.rate = new Decimal(cross).toDecimalPlaces(6, Decimal.ROUND_HALF_UP);
      }
      this.emit();
    });
  }

  /**
   * Computed FX conversion pair — new behavior added per explicit user
   * request, NOT present in the traced baseline source (SSSS_PaymentDebit.js/
   * SSSS_PaymentCredit.js post exactly one entry per leg; see
   * business-case-runner's citation panel). Ensures every currency's own
   * Dr total equals its Cr total, not just the transaction-currency total
   * (V8): each currency-mismatched row gets a same-direction "Trx Ccy site"
   * entry (`FX Exchange <row.currency>`, amount = amountTxCcy) and an
   * opposite-direction "Other Ccy site" entry (`FX Exchange
   * <transactionCurrency>`, amount = amountAccountCcy) — together these net
   * to zero in both currencies, closing the gap the original single-leg
   * posting leaves open. Computed independently per side (Debit/Credit each
   * call this on their own instance — no cross-side dependency).
   */
  get fxPairs(): FxPairEntry[] {
    const nativeDrCr: 'D' | 'C' = this.side === 'DEBIT' ? 'D' : 'C';
    const oppositeDrCr: 'D' | 'C' = nativeDrCr === 'D' ? 'C' : 'D';
    const pairs: FxPairEntry[] = [];
    for (const row of this.rows) {
      if (!this.needsRate(row) || row.pct.lessThanOrEqualTo(0)) continue;
      pairs.push({
        drCr: nativeDrCr,
        account: `FX Exchange ${row.currency}`,
        currency: this.transactionCurrency,
        amount: row.amountTxCcy.toNumber(),
        site: 'Trx Ccy',
      });
      pairs.push({
        drCr: oppositeDrCr,
        account: `FX Exchange ${this.transactionCurrency}`,
        currency: row.currency,
        amount: this.accountCcyAmount(row),
        site: 'Other Ccy',
      });
    }
    return pairs;
  }

  onPctInput(row: Row, pct: number): void {
    row.pct = clampPct(pct);
    row.amountTxCcy = money(this.totalAmount.times(row.pct).dividedBy(100));
    this.fixRow(row);
  }

  onAmountInput(row: Row, amount: number): void {
    row.amountTxCcy = money(Decimal.max(new Decimal(amount || 0), 0));
    row.pct = this.totalAmount.greaterThan(0) ? row.amountTxCcy.dividedBy(this.totalAmount).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : new Decimal(0);
    this.fixRow(row);
  }

  onFieldChange(): void {
    this.emit();
  }

  onAccountTypeChange(row: Row, accountType: AccountType): void {
    row.accountType = accountType;
    if (accountType !== 'NOSTRO') row.rtgsIndicator = false;
    this.emit();
  }

  onRateInput(row: Row, value: number): void {
    row.rate = Decimal.max(new Decimal(value || 0), 0);
    this.emit();
  }

  /** Splits the current remainder into an explicit row (at its current %) plus a fresh 0% remainder after it. */
  addRow(): void {
    const remainder = this.rows.find((r) => r.isRemainder);
    if (remainder) {
      remainder.isRemainder = false;
    }
    this.ensureRemainderRow();
  }

  removeRow(row: Row): void {
    if (this.rows.length <= 1) return;
    this.rows = this.rows.filter((r) => r.id !== row.id);
    // Whatever the removed row held flows back into the remainder either way.
    this.ensureRemainderRow();
  }

  /**
   * Directly editing a row (remainder or not) fixes it at that value; the
   * leftover always flows into a single trailing remainder row.
   *
   * Bug this guards against: if the row being edited WAS the sole remainder,
   * fixing it here leaves NO row designated to absorb the leftover — without
   * this fallback, ensureRemainderRow() would just report an over/under-
   * allocated total (e.g. 110%) and require the user to manually retype a
   * SECOND field to bring it back to 100%, and it's easy for that manual
   * correction to land on an unintended split. Promoting another row to
   * remainder immediately means every single edit — including this one —
   * always resolves to exactly 100% on its own, so an inconsistent
   * intermediate state (that the user would have to do mental math to fix)
   * can never survive past one edit.
   */
  private fixRow(row: Row): void {
    const wasSoleRemainder = row.isRemainder && !this.rows.some((r) => r.id !== row.id && r.isRemainder);
    row.isRemainder = false;
    if (wasSoleRemainder) {
      const fallback = [...this.rows].reverse().find((r) => r.id !== row.id);
      if (fallback) fallback.isRemainder = true;
    }
    this.ensureRemainderRow();
  }

  /**
   * Recomputes whichever row is the remainder — WITHOUT reordering `this.rows`
   * for any row that already exists. This runs on every keystroke (via
   * onPctInput/onAmountInput), and earlier this method did
   * `this.rows = [...fixed, remainderRow]` — moving the remainder row to the
   * end of the array on every edit. Angular's *ngFor (even with trackBy)
   * physically relocates that row's DOM node in the page when its array
   * position changes, which drops focus / cursor position out from under the
   * input the user is actively typing into — that's what caused a previously
   * reported bug where typing a 2-digit % only registered the first digit (or
   * landed keystrokes in the wrong row), because the row got moved mid-edit.
   * A row's position in `rows` now never changes just because its
   * isRemainder flag flips — only genuine add/remove changes the array shape.
   */
  private ensureRemainderRow(): void {
    const fixed = this.rows.filter((r) => !r.isRemainder);
    const fixedPct = fixed.reduce((sum, r) => sum.plus(r.pct), new Decimal(0));
    const remaining = new Decimal(100).minus(fixedPct).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

    if (remaining.greaterThan(0.001)) {
      let remainderRow = this.rows.find((r) => r.isRemainder);
      if (!remainderRow) {
        remainderRow = this.makeRow(0, this.defaultAccountType, '', true);
        this.rows = [...this.rows, remainderRow]; // brand-new row — appending is the only order change that's actually happening.
      }
      remainderRow.pct = remaining;
      // Mortgage/loan-style rounding: the remainder row absorbs whatever's left
      // after the fixed rows' own (independently rounded) amounts, rather than
      // being independently rounded itself from its own percentage. Rounding
      // every row from its percentage (money(total * pct / 100)) can make the
      // rows sum to more or less than total — e.g. total=0.35 split 30/70 gives
      // 0.11 + 0.25 = 0.36, a cent over. Deriving the remainder as
      // total - sum(fixed) instead guarantees every split sums to exactly
      // totalAmount, matching how a final loan installment absorbs rounding.
      const fixedAmountSum = fixed.reduce((sum, r) => sum.plus(r.amountTxCcy), new Decimal(0));
      remainderRow.amountTxCcy = money(this.totalAmount.minus(fixedAmountSum));
      // Existing rows keep their current array position — no reassignment here.
    } else {
      // Fully allocated (or over-allocated) — no leftover to show a remainder row for.
      this.rows = fixed.length > 0 ? fixed : [this.makeRow(100, this.defaultAccountType, this.defaultAccountNo, true)];
    }
    this.emit();
  }

  private emit(): void {
    const legs: PaymentLegInput[] = this.rows
      .filter((r) => r.pct.greaterThan(0))
      .map((r) => {
        const leg: PaymentLegInput = {
          accountNo: r.accountNo,
          accountType: r.accountType,
          currency: r.currency,
          amountTxCcy: r.amountTxCcy.toFixed(2),
        };
        if (r.accountType === 'NOSTRO' && r.rtgsIndicator) {
          leg.rtgsIndicator = true;
        }
        if (this.needsRate(r)) {
          leg.amountAccountCcy = money(r.amountTxCcy.times(r.rate)).toFixed(2);
          if (this.side === 'DEBIT') leg.drBuyRate = r.rate.toFixed(6);
          else leg.crBuyRate = r.rate.toFixed(6);
        }
        return leg;
      });
    this.legsChange.emit(legs);
    const valid =
      legs.length > 0 && !this.isOverAllocated && legs.every((l) => l.accountNo.trim().length > 0 && Number(l.amountTxCcy) > 0);
    this.validChange.emit(valid);
  }
}
