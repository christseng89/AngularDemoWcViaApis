/**
 * Field/rule definitions transcribed directly from
 * analysis/COMMON-BalanceComponent-Design-zh.md (v0.6) §3.1 (natural key
 * table) / §5 (movementType per instrumentType) / §6.2 (Tolerance
 * applicability) — this is the FSD-equivalent for Balance Component (no
 * separate FSD docx exists yet; the design doc + OAS are authoritative).
 * The Transaction Builder UI must not invent movementTypes or fields
 * beyond what these tables declare.
 */

/** EPLC_DUE_FROM_ISSUING_BANK / EPLC_ACCEPTANCE_REIMB_RECEIVABLE / EPLC_EXPORT_BILLS_DISCOUNTED — Gap Analysis §4.1: the asset-side counterpart a Confirmation contingent transforms into once honoured (Sight)/accepted (Usance); obligor is always the issuing bank, never the exporter. */
/** EPLC_EXAMINATION — cs-tf-balance-knowhow D3 ("only legal events move balances"): `MEMO_ONLY`, CREATE only. B3 (Present Docs) creates it; B4 (Honour/Acceptance) releases that same PENDING CREATE as the first leg of its own compound. */
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
  // 'CLOSE' — A10/B6 (Import LC / Export Confirmed LC Close). Write-off + retire the root contract
  // (ContractStatus.CLOSED, reserved since the original design but never previously set anywhere) —
  // see microservices/balance-component/src/domain/closeEligibility.ts for the preconditions.
  IPLC_LC: ['ISSUE', 'AMEND_INCREASE', 'AMEND_DECREASE', 'UTILIZE', 'CLOSE'],
  EPLC_LC: ['ISSUE', 'AMEND_INCREASE', 'AMEND_DECREASE'],
  IPLC_ACCEPTANCE: ['CREATE', 'PARTIAL_SETTLE', 'FULL_SETTLE'],
  EPLC_ACCEPTANCE: ['CREATE', 'PARTIAL_SETTLE', 'FULL_SETTLE'],
  SHGT: ['ISSUE', 'PARTIAL_REDEEM', 'FULL_REDEEM'],
  EPLC_CONFIRMATION: ['ISSUE', 'AMEND', 'HONOUR', 'ACCEPT', 'CLOSE'],
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
  // Created only programmatically by B4's own compound Submit — no picker for it; Balance Component
  // only owns Contingent Liability, and this pure receivable has no paired liability.
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

/** IMPORT -> IPLC_LC, EXPORT -> EPLC_CONFIRMATION — the root LC-level instrumentType for each Import/Export side. Shared by LookUpPanelService.resetForSide() and InquireEventsService, so the one Import/Export default only ever lives in one place. */
export function defaultLcInstrumentTypeForSide(side: 'IMPORT' | 'EXPORT'): InstrumentType {
  return side === 'IMPORT' ? 'IPLC_LC' : 'EPLC_CONFIRMATION';
}

/** PARENT_INSTRUMENT_OPTIONS, inverted once at module load — single source of truth for "what child ledgers exist under this LC" (used by Inquire Events). Does not recurse; the hierarchy is exactly two levels deep. */
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

/** The 5 real, display-worthy Balance Components. Deliberately excludes `EPLC_EXAMINATION` — `MEMO_ONLY`, never a real Balance Component. One flat map suffices since Import/Export event sets never mix. */
export const BALANCE_SNAPSHOT_LABEL: Partial<Record<InstrumentType, string>> = {
  IPLC_LC: 'LC Balance',
  IPLC_ACCEPTANCE: 'Acceptance Balance',
  SHGT: 'Shipping Guarantee Balance',
  EPLC_CONFIRMATION: 'Confirmed LC Balance',
  EPLC_ACCEPTANCE: 'Confirmed LC Acceptance Balance',
};

/** ISO 4217 minor-unit count per currency (e.g. JPY has no cents) — keeps the Amount input's granularity in step with Currency. Mirrors lc-payment-wc's own currencies.json; unlisted currencies default to 2. */
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

/** Same 10-currency set as lc-payment-wc's currencies.json, bare-code labels, wired to A1/B1's Currency field only — every other function carries/protects whatever A1/B1 declared instead of choosing again. A legacy currency outside this list renders blank in a read-only reconstruction; the stored value itself is untouched. */
export const CURRENCY_OPTIONS: { value: string; label: string }[] = ['USD', 'EUR', 'JPY', 'GBP', 'TWD', 'IDR', 'CNY', 'HKD', 'SGD', 'AUD'].map((code) => ({
  value: code,
  label: code,
}));

/**
 * True if `amount`'s decimal places exceed what `currency` allows (Design doc §6.2). Coerces via
 * `String(amount)` first — Formly's number input delivers a real JS `number` despite the `string` type.
 */
