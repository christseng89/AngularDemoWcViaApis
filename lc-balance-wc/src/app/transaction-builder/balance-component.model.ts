/**
 * Field/rule definitions transcribed directly from
 * analysis/COMMON-BalanceComponent-Design-zh.md (v0.6) §3.1 (natural key
 * table) / §5 (movementType per instrumentType) / §6.2 (Tolerance
 * applicability) — this is the FSD-equivalent for Balance Component (no
 * separate FSD docx exists yet; the design doc + OAS are authoritative).
 * The Transaction Builder UI must not invent movementTypes or fields
 * beyond what these tables declare.
 */

/**
 * EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE / EPLC_EXPORT_BILLS_DISCOUNTED —
 * added 2026-08-15 per analysis/COMMON-BalanceComponent-ExportConfirmation-Gap-Analysis-zh.md §4.1.
 * The asset-side counterpart the Confirmation contingent transforms into once honoured (Sight) or
 * accepted (Usance) — obligor is always the issuing bank, never the exporter. See the microservice's
 * own src/types.ts for the matching frozen-spec grounding (CNF_HONOUR_SIGHT/CNF_HONOUR_BU/CNF_ACCEPT/
 * CNF_DISCOUNT in cs-tf-balance-knowhow's event catalogue).
 */
/**
 * EPLC_EXAMINATION — added 2026-08-15, cs-tf-balance-knowhow business-expert review of a proposed
 * "Confirm LC Balance control" lifecycle table found "Confirmation Pending 100K" at Present Docs
 * violates Design Principle D3 ("Documents arriving is a physical event... Only legal events move
 * balances") — impl-spec-en.md's own event matrix confirms `EX_DOC_RCV` only ever touches
 * `EXPORT_BILLS_UNDER_EXAMINATION`/`_CONTRA`, never `CONFIRMATION_OUTSTANDING`. `MEMO_ONLY`, CREATE
 * only — B3 (Present Docs) creates it under a parent Confirmation; B4 (Honour/Acceptance) releases
 * that same PENDING CREATE as the first leg of its own compound once the actual legal decision fires.
 */
export type InstrumentType =
  | 'IPLC_LC'
  | 'EPLC_LC'
  | 'IPLC_ACCEPTANCE'
  | 'EPLC_ACCEPTANCE'
  | 'SHGT'
  | 'EPLC_CONFIRMATION'
  | 'EPLC_DUE_FROM_ISSUING_BANK'
  | 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE'
  | 'EPLC_EXPORT_BILLS_DISCOUNTED'
  | 'EPLC_EXAMINATION';

export const INSTRUMENT_TYPE_OPTIONS: { value: InstrumentType; label: string }[] = [
  { value: 'IPLC_LC', label: 'IPLC_LC — Import LC Balance' },
  { value: 'EPLC_LC', label: 'EPLC_LC — Export LC (reference only, no liability)' },
  { value: 'IPLC_ACCEPTANCE', label: 'IPLC_ACCEPTANCE — Import Acceptance Liability' },
  { value: 'EPLC_ACCEPTANCE', label: 'EPLC_ACCEPTANCE — Export Acceptance Liability / MEMO tracking' },
  { value: 'SHGT', label: 'SHGT — Shipping Guarantee Liability' },
  { value: 'EPLC_CONFIRMATION', label: 'EPLC_CONFIRMATION — Export Confirmation Liability (CONF LIAB)' },
  { value: 'EPLC_DUE_FROM_ISSUING_BANK', label: 'EPLC_DUE_FROM_ISSUING_BANK — Confirmed Sight/BU honour asset (obligor = issuing bank)' },
  { value: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE', label: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE — Confirmed Usance acceptance asset (obligor = issuing bank)' },
  { value: 'EPLC_EXPORT_BILLS_DISCOUNTED', label: 'EPLC_EXPORT_BILLS_DISCOUNTED — Discounted (Nego) confirmed acceptance asset' },
  { value: 'EPLC_EXAMINATION', label: 'EPLC_EXAMINATION — Present Docs MEMO_ONLY earmark (no Confirmation impact)' },
];

/** Design doc §5 — the only legal movementType values per instrumentType, as actually implemented. */
export const MOVEMENT_TYPES_BY_INSTRUMENT: Record<InstrumentType, string[]> = {
  IPLC_LC: ['ISSUE', 'AMEND_INCREASE', 'AMEND_DECREASE', 'UTILIZE'],
  EPLC_LC: ['ISSUE', 'AMEND_INCREASE', 'AMEND_DECREASE'],
  IPLC_ACCEPTANCE: ['CREATE', 'PARTIAL_SETTLE', 'FULL_SETTLE'],
  EPLC_ACCEPTANCE: ['CREATE', 'PARTIAL_SETTLE', 'FULL_SETTLE'],
  SHGT: ['ISSUE', 'PARTIAL_REDEEM', 'FULL_REDEEM'],
  EPLC_CONFIRMATION: ['ISSUE', 'AMEND', 'HONOUR', 'ACCEPT'],
  EPLC_DUE_FROM_ISSUING_BANK: ['CREATE', 'REIMBURSE'],
  EPLC_ACCEPTANCE_REIMB_RECEIVABLE: ['CREATE', 'REIMBURSE', 'RECLASSIFY_OUT'],
  EPLC_EXPORT_BILLS_DISCOUNTED: ['CREATE', 'REIMBURSE'],
  EPLC_EXAMINATION: ['CREATE'],
};

/** Design doc §3.1 — which natural-key fields apply to which instrumentType. lcNumber is always required. */
export const NATURAL_KEY_FIELDS_BY_INSTRUMENT: Record<InstrumentType, ('ibNumber' | 'sgNumber')[]> = {
  IPLC_LC: [],
  EPLC_LC: [],
  IPLC_ACCEPTANCE: ['ibNumber'],
  EPLC_ACCEPTANCE: ['ibNumber'],
  SHGT: ['sgNumber'],
  EPLC_CONFIRMATION: [],
  // Same EB Number as the specific presentation (B3's secondaryRef) they arose from — one asset
  // record per presentation, so an LC/Confirmation with multiple presentations doesn't collide.
  EPLC_DUE_FROM_ISSUING_BANK: ['ibNumber'],
  EPLC_ACCEPTANCE_REIMB_RECEIVABLE: ['ibNumber'],
  EPLC_EXPORT_BILLS_DISCOUNTED: ['ibNumber'],
  EPLC_EXAMINATION: ['ibNumber'],
};

/** Design doc §6.2 — Tolerance only applies to these instrumentTypes' own ISSUE/AMEND*. */
export const TOLERANCE_APPLICABLE_INSTRUMENT_TYPES: ReadonlySet<InstrumentType> = new Set(['IPLC_LC', 'EPLC_LC', 'EPLC_CONFIRMATION']);
export const TOLERANCE_APPLICABLE_MOVEMENT_TYPES: ReadonlySet<string> = new Set(['ISSUE', 'AMEND_INCREASE', 'AMEND_DECREASE', 'AMEND']);

/** movementTypes that implicitly create a new Logical Contract if the natural key doesn't resolve yet (Design doc §3.3). */
export const CREATING_MOVEMENT_TYPES: ReadonlySet<string> = new Set(['ISSUE', 'CREATE']);

/** Design doc §3.1/§6.1 — instrumentTypes that hang off a parent LC (parentLogicalContractId). */
export const HAS_PARENT: ReadonlySet<InstrumentType> = new Set(['IPLC_ACCEPTANCE', 'EPLC_ACCEPTANCE', 'SHGT', 'EPLC_EXAMINATION']);

/** For EPLC_ACCEPTANCE, the parent may be EPLC_CONFIRMATION (Confirmed -> ACTUAL) or EPLC_LC (Unconfirmed -> MEMO, Design doc §6.2 Export LC). */
export const PARENT_INSTRUMENT_OPTIONS: Record<InstrumentType, InstrumentType[]> = {
  IPLC_LC: [],
  EPLC_LC: [],
  IPLC_ACCEPTANCE: ['IPLC_LC'],
  EPLC_ACCEPTANCE: ['EPLC_CONFIRMATION'],
  SHGT: ['IPLC_LC'],
  EPLC_CONFIRMATION: [],
  // Created programmatically by B4's own compound Submit (createsIssuingBankReceivableOnHonour) — no
  // Balance Component function ever picks an EXISTING one via a Parent LC picker (business instruction
  // 2026-08-16, "Balance Component 只負責 Contingent Liability" — collecting this pure receivable, with
  // no paired liability, is out of scope here; B5 is Usance/EPLC_ACCEPTANCE-only).
  EPLC_DUE_FROM_ISSUING_BANK: [],
  EPLC_ACCEPTANCE_REIMB_RECEIVABLE: [],
  EPLC_EXPORT_BILLS_DISCOUNTED: [],
  // B3 (Present Docs) only — a genuinely new EPLC_EXAMINATION record per presentation, picked via the
  // Parent LC picker like A8's own SHGT-under-a-parent-LC pattern.
  EPLC_EXAMINATION: ['EPLC_CONFIRMATION'],
};

export function isToleranceApplicable(instrumentType: InstrumentType, movementType: string): boolean {
  return TOLERANCE_APPLICABLE_INSTRUMENT_TYPES.has(instrumentType) && TOLERANCE_APPLICABLE_MOVEMENT_TYPES.has(movementType);
}

/** IMPORT -> IPLC_LC, EXPORT -> EPLC_CONFIRMATION — the root LC-level instrumentType for each Import/Export side (business instruction 2026-08-15, "Look Up Current Balance... 如果選 Import LC Tab... Export Confirmed Tab..."). Shared by LookUpPanelService.resetForSide() and InquireEventsService, so the one Import/Export default only ever lives in one place. */
export function defaultLcInstrumentTypeForSide(side: 'IMPORT' | 'EXPORT'): InstrumentType {
  return side === 'IMPORT' ? 'IPLC_LC' : 'EPLC_CONFIRMATION';
}

