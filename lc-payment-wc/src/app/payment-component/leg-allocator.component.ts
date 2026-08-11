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
  /**
   * B-Tree allocation driver (XOR — Percentage-driven vs Amount-driven,
   * never both): whichever field the user most recently typed into for
   * THIS row is authoritative; the other field is derived from it and must
   * never silently overwrite what the user actually typed. 'pct' means
   * amountTxCcy is free to rescale whenever the total changes (onTotalChange
   * recomputes it from pct); 'amount' means amountTxCcy — whether the user
   * typed it directly (onAmountInput) or via the row's own currency
   * (onAccountAmountInput) — stays FIXED across a total change, and only
   * pct is refreshed for display. Defaults to 'pct' for a freshly-created
   * remainder row (its % — "whatever's left" — is what defines it; the
   * remainder's own amount is always recomputed via exact subtraction in
   * ensureRemainderRow() regardless of this flag, so the default is mostly
   * inert until the row is fixed by a genuine user edit).
   */
  driver: 'pct' | 'amount';
}

/**
 * Per-A/C-Type placeholder account numbers, used ONLY by onAccountTypeChange below to replace a
 * row's Account No. the moment the user switches its A/C Type — otherwise the OLD type's account
 * number (e.g. "CUST-ACC") silently survives a switch to NOSTRO, reading as if that Nostro leg
 * genuinely posts to a customer account. Naming matches the convention already used throughout
 * business-case-registry.ts's own leg() defaults (CUST-ACC/NOSTRO-ACC/VOSTRO-ACC/INTERNAL-ACC).
 * Purely a same-page UI convenience — the field stays freely editable afterward, same as any other
 * row; this only seeds a sane, unambiguous starting value at the moment of the switch.
 */
const DEFAULT_ACCOUNT_NO_BY_TYPE: Record<AccountType, string> = {
  CUSTOMER: 'CUST-ACC',
  NOSTRO: 'NOSTRO-ACC',
  VOSTRO: 'VOSTRO-ACC',
  SUSPENSE: 'SUSPENSE-ACC',
  INTERNAL: 'INTERNAL-ACC',
};

let rowIdCounter = 0;

export interface FxPairEntry {
  drCr: 'D' | 'C';
  account: string;
  currency: string;
  amount: number;
  site: 'Trx Ccy' | 'Other Ccy';
  /**
   * The row's own exchange rate (row.rate) — only set on the 'Other Ccy' pair, since that's
   * the leg actually being converted (see fxPairs getter below). Display-only, shown in its
   * own "Rate" column (response-viewer.component.html/.ts's formatFxPairRate) — never sent to
   * the microservice, and never conflated with a real settlement entry's own
   * AccountEntry.exchangeRate1 (see CurrencyViewEntry's doc comment).
   */
  rate?: number;
}

/**
 * Rounds to `scale` decimal places, ROUND_HALF_UP — matches
 * microservices/payment-component/src/money.ts's own formatMonetaryAmount(value, scale)
 * convention for the same two reasons: this feeds MonetaryAmount fields on the wire (pattern
 * ^-?\d{1,18}(\.\d{1,3})?$), and split percentages (e.g. 33.33/33.33/33.34 over a large total)
 * can genuinely drift under binary-float math, which is exactly why the sibling microservice
 * uses decimal.js instead of native numbers for this class of arithmetic.
 *
 * `scale` is REQUIRED, never a hardcoded 2 — it must be the SPECIFIC currency's own minor units
 * (LegAllocatorComponent.scaleFor), which every call site below has: `this.transactionCurrency`
 * for an `amountTxCcy` figure, `row.currency` for an `amountAccountCcy`/Account Ccy Equivalent
 * figure. Rounding a JPY (0dp) or BHD/KWD (3dp) amount to a hardcoded 2dp — as this function used
 * to do unconditionally — produces a value the microservice's own H-2 currency-scale validation
 * then rejects (or, worse, silently accepts a value that's wrong for that currency), even though
 * the underlying figure was already a whole number / already within its own currency's precision.
 */