export function amountExceedsCurrencyDecimals(amount: string | number | null | undefined, currency: string | null | undefined): boolean {
  if (amount === null || amount === undefined || amount === '') return false;
  const frac = String(amount).split('.')[1];
  return !!frac && frac.length > decimalPlacesForCurrency(currency);
}

/** Thousand-separates a digit string — display only. A linear scan, not a regex, avoids ReDoS risk. */
export function groupThousands(digits: string): string {
  let result = '';
  for (let i = 0; i < digits.length; i++) {
    const remaining = digits.length - i;
    if (i > 0 && remaining % 3 === 0) result += ',';
    result += digits[i];
  }
  return result;
}

/** Mirrors MOVEMENT_DIRECTION's -1 rows. Filters pickers so a 0-Available-Balance contract isn't offered as a target that would immediately fail (Design doc §6); excludes AMEND_INCREASE/ISSUE/CREATE/AMEND, for which 0 is a normal start. */
export const DECREASING_MOVEMENT_TYPES: ReadonlySet<string> = new Set([
  'AMEND_DECREASE',
  'UTILIZE',
  'HONOUR',
  'ACCEPT',
  'PARTIAL_SETTLE',
  'FULL_SETTLE',
  'PARTIAL_REDEEM',
  'FULL_REDEEM',
  'REIMBURSE',
  'RECLASSIFY_OUT',
  'CLOSE',
]);

/** Named business functions — each pins down instrumentType + movementType (and a sub-choice where one exists) so the UI never makes the user pick raw combinations by hand. Grouped Import (A-series) / Export (B-series). */
export interface SubChoice {
  /** Which field the picked value is written into (`onSubChoice()`). `'movementType'` (A2/A7) writes into `model.movementType`; `'amendDirection'` (B2) writes into a separate component field instead, since EPLC_CONFIRMATION/AMEND has no distinct Increase/Decrease movementType — direction travels via the signed Amount instead. */
  key: 'movementType' | 'amendDirection';
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
  /** Every function except LC Issue (A1/B1) requires one generic secondary reference (sent as sourceTransactionRef), labeled per context. SG Number is separate — for A8/A9 it's SHGT's own primary natural key, not a secondary tag. */
  secondaryRefLabel?: string;
  /** Design doc §7 Tenor Type Routing — when set, Tenor Type is mandatory. A1/B1 offer all three; Acceptance (A6/B4) offers only the two Usance options (Sight never produces an Acceptance). Audit/reporting only — never changes a check. */
  tenorTypeOptions?: { value: string; label: string }[];
  /** A4's Catalog picker: filters to contracts whose own declared tenorType matches, so a Usance LC can't be picked under the Sight card or vice versa. A contract with no tenorType recorded is never filtered out. */
  catalogTenorFilter?: 'SIGHT' | 'USANCE';
  /** B4 (Create Acceptance): parameterizes loadPayableMovements()'s own movementType filter for the "still-PENDING source" being converted. Defaults to 'UTILIZE' when unset (A4/A6). */
  payableMovementType?: string;
  /** B4 only — its source (B3's CREATE) lives on a separate child EPLC_EXAMINATION contract, not the browsed contract, so finding it means catalog-searching that instrumentType under the picked Confirmation. Unset (A6) means same-contract lookup. */
  payableMovementInstrumentType?: InstrumentType;
  /** Display term for whatever payableMovementType above picks out — "Document Arrival" (A4/A6) vs "Present Docs" (B4). Drives the 2ndary Index picker's own label/emptyText/autoPickedHint (component.html). */
  pendingItemLabel?: string;
  /** Which function to point the Maker at when nothing is PENDING yet — "A3 (Document Arrival)" vs "B3 (Present Docs)". */
  pendingItemSourceHint?: string;
  /** The function-code half of pendingItemSourceHint above, for the 2ndary Index picker's own label. Defaults to 'A3' when unset (A6). */
  pendingItemSourceCode?: string;
  /** Which movementType deferSettlement above applies to. Defaults to 'UTILIZE' when unset (A3, its only user since B3's own deferSettlement was removed). */
  deferSettlementMovementType?: string;
  /** Display noun for deferSettlement's own acknowledgment hint/checkmark — "Document Arrival" (A3). Defaults to 'Document Arrival' when unset. */
  deferSettlementLabel?: string;
  /** "go to X to actually finalize it" — which function(s) the Maker/Checker should go to next. Defaults to 'A4 (Sight Settlement) or A6 (Acceptance)' when unset. */
  deferSettlementNextStepHint?: string;
  /** A10/B6 (Close) only — its own flat Catalog picker filters to `documentArrivalHints.catalogCloseEligible` (a server-computed hint-set, not a client-side per-candidate check) instead of the generic 0-Available-Balance fallback every other flat-Catalog function uses. */
  requiresCloseEligibility?: boolean;
}