/**
 * PARENT_INSTRUMENT_OPTIONS above, inverted once at module load — every instrumentType that can hang
 * off a given root as a child (IPLC_LC -> IPLC_ACCEPTANCE/SHGT; EPLC_CONFIRMATION -> EPLC_ACCEPTANCE/
 * EPLC_EXAMINATION). Single source of truth for "what child ledgers exist under this LC" — no second
 * hand-written map to keep in sync. Inquire Events (2026-08-17) is this function's first caller: it
 * needs to fetch every sub-ledger's own movements to build one merged Event timeline. Deliberately
 * does NOT recurse — nothing in PARENT_INSTRUMENT_OPTIONS names IPLC_ACCEPTANCE/EPLC_ACCEPTANCE/SHGT/
 * EPLC_EXAMINATION as a parent of anything else, so the hierarchy is exactly two levels deep today.
 * The three ON_BALANCE_ASSET instrumentTypes (EPLC_DUE_FROM_ISSUING_BANK/
 * EPLC_ACCEPTANCE_REIMB_RECEIVABLE/EPLC_EXPORT_BILLS_DISCOUNTED) never appear here — their own
 * PARENT_INSTRUMENT_OPTIONS entries are empty by design (out of Balance Component's own "只負責
 * Contingent Liability" scope, same boundary contingentAccountEntry already enforces), so they are
 * correctly excluded from Inquire Events' own merged timeline too, not just from the Parent LC picker.
 */
const CHILD_INSTRUMENT_TYPES_BY_PARENT: Record<InstrumentType, InstrumentType[]> = (() => {
  const result = {} as Record<InstrumentType, InstrumentType[]>;
  for (const instrumentType of Object.keys(PARENT_INSTRUMENT_OPTIONS) as InstrumentType[]) result[instrumentType] = [];
  for (const [child, parents] of Object.entries(PARENT_INSTRUMENT_OPTIONS) as [InstrumentType, InstrumentType[]][]) {
    for (const parent of parents) result[parent].push(child as InstrumentType);
  }
  return result;
})();

export function childInstrumentTypesOf(root: InstrumentType): InstrumentType[] {
  return CHILD_INSTRUMENT_TYPES_BY_PARENT[root] ?? [];
}

/**
 * Inquire Events (2026-08-17, user-requested — "Import LC：LC Balance、Acceptance Balance、Shipping
 * Guarantee Balance; Export Confirmed LC：Confirmed LC Balance、Confirmed LC Acceptance Balance") —
 * exactly the 5 instrumentTypes the user named as real, display-worthy Balance Components, each mapped
 * to its own display label. Deliberately excludes `EPLC_EXAMINATION` even though it's one of
 * `childInstrumentTypesOf('EPLC_CONFIRMATION')`'s own results — it's `MEMO_ONLY` and never a real
 * Balance Component (the same "Balance Component 只負責 Contingent Liability" scope boundary
 * `contingentAccountEntry` already enforces for it elsewhere). A single flat map needs no IMPORT/EXPORT
 * branching: a caller scoped to one side's own event set (e.g. InquireEventsService) only ever
 * encounters IPLC_LC/IPLC_ACCEPTANCE/SHGT on the Import side, or EPLC_CONFIRMATION/EPLC_ACCEPTANCE on
 * the Export side — never both, so `Object.keys(BALANCE_SNAPSHOT_LABEL)` never over-matches.
 */
export const BALANCE_SNAPSHOT_LABEL: Partial<Record<InstrumentType, string>> = {
  IPLC_LC: 'LC Balance',
  IPLC_ACCEPTANCE: 'Acceptance Balance',
  SHGT: 'Shipping Guarantee Balance',
  EPLC_CONFIRMATION: 'Confirmed LC Balance',
  EPLC_ACCEPTANCE: 'Confirmed LC Acceptance Balance',
};

/**
 * ISO 4217 minor-unit (decimal place) count per currency code — keeps the Amount input's own
 * granularity in step with whichever Currency is typed/picked alongside it (e.g. "JPY 10000" has no
 * cents). Mirrors lc-payment-wc/backend/data/currencies.json's own JPY/TWD/IDR=0 entries for
 * consistency across the two sibling demo projects, extended with the standard 3-decimal ISO 4217
 * exceptions (BHD/IQD/JOD/KWD/OMR/TND) — this project has no backend currency master of its own (unlike
 * lc-payment-wc's CurrencyService/GET /api/currencies) so this table stands in for one, covering every
 * currency this app's own fields can produce: CURRENCY_OPTIONS' own dropdown codes below, and any value
 * still freely typed elsewhere (every function except A1/B1 carries/protects the currency from A1/B1
 * rather than typing it again — see CURRENCY_OPTIONS' own doc comment). Unlisted currencies default to
 * 2 (the common case, matching both that same JSON's own entries and the microservice's own
 * MONETARY_AMOUNT_PATTERN ceiling of 3).
 */
export const CURRENCY_DECIMALS: Record<string, number> = {
  JPY: 0,
  TWD: 0,
  IDR: 0,
  KRW: 0,
  VND: 0,
  CLP: 0,
  ISK: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  OMR: 3,
  TND: 3,
};

/** Falls back to 2 decimal places for any currency not listed above (or not yet typed). */
export function decimalPlacesForCurrency(currency: string | null | undefined): number {
  return CURRENCY_DECIMALS[(currency ?? '').trim().toUpperCase()] ?? 2;
}

/**
 * Business instruction 2026-08-17 ("For A1 and B1, the Currency Code field should be implemented as a
 * drop-down list, consistent with the existing implementation in lc-payment-wc") — the same 10-currency
 * code set as lc-payment-wc/backend/data/currencies.json (USD/EUR/JPY/GBP/TWD/IDR/CNY/HKD/SGD/AUD), so
 * both sibling demo apps offer the identical currency universe even though lc-balance-wc has no backend
 * currency master of its own to fetch it from (CurrencyService/GET /api/currencies is lc-payment-wc-
 * only — see CURRENCY_DECIMALS' own doc comment). Labels are the bare code, matching lc-payment-wc's
 * own dropdown convention there (label is the code, not "USD - US Dollar", even though its backend data
 * carries a full name) — builder-fields.ts wires this to A1/B1's own Currency field only; every other
 * function still carries/protects whatever Currency A1/B1 declared (Design doc/business instruction
 * 2026-08-16, "Currency = Carry from A1/B1 + Protected"), so this list only ever needs to cover a value
 * a Maker is actively CHOOSING at LC/Confirmation creation time, not every value this app might ever
 * display (e.g. Inquire Events' own read-only reconstruction of a historical A1/B1 event still renders
 * through this same dropdown, decorated disabled — a legacy/exotic currency outside this list would
 * render blank there, an accepted prototype-scope limitation, not a silent data-loss risk, since the
 * underlying stored value is untouched either way).
 */
export const CURRENCY_OPTIONS: { value: string; label: string }[] = ['USD', 'EUR', 'JPY', 'GBP', 'TWD', 'IDR', 'CNY', 'HKD', 'SGD', 'AUD'].map((code) => ({
  value: code,
  label: code,
}));

/**
 * True if `amount`'s own typed decimal-place count exceeds what `currency` allows (Design doc §6.2
 * face-level amount).
 *
 * Live bug, reviewer-reported 2026-08-16 ("All the Submit functions are not working in UI"): `amount`
 * is typed `string` on TransactionModel, but the Amount field is Formly `type: 'number'` — a native
 * `<input type="number">` — and Angular's own built-in NumberValueAccessor coerces that input's value
 * to a real JS `number` (or `null` when empty) before it ever reaches `model.amount`, regardless of the
 * compile-time type. The old `amount.split('.')` call assumed a string and threw
 * `TypeError: amount.split is not a function` the instant any digits were typed — and since this
 * function backs the `amountDecimalMismatch` template getter (evaluated on every change-detection
 * cycle, not just on submit), the error re-fired continuously, freezing the whole form for every
 * business function (A1-A9/B1-B5 alike), not just ones that actually hit a real decimal-place
 * violation. `String(amount)` first makes this robust to either runtime shape.
 */
export function amountExceedsCurrencyDecimals(amount: string | number | null | undefined, currency: string | null | undefined): boolean {
  if (amount === null || amount === undefined || amount === '') return false;
  const frac = String(amount).split('.')[1];
  return !!frac && frac.length > decimalPlacesForCurrency(currency);
}

/**
 * Thousand-separates a plain (non-negative) digit string — display formatting only, never used for any
 * calculation or API payload (those stay plain decimal strings throughout this app).
 *
 * Quality-report-balance.md Security Hotspot (SonarQube typescript:S5852, 2026-08-17): the prior
 * implementation used `digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')` — the nested `(\d{3})+` quantifier
 * inside a lookahead backtracks quadratically on a long run of digits, flagged as a potential ReDoS
 * vector. This is a plain linear right-to-left scan instead — no regex, no backtracking risk regardless
 * of input length.
 */
export function groupThousands(digits: string): string {
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    const remaining = digits.length - i;
    if (i > 0 && remaining % 3 === 0) result += ',';
    result += digits[i];
  }
  return result;
}

/**
 * Business instruction 2026-08-14: "還有相關BALANCE為0的交易過濾" — mirrors
 * src/domain/balanceDerivation.ts's MOVEMENT_DIRECTION on the microservice
 * (movementTypes with direction -1). Used to filter existing-contract
 * pickers (Catalog dropdown, Parent LC picker) so a contract with 0
 * Available Balance isn't offered as the target of an action that would
 * immediately fail (Design doc §6) — e.g. don't list a fully-drawn LC as a
 * Document Arrival target, don't list a fully-settled Acceptance as a
 * Settlement target. Deliberately NOT applied to AMEND_INCREASE/ISSUE/
 * CREATE/AMEND — 0 is a perfectly normal starting point to top up or begin.
 */
export const DECREASING_MOVEMENT_TYPES: ReadonlySet<string> = new Set([
  'AMEND_DECREASE',
  'UTILIZE',
  'HONOUR',
  'ACCEPT',
  'PARTIAL_SETTLE',
  'FULL_SETTLE',
  'PARTIAL_REDEEM',
  'FULL_REDEEM',
  // 2026-08-15 (Export Confirmation Gap Analysis §4.1/§4.2) — same "don't offer an already-cleared
  // record" exclusion for the new asset-side instruments' own settlement/reclass movements.
  'REIMBURSE',
  'RECLASSIFY_OUT',
]);