function money(value: Decimal.Value, scale: number): Decimal {
  return new Decimal(value).toDecimalPlaces(scale, Decimal.ROUND_HALF_UP);
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
 * A protected total + transaction currency anchors every row's amount.
 * B-Tree allocation rule, per row (see Row.driver): Percentage-driven XOR
 * Amount-driven — never both at once. Typing a % makes that row
 * Percentage-driven (its amount is derived and free to rescale whenever the
 * total changes); typing an amount (in either the transaction currency via
 * onAmountInput, or the row's own currency via onAccountAmountInput) makes
 * it Amount-driven (that figure is authoritative and stays fixed across a
 * total change — only its derived % is refreshed). Exactly one row is
 * always the auto-computed remainder (100% − every fixed row), so the
 * side's rows always sum to exactly 100% of the total by construction.
 * Editing any row (including the remainder) fixes it at that value and
 * reflows the leftover into a (possibly new) remainder row — "add another
 * column" from the user's spec. A row's currency may differ from the
 * transaction currency; when it
 * does, an exchange rate becomes editable, and the row's amount can be
 * entered EITHER in the transaction currency (Amount (Tx Ccy)) OR directly in
 * the row's own currency (Account Ccy Equiv. — onAccountAmountInput), each
 * deriving the other via amountAccountCcy = amountTxCcy × rate (mirroring
 * money.ts's convertTxCcyToAccountCcy) — only one of the two is editable at a
 * time per row (whichever the template shows as an <input> vs. a computed
 * <span>), so there's exactly one source of truth for a given edit.
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
  /**
   * Stable identity of the business case currently seeding this allocator
   * (business-case-runner.component.html passes `selectedCase?.id`) — the
   * ONLY signal ngOnChanges treats as "a genuinely new case was selected,
   * hard-reset back to a single 100% row." Regression this guards against:
   * `initialTotalAmount`/`initialCurrency` are themselves DERIVED, live
   * values (business-case-runner's sideDefaults() reconverts Suspense entries
   * against the live transaction currency, which is itself sourced from this
   * component's own emitted legs — see that getter's doc comment) — so they
   * legitimately change value on the SAME case too, e.g. whenever the user
   * edits a row's own currency (onRowCurrencyChange) and that changes what
   * the live transaction currency resolves to. Treating every such change as
   * "new case" (the old logic, inferred from defaultAccountType/
   * defaultRtgsIndicator alone) reset() the whole side back to one row on
   * every currency edit — silently reverting the very edit the user just
   * made. Only a caseKey change reset()s now; a same-case
   * initialTotalAmount/initialCurrency change instead rescales/resyncs in
   * place (see ngOnChanges below), preserving the user's split and any
   * per-row currency divergence.
   */
  @Input({ required: true }) caseKey!: string;
  /** When false, hides the "Total Amount (protected)" input so it isn't shown a second time next to a caller's own Total Amount summary (e.g. business-case-runner's Unit-Code-row display). The Transaction Currency select stays visible either way — this only suppresses the amount input, not currency editing. Purely a display toggle: totalAmount/onTotalChange still work exactly as before, still seeded from initialTotalAmount. */
  @Input() showTotalAmount = true;

  @Output() legsChange = new EventEmitter<PaymentLegInput[]>();
  /** True once every row has an account number and (when split) a valid rate — parent gates preview calls on this. */
  @Output() validChange = new EventEmitter<boolean>();
  /**
   * H-2 companion: messages for any row whose amount was typed with more
   * decimal places than its currency allows (Currency API decimals). Emitted
   * alongside legsChange so the parent (business-case-runner) can block the
   * live preview / Confirm — the same guard it already applies to the header
   * Total Amount and Suspense entries.
   */
  @Output() scaleErrorsChange = new EventEmitter<string[]>();

  totalAmount = new Decimal(0);
  transactionCurrency = '';
  rows: Row[] = [];

  /**
   * Per-row over-precision messages, keyed by row id — set at INPUT time
   * (onAmountInput / onAccountAmountInput) against the RAW typed value, because
   * those handlers immediately money()-round to the relevant currency's own scale, so the raw
   * over-precision ("9999.112") survives nowhere else. Cleared when the row's amount is
   * re-driven cleanly (% edit) or its currency changes (the allowed scale
   * changed and there is no stored raw value to re-check).
   */
  private readonly rowScaleErrors = new Map<number, string>();
  /** Currency minor-unit places from CurrencyService.decimals() ("Get Currency API"). */
  private currencyDecimals: Record<string, number> = {};

  /** "Get Currency API" (currency.service.ts) — populates the Transaction/Leg Currency dropdowns below. */
  readonly currencies$: Observable<string[]>;

  constructor(private readonly fx: FxRateService, currency: CurrencyService) {
    this.currencies$ = currency.codes();
    currency.decimals().subscribe((d) => {
      this.currencyDecimals = d;
    });
  }

  private decimalPlacesOf(value: number): number {
    const s = String(value);
    const dot = s.indexOf('.');
    return dot === -1 ? 0 : s.length - dot - 1;
  }

  /**
   * Minor-unit decimal places for `currency` from the Currency API (CurrencyService.decimals()),
   * falling back to 2 for a currency absent from the map (unknown, or not yet loaded) — same
   * fallback convention business-case-runner.component.ts's own decimalsFor() uses. Feeds every
   * money()/toFixed() call below so a row's amounts round to ITS OWN currency's precision (JPY =
   * 0dp, BHD/KWD = 3dp, etc.), never a hardcoded 2dp.
   */
  private scaleFor(currency: string): number {
    return this.currencyDecimals[currency] ?? 2;
  }

  /**
   * Record/clear a row's over-precision error from a RAW typed amount against
   * `currency`'s minor units. A currency absent from the Currency master (or
   * not loaded yet) is skipped — the Currency API is the source of truth, so
   * no limit is invented (mirrors the microservice's knownMinorUnitsForCurrency).
   */
  private checkRowScale(row: Row, rawValue: number, currency: string): void {
    const max = this.currencyDecimals[currency];
    if (max === undefined) {
      this.rowScaleErrors.delete(row.id);
      return;
    }
    const dp = this.decimalPlacesOf(rawValue);
    if (dp > max) {
      this.rowScaleErrors.set(
        row.id,
        `${this.side} leg amount ${rawValue} has ${dp} decimal place(s) but ${currency} allows at most ${max}.`,
      );
    } else {
      this.rowScaleErrors.delete(row.id);
    }
  }

  /** Over-precision messages for the CURRENT rows (stale ids for removed rows are ignored). */
  get amountScaleErrors(): string[] {
    return this.rows
      .map((r) => this.rowScaleErrors.get(r.id))
      .filter((m): m is string => m !== undefined);
  }

  ngOnInit(): void {
    this.reset();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['caseKey']) {
      // ngOnInit's reset() already ran for the very first binding — only re-reset on a LATER
      // change (the parent switched to a genuinely different business case).
      if (!changes['caseKey'].firstChange) this.reset();
      return;
    }

    // Same case — initialTotalAmount/initialCurrency still moved (a live reseed: Suspense
    // entries changed, or the transaction currency the seed was converted against did). Rescale/
    // resync the EXISTING rows in place rather than reset()ing — see caseKey's doc comment above
    // for why a hard reset here silently reverts the user's own split/currency edits.
    if (changes['initialTotalAmount']) {
      this.onTotalChange(Number(this.initialTotalAmount) || 0);
    }
    if (changes['initialCurrency']) {
      this.onCurrencyChange(this.initialCurrency);
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
      amountTxCcy: money(this.totalAmount.times(pctDecimal).dividedBy(100), this.scaleFor(this.transactionCurrency)),
      rate: new Decimal(1),
      exchangeAccountNo: '',
      dealNumber: '',
      isRemainder,
      driver: 'pct',
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
    return money(row.amountTxCcy.times(row.rate), this.scaleFor(row.currency)).toNumber();
  }

  /**
   * B-Tree allocation rule (Percentage-driven XOR Amount-driven — see Row.driver):
   * a row's amount-driven amount (typed via onAmountInput OR
   * onAccountAmountInput — either is "Amount" as far as this XOR is
   * concerned, regardless of which currency it was typed in) MUST stay
   * exactly what the user typed, even when this method fires again later
   * because the SEEDED total moved for an unrelated reason (a Suspense
   * entry changed, re-seeding business-case-runner's
   * debitDefaults().totalAmount, which reaches this component via
   * ngOnChanges -> onTotalChange). Regression this generalizes: an earlier
   * fix protected only FOREIGN-currency amount-driven rows (via a
   * needsRate() proxy for "was edited via onAccountAmountInput"), missing
   * the identical risk for a SAME-currency row the user drove via
   * onAmountInput directly — that row's typed amount would silently drift
   * whenever the total re-seeded, exactly like the foreign-row bug. The
   * explicit driver flag covers both uniformly. Percentage-driven
   * (non-remainder) rows are still rescaled by their existing % — the
   * pre-existing, correct behavior for that side of the XOR (see the
   * passing 'rescales every row amount to match its existing percentage'
   * test); amount-driven rows only get their pct refreshed, for display.
   *
   * The remainder row is NOT rescaled by its own stale % either — that would
   * implicitly assume every OTHER row (including now-fixed amount-driven
   * ones) scales proportionally too, which is exactly what this fix prevents,
   * producing a double-rounded/wrong remainder (verified against a
   * regression test: total 10000->10110 with a fixed EUR-40 row rescaled the
   * USD remainder to 10065.52 via %, not the exact 10066 = 10110-44).
   * ensureRemainderRow() instead recomputes it EXACTLY as
   * totalAmount − Σ(every other row's now-correct amount), matching how a
   * fresh remainder is always computed elsewhere in this component.
   */
  onTotalChange(value: number): void {
    this.totalAmount = new Decimal(value || 0);
    for (const row of this.rows) {
      if (row.isRemainder) continue; // recomputed exactly by ensureRemainderRow() below
      if (row.driver === 'amount') {
        row.pct = this.totalAmount.greaterThan(0)
          ? row.amountTxCcy.dividedBy(this.totalAmount).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
          : new Decimal(0);
      } else {
        row.amountTxCcy = money(this.totalAmount.times(row.pct).dividedBy(100), this.scaleFor(this.transactionCurrency));
      }
    }
    this.ensureRemainderRow();
  }

  onCurrencyChange(value: string): void {
    // Transaction currency changed — the allowed scale for every Tx-Ccy amount changed too, and no
    // raw typed value is retained to re-check against; clear stale over-precision flags.
    this.rowScaleErrors.clear();
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
    // Row's own currency changed — its allowed scale changed; clear any stale over-precision flag.
    this.rowScaleErrors.delete(row.id);
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
        rate: row.rate.toNumber(),
      });
    }
    return pairs;
  }

  onPctInput(row: Row, pct: number): void {
    // %-driven amount is recomputed via money() (rounded to the transaction currency's own scale) — any prior over-precision on this row is gone.
    this.rowScaleErrors.delete(row.id);
    row.driver = 'pct';
    row.pct = clampPct(pct);
    row.amountTxCcy = money(this.totalAmount.times(row.pct).dividedBy(100), this.scaleFor(this.transactionCurrency));
    this.fixRow(row);
  }

  onAmountInput(row: Row, amount: number): void {
    // Amount (Tx Ccy) is denominated in the transaction currency — validate the RAW typed value now,
    // before money() rounds it to the transaction currency's own scale (which would silently discard
    // any over-precise digits).
    this.checkRowScale(row, amount, this.transactionCurrency);
    row.driver = 'amount';
    row.amountTxCcy = money(Decimal.max(new Decimal(amount || 0), 0), this.scaleFor(this.transactionCurrency));
    row.pct = this.totalAmount.greaterThan(0) ? row.amountTxCcy.dividedBy(this.totalAmount).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : new Decimal(0);
    this.fixRow(row);
  }

  /**
   * NOT FSD-sourced — lets the user type a foreign-currency row's amount
   * directly in ITS OWN currency (the "Account Ccy Equiv." column, editable
   * only when needsRate(row)), per explicit user request for the Suspense
   * netting feature: "Debit Leg = EUR 20" means the leg genuinely posts
   * EUR 20, not "20 units of the transaction currency settling into an EUR
   * account." amountTxCcy — which the wire/%-split math/V8 balance check all
   * still treat as the transaction-currency figure (see the Row.amountTxCcy
   * field doc comment) — is derived from this input by dividing back through
   * the row's own rate: amountTxCcy = accountAmount ÷ rate. For a
   * same-currency row (rate always 1 there) this would be a no-op; the
   * template only renders this input when needsRate(row) is true, so rate is
   * never 0 there in practice, but guard anyway rather than divide by zero.
   */
  onAccountAmountInput(row: Row, accountAmount: number): void {
    // Account Ccy Equiv. is denominated in the ROW's own currency — validate the RAW typed value now.
    this.checkRowScale(row, accountAmount, row.currency);
    row.driver = 'amount';
    const amount = Decimal.max(new Decimal(accountAmount || 0), 0);
    // Deriving amountTxCcy (always transaction-currency-denominated — see the Row field doc
    // comment), so it rounds to the TRANSACTION currency's own scale, not row.currency's.
    row.amountTxCcy = row.rate.greaterThan(0) ? money(amount.dividedBy(row.rate), this.scaleFor(this.transactionCurrency)) : new Decimal(0);
    row.pct = this.totalAmount.greaterThan(0) ? row.amountTxCcy.dividedBy(this.totalAmount).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : new Decimal(0);
    this.fixRow(row);
  }

  onFieldChange(): void {
    this.emit();
  }

  /**
   * Switching A/C Type also resets Account No. to that type's own default placeholder — the field
   * stays free text and freely re-editable, but leaving the PRIOR type's account number behind
   * (e.g. still "CUST-ACC" after switching CUSTOMER -> NOSTRO) reads as if this leg genuinely posts
   * to a customer account, which is exactly the confusion this avoids. Only fires on a real type
   * switch (the template's ngModelChange only emits on a change), so this never clobbers an
   * in-progress edit to the same type.
   */
  onAccountTypeChange(row: Row, accountType: AccountType): void {
    row.accountType = accountType;
    if (accountType !== 'NOSTRO') row.rtgsIndicator = false;
    row.accountNo = DEFAULT_ACCOUNT_NO_BY_TYPE[accountType];
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
    this.rowScaleErrors.delete(row.id);
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
      remainderRow.amountTxCcy = money(this.totalAmount.minus(fixedAmountSum), this.scaleFor(this.transactionCurrency));
      // Existing rows keep their current array position — no reassignment here.
    } else {
      // Fully allocated (or over-allocated) — no leftover to show a remainder row for.
      this.rows = fixed.length > 0 ? fixed : [this.makeRow(100, this.defaultAccountType, this.defaultAccountNo, true)];
    }
    this.emit();
  }

  /**
   * v1.10.0: the server now takes the transaction currency from an explicit
   * request field (business-case-runner.component.ts's own transactionCurrency
   * getter, sent as PaymentInstructionConfirmRequest.transactionCurrency —
   * see that getter's doc comment for why it's deliberately NOT derived from
   * any leg's own currency), so `legs[0].currency` no longer needs to match
   * this.transactionCurrency for the server to classify correctly — the
   * pre-v1.10.0 fallback (debitLegs[0].currency) only matters for callers that
   * omit the new field. Kept as a display/readability nicety regardless: a
   * leg whose OWN currency matches the shared Transaction Currency reads more
   * naturally first in the array (and in anything that iterates it, e.g. the
   * Settlement Vouchers table) than one that needed an FX rate to get there.
   */
  private emit(): void {
    const legs: PaymentLegInput[] = this.rows
      .filter((r) => r.pct.greaterThan(0))
      .map((r) => {
        const leg: PaymentLegInput = {
          accountNo: r.accountNo,
          accountType: r.accountType,
          currency: r.currency,
          // amountTxCcy is always transaction-currency-denominated (see the Row field doc
          // comment) — formatted to ITS scale, not a hardcoded 2dp, so e.g. a JPY transaction
          // currency (0dp) never puts a fractional ".00" on the wire that the microservice's
          // own H-2 currency-scale validation would then reject.
          amountTxCcy: r.amountTxCcy.toFixed(this.scaleFor(this.transactionCurrency)),
        };
        if (r.accountType === 'NOSTRO' && r.rtgsIndicator) {
          leg.rtgsIndicator = true;
        }
        if (this.needsRate(r)) {
          // amountAccountCcy is denominated in the ROW's OWN currency — formatted to ITS scale,
          // same reasoning as amountTxCcy above (this is the field the JPY Account Ccy
          // Equivalent bug actually shipped on the wire, not just in the display).
          const rowScale = this.scaleFor(r.currency);
          leg.amountAccountCcy = money(r.amountTxCcy.times(r.rate), rowScale).toFixed(rowScale);
          if (this.side === 'DEBIT') leg.drBuyRate = r.rate.toFixed(6);
          else leg.crBuyRate = r.rate.toFixed(6);
        }
        return leg;
      })
      .sort((a, b) => {
        const aMatch = a.currency === this.transactionCurrency;
        const bMatch = b.currency === this.transactionCurrency;
        return aMatch === bMatch ? 0 : aMatch ? -1 : 1;
      });
    this.legsChange.emit(legs);
    const valid =
      legs.length > 0 && !this.isOverAllocated && legs.every((l) => l.accountNo.trim().length > 0 && Number(l.amountTxCcy) > 0);
    this.validChange.emit(valid);
    this.scaleErrorsChange.emit(this.amountScaleErrors);
  }
}