const ALL_TENOR_OPTIONS = [
  { value: 'SIGHT', label: 'Sight' },
  { value: 'SELLERS_USANCE', label: "Seller's Usance" },
  { value: 'BUYERS_USANCE', label: "Buyer's Usance" },
];

/** Human label for a contract's tenorType — Export labels SELLERS_USANCE as plain "Usance" (Buyer's/Seller's is Import-only); Import spells it out. Reuses A1's/B1's own option arrays. No "Mixed Tenor" support — a contract's tenorType is one fixed value (Design doc §7). */
export function tenorTypeLabel(tenorType: string | null | undefined, side: 'IMPORT' | 'EXPORT'): string {
  if (!tenorType) return '—';
  const options = side === 'EXPORT' ? EXPORT_TENOR_OPTIONS : ALL_TENOR_OPTIONS;
  return options.find((o) => o.value === tenorType)?.label ?? '—';
}

const USANCE_ONLY_TENOR_OPTIONS = [
  { value: 'SELLERS_USANCE', label: "Seller's Usance" },
  { value: 'BUYERS_USANCE', label: "Buyer's Usance" },
];

// Buyer's vs Seller's Usance is an Import-side domestic financing-structure distinction the confirming
// bank has no visibility into — its own undertaking only distinguishes Sight vs Usance. Stored as
// SELLERS_USANCE (no generic USANCE enum value) but labelled plain "Usance".
const EXPORT_TENOR_OPTIONS = [
  { value: 'SIGHT', label: 'Sight' },
  { value: 'SELLERS_USANCE', label: 'Usance' },
];