/**
 * Named business functions (business instruction 2026-08-14: "similar as
 * Payment Component A1-A4, B1-B5") — each pins down instrumentType +
 * movementType (and, where the real business function has one, a
 * meaningful sub-choice like Increase/Decrease or Sight/Usance) so the
 * Transaction Builder never makes the user pick raw instrumentType/
 * movementType combinations by hand. Grouped Import (A-series) / Export
 * (B-series), same split as lc-payment-wc's own
 * src/app/web-components/import/ vs export/ screens.
 */
export interface SubChoice {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export interface TransactionFunction {
  code: string;
  label: string;
  side: 'IMPORT' | 'EXPORT';
  help: string;
  instrumentType: InstrumentType;
  /** Fixed movementType, OR a sub-choice the user picks (its value becomes the movementType, or feeds resolveMovementType). */
  movementType?: string;
  subChoice?: SubChoice;
  /** True when this function's parent-instrument default should be pre-selected (SHGT/IPLC_ACCEPTANCE always IPLC_LC; EPLC_ACCEPTANCE depends on the Confirmed/Unconfirmed sub-choice). */
  defaultParentInstrumentType?: InstrumentType;
  /**
   * Business instruction 2026-08-14: "amend number, ib number and sg
   * number can be treated as 2ndary reference number for events after LC
   * issue" — every function except LC Issue (A1/B1) requires ONE generic
   * secondary reference (sent as sourceTransactionRef), just labeled per
   * context (Amendment No./Times, IB Number, …). SG Number is deliberately
   * NOT covered by this — for A8/A9 it's SHGT's own PRIMARY natural key
   * (naturalKey.sgNumber / searchNaturalKey.sgNumber), not a secondary tag
   * on top of some other instrument's own key.
   */
  secondaryRefLabel?: string;
  /**
   * Design doc §7 Tenor Type Routing (v0.7/v0.9) — when set, Tenor Type is
   * mandatory and offers exactly these options. LC Issue (A1/B1) offers all
   * three (the LC's own stated tenor, declared at issuance — business
   * instruction 2026-08-14: "開證時必須輸入Tenor Type"); Acceptance (A6/B4)
   * offers only the two Usance options, since Sight never produces an
   * Acceptance (Design doc §7's routing table). SELLERS_USANCE/
   * BUYERS_USANCE drive IDENTICAL Balance +/- mechanics wherever they
   * appear — this field is audit/reporting only, never changes a check.
   */
  tenorTypeOptions?: { value: string; label: string }[];
  /**
   * Business-reported gap 2026-08-14 ("There is no Sight Payment function
   * for the Tenor Sight to pay") — for A4, which Catalog picker
   * entries are eligible: filters out contracts whose OWN declared
   * tenorType (set at A1 Issue) doesn't match, so a Usance LC can't be
   * picked under the Sight cards or vice versa. Contracts with no
   * tenorType recorded (legacy, pre-v0.9) are never filtered out — silently
   * hiding them would make them permanently unreachable.
   */
  catalogTenorFilter?: 'SIGHT' | 'USANCE';
  /**
   * Business instruction 2026-08-14 ("pickup LC then pickup IB Number...
   * Amount will be captured... without further input") — when true, this
   * function does NOT create a new movement at all: pick the LC (existing
   * Catalog picker), then pick a still-PENDING movement under it (IB
   * Index, component.ts's payableMovements), then Pay releases that exact
   * movement. The Amount/currency/secondaryRef Formly fields are hidden
   * entirely — there is nothing left to type. A4 (Sight Settlement) only.
   */
  payExistingUtilize?: boolean;
  /**
   * Business instruction 2026-08-14, revised: "When Submit A6, the LC
   * Balance is remain unchanged but create an Acceptance Balance in
   * Pending. When Checker approve it, then LC Balance will be approved and
   * Acceptance Balance will be approved too." — A6 only. When true, the
   * Parent LC picker's Step 2 shows still-PENDING Document Arrival
   * movements under the picked LC (component.ts's payableMovements — same
   * mechanism as A4's IB Index, just triggered from onSelectParent()
   * instead of onSelectContract()); picking one auto-fills AND LOCKS
   * naturalKey.ibNumber and model.amount (protected — see rebuildFields()).
   * submit() (Maker) only createMovement()s the new Acceptance (PENDING) —
   * the LC's own Balance stays untouched. release() (Checker) is the
   * compound call: release the picked Document Arrival FIRST (finalizes
   * the LC's own Balance, Pending -> Approved/Utilized), THEN release the
   * new Acceptance — matching balanceService.ts's own documented "two
   * separate calls, orchestrated by the caller" principle for a Usance
   * drawing, but now both halves happen at the CHECKER step, not the
   * Maker's submit — a Maker must never unilaterally finalize the LC's own
   * Balance just by submitting a request (4-eyes).
   */
  settlesDocumentArrival?: boolean;
  /**
   * Business instruction 2026-08-15 ("B4 should index records from B3, once B3 record is processed
   * via B4, then it is no longer to run B3 again") — reused by B4 (Create Acceptance) alongside
   * settlesDocumentArrival above: on IPLC_LC the "still-PENDING" thing being converted is A3's own
   * UTILIZE (Document Arrival); on EPLC_CONFIRMATION for B4 it's B3's own ACCEPT (Present Docs,
   * Usance branch) instead. Parameterizes loadPayableMovements()'s own movementType filter — defaults
   * to 'UTILIZE' when unset (A4/A6, unchanged).
   */
  payableMovementType?: string;
  /**
   * Business instruction 2026-08-15 ("Confirm LC Balance 控制" table review) — B4 only. A3's own
   * UTILIZE lives on the SAME contract A6 browses (IPLC_LC), so loadPayableMovements() can just call
   * listMovements() on the picked contract directly. B3's own CREATE does NOT — it lives on a
   * SEPARATE child EPLC_EXAMINATION contract (parentLogicalContractId -> the Confirmation), so finding
   * it means: catalog-search EPLC_EXAMINATION contracts under the picked Confirmation's own LC Number,
   * then fetch each one's own movements. Set only when the "still-PENDING source" isn't on the browsed
   * contract itself — unset (A6, unchanged) means same-contract lookup.
   */
  payableMovementInstrumentType?: InstrumentType;
  /**
   * Business instruction 2026-08-15 ("B4 只能挑 Approved 的記錄" — B4 should only be able to pick a B3
   * Present Docs record the Checker has already Released, enforcing the 4-eyes check on the
   * presentation itself before Honour/Accept becomes possible). B4 only — A6's own equivalent
   * (still-PENDING A3 Document Arrivals) has no equivalent concept and is unaffected. Filters
   * loadPayableMovementsAcrossChildContracts()'s own candidate pool to `m.status === 'RELEASED'`
   * instead of the usual `'PENDING'`, on top of the existing movementType filter.
   *
   * Renamed 2026-08-18 from `payableMovementRequiresAcknowledgment` (business instruction, "所有交易要
   * RELEASE過後 才能根據流程走下一個交易" — B3 now genuinely RELEASEs on its own, superseding the prior
   * acknowledgment-only design; see the now-removed `deferSettlementRequiresBackendAck`'s own former
   * doc comment). Also doubles, in `checker-actions.service.ts`'s own `release()`, as the signal that
   * B4's compound release must NOT attempt to re-release its own picked source (already RELEASED by
   * the time B4 acts — re-releasing it would 409) — see that file's own doc comment.
   *
   * Bug fixed 2026-08-18, reviewer-reported live ("Export Confirmed LC Sight B4 Submit後 不應該再出現
   * S01 E01 E02" — a presentation B4 already consumed kept reappearing as a pickable candidate): status
   * RELEASED alone is not sufficient once a presentation can ALSO already be fully consumed by an
   * earlier B4 (an already-consumed record stays RELEASED forever — it never transitions again, so a
   * status-only filter matches it indefinitely). `loadPayableMovementsAcrossChildContracts()` also
   * excludes any candidate with `presentDocsConsumedAt` already set — see that field's own doc comment.
   */
  payableMovementRequiresRelease?: boolean;
  /** Display term for whatever payableMovementType above picks out — "Document Arrival" (A4/A6) vs "Present Docs" (B4). Drives the 2ndary Index picker's own label/emptyText/autoPickedHint (component.html). */
  pendingItemLabel?: string;
  /** Which function to point the Maker at when nothing is PENDING yet — "A3 (Document Arrival)" vs "B3 (Present Docs)". */
  pendingItemSourceHint?: string;
  /**
   * Business instruction 2026-08-15 ("LC Index — Existing Contract then EB Index - Existing Contract
   * (from B3)") — just the function code half of pendingItemSourceHint above, for the 2ndary Index
   * picker's own label ("{IB/EB} Index — Existing Contract (from {code})", component.html — the IB/EB
   * half comes from ibNumberLabel). Defaults to 'A3' when unset (A6, unchanged).
   */
  pendingItemSourceCode?: string;
  /**
   * Business instruction 2026-08-16 ("從Balance Component角度來看B5不需要，B6改成B5選資料為有Acceptance
   * Balance>0的EB交易，交易會解除EB交易的Acceptance Balance") — B5 only, and — since B5's own
   * instrumentType is fixed to EPLC_ACCEPTANCE (Usance held-to-maturity; B5 has no subChoice and no
   * Sight branch of its own, see the registry entry below) — always true for a real B5 submission, not
   * a conditional/fallback path. Submit derives FULL_SETTLE/PARTIAL_SETTLE from Amount vs the
   * Acceptance's own Available Balance (same shape as autoRedeemType, see its own doc comment), then
   * creates a linked REIMBURSE for the SAME amount against the matching EPLC_ACCEPTANCE_REIMB_RECEIVABLE
   * contract (found via the same LC+EB Number) — one Checker Release finalizes both. Grounded in
   * impl-spec-en.md's own CNF_MATURE event row, which clears both balance types together, not two
   * independent events.
   *
   * (B5 used to also cover the Sight case, EPLC_DUE_FROM_ISSUING_BANK, via a `dualInstrumentFallback`
   * field that let one B5 function serve both tenors — removed as dead code per
   * Quality-report-balance.md BAL-101, since B5 was later split back into "Usance-only" per the registry
   * entry's own history comment below, leaving that field permanently unset. This flag's own Usance
   * check was never the dead part — it's B5's everyday behavior — only the now-gone Sight alternative
   * was.)
   */
  settlesAcceptanceOnMature?: boolean;
  /**
   * Business instruction 2026-08-16 ("B6 要有類似B5[B4]的LC Index — Existing Contract & EB Index —
   * Existing Contract (from B3) 選擇 those EB records with Acceptance Balance") — B5 only. Adds a
   * genuine "EB Index" Step-2 picker after the Parent LC ("LC Index") Step 1 — same two-step shape A6/
   * B4 already have, surfacing still-outstanding EPLC_ACCEPTANCE (B5's own instrumentType) candidates
   * under the picked Confirmation's own LC Number. Only 0-Available candidates are excluded (nothing
   * left to settle). Does not replace the existing free-text LC+EB search — that stays as a manual
   * fallback, same precedent as every other Parent-LC-picker function.
   */
  settleableBalanceIndex?: boolean;
  /**
   * Business instruction 2026-08-14 (revised Maker/Checker statement):
   * "A3 Checker: Release/approve the Document Arrival. No further LC
   * Balance update. A4 Checker: upon settlement approval, move the
   * corresponding LC Balance from Pending to Approved/Utilized." — the LC
   * Balance is only genuinely finalized (moved out of Pending) by A4's
   * release() call; A3's own Checker step must NOT trigger that same
   * balance-finalizing transition, or A4 would never find anything still
   * PENDING to settle. A3 (Document Arrival (Sight)) only — component.ts's
   * approveArrival() is a Checker-visible acknowledgment that does NOT call
   * the release API; the movement stays PENDING server-side. Reject still
   * calls the real reject API (releases the earmark back), since that's a
   * genuine, correctness-critical action regardless of this flag.
   *
   * B3 (EPLC_EXAMINATION/CREATE) also set this flag through 2026-08-17 — REMOVED from B3's own
   * registry entry 2026-08-18 (business instruction, "所有交易要RELEASE過後 才能根據流程走下一個交易"):
   * B3 now uses the standard Checker release()/reject() path directly, same as every other function
   * that doesn't set this flag (A1/A2/A8/A9/B1/B2/etc.) — its own Present Docs earmark genuinely
   * transitions PENDING -> RELEASED on the Checker's own real Release click, not a client-only
   * acknowledgment. A3 remains this flag's only user now.
   */
  deferSettlement?: boolean;
  /**
   * Business instruction 2026-08-15 ("B4 should index records from B3, once B3 record is processed
   * via B4, then it is no longer to run B3 again") — which movementType deferSettlement above applies
   * to. Defaults to 'UTILIZE' when unset (A3, unchanged). Was also used by B3 (EPLC_EXAMINATION/CREATE)
   * — REMOVED from B3's own registry entry 2026-08-18 (see deferSettlement's own doc comment for why);
   * A3 remains this field's only user.
   */
  deferSettlementMovementType?: string;
  /** Display noun for deferSettlement's own acknowledgment hint/checkmark — "Document Arrival" (A3). Defaults to 'Document Arrival' when unset. */
  deferSettlementLabel?: string;
  /** "go to X to actually finalize it" — which function(s) the Maker/Checker should go to next. Defaults to 'A4 (Sight Settlement) or A6 (Acceptance)' when unset. */
  deferSettlementNextStepHint?: string;
  /**
   * Business instruction 2026-08-14 ("Document Arrival w Shipping Gtee...
   * pick up the LC Number and associated SG Record... Bill Amount will be
   * protected and carry from selected SG Record", "always response full
   * match only") — A3S only. Step 2 (component.ts's loadSgsForArrival(),
   * triggered from onSelectContract() once the LC is picked) lists the
   * LC's own outstanding SHGT records instead of A6's still-PENDING
   * Document Arrivals; picking one auto-fills AND LOCKS Amount = that SG's
   * current full outstanding balance (never a partial/typed figure — v0.13
   * business decision, full match only).
   *
   * Maker Submit creates TWO new PENDING movements, in this exact order:
   * (1) the matched SG's own FULL_REDEEM, (2) the LC's own UTILIZE for the
   * same amount. The order matters for the balance math, not just
   * bookkeeping — src/domain/offBalanceExposure.ts's computeOffBalanceExposure()
   * counts a PENDING redemption the same as a RELEASED one, so by the time
   * step (2)'s sufficiency check runs, this SG's exposure is already
   * netted out of Tight Available (Design doc §6.1 v0.12) and the check
   * passes even though an unmatched arrival of the same amount would now
   * hard-reject. Checker Release is the mirrored compound action: release
   * the SG's FULL_REDEEM first, then the Document Arrival — both finalize
   * together on one click, matching A6's "one Release does both" pattern.
   */
  documentArrivalWithSg?: boolean;
  /**
   * Business instruction 2026-08-15 (analysis/COMMON-BalanceComponent-ExportConfirmation-Gap-Analysis-zh.md
   * §3, Row 5) — B3's Sight/HONOUR branch only. rationale-en.md §7.4a: "paying the exporter under a
   * confirmation creates an asset against the issuing/reimbursing bank, not another liability."
   * Maker Submit creates TWO new PENDING movements, same compound-and-linked shape as A3S's
   * documentArrivalWithSg above: (1) the EPLC_CONFIRMATION's own HONOUR (releases the Confirmation
   * contingent), (2) a new EPLC_DUE_FROM_ISSUING_BANK CREATE for the same amount (naturalKey.ibNumber
   * = this submission's own secondaryRef/EB Number — one asset record per presentation). Checker
   * Release is the mirrored compound action. Usance's ACCEPT branch (Row 6, the 3-way
   * Confirmation+Acceptance+Receivable compound) is intentionally NOT yet covered by this flag —
   * follow-up work, see the gap analysis §5.
   */
  createsIssuingBankReceivableOnHonour?: boolean;
  /**
   * Business instruction 2026-08-15 ("B4 should index records from B3, once B3 record is processed
   * via B4, then it is no longer to run B3 again") — B4 only. Closes Gap Analysis Row 6's Critical
   * Gap: the 3-way Confirmation+Acceptance+Receivable compound createsIssuingBankReceivableOnHonour's
   * own doc comment above flagged as "NOT yet covered". Works together with settlesDocumentArrival/
   * payableMovementType='ACCEPT' above (B4 must convert a SPECIFIC still-PENDING B3 ACCEPT record, not
   * create an Acceptance untethered from one — same reasoning as A6). Maker Submit creates TWO new
   * PENDING movements, same compound-and-linked shape as createsIssuingBankReceivableOnHonour: (1) the
   * new EPLC_ACCEPTANCE CREATE (the liability half, req), (2) a new EPLC_ACCEPTANCE_REIMB_RECEIVABLE
   * CREATE for the same amount (the asset half — naturalKey.ibNumber matches the Acceptance's own,
   * carried from the picked B3 record). Checker Release is a 3-way compound: release the picked B3
   * ACCEPT record FIRST (settlesDocumentArrival's existing release() branch), THEN release the
   * Acceptance (releaseAcceptance()), THEN release the Receivable asset (new
   * releaseAcceptanceReimbReceivable()) — once released, that B3 record is gone from the "still-
   * PENDING" 2ndary Index and can never be picked/converted a second time.
   */
  createsAcceptanceReimbReceivableOnCreate?: boolean;
  /**
   * Business instruction 2026-08-15 ("There is no need to select Full or Partial as long as the
   * amount is not greater than the SG Balance. The defaulted amount is the SG Balance and
   * mandatory.", refined same day: "Amount default to SG Available Balance") — A9 only. Replaces a
   * manual Full/Partial Redeem subChoice: Amount defaults to the picked SG's own Available Balance
   * (component.ts's refreshSelectedContractSnapshot()) — Available, not Confirmed, so any OTHER
   * redemption already PENDING against this same SG is correctly netted out — and stays freely
   * editable down, capped at it (never disabled — rebuildFields()'s amountCappedAtSg/props.max).
   * movementType is DERIVED at submit() time from whether the typed amount still equals that
   * Available Balance (FULL_REDEEM) or was reduced below it (PARTIAL_REDEEM), never picked by the
   * user.
   */
  autoRedeemType?: boolean;
  /**
   * Business instruction 2026-08-15 ("B3 不須選 Sight/Usance 因為交易本身已經有此訊息了 — 登記 B1 時已經
   * 有此訊息了") — B3 only. Replaces a manual Sight/Usance subChoice: the picked EPLC_CONFIRMATION
   * contract's own tenorType (declared once, at B1 Confirm LC) already says which it is, so asking
   * again at Present Docs time was redundant — and could theoretically diverge from the contract's
   * real tenorType if the Maker picked wrong. onSelectContract() (component.ts) derives
   * model.movementType from the picked contract's own tenorType instead: 'SIGHT' -> 'HONOUR', anything
   * else (Usance, i.e. SELLERS_USANCE per B1's own Sight/Usance-only Tenor Type options) -> 'ACCEPT'.
   */
  movementTypeFromContractTenor?: boolean;
}

const ALL_TENOR_OPTIONS = [
  { value: 'SIGHT', label: 'Sight' },
  { value: 'SELLERS_USANCE', label: "Seller's Usance" },
  { value: 'BUYERS_USANCE', label: "Buyer's Usance" },
];

/**
 * Human label for a contract's own tenorType (2026-08-19, user-requested — LC Master Records Index's
 * own new "Tenor Type" column, both Import LC and Export Confirmed LC) — side-aware because Export
 * Confirmed LC deliberately labels SELLERS_USANCE as plain "Usance" (Buyer's/Seller's is an Import-side-
 * only financing-structure distinction the confirming bank has no visibility into — see
 * EXPORT_TENOR_OPTIONS's own doc comment below) while Import LC spells out which. Reuses the SAME two
 * option arrays A1's/B1's own tenorType Formly `select` fields are already built from (ALL_TENOR_OPTIONS/
 * EXPORT_TENOR_OPTIONS, both below) rather than a third, independently-maintained copy of these label
 * strings. "—" for a null/unset tenorType (legacy data, or an instrumentType where tenorType doesn't
 * apply) or a value that doesn't resolve for the given side (e.g. a BUYERS_USANCE Export Confirmation,
 * which the business rules say should never happen — see EXPORT_TENOR_OPTIONS — but is handled the same
 * defensive way as every other unresolved-lookup fallback in this file, not a thrown error).
 *
 * Deliberately does NOT attempt to detect or label a "Mixed Tenor" case — floated by the user, then
 * explicitly deferred ("Not for the time-being") pending a still-undecided detection rule. A single
 * BalanceContract's own tenorType is one fixed value, declared once at Issue and protected thereafter
 * (Design doc §7), so there is no multi-value case for this function to resolve today.
 */
export function tenorTypeLabel(tenorType: string | null | undefined, side: 'IMPORT' | 'EXPORT'): string {
  if (!tenorType) return '—';
  const options = side === 'EXPORT' ? EXPORT_TENOR_OPTIONS : ALL_TENOR_OPTIONS;
  return options.find((o) => o.value === tenorType)?.label ?? '—';
}

const USANCE_ONLY_TENOR_OPTIONS = [
  { value: 'SELLERS_USANCE', label: "Seller's Usance" },
  { value: 'BUYERS_USANCE', label: "Buyer's Usance" },
];

// Business instruction 2026-08-15: from the Export/confirming bank's own point of view, Buyer's
// Usance vs Seller's Usance is meaningless — that split is an Import-side domestic financing-structure
// decision (rationale non-negotiable #4, BU-A/BU-B fundingParty) the confirming bank has no visibility
// into. The confirming bank's own undertaking only ever distinguishes Sight vs Usance. Stored as
// SELLERS_USANCE (the backend TenorType enum has no generic USANCE value) but labelled plain "Usance".
const EXPORT_TENOR_OPTIONS = [
  { value: 'SIGHT', label: 'Sight' },
  { value: 'SELLERS_USANCE', label: 'Usance' },
];

/**
 * Business instruction 2026-08-14 — full Import function renumbering:
 * "A3-Document Arrival (Sight), A4-Sight Settlement, A5-Document Arrival
 * (Usance), A6-Acceptance (Usance), A7-Acceptance Settlement, A8-Shipping
 * Gtee (Issue), A9-Shipping Gtee (Redemption)". A1/A2 unchanged. Also
 * splits what was a single SHGT card (Issue/Partial Redeem/Full Redeem
 * subChoice) into two dedicated cards (A8 Issue, A9 Redemption), matching
 * how A3/A6/A7 already separate Document Arrival from Acceptance from
 * Settlement rather than subChoice-ing them together.
 *
 * Business instruction 2026-08-14 (later) — A3 (Sight) and the former A5
 * (Usance) were then MERGED: mechanically identical (IPLC_LC/UTILIZE, same
 * fields), the only difference was which tenor's Catalog picker filter was
 * applied. The picked LC's own tenorType already determines whether it
 * routes to A4 (Sight) or A6 (Usance) — no need to pre-split the function
 * itself. A5's number was retired, not reused; A6-A9 numbers unchanged.
 */
export const IMPORT_FUNCTIONS: TransactionFunction[] = [
  {
    code: 'A1',
    label: 'LC Issue',
    side: 'IMPORT',
    instrumentType: 'IPLC_LC',
    movementType: 'ISSUE',
    tenorTypeOptions: ALL_TENOR_OPTIONS,
    help: "Establish a new Import LC, with Tolerance on a Maximum Exposure Basis. Tenor Type is the LC's own stated payment term, declared at issuance (Design doc §7) — determines whether A3 routes to A4 (Sight) or A6 (Usance) later.",
  },
  {
    code: 'A2',
    label: 'LC Amendment',
    side: 'IMPORT',
    instrumentType: 'IPLC_LC',
    subChoice: {
      key: 'movementType',
      label: 'Direction',
      options: [
        { value: 'AMEND_INCREASE', label: 'Increase' },
        { value: 'AMEND_DECREASE', label: 'Decrease' },
      ],
    },
    secondaryRefLabel: 'Amendment No./Times',
    help: 'Increase always succeeds; Decrease is checked against Available Balance (Design doc §6.2).',
  },
  // Business instruction 2026-08-14 ("A3 and A5 could be combined, the only
  // difference that A3 => A4 for Sight, and A3 => A6 Usance based on the LC
  // Event flow"): A3 and the former A5 were mechanically identical
  // (IPLC_LC/UTILIZE, same fields) — the only difference was which Catalog
  // picker filter was applied, which routing help text pointed at, and
  // nothing about the ACTION itself. The picked LC's own tenorType (set at
  // A1 Issue) already determines the correct downstream step; the function
  // doesn't need to be pre-split by tenor. Merged into one card, showing
  // ALL ACTIVE IPLC_LC contracts regardless of tenor — no catalogTenorFilter.
  {
    code: 'A3',
    label: 'Document Arrival',
    side: 'IMPORT',
    instrumentType: 'IPLC_LC',
    movementType: 'UTILIZE',
    secondaryRefLabel: 'IB Number',
    // Business instruction 2026-08-14 (revised Maker/Checker statement):
    // Maker moves the amount to Pending (the earmark, at creation);
    // Checker's Approve here does NOT further update the LC Balance —
    // component.ts's approveArrival() is an acknowledgment only, it does
    // NOT call the release API, so the movement stays PENDING server-side
    // either way (Sight or Usance) — only A4 (Sight) or A6 (Usance)
    // actually finalizes it. Reject still calls the real reject API.
    deferSettlement: true,
    help: "Presentation Earmark (PENDING) for ANY tenor. Checker Approve here is an acknowledgment only — it does NOT finalize the LC Balance, which stays Pending either way. Go to A4 (Sight Settlement) if this LC is Sight, or A6 (Acceptance) if it's Usance — the LC's own declared Tenor Type (from A1 Issue) decides which. If this LC has an outstanding Shipping Guarantee reserving the capacity this arrival needs, use A3S instead — a plain A3 now hard-rejects past Tight Available (Design doc §6.1 v0.12).",
  },
  // Business instruction 2026-08-14 ("Document Arrival w Shipping Gtee... Bill Amount will be protected and
  // carry from selected SG Record"): a plain A3 checks against Tight Available (Available Balance minus ALL
  // outstanding SG exposure on this LC) and now hard-rejects if exceeded (v0.12) — this function is the
  // explicit, SG-matched alternative for exactly that case, netting the picked SG's own exposure out of the
  // check by redeeming it first. See documentArrivalWithSg's own doc comment above for the full mechanism.
  {
    code: 'A3S',
    label: 'Document Arrival w/ Shipping Gtee',
    side: 'IMPORT',
    instrumentType: 'IPLC_LC',
    movementType: 'UTILIZE',
    secondaryRefLabel: 'IB Number',
    documentArrivalWithSg: true,
    deferSettlement: true,
    // Business instruction 2026-08-15 ("SG redemption should support partial redemption... SG
    // Redemption Amount = system-calculated MIN(Bill Amount, SG Outstanding)") — reverses the prior
    // full-match-only rule (Bill Amount used to be locked to the SG's own outstanding).
    help: "For documents arriving against an LC that still has an outstanding Shipping Guarantee reserving the capacity (A8). Pick the LC, then the specific SG record below — Bill Amount is the actual document amount, freely typed; SG Redemption Amount = MIN(Bill Amount, SG Outstanding), shown below once picked (any excess above the SG's outstanding is ordinary incremental LC exposure, still checked against Tight Available). Maker: Submit reserves BOTH the SG's own redemption (Full or Partial, whichever the match works out to) and this Document Arrival as PENDING. Checker: one Release does BOTH — the SG redemption releases AND the Document Arrival moves to Pending LC Balance (still not finalized — go to A4/A6 next, same as a plain A3).",
  },
  {
    code: 'A4',
    label: 'Sight Settlement',
    side: 'IMPORT',
    instrumentType: 'IPLC_LC',
    movementType: 'UTILIZE',
    catalogTenorFilter: 'SIGHT',
    // Business-reported gap 2026-08-14: "There is no Sight Payment function
    // for the Tenor Sight to pay", then clarified: "Sight Payment needs to
    // pickup the LC number then the pickup IB Number under the LC Number,
    // once pickup, the Amount will be captured for the IB records without
    // further input." Amount is NOT re-typed here — it was already fixed
    // when A3 recorded the presentation; re-typing it would risk a payment
    // amount that doesn't match the documents actually presented.
    // payExistingUtilize (component.ts) makes this the Checker step:
    // search-and-release ONLY — no createMovement call, unlike A3.
    // Business instruction 2026-08-16, revised twice the same day. First: "A4 Need Maker and Checker
    // feature (4 eyes principle) i.e. Submit by Maker, then Release by Checker" — A4 used to have its
    // own dedicated "Pay (Release)" button that released directly, a single actor doing both steps;
    // removed in favor of a browse-only picker + the standard Checker panel. Then, immediately: "Add
    // real Maker Submit, then have Checker to Release it. Exactly the same as A1." — browse-only
    // wasn't enough; A4 needed a REAL Maker action too, not just a "go release it yourself" hint. A4
    // still creates no new movement (component.ts's submitA4() calls the dedicated maker-submit
    // backend action on A3's own already-earmarked UTILIZE, not createMovement()) — but it IS now a
    // genuine, backend-persisted Maker step (visible to any independent Checker session) that gates
    // the Checker's own Release, exactly like every other function's Submit does.
    payExistingUtilize: true,
    help: 'Sight only — pick the LC (LC Index), then the still-PENDING IB record under it (IB Index) that A3 recorded; Amount is shown read-only from that record, never re-typed. Maker: Submit A4 — a real action confirming this Document Arrival for settlement (no LC Balance change yet). Checker: search the same LC in the Checker panel below and Release — this moves the LC Balance from Pending to Approved/Utilized and is the only step that finalizes it. If nothing is PENDING yet, use A3 (Document Arrival) first.',
  },
  {
    code: 'A6',
    label: 'Acceptance (Usance)',
    side: 'IMPORT',
    instrumentType: 'IPLC_ACCEPTANCE',
    movementType: 'CREATE',
    defaultParentInstrumentType: 'IPLC_LC',
    tenorTypeOptions: USANCE_ONLY_TENOR_OPTIONS,
    // Business instruction 2026-08-14, revised: "When Submit A6, the LC
    // Balance is remain unchanged but create an Acceptance Balance in
    // Pending. When Checker approve it, then LC Balance will be approved
    // and Acceptance Balance will be approved too." — matching
    // balanceService.ts's own documented principle that a Usance drawing
    // is deliberately two separate calls, orchestrated by the caller, not
    // the backend — but BOTH calls now happen at the CHECKER's Release
    // click, not the Maker's Submit: (1) release the picked still-PENDING
    // Document Arrival (A3) — finalizes the ORIGINAL LC Balance, Pending ->
    // Approved/Utilized; (2) THEN release the new Acceptance itself. Amount
    // and Tenor Type/Days are carried from the picked Document
    // Arrival/parent LC and protected (read-only) — see component.ts's
    // rebuildFields().
    settlesDocumentArrival: true,
    payableMovementType: 'UTILIZE',
    pendingItemLabel: 'Document Arrival',
    pendingItemSourceHint: 'use A3 (Document Arrival) first',
    help: 'Usance only — pick the LC (LC Index), then the still-PENDING Document Arrival under it (IB Index) that A3 recorded; Amount, Tenor Type, and Tenor Days are carried over and protected (read-only). Maker: Submit only creates the new Acceptance Balance (PENDING) — the LC Balance stays unchanged. Checker: one Release click does BOTH — releases that Document Arrival (LC Balance Pending -> Approved/Utilized) AND approves the new Acceptance Balance.',
  },
  {
    code: 'A7',
    label: 'Acceptance Settlement',
    side: 'IMPORT',
    instrumentType: 'IPLC_ACCEPTANCE',
    subChoice: {
      key: 'movementType',
      label: 'Settlement type',
      options: [
        { value: 'FULL_SETTLE', label: 'Full Settle' },
        { value: 'PARTIAL_SETTLE', label: 'Partial Settle' },
      ],
    },
    defaultParentInstrumentType: 'IPLC_LC',
    // Business instruction 2026-08-14 ("A7 should filter out LC records Tenor = Sight") — an Acceptance can
    // only ever exist under a Usance LC (Design doc §7: Sight never routes to A6/A7), so a Sight LC in the LC
    // Index would always have zero IBs to pick in Step 2. A7 has no tenorTypeOptions of its own (nothing is
    // being declared here), so this piggybacks on the same catalogTenorFilter used by A4's flat Catalog picker.
    catalogTenorFilter: 'USANCE',
    help: 'Settlement Due Date — never touches the LC Balance itself (Cross-Reference Finding 1). Pick the LC below (LC Index, Usance only — a Sight LC never has an Acceptance), then the IB Number (IB Index) — a single LC can have multiple Document Arrivals.',
  },
  {
    code: 'A8',
    label: 'Shipping Gtee (Issue)',
    side: 'IMPORT',
    instrumentType: 'SHGT',
    movementType: 'ISSUE',
    defaultParentInstrumentType: 'IPLC_LC',
    // Business instruction 2026-08-14 ("SG issue amount should be less than the LC Current Balance" — "For
    // example S001 has 3000 LC Available Balance, the SG Issue should be not greater than 3000... a validation
    // for the Maker Input") — server-enforced (balanceService.ts), rejects with 409 at Submit if exceeded.
    // Overrides Design doc §5/§11's earlier LMTS-Available-Limit-based decision (see design doc v0.10 note).
    help: "Independent contingent liability, issued against the LC as parent. Amount is capped at the parent LC's current Available Balance — rejected at Submit if exceeded (business instruction 2026-08-14, overriding the original LMTS-based sufficiency design). See Design doc §6.1 for the separate, non-blocking off-balance WARNING that also applies later against the LC's own UTILIZE. SG Number is SHGT's own natural key field (below), not a separate reference.",
  },
  // Business instruction 2026-08-15 ("There is no need to select Full or Partial as long as the
  // amount is not greater than the SG Balance. The defaulted amount is the SG Balance and
  // mandatory.", refined same day: "Amount default to SG Available Balance") — drops the earlier
  // explicit Full/Partial Redeem subChoice entirely (superseding a same-session prior design where it
  // stayed a manual choice). movementType is now fixed to FULL_REDEEM as a placeholder — the real
  // value is DERIVED at submit() time (autoRedeemType, see its own doc comment) from whether the typed
  // Amount still equals the SG's Available Balance.
  {
    code: 'A9',
    label: 'Shipping Gtee (Redemption)',
    side: 'IMPORT',
    instrumentType: 'SHGT',
    movementType: 'FULL_REDEEM',
    autoRedeemType: true,
    defaultParentInstrumentType: 'IPLC_LC',
    help: "Search by LC Number + SG Number (below) — a single LC can have multiple Shipping Guarantees. Amount defaults to the SG's current Available Balance and stays editable, capped at it — reduce it for a Partial Redeem, leave it as-is for a Full Redeem (no separate type to pick). Design doc §6.1: redemption is NOT auto-linked to Document Arrival (A3) — it's a separate, explicit action.",
  },
];

/**
 * Business instruction 2026-08-15 ("EBL does not include in the Balance Component Scope, therefore
 * the Export LC without confirmation should be removed from the Export") — this side ("Export
 * Confirmed" in the UI) ONLY models Confirmed Export LC. Plain (unconfirmed) advising and Unconfirmed
 * negotiation (EBL) are deliberately absent: per rationale-en.md §6/§7.4b, advising itself creates no
 * contingent, and Unconfirmed negotiation/refinancing are both funded-lending products that belong to
 * a separate Loan Component, not this one. `EPLC_LC` stays a valid InstrumentType in the schema, but
 * no function here creates one, and (2026-08-15) it was also dropped from the "Look Up Current
 * Balance" instrumentType dropdown (transaction-builder.component.html) for the same reason — this
 * dev prototype's DB carries no real historical EPLC_LC records worth keeping reachable.
 */
export const EXPORT_FUNCTIONS: TransactionFunction[] = [
  // Business instruction 2026-08-15 ("EBL does not include in the Balance Component Scope, therefore
  // the Export LC without confirmation should be removed from the Export"): checked against the frozen
  // event catalogue (rationale-en.md §6/§7.4b) — the ONLY substantive events under an Unconfirmed
  // (Nominated) LC are EX_NEGOTIATE (with-recourse negotiation, obligor=Exporter — the Unconfirmed EBL)
  // and EX_REFIN (this bank refinancing the issuing bank) — both funded-lending products, already out
  // of Balance Component scope. EX_ADVISE itself creates no contingent (§6, NO_BALANCE_EFFECT). So
  // once EBL/Nego is excluded, an Unconfirmed Export LC has NOTHING left for the Balance Component to
  // track — the Confirmed?/subChoice previously here, and B4's EPLC_LC-parented MEMO Acceptance path,
  // are both removed. This side now ONLY models Confirmed Export LC.
  {
    code: 'B1',
    label: 'Confirm LC',
    side: 'EXPORT',
    instrumentType: 'EPLC_CONFIRMATION',
    movementType: 'ISSUE',
    tenorTypeOptions: EXPORT_TENOR_OPTIONS,
    help: "Adds this bank's own confirmation — an independent undertaking to the beneficiary, obligor = issuing bank (rationale §7.1). Plain advising (no confirmation) and Unconfirmed negotiation (EBL) are out of Balance Component scope — see the module note above. Tenor Type is the LC's own stated payment term, declared at confirmation (Design doc §7) — Sight or Usance only from the confirming bank's own perspective (Seller's/Buyer's Usance is an Import-side financing-structure distinction the confirming bank has no visibility into).",
  },
  {
    code: 'B2',
    label: 'Confirm LC Amendment',
    side: 'EXPORT',
    instrumentType: 'EPLC_CONFIRMATION',
    movementType: 'AMEND',
    secondaryRefLabel: 'Amendment No./Times',
    help: "Adjusts confirmed_amount — rationale §7.2: a confirming bank may advise an amendment WITHOUT extending its confirmation (Art. 10(b)), so confirmed_amount can genuinely diverge from the LC's own face amount. This function only ever moves the Confirmation's own contingent.",
  },
  // Business instruction 2026-08-15 ("Confirm LC Balance 控制" table review, cs-tf-balance-knowhow
  // business-expert check) — B3 REBUILT as a genuinely separate physical event (D3: "documents
  // arriving is a physical event... only legal events move balances"; impl-spec-en.md's own matrix:
  // `EX_DOC_RCV` touches only `EXPORT_BILLS_UNDER_EXAMINATION`/`_CONTRA`, never `CONFIRMATION_
  // OUTSTANDING`). B3 no longer auto-derives Sight/Usance or touches the Confirmation at all — it
  // only creates a MEMO_ONLY `EPLC_EXAMINATION` earmark under the picked Confirmation (either tenor,
  // same event either way). B4 (Honour / Acceptance) is now the actual legal-event step — see its own
  // doc comment for the full B3→B4 handoff.
  {
    code: 'B3',
    label: 'Present Docs',
    side: 'EXPORT',
    instrumentType: 'EPLC_EXAMINATION',
    movementType: 'CREATE',
    defaultParentInstrumentType: 'EPLC_CONFIRMATION',
    // No secondaryRefLabel — unlike old-B3 (EPLC_CONFIRMATION, an existing-contract lookup with no
    // ibNumber of its own), B3's own instrumentType (EPLC_EXAMINATION) HAS ibNumber as its natural
    // key (like A8's SHGT Issue), so the "New Reference — Natural Key" EB Number field already serves
    // as both identity and audit reference — a second secondaryRef field would be redundant.
    //
    // Checker Release SUPERSEDED 2026-08-18 (business instruction, "所有交易要RELEASE過後 才能根據流程走
    // 下一個交易" — every transaction must genuinely RELEASE before the next step in the flow can act on
    // it): previously acknowledgment-only (deferSettlement/deferSettlementRequiresBackendAck, mirroring
    // plain A3's own pattern) — the memo stayed PENDING forever, only B4's own compound release ever
    // finalized it for real. B3 now has NO special Checker flags at all — it uses the standard
    // release()/reject() path directly, same as A1/A2/A8/A9/B1/B2. A real Checker Release genuinely
    // transitions PENDING -> RELEASED (EARMARKED) on B3's own record, independent of B4 — B4 later
    // consumes it (marks it as no longer occupying Present Docs Earmark capacity) via its own linked
    // HONOUR/ACCEPT's own referencedTransactionId, see checker-actions.service.ts's own doc comment.
    help: 'Physical event only (cs-tf-balance-knowhow D3: "documents arriving... only legal events move balances") — creates a MEMO_ONLY examination earmark; the Confirmation itself stays completely untouched, Sight or Usance alike. Pick the Confirmation LC, type the EB Number for this presentation. Maker: Submit reserves it as PENDING. Checker: Release genuinely finalizes THIS record (PENDING -> RELEASED) — it still occupies Present Docs Earmark capacity until B4 (Honour / Acceptance) actually consumes it; skipping B4 leaves it RELEASED but never consumed.',
  },
  // Business instruction 2026-08-15 ("Confirm LC Balance 控制" table review) — B4 REBUILT as the
  // unified legal-event step for BOTH tenors, absorbing what used to be split across the old B3
  // (Sight/HONOUR, createsIssuingBankReceivableOnHonour) and the old B4 (Usance/ACCEPT's own
  // Acceptance+Receivable compound, createsAcceptanceReimbReceivableOnCreate) — this is what `CNF_
  // HONOUR_SIGHT`/`CNF_ACCEPT` actually ARE: the real legal event, not just a follow-up to one. Its
  // own instrumentType is EPLC_CONFIRMATION (no parent of its own), so — like the old B3 — it picks
  // its target via the flat Catalog (onSelectContract), NOT a Parent LC picker; movementType is
  // derived the same way the old B3 did (movementTypeFromContractTenor: SIGHT -> HONOUR, else ->
  // ACCEPT). settlesDocumentArrival (reused from A6) then shows Step 2: still-PENDING B3 Present Docs
  // records under whichever Confirmation was picked (payableMovementType: 'CREATE' — B3's own
  // deferSettlement leaves them PENDING for exactly this); picking one auto-fills EB Number and
  // Amount. Maker Submit creates the primary req (HONOUR or ACCEPT) plus whichever secondary leg(s)
  // that tenor needs, all PENDING, linked by one businessEventId:
  //   Sight:  HONOUR (Confirmation) -> EPLC_DUE_FROM_ISSUING_BANK (asset) — createsIssuingBankReceivableOnHonour
  //   Usance: ACCEPT (Confirmation) -> EPLC_ACCEPTANCE (liability) -> EPLC_ACCEPTANCE_REIMB_RECEIVABLE (asset) — createsAcceptanceReimbReceivableOnCreate
  // Checker Release SUPERSEDED 2026-08-18 (business instruction, "所有交易要RELEASE過後 才能根據流程走
  // 下一個交易") — used to be a single click doing the WHOLE compound including releasing the picked B3
  // record FIRST; B3 is now independently RELEASED by its own real Checker action BEFORE B4 ever picks
  // it (payableMovementRequiresRelease below only shows already-RELEASED candidates), so re-releasing
  // it here would 409 (RELEASED has no further legal transitions). Checker Release now releases ONLY
  // the primary (Honour/Accept) and whichever secondary leg(s) — the B3 record is marked "consumed"
  // (stops occupying Present Docs Earmark capacity) as a server-side side effect of releasing the
  // primary, via its own referencedTransactionId — see checker-actions.service.ts's own doc comment.
  {
    code: 'B4',
    label: 'Honour / Acceptance',
    side: 'EXPORT',
    instrumentType: 'EPLC_CONFIRMATION',
    movementType: 'HONOUR',
    movementTypeFromContractTenor: true,
    secondaryRefLabel: 'EB Number',
    settlesDocumentArrival: true,
    payableMovementType: 'CREATE',
    payableMovementInstrumentType: 'EPLC_EXAMINATION',
    payableMovementRequiresRelease: true,
    pendingItemLabel: 'Present Docs',
    pendingItemSourceHint: 'use B3 (Present Docs) first',
    pendingItemSourceCode: 'B3',
    createsIssuingBankReceivableOnHonour: true,
    createsAcceptanceReimbReceivableOnCreate: true,
    help: "The actual Honour/Accept legal event (cs-tf-balance-knowhow §7.4a/§7.6) — Sight vs Usance is read from the picked Confirmation's own Tenor Type (declared at B1), not re-asked here. Pick the Confirmation, then the already-RELEASED B3 (Present Docs) record under it (B3 must be genuinely Released first — go to B3 if nothing shows here) — EB Number and Amount are carried from it. Sight: Honours, releasing the Confirmation contingent and creating the Due from Issuing Bank asset (rationale §7.4a) — go to B5 to record the actual reimbursement later. Usance: Accepts, releasing the Confirmation contingent and creating BOTH the Acceptance liability AND its Reimbursement Receivable asset (rationale §7.6) — go to B5 at maturity too. Checker: one Release does the primary (Honour/Accept) and whichever secondary leg(s) that tenor needs, and consumes the B3 record's own Present Docs Earmark occupancy as a side effect.",
  },
  // Business instruction 2026-08-16 ("從Balance Component角度來看B5不需要，B6改成B5選資料為有Acceptance
  // Balance>0的EB交易，交易會解除EB交易的Acceptance Balance") — merges the OLD B5 (Settlement Due Date,
  // EPLC_ACCEPTANCE FULL_SETTLE/PARTIAL_SETTLE only — paid the beneficiary, but left the matching
  // Reimbursement Receivable as separate follow-up work) into the OLD B6 (Settlement — Reimbursement
  // Received). Grounded in the frozen spec's own event table (impl-spec-en.md, the authoritative
  // event→balance-type catalogue): `CNF_MATURE` | `−CONFIRMED_ACCEPTANCE_DPU_OUTSTANDING` |
  // `−BENEFICIARY_ACCOUNT; +NOSTRO / −ACCEPTANCE_REIMB_RECEIVABLE_ISSUING_BANK` — ONE event clears BOTH
  // the Acceptance liability AND its Reimbursement Receivable together; the OLD split (B5 does the
  // liability, B6 separately does the receivable via `CNF_REIMB`) was wrong — `CNF_REIMB`'s own FROM
  // clause (`−DUE_FROM_ISSUING_BANK or −EXPORT_BILLS_DISCOUNTED`) never mentions
  // `ACCEPTANCE_REIMB_RECEIVABLE_ISSUING_BANK` at all; that clearing only ever happens inside
  // `CNF_MATURE`. Sight keeps its own genuinely-separate `CNF_REIMB` (Due from Issuing Bank has no
  // paired liability to settle) — at this point in B5's history (before being reverted to Usance-only
  // below), a `dualInstrumentFallback` field let one B5 function resolve Sight vs Usance transparently
  // by the same LC+EB Number without the Maker needing to know which tenor this was; that field was
  // later removed as dead code (Quality-report-balance.md BAL-101) once B5 stopped needing it.
  // Business instruction 2026-08-16 ("BALANCE COMPONENT 只負責 CONTINGENT LIABILITY" — Balance
  // Component only owns the bank's own contingent/liability side; once Sight's Confirmation contingent
  // converts into a pure receivable (EPLC_DUE_FROM_ISSUING_BANK, an ON_BALANCE_ASSET with NO paired
  // liability — Sight never creates an Acceptance), collecting it is someone else's job, out of scope
  // here — B3/B4 still CREATE that asset (untouched, business instruction "只移除 B5 Sight 分支的顯示/
  // 選取（不動 B3/B4）"), there just isn't a Balance Component function to settle it. Usance held-to-
  // maturity stays in scope: CNF_MATURE is fundamentally about closing the Acceptance DPU LIABILITY,
  // and clears its paired EPLC_ACCEPTANCE_REIMB_RECEIVABLE only as a side-effect of that SAME event
  // (settlesAcceptanceOnMature below) — not a standalone asset-tracking function the way Sight's own
  // settlement would have been. B5 is Usance-only again (reverses part of §6.9's Sight+Usance merge —
  // the merge's own Usance-side compound logic is unchanged, only the Sight branch is gone).
  {
    code: 'B5',
    label: 'Settlement — Reimbursement / Maturity',
    side: 'EXPORT',
    instrumentType: 'EPLC_ACCEPTANCE',
    movementType: 'FULL_SETTLE',
    settlesAcceptanceOnMature: true,
    defaultParentInstrumentType: 'EPLC_CONFIRMATION',
    catalogTenorFilter: 'USANCE',
    settleableBalanceIndex: true,
    help: "Confirm LC Settlement — Usance held-to-maturity only (CNF_MATURE): one compound settles BOTH the Acceptance (this bank's own DPU liability, paid to the beneficiary) AND its matching Reimbursement Receivable (the issuing bank's own reimbursement to this bank), same amount, in a single Checker Release. Pick the LC (LC Index, Usance only), then the EB Number (EB Index) — a single LC can have multiple Document Presentations. Sight settlement (Due from Issuing Bank) is out of Balance Component's own scope — Balance Component only owns the contingent/liability side; B4 still creates that asset, but collecting it happens outside this system. Nego'd/discounted Usance (EPLC_EXPORT_BILLS_DISCOUNTED) is still follow-up work, not this function.",
  },
];

/**
 * Inquire Events (2026-08-17, OOD Design Patterns — Strategy) — true when `movementType` is one this
 * function could actually have produced, treating IMPORT_FUNCTIONS/EXPORT_FUNCTIONS as a strategy
 * table for resolveFunctionForMovement() below rather than adding a second, separately-maintained
 * (instrumentType, movementType) -> function map.
 *
 * A literal `fn.movementType`/`fn.subChoice.options` match covers most functions. Three flags mean the
 * registry's own `movementType` is only a placeholder default — the real value is derived elsewhere —
 * so a literal-only match would silently miss half of what the function actually produces:
 *  - `movementTypeFromContractTenor` (B4): HONOUR vs ACCEPT is read from the picked contract's own
 *    tenorType at submit time, not fixed on the registry entry. B4 is EPLC_CONFIRMATION's only HONOUR/
 *    ACCEPT producer today, so matching on instrumentType alone is unambiguous here.
 *  - `autoRedeemType` (A9): FULL_REDEEM is the registry default; PARTIAL_REDEEM is derived from Amount
 *    vs the SG's own Available Balance at submit time.
 *  - `settlesAcceptanceOnMature` (B5): same shape as autoRedeemType, for FULL_SETTLE/PARTIAL_SETTLE.
 */
function movementTypeMatchesFunction(fn: TransactionFunction, movementType: string): boolean {
  if (fn.movementType === movementType) return true;
  if (fn.subChoice?.options.some((o) => o.value === movementType)) return true;
  if (fn.movementTypeFromContractTenor) return true;
  if (fn.autoRedeemType && movementType === 'PARTIAL_REDEEM') return true;
  if (fn.settlesAcceptanceOnMature && movementType === 'PARTIAL_SETTLE') return true;
  return false;
}

/**
 * Inquire Events (2026-08-17) — which named business function (A1-A9/B1-B5) could have produced a
 * given (instrumentType, movementType) pair, so a historical movement's own data can be redisplayed
 * through that function's own field set (builder-fields.ts's buildFields(), unchanged) rather than a
 * second, purpose-built "view" field list.
 *
 * Known, explicitly-accepted limitation (same honesty convention as Quality-report-balance.md BAL-108's
 * own "left as-is, documented" entries): a handful of (instrumentType, movementType) pairs are produced
 * by MORE than one function code — e.g. IPLC_LC/UTILIZE comes from both A3 (Document Arrival, Sight)
 * and A3S (Document Arrival w/ Shipping Gtee); SHGT/FULL_REDEEM comes from both A9 (SG Redemption) and
 * A3S's own first leg. This resolver returns the first registry match (IMPORT_FUNCTIONS ahead of
 * EXPORT_FUNCTIONS, each searched in declared order) rather than trying to disambiguate via
 * businessEventId cross-referencing — the reconstructed FIELD SET is identical either way in every
 * such case (the difference between the two functions is a label string, never which fields exist), so
 * this only affects which function-code badge Inquire Events shows, never the data displayed. Returns
 * undefined when nothing matches (a movementType/instrumentType combination no current function
 * produces, e.g. legacy data) — callers must fall back to a generic, function-less field set rather
 * than guessing.
 */
export function resolveFunctionForMovement(instrumentType: InstrumentType, movementType: string): TransactionFunction | undefined {
  const direct = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].find((fn) => fn.instrumentType === instrumentType && movementTypeMatchesFunction(fn, movementType));
  if (direct) return direct;
  // Bug fixed 2026-08-18, reviewer-reported (Inquire Events on LC U01 showed a blank "–" Function
  // column for the EPLC_ACCEPTANCE/CREATE row) — B4's own Usance compound Maker Submit
  // (createsAcceptanceReimbReceivableOnCreate) creates this movement as a SECONDARY leg, but B4's own
  // registry entry is instrumentType EPLC_CONFIRMATION, so the direct match above can never find it
  // for this leg's own instrumentType (unlike A6 on the Import side, whose registry entry IS
  // instrumentType IPLC_ACCEPTANCE/CREATE directly). This is a real, named, in-scope Balance Component
  // ledger event (unlike the on-balance-sheet asset legs — EPLC_DUE_FROM_ISSUING_BANK/
  // EPLC_ACCEPTANCE_REIMB_RECEIVABLE — which genuinely have no Balance Component function at all, per
  // this file's own "Balance Component 只負責 Contingent Liability" scope boundary, and correctly stay
  // unresolved), so it earns its own fallback rather than being left blank.
  if (instrumentType === 'EPLC_ACCEPTANCE' && movementType === 'CREATE') {
    return EXPORT_FUNCTIONS.find((fn) => fn.createsAcceptanceReimbReceivableOnCreate);
  }
  return undefined;
}

