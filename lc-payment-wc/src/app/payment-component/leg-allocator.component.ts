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
  /**
   * The EXACT account-currency amount most recently typed via onAccountAmountInput, kept
   * alongside (not instead of) amountTxCcy — null whenever it doesn't apply (never typed that
   * way, or invalidated by a later edit; see every assignment site below). Reviewer-reported
   * round-trip bug this fixes: amountTxCcy is always rounded to the TRANSACTION currency's own
   * scale (by design — see that field's own doc comment; it's what the wire/%-split math/V8
   * balance check all operate on), so re-deriving the account-ccy figure as
   * amountTxCcy × rate for display/wire (accountCcyAmount()/emit()) silently loses precision
   * whenever the row's own currency has COARSER minor units than the transaction currency's —
   * concretely, typing JPY 20000 (rate 149.0825) computes amountTxCcy = money(20000/149.0825, 2dp)
   * = 134.15 (the exact quotient is 134.15389…, rounded down), and re-deriving from THAT
   * (134.15 × 149.0825 = 19999.42, rounded to JPY's 0dp) reads back as 19999, not the 20000 the
   * user actually typed. Storing the raw account-ccy figure here and preferring it over the
   * derivation (whenever it's still valid) makes that edit round-trip exactly. Only ever set by
   * onAccountAmountInput, and only when the edit wasn't capped by the waterfall (a capped edit's
   * actual amountTxCcy differs from what the raw account-ccy figure would imply, so the
   * derivation — not the stale override — is the correct value there). Cleared by every OTHER
   * thing that changes what this row's amount/currency/rate means: onAmountInput (the OTHER
   * input surface for the same underlying amountTxCcy — now THAT'S the authoritative edit),
   * onPctInput, onRowCurrencyChange, onCurrencyChange, and markCascaded (this row's amount moved
   * for a reason that has nothing to do with a fresh account-ccy retype — a waterfall donor/
   * receiver, a Total Amount absorption, or a newly-spawned row).
   */
  accountCcyOverride: Decimal | null;
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
  /**
   * Per-foreign-currency Suspense breakdown for THIS side (business-case-runner's
   * debitSuspenseCurrencyTotals/creditSuspenseCurrencyTotals — see those getters' own doc
   * comments), keyed by currency: `rawTotal` is that currency's Σ Suspense entry.amount (untouched);
   * `trxEquivalent` is the SAME per-entry-rounded conversion suspenseAdjustment()/the server's own
   * buildSuspenseBridgeLeg use to fund it — i.e. what this side's seeded Total Amount actually
   * expects that bucket to contribute. Consumed only by onAccountAmountInput's granularity-snap
   * below; every other computation in this component is unaffected. Defaults to `{}` (no snapping)
   * for any caller that doesn't wire this input.
   */
  @Input() suspenseCurrencyTotals: Record<string, { rawTotal: string; trxEquivalent: string }> = {};

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
      accountCcyOverride: null,
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

  /**
   * Amount (Tx Ccy) input tooltip — describes whichever rebalancing rule editing THIS row would
   * actually trigger (see applyAmountWaterfall's doc comment for the full rule). Only the
   * single-row, not-yet-split case still gets the old "Remainder" message — a row that's still
   * marked isRemainder in a genuine multi-row split goes through the SAME waterfall as any other
   * row now (see finishAmountEdit), so it gets the ordinary first/middle/last message too.
   */
  amountInputTitle(row: Row): string {
    if (this.rows.length <= 1) {
      return row.isRemainder ? "Remainder — editing it fixes this row and opens a new remainder for what's left" : '';
    }
    const index = this.rows.indexOf(row);
    if (index === this.rows.length - 1) return 'Last leg — decreasing creates a new leg to hold the difference; increasing draws from the leg(s) before it.';
    return 'Increasing decreases the LAST leg by the same amount; decreasing increases the LAST leg by the same amount.';
  }

  accountCcyAmount(row: Row): number {
    return this.accountCcyAmountDecimal(row).toNumber();
  }

  /**
   * Prefers row.accountCcyOverride (the exact figure last typed via onAccountAmountInput, when
   * still valid) over re-deriving amountTxCcy × rate — see the Row.accountCcyOverride field doc
   * comment for the precision-loss bug this avoids. Shared by the public accountCcyAmount()
   * getter (template display) and emit() (the wire's amountAccountCcy) so both read the same
   * value — the whole point is that what's displayed is exactly what gets sent.
   */
  private accountCcyAmountDecimal(row: Row): Decimal {
    if (row.accountCcyOverride !== null) return money(row.accountCcyOverride, this.scaleFor(row.currency));
    return money(row.amountTxCcy.times(row.rate), this.scaleFor(row.currency));
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
   *
   * v1.12.2 (reviewer-confirmed 2026-08-11): once every row is amount-driven (no floating
   * remainder row left — the normal state after using the Amount waterfall), the loop above still
   * leaves every amount-driven row's OWN amount untouched (only its display % refreshes) — by
   * design, per the doc comment above. The gap that opens up between Σ(all rows) and the NEW
   * totalAmount is what absorbTotalDeltaIntoLastRow() below resolves, targeting the LAST row
   * specifically rather than letting ensureRemainderRow's own amount-based routing spawn/grow a
   * brand-new row for it (which is what would otherwise happen, per v1.12.1). Reviewer's rule,
   * worked through with concrete examples until unambiguous: an INCREASE just adds directly to the
   * last row (no cascading — growing the total doesn't require taking money from anywhere); a
   * DECREASE subtracts from the last row and, if it alone can't cover it without going negative,
   * continues subtracting from the row before it, and so on — capped at 0 per row, same
   * "no-negative" precedent as applyAmountWaterfall's own increase-draw cascade. When a genuine
   * remainder row still exists (the split isn't yet fully amount-driven), this step is skipped
   * entirely — ensureRemainderRow's EXISTING exact-subtraction handling of that row already does
   * the right thing, unchanged.
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
    if (!this.rows.some((r) => r.isRemainder)) this.absorbTotalDeltaIntoLastRow();
    this.ensureRemainderRow();
  }

  /**
   * v1.12.2 — called from onTotalChange only, and only when no row is currently the floating
   * remainder (see that method's own doc comment for the full rule and reviewer citation). Every
   * OTHER row's amount is left exactly as onTotalChange's own loop set it (unchanged for
   * amount-driven rows, freshly rescaled via % for pct-driven ones) — this only ever touches the
   * LAST row, and — on a decrease that exceeds it — rows before it, in strict back-to-front order.
   */
  private absorbTotalDeltaIntoLastRow(): void {
    if (this.rows.length === 0) return;
    const scale = this.scaleFor(this.transactionCurrency);
    const currentSum = this.rows.reduce((sum, r) => sum.plus(r.amountTxCcy), new Decimal(0));
    const gap = money(this.totalAmount.minus(currentSum), scale);
    if (gap.isZero()) return;

    const last = this.rows[this.rows.length - 1]!;
    if (gap.greaterThan(0)) {
      // Total grew — the new money just adds to the last row directly. No cascading: growing the
      // total doesn't require taking anything from any other row.
      last.amountTxCcy = last.amountTxCcy.plus(gap);
      this.markCascaded(last);
      return;
    }

    // Total shrank — remove |gap| starting from the last row; if it alone can't cover the full
    // decrease without going negative, keep removing from the row before it, and so on. Capped at
    // 0 per row (never negative) — if every row drains to 0 and a shortfall remains, that's the
    // same "capped to whatever was actually available" precedent applyAmountWaterfall's own
    // increase-draw cascade already establishes; nothing further to do.
    let remaining = gap.abs();
    for (let j = this.rows.length - 1; j >= 0 && remaining.greaterThan(0); j--) {
      const row = this.rows[j]!;
      const take = Decimal.min(row.amountTxCcy, remaining);
      if (take.isZero()) continue;
      row.amountTxCcy = row.amountTxCcy.minus(take);
      this.markCascaded(row);
      remaining = remaining.minus(take);
    }
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
      // The transaction currency itself moved — every row's amountTxCcy is now denominated
      // relative to a different currency, so a previously-exact account-ccy figure (typed against
      // the OLD transaction currency's rate/rounding) no longer round-trips reliably. See
      // Row.accountCcyOverride.
      row.accountCcyOverride = null;
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
    // Any account-ccy figure typed under the OLD currency doesn't mean anything under the new
    // one. See Row.accountCcyOverride.
    row.accountCcyOverride = null;
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

  /**
   * % input tooltip — the % mirror of amountInputTitle above (see that method's own doc comment
   * for the single-row exemption). A genuine multi-row split gets the same "always the last leg"
   * phrasing as the Amount waterfall, plus a note that % is whole-percentage-point only.
   */
  pctInputTitle(row: Row): string {
    if (this.rows.length <= 1) {
      return row.isRemainder ? "Remainder — editing it fixes this row and opens a new remainder for what's left" : '';
    }
    const index = this.rows.indexOf(row);
    if (index === this.rows.length - 1) {
      return 'Last leg — decreasing creates a new leg to hold the difference; increasing draws from the leg(s) before it. Whole percentage points only (1%) — use Amount for a finer split.';
    }
    return "Increasing decreases the LAST leg's % by the same amount; decreasing increases the LAST leg's % by the same amount. Whole percentage points only (1%) — use Amount for a finer split.";
  }

  /**
   * % waterfall — the same 4-rule model as applyAmountWaterfall above (business-requirement-
   * confirmed 2026-08-12, explicitly requested as "same as Amount調整規則"), applied to `row.pct`
   * instead of `row.amountTxCcy`:
   *
   * 1. Non-last row, % increase → decreases the LAST row's % by the same amount, capped at
   *    whatever the last row currently has (never negative). Reviewer: "非最後一筆%調升調升 都調
   *    到最後一筆" (non-last-row inc/dec always targets the last row, never the adjacent row).
   * 2. Non-last row, % decrease → increases the LAST row's % by the exact freed amount (always
   *    fully absorbed — the same 100% total, minus one row, plus the same amount elsewhere).
   * 3. Last row, % decrease → auto-creates a new trailing row holding exactly the freed %
   *    difference (Account No. defaults to the account TYPE's own placeholder,
   *    `DEFAULT_ACCOUNT_NO_BY_TYPE[defaultAccountType]` — same convention as Amount rule 3).
   *    Reviewer: "最後一筆調降 % 新增一筆 Account Number 根據 Account Type Default Account
   *    Number".
   * 4. Last row, % increase → draws from the row immediately before it, cascading further back
   *    if one row alone can't cover it, each donor capped at 0 (never negative). Reviewer: "最後
   *    一筆調升% 減少上一筆%比例 不足再繼續往上調降".
   *
   * Because % only ever moves BETWEEN existing rows (or into a freshly-created one, rule 3), Σ %
   * across all rows never changes and — critically — never goes negative on any single row
   * (reviewer: "調降後不得小於0% i.e. 單筆%不能為負數") and never exceeds 100% in total (reviewer:
   * "總比例不得超過100%") — both are structural invariants of this method, not separately
   * validated. `requestedPct` is always already an integer (0–100) by the time this is called —
   * see onPctInput's own rounding — so every row this method touches also stays an integer; no
   * separate rounding needed here.
   *
   * Every row this method actually touches (the last row, any donor row during rule 4's backward
   * cascade, or a newly-created row under rule 3 — via markPctCascaded — NOT the edited row
   * itself, which the caller (onPctInput) still finishes) becomes driver:'pct'/isRemainder:false,
   * exactly as if the user had typed that row's % directly.
   *
   * Deliberately independent of applyAmountWaterfall — a % edit never triggers the Amount
   * waterfall and vice versa; the two are separate input surfaces for the same underlying
   * amountTxCcy/pct pair (see Row.driver), each managing its own rebalancing the same way Total
   * Amount header changes (absorbTotalDeltaIntoLastRow) stay independent of both per-leg
   * waterfalls.
   */
  private applyPctWaterfall(index: number, requestedPct: Decimal): { finalPct: Decimal } {
    const rows = this.rows;
    const row = rows[index]!;
    const oldPct = row.pct;
    const delta = requestedPct.minus(oldPct);
    if (delta.isZero()) return { finalPct: oldPct };

    const lastIndex = rows.length - 1;

    if (index === lastIndex) {
      if (delta.isNegative()) {
        // Rule 3 — last row decrease: create a new trailing row for the freed % difference.
        const freed = oldPct.minus(requestedPct);
        const newRow = this.makeRow(freed, this.defaultAccountType, DEFAULT_ACCOUNT_NO_BY_TYPE[this.defaultAccountType], false);
        this.rows = [...this.rows, newRow];
        this.markPctCascaded(newRow);
        return { finalPct: requestedPct };
      }
      // Rule 4 — last row increase: draw from the row(s) before it, cascading backward, capped at 0.
      let remaining = delta;
      let drawn = new Decimal(0);
      for (let j = index - 1; j >= 0 && remaining.greaterThan(0); j--) {
        const donor = rows[j]!;
        const take = Decimal.min(donor.pct, remaining);
        if (take.isZero()) continue;
        donor.pct = donor.pct.minus(take);
        this.markPctCascaded(donor);
        this.pruneZeroRow(donor); // fully drained (0%/0) — remove the now-empty leg (2026-08-12)
        remaining = remaining.minus(take);
        drawn = drawn.plus(take);
      }
      return { finalPct: oldPct.plus(drawn) }; // capped to `drawn` if earlier rows couldn't fully cover the request
    }

    // NOT the last row — rules 1 & 2: any change here offsets directly against the LAST row,
    // regardless of this row's own position (first or middle), never the adjacent neighbor.
    const last = rows[lastIndex]!;
    if (delta.isPositive()) {
      // Rule 1 — non-last row increase: decrease the last row by the same amount, capped at what it has.
      const take = Decimal.min(last.pct, delta);
      last.pct = last.pct.minus(take);
      this.markPctCascaded(last);
      this.pruneZeroRow(last); // the cap fully drained the last row (0%/0) — remove it (2026-08-12)
      return { finalPct: oldPct.plus(take) }; // capped to `take` if the last row couldn't fully cover the request
    }
    // Rule 2 — non-last row decrease: increase the last row by the exact freed amount (always fully absorbed).
    const freed = oldPct.minus(requestedPct);
    last.pct = last.pct.plus(freed);
    this.markPctCascaded(last);
    return { finalPct: requestedPct };
  }

  /** Fixes a donor/receiver/new row touched by applyPctWaterfall above — the % mirror of markCascaded. */
  private markPctCascaded(row: Row): void {
    row.driver = 'pct';
    row.isRemainder = false;
    row.amountTxCcy = money(this.totalAmount.times(row.pct).dividedBy(100), this.scaleFor(this.transactionCurrency));
    this.rowScaleErrors.delete(row.id); // programmatic move via exact Decimal arithmetic — never over-precise.
    // This row's amount just moved for a reason that has nothing to do with a fresh account-ccy
    // retype — see Row.accountCcyOverride.
    row.accountCcyOverride = null;
  }

  /**
   * % is whole-percentage-point only (reviewer-confirmed 2026-08-12: "輸入比例保留 但以整數輸入
   * ％為主" — keep free-text %, but integer only; a split needing finer-than-1% precision must
   * use Amount instead — "如果不是整數調整% 用戶須改用金額調整模式"). `clampPct` bounds to
   * [0, 100] first (unchanged, existing behavior), then rounded to 0dp — matches this component's
   * own money()/scaleFor() convention of never leaving a scale implicit.
   */
  onPctInput(row: Row, pct: number): void {
    this.rowScaleErrors.delete(row.id);
    const requested = clampPct(pct).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    const index = this.rows.indexOf(row);
    const wentThroughWaterfall = this.rows.length > 1 && index !== -1;
    if (wentThroughWaterfall) {
      const { finalPct } = this.applyPctWaterfall(index, requested);
      row.pct = finalPct;
    } else {
      row.pct = requested;
    }
    row.driver = 'pct';
    row.amountTxCcy = money(this.totalAmount.times(row.pct).dividedBy(100), this.scaleFor(this.transactionCurrency));
    row.accountCcyOverride = null; // recomputed via %, not a fresh account-ccy retype — see Row.accountCcyOverride
    this.finishPctEdit(row, wentThroughWaterfall);
    // Scoped to the genuine multi-row waterfall only — NOT the single-row (not-yet-split) bypass,
    // where fixRow()'s pre-existing "typing a smaller value splits off a new remainder" behavior
    // must keep showing the edited row at its own (possibly 0) value, not silently vanish it in
    // favor of the freshly-spawned remainder (which would make e.g. "clamp a negative input to 0"
    // unobservable on the row the user actually edited).
    if (wentThroughWaterfall && this.pruneZeroRow(row)) this.emit(); // the edited row itself settled at 0%/0 — remove it (2026-08-12)
  }

  /**
   * Finishes a % edit — the % mirror of finishAmountEdit above. When the waterfall actually ran,
   * it already manages exactly which rows exist and their %/amounts (including creating a
   * brand-new trailing row on a last-leg decrease), so this just clears the edited row's OWN
   * isRemainder flag and runs ensureRemainderRow() as a consistency pass (a no-op in practice,
   * since Σ % already equals 100 exactly by construction). Deliberately does NOT call fixRow() for
   * the same reason finishAmountEdit doesn't — fixRow's fallback-promotion is built for the OLD
   * one-remainder-row model and would otherwise silently reassign an unrelated, already-correct
   * row's isRemainder flag even though the waterfall already balanced everything exactly.
   *
   * When the waterfall did NOT run (still a single, not-yet-split row), delegates to fixRow(row) —
   * the ORIGINAL, unchanged "typing a smaller % splits off a new remainder row" behavior.
   */
  private finishPctEdit(row: Row, wentThroughWaterfall: boolean): void {
    if (wentThroughWaterfall) {
      row.isRemainder = false;
      this.ensureRemainderRow();
    } else {
      this.fixRow(row);
    }
  }

  /**
   * User-requested "waterfall" rebalancing rule (business-requirement-confirmed, v1.12.3
   * REPLACES the earlier v1.12.0 "adjacent neighbor" model — see below) for editing an Amount
   * (Tx Ccy) — kicks in whenever the side already has more than one row (`rows.length > 1`, a
   * genuine multi-leg split), REGARDLESS of whether the edited row is currently the remainder
   * (see finishAmountEdit's own doc comment for why an earlier `!row.isRemainder` gate here was a
   * bug). The LAST row is the universal counterparty for every OTHER row; only the last row's own
   * edits have their own distinct rules. Four cases, all reviewer-confirmed with worked numeric
   * examples (2026-08-11):
   *
   * 1. INCREASE on a NON-last row → decreases the LAST row by the same amount, capped at whatever
   *    the last row actually has (never negative) — a single direct offset, NOT cascading through
   *    any other row. Reviewer: "不是最後一筆增加金額 就減少至最後一筆幣別等值".
   * 2. DECREASE on a NON-last row → increases the LAST row by the exact freed amount — always
   *    fully absorbed, since increasing has no capacity limit. Reviewer: "不是最後一筆減少金額加
   *    增加至最後一筆幣別等值".
   * 3. DECREASE on the LAST row → auto-CREATES A NEW ROW (Account No. defaults to the account
   *    TYPE's own placeholder — `DEFAULT_ACCOUNT_NO_BY_TYPE[defaultAccountType]`, e.g. `CUST-ACC`
   *    — same convention onAccountTypeChange already uses; same transaction currency) at the end
   *    of the array, holding exactly the freed difference — the edited row becomes leg N, the new
   *    row becomes leg N+1, so a further decrease on the (still-)last row keeps working the same
   *    way, cascading into yet another fresh row each time. This is the ONLY place
   *    applyAmountWaterfall grows `this.rows`. Reviewer: "最後一筆減少金額 增加一筆新的Trx幣別等值"
   *    (unchanged since v1.12.0/v1.12.1, reconfirmed verbatim).
   * 4. INCREASE on the LAST row → draws from the row immediately before it, then the one before
   *    THAT, and so on — as far back as needed, capping each donor row at 0 (never negative).
   *    Reviewer: "最後一筆增加金額 減少上一筆幣別等值 不夠繼續往上減少" (unchanged since
   *    v1.12.0, reconfirmed verbatim).
   *
   * Why rule 1 doesn't ALSO cascade past the last row the way rule 4 does: the reviewer's own
   * phrasing for rule 1 names a single target ("減少至最後一筆", decrease TO the last row) with no
   * "不夠繼續" (if insufficient, continue) clause — unlike rule 4's, which explicitly has one. A
   * non-last row's increase is capped, not rejected and not cascaded further, if the last row
   * alone can't fully cover it.
   *
   * This keeps Σ Amount (Tx Ccy) and Total Allocated automatically unchanged by construction —
   * money only ever moves BETWEEN existing rows (or into a freshly-created one, rule 3), so
   * nothing needs to separately re-verify the total. The single-row (not-yet-split) case is the
   * ONLY one still exempt — see onAmountInput/onAccountAmountInput's own `wentThroughWaterfall`
   * gate — since there the ORIGINAL "typing a smaller amount splits off a new remainder row"
   * behavior already achieves the same practical outcome via a different, pre-existing mechanism
   * (fixRow/ensureRemainderRow).
   *
   * Superseded from v1.12.0: rule 1 no longer flows into the immediate next row (N+1) — it always
   * targets the LAST row directly, even when there are several rows between them. Rule 2 likewise
   * no longer flows into N+1 specifically — same target. Rules 3 and 4 (the last row's own
   * behavior) are UNCHANGED from v1.12.0/v1.12.1. The old "increasing the FIRST row is REJECTED"
   * boundary case no longer exists as a special case: under this model the first row is just
   * another non-last row, so increasing it now succeeds via rule 1 (decreasing the last row),
   * rather than being blocked for lack of an N-1 to draw from.
   *
   * Every row this method actually touches (the last row, any donor row during rule 4's cascade,
   * or a newly-created row under rule 3 — via markCascaded — NOT the edited row itself, which the
   * caller still finishes via finishAmountEdit) becomes driver:'amount'/isRemainder:false, exactly
   * as if the user had typed that row directly — a deliberate consequence, not an oversight: the
   * whole point of this feature is precision-tuning individual legs, so a leg touched by the
   * cascade should stick the same way a directly-typed one already does.
   *
   * Returns the row's actual final amount (after any capping) and `applied` (always true now —
   * rule 1 caps rather than rejects, and rule 2/3/4 always succeed; the parameter is kept in the
   * return shape for the caller's existing boundary-rejection handling, which is simply never
   * exercised post-v1.12.3, rather than restructuring both call sites for one guaranteed-true field).
   */
  private applyAmountWaterfall(index: number, requestedAmount: Decimal): { finalAmount: Decimal; applied: boolean } {
    const rows = this.rows;
    const row = rows[index]!;
    const oldAmount = row.amountTxCcy;
    const delta = requestedAmount.minus(oldAmount);
    if (delta.isZero()) return { finalAmount: oldAmount, applied: true };

    const lastIndex = rows.length - 1;

    if (index === lastIndex) {
      if (delta.isNegative()) {
        // Rule 3 — last row decrease: create a new trailing row for the freed difference.
        const freed = oldAmount.minus(requestedAmount);
        const newRow = this.makeRow(0, this.defaultAccountType, DEFAULT_ACCOUNT_NO_BY_TYPE[this.defaultAccountType], false);
        newRow.amountTxCcy = freed;
        this.rows = [...this.rows, newRow];
        this.markCascaded(newRow);
        return { finalAmount: requestedAmount, applied: true };
      }
      // Rule 4 — last row increase: draw from the row(s) before it, cascading backward, capped at 0.
      let remaining = delta;
      let drawn = new Decimal(0);
      for (let j = index - 1; j >= 0 && remaining.greaterThan(0); j--) {
        const donor = rows[j]!;
        const take = Decimal.min(donor.amountTxCcy, remaining);
        if (take.isZero()) continue;
        donor.amountTxCcy = donor.amountTxCcy.minus(take);
        this.markCascaded(donor);
        this.pruneZeroRow(donor); // fully drained (0/0) — remove the now-empty leg (2026-08-12)
        remaining = remaining.minus(take);
        drawn = drawn.plus(take);
      }
      return { finalAmount: oldAmount.plus(drawn), applied: true }; // capped to `drawn` if earlier rows couldn't fully cover the request
    }

    // NOT the last row — rules 1 & 2: any change here offsets directly against the LAST row,
    // regardless of this row's own position (first or middle), never the adjacent neighbor.
    const last = rows[lastIndex]!;
    if (delta.isPositive()) {
      // Rule 1 — non-last row increase: decrease the last row by the same amount, capped at what it has.
      const take = Decimal.min(last.amountTxCcy, delta);
      last.amountTxCcy = last.amountTxCcy.minus(take);
      this.markCascaded(last);
      this.pruneZeroRow(last); // the cap fully drained the last row (0/0) — remove it (2026-08-12)
      return { finalAmount: oldAmount.plus(take), applied: true }; // capped to `take` if the last row couldn't fully cover the request
    }
    // Rule 2 — non-last row decrease: increase the last row by the exact freed amount (always fully absorbed).
    const freed = oldAmount.minus(requestedAmount);
    last.amountTxCcy = last.amountTxCcy.plus(freed);
    this.markCascaded(last);
    return { finalAmount: requestedAmount, applied: true };
  }

  /**
   * Removes `row` from the grid entirely once it has genuinely settled at 0% AND 0 amount — a
   * dangling empty leg conveys no information and just clutters the grid (it was already excluded
   * from the wire by emit()'s own `pct.greaterThan(0)` filter, so this is a UI-only cleanup, not a
   * contract change). Reviewer-confirmed 2026-08-12: "如果單筆比例為0%＆金額=0 就直接刪除該筆",
   * applied uniformly to both the % and Amount waterfalls — checked immediately as each row
   * settles (a donor drained by rule 4's backward cascade, the LAST row when rule 1's cap drains
   * it to exactly 0, or the edited row itself when typed/derived down to exactly 0), not deferred
   * to a post-edit sweep. Never removes the LAST REMAINING row (same guard as removeRow) — a side
   * must always show at least one row. The edited row itself is only pruned when the edit actually
   * went through the waterfall (`wentThroughWaterfall`, both call sites) — the single-row
   * (not-yet-split) `fixRow`/`ensureRemainderRow` bypass is deliberately exempt, so e.g. clamping a
   * negative typed amount to 0 on the sole row still shows 0 on that row instead of it vanishing
   * in favor of a freshly-spawned 100% remainder.
   *
   * Mutates `this.rows` IN PLACE (`splice`, not a reassigned `[...]` copy) deliberately: this is
   * called from inside applyAmountWaterfall's/applyPctWaterfall's own rule-4 backward-cascade
   * loops, which capture `const rows = this.rows` once at the top of the method — an in-place
   * splice keeps that local reference correctly in sync for the loop's remaining iterations,
   * whereas reassigning `this.rows` to a new array would silently leave the loop iterating over a
   * stale, pre-prune copy. Safe with the default (non-OnPush) change detection this component
   * uses — Angular's *ngFor differ walks the current array contents on every cycle regardless of
   * whether the array's own object identity changed.
   */
  private pruneZeroRow(row: Row): boolean {
    if (this.rows.length <= 1) return false;
    if (!row.pct.isZero() || !row.amountTxCcy.isZero()) return false;
    const idx = this.rows.indexOf(row);
    if (idx === -1) return false;
    this.rows.splice(idx, 1);
    this.rowScaleErrors.delete(row.id);
    return true;
  }

  /** Fixes a donor/receiver row touched by applyAmountWaterfall above, and refreshes its display %. */
  private markCascaded(row: Row): void {
    row.driver = 'amount';
    row.isRemainder = false;
    row.pct = this.totalAmount.greaterThan(0)
      ? row.amountTxCcy.dividedBy(this.totalAmount).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      : new Decimal(0);
    this.rowScaleErrors.delete(row.id); // programmatic move via exact Decimal arithmetic — never over-precise.
    // This row's amount just moved for a reason that has nothing to do with a fresh account-ccy
    // retype (a waterfall donor/receiver, a Total Amount absorption, or a newly-spawned row) — any
    // previously-stored exact figure no longer describes it. See Row.accountCcyOverride.
    row.accountCcyOverride = null;
  }

  onAmountInput(row: Row, amount: number): void {
    // Amount (Tx Ccy) is denominated in the transaction currency — validate the RAW typed value now,
    // before money() rounds it to the transaction currency's own scale (which would silently discard
    // any over-precise digits).
    this.checkRowScale(row, amount, this.transactionCurrency);
    const requested = money(Decimal.max(new Decimal(amount || 0), 0), this.scaleFor(this.transactionCurrency));
    const index = this.rows.indexOf(row);
    const wentThroughWaterfall = this.rows.length > 1 && index !== -1;
    if (wentThroughWaterfall) {
      const { finalAmount, applied } = this.applyAmountWaterfall(index, requested);
      if (!applied) this.rowScaleErrors.delete(row.id); // boundary-rejected — the edit never took effect.
      row.amountTxCcy = finalAmount;
    } else {
      row.amountTxCcy = requested;
    }
    // This is the OTHER input surface for the same amountTxCcy field — now THAT'S the
    // authoritative edit, so any account-ccy figure previously typed via onAccountAmountInput no
    // longer describes this row (see Row.accountCcyOverride's own doc comment).
    row.accountCcyOverride = null;
    row.driver = 'amount';
    row.pct = this.totalAmount.greaterThan(0) ? row.amountTxCcy.dividedBy(this.totalAmount).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : new Decimal(0);
    this.finishAmountEdit(row, wentThroughWaterfall);
    // Scoped to the genuine multi-row waterfall only — see the identical note in onPctInput above.
    if (wentThroughWaterfall && this.pruneZeroRow(row)) this.emit(); // the edited row itself settled at 0/0 — remove it (2026-08-12)
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
   *
   * Granularity-unification snap (business-requirement-confirmed 2026-08-12, reviewer-reported
   * 1-cent gap on a Suspense Debit of 20 EUR + 50 EUR): when the typed figure exactly equals a
   * `suspenseCurrencyTotals[row.currency]` bucket's own `rawTotal`, this row is funding that WHOLE
   * bucket via a single leg — use the bucket's `trxEquivalent` (the SAME per-entry-rounded
   * conversion suspenseAdjustment()/the server's own buildSuspenseBridgeLeg use: round(20*rate) +
   * round(50*rate) = 75.81) instead of this row's own combined, round-once division (70 / rate =
   * 75.82). The two are NOT interchangeable — summing already-rounded per-entry conversions vs.
   * rounding one combined conversion can legitimately land a minor unit apart — and this side's
   * seeded Total Amount (business-case-runner's sideDefaults()) is built from the FORMER, so a row
   * using the latter left a 1-minor-unit gap that absorbTotalDeltaIntoLastRow() then silently
   * dumped onto the last row. Deliberately does NOT change the seed formula itself
   * (suspenseAdjustment stays per-entry — see that method's own v1.7.4 doc comment for why a
   * v1.7.3 attempt at the opposite direction caused a real 409 LEGS_UNBALANCED) — this only changes
   * which conversion THIS row uses when it's unambiguously standing in for that whole bucket. A
   * typed figure that does NOT match any bucket's rawTotal is completely unaffected — ordinary
   * combined conversion, exactly as before.
   */
  onAccountAmountInput(row: Row, accountAmount: number): void {
    // Account Ccy Equiv. is denominated in the ROW's own currency — validate the RAW typed value now.
    this.checkRowScale(row, accountAmount, row.currency);
    const amount = Decimal.max(new Decimal(accountAmount || 0), 0);
    // Deriving amountTxCcy (always transaction-currency-denominated — see the Row field doc
    // comment), so it rounds to the TRANSACTION currency's own scale, not row.currency's.
    const suspenseBucket = this.suspenseCurrencyTotals[row.currency];
    const matchesSuspenseBucket = !!suspenseBucket && amount.equals(new Decimal(suspenseBucket.rawTotal));
    const requested = matchesSuspenseBucket
      ? money(suspenseBucket.trxEquivalent, this.scaleFor(this.transactionCurrency))
      : row.rate.greaterThan(0)
        ? money(amount.dividedBy(row.rate), this.scaleFor(this.transactionCurrency))
        : new Decimal(0);
    // Same waterfall rule as onAmountInput above — this is just an alternate input surface for
    // the identical underlying amountTxCcy field, so it must rebalance neighbors the same way.
    const index = this.rows.indexOf(row);
    const wentThroughWaterfall = this.rows.length > 1 && index !== -1;
    if (wentThroughWaterfall) {
      const { finalAmount, applied } = this.applyAmountWaterfall(index, requested);
      if (!applied) this.rowScaleErrors.delete(row.id);
      row.amountTxCcy = finalAmount;
    } else {
      row.amountTxCcy = requested;
    }
    // Round-trip fix (see Row.accountCcyOverride's own doc comment): only trustworthy when this
    // row actually landed on `requested` — i.e. the waterfall didn't cap it short (rule 1 capping
    // at the last row's own balance). A capped edit's real amountTxCcy is smaller than what the
    // raw account-ccy figure implies, so the ordinary derivation (not this stale override) is the
    // correct value there — leave it null and let accountCcyAmountDecimal() fall back to it.
    row.accountCcyOverride = row.amountTxCcy.equals(requested) ? amount : null;
    row.driver = 'amount';
    row.pct = this.totalAmount.greaterThan(0) ? row.amountTxCcy.dividedBy(this.totalAmount).times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP) : new Decimal(0);
    this.finishAmountEdit(row, wentThroughWaterfall);
    // Scoped to the genuine multi-row waterfall only — see the identical note in onPctInput above.
    if (wentThroughWaterfall && this.pruneZeroRow(row)) this.emit(); // the edited row itself settled at 0/0 — remove it (2026-08-12)
  }

  /**
   * Finishes an Amount (Tx Ccy) / Account Ccy Equiv. edit — called by both onAmountInput and
   * onAccountAmountInput. When the waterfall actually ran (`wentThroughWaterfall`), it already
   * manages exactly which rows exist and their amounts (including creating a brand-new trailing
   * row on a last-leg decrease — see applyAmountWaterfall), so this just clears the edited row's
   * OWN isRemainder flag and runs ensureRemainderRow() as a consistency pass (a no-op in practice,
   * since Σ Amount already equals totalAmount exactly by construction). It deliberately does NOT
   * call fixRow(): fixRow's single-remainder fallback-promotion (reverse-find some OTHER row to
   * re-designate as "the remainder" whenever the edited row WAS the sole remainder) is built for
   * the OLD one-remainder-row model and would otherwise silently reassign an unrelated, already-
   * correct row's isRemainder flag even though the waterfall already balanced everything exactly
   * — confusing, and no longer needed now that a last-leg decrease creates its own new row instead
   * of relying on that promotion. (Bug this fixes, reviewer-reported: decreasing a row that was
   * STILL marked isRemainder — the common case, since the remainder row is normally last —
   * previously bypassed the waterfall entirely via an earlier, overly-broad `!row.isRemainder`
   * gate, so decreasing "the last leg" silently fell back to fixRow's fallback-promotion instead
   * of creating a new leg, i.e. exactly the reported "沒有增加一筆TRX等值的" gap.)
   *
   * When the waterfall did NOT run (still a single, not-yet-split row), delegates to fixRow(row)
   * — the ORIGINAL, unchanged "typing a smaller amount splits off a new remainder row" behavior.
   */
  private finishAmountEdit(row: Row, wentThroughWaterfall: boolean): void {
    if (wentThroughWaterfall) {
      row.isRemainder = false;
      this.ensureRemainderRow();
    } else {
      this.fixRow(row);
    }
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
    // 100 - Σ(every fixed row's own, independently-rounded %) — the exact-complement % a
    // remainder row (real or the "last row" fallback below) needs to make the total read exactly
    // 100.00%, regardless of drift in the fixed rows' own %. Also used for the fixed-vs-remainder
    // routing decision as a first pass, refined below by amountRemaining below.
    const remaining = new Decimal(100).minus(fixedPct).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const fixedAmountSum = fixed.reduce((sum, r) => sum.plus(r.amountTxCcy), new Decimal(0));
    // v1.12.1: whether a real remainder row is needed is decided by AMOUNT, never by the
    // independently-rounded % sum above — % is reference-only once amount has been entered (per
    // this project's own confirmed principle; see finishAmountEdit/applyAmountWaterfall). Money
    // per row is already scale-rounded, so a genuinely fully-allocated split always sums to
    // EXACTLY totalAmount — no epsilon/tolerance needed, unlike the pct-based `remaining` above.
    // Repeating-fraction splits (e.g. three equal 1/3 shares) are the concrete case this matters
    // for: each row's % independently rounds to 33.33%, summing to 99.99% — `remaining` alone
    // would read as "0.01% left" and spawn a phantom remainder row holding 0.00, even though the
    // AMOUNTS already sum to totalAmount exactly and nothing is actually missing.
    const amountRemaining = money(this.totalAmount.minus(fixedAmountSum), this.scaleFor(this.transactionCurrency));

    if (amountRemaining.greaterThan(0)) {
      let remainderRow = this.rows.find((r) => r.isRemainder);
      if (!remainderRow) {
        // Same DEFAULT_ACCOUNT_NO_BY_TYPE placeholder the v1.12.2 rule-3 new-row path already
        // uses (line ~666 above) — this is the OTHER place a brand-new row gets spawned (any
        // fixed-row edit that leaves a leftover, not just a last-row decrease), and it was
        // still defaulting to '' until now: a blank Account No. here reads as incomplete/broken
        // the same way it did before v1.12.2, and this path fires far more often (it's how the
        // very first split happens) than rule 3's own new-row case.
        remainderRow = this.makeRow(0, this.defaultAccountType, DEFAULT_ACCOUNT_NO_BY_TYPE[this.defaultAccountType], true);
        this.rows = [...this.rows, remainderRow]; // brand-new row — appending is the only order change that's actually happening.
      }
      remainderRow.pct = remaining;
      // Mortgage/loan-style rounding: the remainder row absorbs whatever's left after the fixed
      // rows' own (independently rounded) amounts, rather than being independently rounded itself
      // from its own percentage — guarantees every split sums to exactly totalAmount, matching how
      // a final loan installment absorbs rounding. amountRemaining above already IS this figure.
      remainderRow.amountTxCcy = amountRemaining;
      // Existing rows keep their current array position — no reassignment here.
    } else {
      // Fully allocated by AMOUNT (or over-allocated) — no leftover to show a remainder row for.
      this.rows = fixed.length > 0 ? fixed : [this.makeRow(100, this.defaultAccountType, this.defaultAccountNo, true)];
      // Reviewer-requested (v1.12.1): give the LAST row's own displayed % the same "exact
      // complement" treatment a dedicated remainder row already gets above
      // (`remainderRow.pct = remaining`) — otherwise, once every row is amount-driven (the normal
      // end state after using the Amount waterfall repeatedly — see applyAmountWaterfall/
      // finishAmountEdit above), each row's % is only ever independently rounded from its OWN
      // amount (2dp), which can fail to sum to exactly 100.00% even though the underlying AMOUNTS
      // sum to totalAmount exactly (e.g. three equal 1/3 splits each round to 33.33%, summing to
      // 99.99%, not 100.00% — the classic repeating-fraction rounding gap). Formula, exactly as
      // specified: last row's % = 100% − Σ(every OTHER row's own %).
      //
      // Skipped when genuinely over-allocated (amountRemaining negative — a REAL, amount-level
      // over-allocation, not just %-drift) — silently "fixing" the last row's % there would mask
      // the real over-allocation the Total Allocated warning exists to surface.
      if (this.rows.length > 0 && !amountRemaining.isNegative()) {
        const last = this.rows[this.rows.length - 1]!;
        const othersPct = this.rows.slice(0, -1).reduce((sum, r) => sum.plus(r.pct), new Decimal(0));
        last.pct = new Decimal(100).minus(othersPct).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }
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
          // same reasoning as amountTxCcy above. Reviewer-reported round-trip bug fixed here: this
          // used to always re-derive amountTxCcy × rate, which silently lost precision whenever
          // the row's own currency has coarser minor units than the transaction currency's (e.g.
          // typing JPY 20000 came back as 19999) — see the Row.accountCcyOverride field doc
          // comment for the full mechanism. accountCcyAmountDecimal() prefers that exact
          // last-typed figure when it's still valid, so the wire sends exactly what was typed,
          // same as the display now does.
          const rowScale = this.scaleFor(r.currency);
          leg.amountAccountCcy = this.accountCcyAmountDecimal(r).toFixed(rowScale);
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