/** A3 (Sight) and a former A5 (Usance) were merged — mechanically identical (IPLC_LC/UTILIZE), only the Catalog tenor filter differed; the picked LC's own tenorType already routes to A4 or A6. A5's number was retired, not reused. */
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
    help: 'Increase always succeeds; Decrease is checked against Tight Available Balance (Design doc §6.2) — only APPROVED amounts count, and outstanding off-balance-sheet exposure is netted out.',
  },
  // Merged into one card, showing all ACTIVE IPLC_LC contracts regardless of tenor — no catalogTenorFilter.
  {
    code: 'A3',
    label: 'Document Arrival',
    side: 'IMPORT',
    instrumentType: 'IPLC_LC',
    movementType: 'UTILIZE',
    secondaryRefLabel: 'IB Number',
    // Maker moves the amount to Pending (the earmark) at creation; Checker's Approve here is an
    // acknowledgment only — it never calls release, so the movement stays PENDING either way. Only A4
    // (Sight) or A6 (Usance) actually finalizes it. Reject still calls the real reject API.
    help: "Presentation Earmark (PENDING) for ANY tenor. Checker Approve here is an acknowledgment only — it does NOT finalize the LC Balance, which stays Pending either way. Go to A4 (Sight Settlement) if this LC is Sight, or A6 (Acceptance) if it's Usance — the LC's own declared Tenor Type (from A1 Issue) decides which. If this LC has an outstanding Shipping Guarantee reserving the capacity this arrival needs, use A3S instead — a plain A3 now hard-rejects past Tight Available (Design doc §6.1 v0.12).",
  },
  // A plain A3 checks against Tight Available (Available Balance minus all outstanding SG exposure on
  // this LC) and hard-rejects if exceeded — this is the explicit, SG-matched alternative that nets the
  // picked SG's own exposure out of the check by redeeming it first.
  {
    code: 'A3S',
    label: 'Document Arrival w/ Shipping Gtee',
    side: 'IMPORT',
    instrumentType: 'IPLC_LC',
    movementType: 'UTILIZE',
    secondaryRefLabel: 'IB Number',
    help: "For documents arriving against an LC that still has an outstanding Shipping Guarantee reserving the capacity (A8). Pick the LC, then the specific SG record below — Bill Amount is the actual document amount, freely typed; SG Redemption Amount = MIN(Bill Amount, SG Outstanding), shown below once picked (any excess above the SG's outstanding is ordinary incremental LC exposure, still checked against Tight Available). Maker: Submit reserves BOTH the SG's own redemption (Full or Partial, whichever the match works out to) and this Document Arrival as PENDING. Checker: one Release does BOTH — the SG redemption releases AND the Document Arrival moves to Pending LC Balance (still not finalized — go to A4/A6 next, same as a plain A3).",
  },
  {
    code: 'A4',
    label: 'Sight Settlement',
    side: 'IMPORT',
    instrumentType: 'IPLC_LC',
    movementType: 'UTILIZE',
    catalogTenorFilter: 'SIGHT',
    // Amount is NOT re-typed here — it was already fixed when A3 recorded the presentation, so it can't
    // drift from the documents actually presented. submitA4() calls a dedicated maker-submit backend
    // action on A3's own earmarked UTILIZE, not createMovement() — no new movement is created.
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
    // A Usance drawing is deliberately two calls, both fired at the Checker's Release click: release
    // the picked Document Arrival, then the new Acceptance. Amount/Tenor carried and protected.
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
    // An Acceptance can only exist under a Usance LC (Design doc §7) — a Sight LC would always have zero
    // IBs to pick in Step 2, so this piggybacks on A4's own catalogTenorFilter.
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
    // SG Issue amount must not exceed the parent LC's own Available Balance — server-enforced (409 at
    // Submit if exceeded), overriding Design doc §5/§11's earlier LMTS-based sufficiency design.
    help: "Independent contingent liability, issued against the LC as parent. Amount is capped at the parent LC's current Available Balance — rejected at Submit if exceeded (business instruction 2026-08-14, overriding the original LMTS-based sufficiency design). See Design doc §6.1 for the separate, non-blocking off-balance WARNING that also applies later against the LC's own UTILIZE. SG Number is SHGT's own natural key field (below), not a separate reference.",
  },
  // No Full/Partial subChoice — movementType is always FULL_REDEEM. BA-confirmed 2026-08-21
  // (TF_Balance_Component_Mapping Rule #1, "SG discharge is instrument-based, not amount-based" —
  // SG_RELEASE is always the FULL amount, no residual): Partial Redeem is no longer reachable through
  // this function — Amount is locked to the SG's own Available Balance (builder-fields.ts's own
  // amountFromSgRedeem), not merely capped-but-editable. A3S's own matched SG redemption leg
  // (documentArrivalWithSg) is unaffected — genuinely tied to a real Document Arrival, a separate code
  // path entirely.
  {
    code: 'A9',
    label: 'Shipping Gtee (Redemption)',
    side: 'IMPORT',
    instrumentType: 'SHGT',
    movementType: 'FULL_REDEEM',
    defaultParentInstrumentType: 'IPLC_LC',
    help: "Search by LC Number + SG Number (below) — a single LC can have multiple Shipping Guarantees. Amount is carried from the SG's current Available Balance and protected (Full Redeem only) — Partial Redeem is no longer supported through this function. Design doc §6.1: redemption is NOT auto-linked to Document Arrival (A3) — it's a separate, explicit action.",
  },
  // cs-tf-balance-knowhow rationale §3.9's "cancellation before expiry" analog — same write-off entry as
  // a natural expiry, but Maker/Checker-triggered. Flat Catalog picker like A2/A3 (no parent concept —
  // this function acts on the root LC itself), filtered to only currently-eligible LCs.
  {
    code: 'A10',
    label: 'LC Close',
    side: 'IMPORT',
    instrumentType: 'IPLC_LC',
    movementType: 'CLOSE',
    requiresCloseEligibility: true,
    help: 'Writes off whatever Confirmed Balance remains and retires the LC. Only LCs with Shipping Guarantee Balance = 0, Acceptance Balance = 0, and no open Events anywhere in the tree (including SG/Acceptance children) are shown below — redeem the SG (A9) and settle the Acceptance (A7) first if either is still outstanding. Amount is never typed — it is carried from the current Confirmed Balance and locked; 0 is a normal figure for an already fully-utilized LC. Once Released, this LC can no longer be selected by any other function.',
  },
];