/**
 * Status display — **settled requirement, 2026-08-18** (business instruction, final locked-in form
 * after two same-day revisions: "PENDING: not yet released. EARMARK: released, but the balance is only
 * earmarked/reserved..." → narrowed to "EARMARK only applies to... Import LC Document Arrival and
 * Export Present Docs" → this function's own final table: "EARMARKING/EARMARKED replace PENDING/
 * APPROVED for A3/A3S/B3 specifically; every other function keeps PENDING/APPROVED unchanged. Both
 * Look Up Current Balance and Inquire Events MUST use exactly the same mapping — do not get this wrong
 * again."). The full, authoritative mapping (see this file's own nested `CLAUDE.md` decision log for
 * the full requirement writeup) — both the NOT-RELEASED and RELEASED label change together, driven by
 * the SAME function classification:
 *
 * | Function                     | Not Released | Released    |
 * |-------------------------------|--------------|-------------|
 * | Import LC — A3 / A3S          | EARMARKING   | EARMARKED   |
 * | Export Confirmed LC — B3      | EARMARKING   | EARMARKED   |
 * | All other functions           | PENDING      | APPROVED    |
 *
 * The A3/A3S/B3 pair is STILL what earns the special label — both are D3 "physical event, not a legal
 * event" earmarks (`cs-tf-balance-knowhow`'s own Design Principle — "Documents arriving is a physical
 * event... Only legal events move balances", already cited throughout A3/A3S's/B3's own doc comments
 * elsewhere in this file): the amount they reserve doesn't become the bank's own definitive contingent
 * position until a LATER, separate legal event (A4/A6 Settlement for Import, B4 Honour/Acceptance for
 * Export) actually posts it — true whether that reservation is still Maker-submitted-only (EARMARKING)
 * or already Checker-released (EARMARKED). Every OTHER function's PENDING/RELEASED movement (LC Issue,
 * SG Issue, Acceptance CREATE/Settlement, Confirmation Issue/Honour/Accept, etc.) IS the definitive
 * legal event for its own leg at each of those two stages — those stay PENDING/APPROVED, unchanged.
 *   - Import: `IPLC_LC`/`UTILIZE` (A3/A3S's own Document Arrival earmark).
 *   - Export: `EPLC_EXAMINATION`/`CREATE` (B3's own Present Docs earmark).
 * `EPLC_LC` is deliberately not included — it's a reference-only instrumentType never actually created
 * by any function in this registry (see the Tolerance conversion section of this file's own nested
 * CLAUDE.md), so there is no real "Export Document Arrival" leg to cover.
 *
 * Renamed from `isEarmarkOnlyRelease` (2026-08-18) — the ORIGINAL name only made sense back when this
 * classification only affected the RELEASED label; now that it drives BOTH the PENDING-side
 * (EARMARKING) and RELEASED-side (EARMARKED) label, "earmark function" is the accurate name for what
 * this actually identifies: is this movement one of the two functions whose whole lifecycle (both
 * before AND after Release) is an earmark, never the two functions' own PENDING/RELEASED movements one
 * at a time.
 *
 * **Bug fixed same day, reviewer-caught live** ("Import LC S01 => A4 · Sight Settlement / IPLC_LC /
 * UTILIZE / ... / EARMARKED — 應該是 Approved 對嗎?" — shouldn't that be Approved?): a raw
 * `(instrumentType, movementType)` check alone cannot tell A3/A3S's own row apart from A4's own row for
 * a FINALIZED Sight Document Arrival, because Inquire Events' own `toEventRows()` split (see
 * `InquiredEvent`'s own doc comment, inquire-events.service.ts) represents them as TWO rows sharing the
 * IDENTICAL `(IPLC_LC, UTILIZE)` — 'create' (A3's own submission, always PENDING) and 'finalize' (A4's
 * own Release, the movement's real terminal status) — yet only the FIRST is actually A3/A3S's own
 * earmark; the second is A4's own real legal settlement event, which the "Function" column already
 * correctly labels "A4 · Sight Settlement", not A3. Showing EARMARKED there directly contradicted the
 * very Function column sitting right next to it. The new optional `phase` parameter closes this: a
 * `'finalize'`-phase row is NEVER an earmark function, regardless of instrumentType/movementType,
 * because `'finalize'` is — by `toEventRows()`'s own design — used for exactly one case in this whole
 * registry (A4 completing an EXISTING A3/A3S row) and no other. `'primary'`/`'create'` (the default when
 * `phase` is omitted, e.g. a caller that never split anything) are unaffected — including a Usance
 * Document Arrival's own single, never-split row, which stays attributed to A3/A3S (and therefore
 * EARMARKING/EARMARKED) throughout its whole lifecycle even though A6's own compound Release is what
 * actually flips its status, because A6 creates its OWN separate Acceptance CREATE movement/row rather
 * than re-attributing the Document Arrival's own row the way A4 does — there is no Usance equivalent of
 * this bug to fix.
 */