/** Export Confirmed side ONLY models Confirmed Export LC — per rationale-en.md §6/§7.4b, plain advising creates no contingent and Unconfirmed negotiation (EBL) belongs to a separate Loan Component. `EPLC_LC` stays valid but no function here creates one. */
export const EXPORT_FUNCTIONS: TransactionFunction[] = [
  // Per the frozen event catalogue (rationale-en.md §6/§7.4b), an Unconfirmed LC's only substantive
  // events (EX_NEGOTIATE/EX_REFIN) are both funded-lending products already out of scope, and EX_ADVISE
  // itself creates no contingent — so an Unconfirmed Export LC has nothing for Balance Component to track.
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
    // Reuses the same generic subChoice mechanism A2/A7 use — see SubChoice.key's own doc comment for
    // why 'amendDirection', not 'movementType', is the write target here.
    subChoice: {
      key: 'amendDirection',
      label: 'Direction',
      options: [
        { value: 'INCREASE', label: 'Increase' },
        { value: 'DECREASE', label: 'Decrease' },
      ],
    },
    secondaryRefLabel: 'Amendment No./Times',
    help: "Adjusts confirmed_amount — rationale §7.2: a confirming bank may advise an amendment WITHOUT extending its confirmation (Art. 10(b)), so confirmed_amount can genuinely diverge from the LC's own face amount. This function only ever moves the Confirmation's own contingent. Amount stays a positive magnitude — Direction (above), not the amount's own sign, carries Increase vs. Decrease.",
  },
  // B3 is a genuinely separate physical event (D3): it never auto-derives Sight/Usance or touches the
  // Confirmation, only creates a MEMO_ONLY EPLC_EXAMINATION earmark. B4 is the actual legal-event step.
  {
    code: 'B3',
    label: 'Present Docs',
    side: 'EXPORT',
    instrumentType: 'EPLC_EXAMINATION',
    movementType: 'CREATE',
    defaultParentInstrumentType: 'EPLC_CONFIRMATION',
    // No secondaryRefLabel — EPLC_EXAMINATION has ibNumber as its own natural key (like A8's SHGT
    // Issue), so the EB Number field already serves as both identity and audit reference.
    //
    // B3 uses the standard release()/reject() path directly (same as A1/A2/A8/A9/B1/B2) — a real
    // Checker Release transitions PENDING -> RELEASED (EARMARKED) on B3's own record independently of
    // B4; B4 later "consumes" it (stops occupying Present Docs Earmark capacity) via its own linked
    // HONOUR/ACCEPT's referencedTransactionId.
    help: 'Physical event only (cs-tf-balance-knowhow D3: "documents arriving... only legal events move balances") — creates a MEMO_ONLY examination earmark; the Confirmation itself stays completely untouched, Sight or Usance alike. Pick the Confirmation LC, type the EB Number for this presentation. Maker: Submit reserves it as PENDING. Checker: Release genuinely finalizes THIS record (PENDING -> RELEASED) — it still occupies Present Docs Earmark capacity until B4 (Honour / Acceptance) actually consumes it; skipping B4 leaves it RELEASED but never consumed.',
  },
  // B4 is the unified legal-event step for both tenors (this is what CNF_HONOUR_SIGHT/CNF_ACCEPT
  // actually ARE). Maker Submit creates the primary (HONOUR/ACCEPT) plus whichever secondary leg(s) the
  // tenor needs, linked by one businessEventId:
  //   Sight:  HONOUR -> EPLC_DUE_FROM_ISSUING_BANK (asset)
  //   Usance: ACCEPT -> EPLC_ACCEPTANCE (liability) -> EPLC_ACCEPTANCE_REIMB_RECEIVABLE (asset)
  // B3's own record must already be independently Released before B4 can pick it; Release marks it
  // "consumed" via referencedTransactionId.
  {
    code: 'B4',
    label: 'Honour / Acceptance',
    side: 'EXPORT',
    instrumentType: 'EPLC_CONFIRMATION',
    movementType: 'HONOUR',
    secondaryRefLabel: 'EB Number',
    payableMovementType: 'CREATE',
    payableMovementInstrumentType: 'EPLC_EXAMINATION',
    pendingItemLabel: 'Present Docs',
    pendingItemSourceHint: 'use B3 (Present Docs) first',
    pendingItemSourceCode: 'B3',
    help: "The actual Honour/Accept legal event (cs-tf-balance-knowhow §7.4a/§7.6) — Sight vs Usance is read from the picked Confirmation's own Tenor Type (declared at B1), not re-asked here. Pick the Confirmation, then the already-RELEASED B3 (Present Docs) record under it (B3 must be genuinely Released first — go to B3 if nothing shows here) — EB Number and Amount are carried from it. Sight: Honours, releasing the Confirmation contingent and creating the Due from Issuing Bank asset (rationale §7.4a) — go to B5 to record the actual reimbursement later. Usance: Accepts, releasing the Confirmation contingent and creating BOTH the Acceptance liability AND its Reimbursement Receivable asset (rationale §7.6) — go to B5 at maturity too. Checker: one Release does the primary (Honour/Accept) and whichever secondary leg(s) that tenor needs, and consumes the B3 record's own Present Docs Earmark occupancy as a side effect.",
  },
  // CNF_MATURE (impl-spec-en.md) clears BOTH the Acceptance liability and its Reimbursement Receivable
  // in ONE event. Sight's own receivable has no paired liability, so it's out of scope here — B5 is
  // Usance-only.
  {
    code: 'B5',
    label: 'Settlement — Reimbursement / Maturity',
    side: 'EXPORT',
    instrumentType: 'EPLC_ACCEPTANCE',
    movementType: 'FULL_SETTLE',
    defaultParentInstrumentType: 'EPLC_CONFIRMATION',
    catalogTenorFilter: 'USANCE',
    help: "Confirm LC Settlement — Usance held-to-maturity only (CNF_MATURE): one compound settles BOTH the Acceptance (this bank's own DPU liability, paid to the beneficiary) AND its matching Reimbursement Receivable (the issuing bank's own reimbursement to this bank), same amount, in a single Checker Release. Pick the LC (LC Index, Usance only), then the EB Number (EB Index) — a single LC can have multiple Document Presentations. Sight settlement (Due from Issuing Bank) is out of Balance Component's own scope — Balance Component only owns the contingent/liability side; B4 still creates that asset, but collecting it happens outside this system. Nego'd/discounted Usance (EPLC_EXPORT_BILLS_DISCOUNTED) is still follow-up work, not this function.",
  },
  // Export analog of A10 — see A10's own help text/doc comment above for the shared rationale.
  {
    code: 'B6',
    label: 'Confirmed LC Close',
    side: 'EXPORT',
    instrumentType: 'EPLC_CONFIRMATION',
    movementType: 'CLOSE',
    requiresCloseEligibility: true,
    help: 'Writes off whatever Confirmed Balance remains and retires the Confirmation. Only Confirmations with Acceptance Balance = 0 and no open Events anywhere in the tree — including a RELEASED-but-not-yet-consumed B3 Present Docs presentation (B4 has not Honoured/Accepted it yet) — are shown below; settle the Acceptance (B5) or complete B4 first if either is still outstanding. Amount is never typed — it is carried from the current Confirmed Balance and locked; 0 is a normal figure once every presentation has been fully honoured/accepted. Once Released, this Confirmation can no longer be selected by any other function.',
  },
];

// movementTypeMatchesFunction() / resolveFunctionForMovement() relocated to function-strategy.ts —
// both read the flags this file no longer carries; moving them here would create a circular import.

/**
 * Status display mapping — see this file's own nested `CLAUDE.md` decision log (originally "settled",
 * extended 2026-08-20 for the `acknowledgedAt` case below — business instruction, "A4 選取 EARMARKED
 * 的交易" / "狀態必須是 EARMARKED"):
 *
 * | Function                     | Not Submitted-Approved | Checker-Approved (still PENDING) | Released    |
 * |-------------------------------|------------------------|-----------------------------------|-------------|
 * | Import LC — A3 / A3S          | EARMARKING             | EARMARKED                          | EARMARKED   |
 * | Export Confirmed LC — B3      | EARMARKING             | EARMARKED                          | EARMARKED   |
 * | All other functions           | PENDING                 | n/a                                | APPROVED    |
 *
 * A3/A3S/B3 are D3 "physical event, not a legal event" earmarks (cs-tf-balance-knowhow) — the reserved
 * amount isn't the bank's definitive contingent position until a later legal event (A4/A6 for Import,
 * B4 for Export) posts it. Matching instrumentType/movementType:
 *   - Import: `IPLC_LC`/`UTILIZE`. Export: `EPLC_EXAMINATION`/`CREATE`.
 *
 * A3/A3S's own Checker "Approve" is deliberately acknowledgment-only (never a real Release — status
 * stays PENDING) — but once genuinely acknowledged (`acknowledgedAt` set, restored 2026-08-20), the
 * display already reads EARMARKED rather than waiting for A4/A6's own later Release, since a Checker has
 * already confirmed it. A4/A6's own picker eligibility (`document-arrival-hints.service.ts`) requires
 * this same EARMARKED state — a Document Arrival that's only Maker-Submitted (EARMARKING, not yet
 * acknowledged) is not yet selectable there, for genuine 4-eyes separation between A3's own Maker and
 * the Checker who must confirm it before A4/A6 ever touches it.
 *
 * The `phase` param exists because Inquire Events' `toEventRows()` split represents a finalized Sight
 * Document Arrival as TWO rows sharing the identical `(IPLC_LC, UTILIZE)` pair — 'create' (A3's own
 * submission) and 'finalize' (A4's own Release, a different function's real legal event). A
 * `'finalize'`-phase row is never an earmark function regardless of instrumentType/movementType.
 */
export function isEarmarkFunction(
  instrumentType: InstrumentType | string | null | undefined,
  movementType: string | null | undefined,
  phase?: 'primary' | 'create' | 'finalize' | null,
): boolean {
  if (phase === 'finalize') return false;
  return (instrumentType === 'IPLC_LC' && movementType === 'UTILIZE') || (instrumentType === 'EPLC_EXAMINATION' && movementType === 'CREATE');
}

/** PENDING/RELEASED/etc. display label per `isEarmarkFunction()`'s own mapping above. Shared by TransactionBuilderComponent and AccountEntriesDialogComponent so neither re-derives the rule independently. */
export function displayStatus(
  status: string,
  instrumentType?: InstrumentType | string | null,
  movementType?: string | null,
  phase?: 'primary' | 'create' | 'finalize' | null,
  acknowledgedAt?: string | null,
): string {
  // 2026-08-22 ("Highlight LC Close Event") — a red badge still reading "APPROVED" for a genuinely closed
  // LC/Confirmation reads as contradictory (red usually signals a problem, "APPROVED" sounds positive);
  // CLOSED/CLOSING make the row self-explanatory without relying on color alone. See statusBadgeClass()'s
  // own doc comment just below for the full rationale — this mirrors that same PENDING/RELEASED split.
  if (isCloseMovement(movementType) && (status === 'PENDING' || status === 'RELEASED')) return status === 'PENDING' ? 'CLOSING' : 'CLOSED';
  const earmark = isEarmarkFunction(instrumentType, movementType, phase);
  if (status === 'PENDING') return earmark ? (acknowledgedAt ? 'EARMARKED' : 'EARMARKING') : 'PENDING';
  if (status === 'RELEASED') return earmark ? 'EARMARKED' : 'APPROVED';
  return status;
}