export function isEarmarkFunction(
  instrumentType: InstrumentType | string | null | undefined,
  movementType: string | null | undefined,
  phase?: 'primary' | 'create' | 'finalize' | null,
): boolean {
  if (phase === 'finalize') return false;
  return (instrumentType === 'IPLC_LC' && movementType === 'UTILIZE') || (instrumentType === 'EPLC_EXAMINATION' && movementType === 'CREATE');
}

/**
 * Inquire Events (2026-08-18, "A4 Sight Payment" ordering bug fix, live example LC S01) — the ONE
 * function in this whole registry that finalizes (Maker-Submits + Checker-Releases) an EXISTING
 * movement instead of creating a new one (`payExistingUtilize`, A4 only today — see that flag's own doc
 * comment on TransactionFunction). resolveFunctionForMovement() above always resolves this same
 * (instrumentType, movementType) pair to A3 (the first registry match) since A3/A4 share an identical
 * shape — correct for the movement's own CREATE event, but wrong for its later, separately-timed
 * FINALIZE event (A4's own Release). InquireEventsService uses this instead, specifically for that
 * later event, so the "View" screen correctly shows "A4 · Sight Settlement" rather than "A3 · Document
 * Arrival" once a Sight-tenor Document Arrival has actually been Sight-Settled.
 */
export function payExistingUtilizeFunctionFor(instrumentType: InstrumentType): TransactionFunction | undefined {
  return IMPORT_FUNCTIONS.find((fn) => fn.instrumentType === instrumentType && fn.payExistingUtilize);
}