/**
 * P2 UI/UX pass — function-chip action-type icon (`TbIconComponent`), one of 5 groups by underlying
 * domain semantics rather than raw movementType: `issue` (ISSUE/CREATE establishing a new
 * balance/facility record — A1/A6/A8/B1), `amend` (A2/B2), `utilize` (presentation/finalize —
 * A3/A3S/A4/B3/B4), `redeem` (settle an existing exposure — A7/A9/B5), `cross` (retire the LC/
 * Confirmation outright — A10/B6). User-requested 2026-08-21 ("Close 不應該用打勾") — A10/B6 used to fall
 * into the `redeem` fallback below, but `redeem`'s own icon (`TbIconComponent`'s own `'redeem'` case) is
 * the identical checkmark shape as `'ok'`, which reads as "settled/approved", not "closed out" — `cross`
 * (the existing rejected/cancelled X icon, already in `TbIconComponent`'s shared set, no new SVG) is the
 * more honest signal for an irreversible retirement action. A plain lookup keyed by function `code`, not
 * instrumentType/movementType — several codes share a movementType (e.g. A3/A3S/
 * A4/B4 are all effectively UTILIZE-shaped) but land in the same group anyway, so re-deriving from
 * movementType would be no simpler.
 */
const ISSUE_GROUP_CODES: ReadonlySet<string> = new Set(['A1', 'A6', 'A8', 'B1']);
const AMEND_GROUP_CODES: ReadonlySet<string> = new Set(['A2', 'B2']);
const UTILIZE_GROUP_CODES: ReadonlySet<string> = new Set(['A3', 'A3S', 'A4', 'B3', 'B4']);
const CLOSE_GROUP_CODES: ReadonlySet<string> = new Set(['A10', 'B6']);
// Anything not in the 4 sets above (A7/A9/B5) falls into the redeem group — see functionActionIcon().

export function functionActionIcon(code: string): 'issue' | 'amend' | 'utilize' | 'redeem' | 'cross' {
  if (ISSUE_GROUP_CODES.has(code)) return 'issue';
  if (AMEND_GROUP_CODES.has(code)) return 'amend';
  if (UTILIZE_GROUP_CODES.has(code)) return 'utilize';
  if (CLOSE_GROUP_CODES.has(code)) return 'cross';
  return 'redeem';
}

/** Status badge icon — so status isn't conveyed by color alone (accessibility). Derived from the CSS class `statusBadgeClass()` already returns, not re-computed from status/instrumentType/movementType/phase — one mapping, called at every `statusBadgeClass()` call site. */
export function statusBadgeIcon(badgeClass: string): 'ok' | 'pending' | 'cross' | 'dash' {
  if (badgeClass === 'tb-status-badge--approved' || badgeClass === 'tb-status-badge--earmark') return 'ok';
  if (badgeClass === 'tb-status-badge--pending') return 'pending';
  if (badgeClass === 'tb-status-badge--negative') return 'cross';
  return 'dash';
}

/**
 * User-requested 2026-08-22 ("Highlight LC Close Event" — A10/B6's own event row must stand out in red in
 * BOTH Look Up Current Balance and Inquire Events, "so that users can immediately recognize that the LC
 * has been closed"). Both screens already funnel every row through this ONE function (see
 * transaction-builder.component.html/inquire-events.component.html's own `[ngClass]="statusBadgeClass(...)"`
 * bindings) — no per-screen change needed, just this shared mapping. Reuses the EXISTING `--negative` red
 * token rather than inventing a new color, consistent with `contractStatusBadgeClass()`'s own established
 * "red=negative/closed-out" language (2026-08-21) — and `statusBadgeIcon()` below already turns
 * `--negative` into the same `cross` icon `functionActionIcon()`'s own CLOSE_GROUP_CODES already uses for
 * A10/B6's function-chip, so the two independent icon sources agree by construction, not coincidence.
 * Applies to PENDING (Maker-submitted, not yet closed) and RELEASED (genuinely closed) alike — both are a
 * real Close *event* the user should notice, not just the terminal state; REJECTED/CANCELLED Close
 * attempts fall through unchanged to the ordinary status handling below (already red via `--negative`,
 * already correctly reads as "this failed", not "the LC is closed").
 */
function isCloseMovement(movementType?: string | null): boolean {
  return movementType === 'CLOSE';
}

/** Status badge CSS class — shares `displayStatus()`'s own mapping. */
export function statusBadgeClass(
  status: string,
  instrumentType?: InstrumentType | string | null,
  movementType?: string | null,
  phase?: 'primary' | 'create' | 'finalize' | null,
  acknowledgedAt?: string | null,
): string {
  if (isCloseMovement(movementType) && (status === 'PENDING' || status === 'RELEASED')) return 'tb-status-badge--negative';
  if (status === 'PENDING') return isEarmarkFunction(instrumentType, movementType, phase) && acknowledgedAt ? 'tb-status-badge--earmark' : 'tb-status-badge--pending';
  if (status === 'RELEASED') return isEarmarkFunction(instrumentType, movementType, phase) ? 'tb-status-badge--earmark' : 'tb-status-badge--approved';
  if (status === 'REJECTED' || status === 'CANCELLED') return 'tb-status-badge--negative';
  if (status === 'SUPERSEDED') return 'tb-status-badge--neutral';
  return '';
}

/**
 * Contract-level `ContractStatus` (ACTIVE/CLOSED/SUPERSEDED/CANCELLED) — a genuinely different enum from
 * `MovementStatus` above (PENDING/RELEASED/REJECTED/CANCELLED/SUPERSEDED — 'CANCELLED'/'SUPERSEDED' are
 * shared strings but mean different things on the two enums), so this is its own small function rather
 * than overloading `statusBadgeClass()` with a status space it was never designed for. User-requested
 * 2026-08-21 ("LC Active shows Green, Close shows Red... 容易識別") for the LC Master Records Index,
 * where ACTIVE/CLOSED previously rendered as the same plain `.tb-type-tag` regardless of status. Reuses
 * the SAME color tokens `statusBadgeClass()`/`statusBadgeIcon()` above already established app-wide
 * (green=approved/good, red=negative/closed-out) rather than inventing a second color language.
 *
 * `closingPending` (2026-08-22, "U03 應該是CLOSING狀態" — a Master Index row for an LC/Confirmation with a
 * Maker-Submitted-but-not-yet-Released CLOSE movement still correctly reads `ContractStatus.ACTIVE` (it
 * only flips to CLOSED at Release, see `markClosed()` on the microservice side) — but the Index should
 * still flag it, same "don't wait for the terminal state to say something" reasoning as
 * `statusBadgeClass()`'s own CLOSE special-case just above. `InquireEventsService.loadIndexRow()` already
 * fetches every root movement per row (for `lastEventAt`), so detecting this costs no extra API call.
 */
export function contractStatusBadgeClass(status: string, closingPending?: boolean): string {
  if (status === 'ACTIVE' && closingPending) return 'tb-status-badge--negative';
  if (status === 'ACTIVE') return 'tb-status-badge--approved';
  if (status === 'CLOSED') return 'tb-status-badge--negative';
  if (status === 'SUPERSEDED') return 'tb-status-badge--neutral';
  if (status === 'CANCELLED') return 'tb-status-badge--negative';
  return 'tb-status-badge--neutral';
}

/** Display label pair to `contractStatusBadgeClass()` above — same "CLOSING while red but not yet actually CLOSED" reasoning as `displayStatus()`'s own CLOSE special-case. Every other status displays as its own raw `ContractStatus` string, unchanged. */
export function contractStatusLabel(status: string, closingPending?: boolean): string {
  if (status === 'ACTIVE' && closingPending) return 'CLOSING';
  return status;
}

/** Display-only pair (with `displayMovementAmount()` below): EPLC_CONFIRMATION's shared `AMEND` movementType, whose direction rides the sign of the wire `amount`, reads like A2's distinct AMEND_INCREASE/AMEND_DECREASE in list views. Never written back to `model`; every other pair passes through unchanged. */
export function displayMovementType(
  instrumentType: InstrumentType | string | null | undefined,
  movementType: string | null | undefined,
  amount: string | number | null | undefined,
): string {
  if (instrumentType === 'EPLC_CONFIRMATION' && movementType === 'AMEND') {
    return Number(amount) < 0 ? 'AMEND_DECREASE' : 'AMEND_INCREASE';
  }
  return movementType ?? '';
}

/** The magnitude half of `displayMovementType()`'s pair. Also callable on `ceilingAmount` — Tolerance conversion scales but never flips sign, so this de-signs either consistently. */
export function displayMovementAmount(
  instrumentType: InstrumentType | string | null | undefined,
  movementType: string | null | undefined,
  amount: string | null | undefined,
): string {
  if (instrumentType === 'EPLC_CONFIRMATION' && movementType === 'AMEND' && amount != null) {
    return String(Math.abs(Number(amount)));
  }
  return amount ?? '';
}

// payExistingUtilizeFunctionFor() relocated to function-strategy.ts too, same circular-import reason.
