import { FormlyFieldConfig } from '@ngx-formly/core';
import { BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';
import {
  CURRENCY_OPTIONS,
  MATURITY_DATE_CALENDAR_PROFILES,
  TENOR_BASIS_OPTIONS,
  TransactionFunction,
  decimalPlacesForCurrency,
  maturityDateStatusLabel,
  tenorBasisHasWorkingCalculation,
} from './balance-component.model';
import { BuilderModel, carriedCurrency, hasParent, isCreatingMovement, toleranceApplicable } from './function-policy';
import { deriveFunctionStrategy } from './function-strategy';

/**
 * BAL-003 (God Component) — the Transaction Builder's own Formly field factory, extracted from
 * `TransactionBuilderComponent.rebuildFields()` as a pure `(context) => FormlyFieldConfig[]` function.
 * This is where the Amount/Currency/Tenor "carried forward and protected" rules are actually enforced.
 */

/** Everything `buildFields()` reads. Assembled by the component; never mutated here. */
export interface BuilderFieldsContext {
  model: BuilderModel;
  selectedFunction: TransactionFunction | null;
  selectedPayMovement: BalanceMovement | null;
  selectedContract: BalanceContract | null;
  selectedContractSnapshot: BalanceSnapshot | null;
  selectedParent: BalanceContract | null;
  dynamicSecondaryRefLabel: string | null;
}

export function buildFields(ctx: BuilderFieldsContext): FormlyFieldConfig[] {
  const { model, selectedFunction, selectedContractSnapshot } = ctx;
  const strategy = selectedFunction ? deriveFunctionStrategy(selectedFunction) : null;
  // A6/B4 (once the source is picked) and A7 Full Settle — Amount carries from the source record and
  // is protected. Partial Settle stays free-typed.
  //
  // BAL-135 fix: excludes settlesAcceptanceOnMature (B5) explicitly. B5's registry entry declares
  // `movementType: 'FULL_SETTLE'` only as a placeholder (the real value is DERIVED at submit() time,
  // same as A9's `autoRedeemType`) — without this exclusion the shared literal wrongly matched B5 too,
  // locking its Amount field and pre-empting the correct amountCappedAtAcceptance rule below.
  const amountFromDocArrival = !!strategy?.checkerRelease.settlesDocumentArrival && !!ctx.selectedPayMovement;
  const amountFromFullSettle =
    strategy?.movementDerivation.amountVsAvailableDerivation !== 'SETTLE' && model.movementType === 'FULL_SETTLE' && !!selectedContractSnapshot;
  // A9 only. BA-confirmed 2026-08-21 (TF_Balance_Component_Mapping Rule #1, "SG discharge is
  // instrument-based, not amount-based" — SG_RELEASE is always the FULL amount, no residual): Amount is
  // now fully LOCKED to the SG's own Available Balance (nets an already-PENDING redemption on the same
  // SG), not merely capped-but-editable — Partial Redeem is no longer reachable through this function at
  // all (see submit-rules.ts's own hard-reject backstop). Previously stayed editable/capped here with
  // FULL_REDEEM vs PARTIAL_REDEEM derived at submit() time (autoRedeemType); A3S's own matched SG
  // redemption leg (documentArrivalWithSg) is a completely separate code path and is unaffected — it
  // never sets amountVsAvailableDerivation, so this flag is still exclusively an A9 marker.
  const amountFromSgRedeem = strategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM' && !!selectedContractSnapshot;
  // Same default-to-Available/capped shape amountFromSgRedeem used to have, for B5's own Usance branch —
  // B5 keeps the original editable-but-capped Partial Settle behavior; only A9 was locked down.
  const amountCappedAtAcceptance =
    strategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' && model.instrumentType === 'EPLC_ACCEPTANCE' && !!selectedContractSnapshot;
  // A10/B6 only — Amount is NEVER typed, same fully-locked shape amountFromSgRedeem now also has (unlike
  // amountCappedAtAcceptance above, which stays editable, just capped); the write-off must equal the
  // current Confirmed Balance exactly (see submit-rules.ts's own closeShaped exact-amount comment on the
  // microservice side).
  const amountFromClose = strategy?.movementDerivation.amountAutoFilledFrom === 'confirmedBalance' && !!selectedContractSnapshot;
  // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2/§3 — A2/B2 Extend Expiry. Same fully-locked
  // shape amountFromClose/amountFromSgRedeem already have (never editable, unlike amountCappedAtAcceptance)
  // — always exactly 0, forced in maker-panel.component.ts's own afterResolved()/onSubChoice().
  const amountFromAmendExpiry = model.movementType === 'AMEND_EXPIRY';
  // A6/B4 Calculated Maturity Date (2026-08-23, user-directed) — A2/B2's own Update Maturity Date
  // Calendars, same numerically-inert "amount always 0" shape as amountFromAmendExpiry immediately above.
  const amountFromAmendMaturityCalendars = model.movementType === 'AMEND_MATURITY_CALENDARS';
  const amountLocked = amountFromDocArrival || amountFromFullSettle || amountFromClose || amountFromSgRedeem || amountFromAmendExpiry || amountFromAmendMaturityCalendars;
  const tenorLocked = !!selectedFunction?.tenorTypeOptions?.length && isCreatingMovement(model) && hasParent(model) && !!ctx.selectedParent;
  // A1/B1 = Input; every other function = carry from A1/B1 + protected — see carriedCurrency (function-policy.ts).
  const currencyLocked = !!carriedCurrency(ctx.selectedParent, ctx.selectedContract);
  // A1/B1 only — the only functions where Currency is actually being chosen (currencyLocked is always false for them).
  const currencyIsDropdown = selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1';
  // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §1 — A1/B1 root ISSUE only, same scope as currencyIsDropdown above.
  const isRootIssue = selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1';
  // §2/§3 — A3/A3S (Import) and B3 (Export), the three functions that carry a Document Presentation Date.
  // Extracted so documentPresentationDate's own hide clause and originalExpiryDateReference's below (added
  // 2026-08-23, user-requested) can never drift apart — both fields exist for exactly the same reason.
  const isDocumentPresentationFunction = selectedFunction?.code === 'A3' || selectedFunction?.code === 'A3S' || selectedFunction?.code === 'B3';
  // UI-only reference field (2026-08-23, user-requested) — A6 (always Usance, per its own name) and
  // B4's own Usance branch (movementType 'ACCEPT', not 'HONOUR' — B4's Sight branch produces no
  // Acceptance at all, see §2/§3's own "維持現狀，不修改" note) are the two functions that will
  // eventually enter a Maturity Date (§2/§3's own Calculated Maturity Date, still gated on
  // Maturity-Date-Business-Day-Convention-Decision-Request.md). Surfacing the PARENT LC/Confirmation's
  // own Expiry Date here — well before that calculation itself is implemented — costs nothing and gives
  // the Maker useful UCP 600 context while typing. B4 has no `tenorTypeOptions` of its own (the Sight-
  // vs-Usance distinction lives entirely on the parent Confirmation it derives movementType from — see
  // FunctionStrategy.movementDerivation.derivesMovementTypeFromTenor), so `selectedParent.tenorType` is
  // the only reliable Sight/Usance signal available here for B4; A6 needs no such check, it's Usance-only
  // by definition (a Sight LC's own Document Arrival routes to A4 instead, never reaches A6 at all).
  const isMaturityDateFunction =
    selectedFunction?.code === 'A6' || (selectedFunction?.code === 'B4' && !!ctx.selectedParent?.tenorType && ctx.selectedParent.tenorType !== 'SIGHT');
  // Maturity-Date-Tenor-Basis-Decision-Review.md v31 §3.1 (business-confirmed) — A1/B1 root ISSUE only;
  // tenorBasis/fixedMaturityDate are captured once here and inherited by every later Acceptance CREATE
  // under this LC/Confirmation, same "father decides, child inherits" convention as
  // maturityDateProfile/tenorType/currency above. Reactive to tenorType (not a static gate) since SIGHT
  // must never carry a tenorBasis (validateTenorBasisTypeCombination() on the microservice rejects it).
  const isTenorBasisFunction = isRootIssue;
  // UI-only read-only reference (2026-08-24) — whenever the currently picked/reconstructed contract IS an
  // Acceptance (A7/B5 live entry once the Maker has picked one to settle; Inquire Events reconstructing
  // any A6/B4-CREATE or A7/B5 event, whose own `selectedContract` already equals the Acceptance's
  // contract — see inquire-events.service.ts's own selectEvent()). Deliberately NOT gated to A7/B5's own
  // function codes — this is a passive display of whatever selectedContract already resolved to, not a
  // new lookup, so it degrades correctly (stays hidden) for A6/B4's own LIVE entry screen, where the
  // Acceptance doesn't exist yet and selectedContract is still null/the parent LC.
  const isAcceptanceContractSelected = ctx.selectedContract?.instrumentType === 'IPLC_ACCEPTANCE' || ctx.selectedContract?.instrumentType === 'EPLC_ACCEPTANCE';
  // Clearing Bank Calendar Profile (2026-08-23, user-directed — "這些欄位最好在A1/B1就輸入... A3 A3S B3
  // 就只顯示不用輸入") — A3/A3S/B3's own read-only reference to the underlying LC/Confirmation's
  // currently-configured calendar profile. Originally Usance-only, widened same day ("SIGHT也要有這欄位
  // 因為也要跟收款行清算收錢與付錢") — a Sight LC still settles through a paying/collecting bank, so the
  // reference is relevant regardless of tenor; this is now just `isDocumentPresentationFunction` itself,
  // no separate tenor-gated boolean needed. `selectedContract` is the right source for all three: A3/A3S
  // resolve it directly (flat Catalog); B3 gets it aliased from `selectedParent` inside onSelectParent()'s
  // own B3/A8 shape (see that method's doc comment) — the component never needs to know which case it's in.

  const fields: FormlyFieldConfig[] = [
    // Must be the first field on the entry screen (Amendment No. for A2/B2, IB Number for A3/A3S, EB
    // Number for B4) — mandatory, validated on blur like Amount. A no-op for A1/B1 (no secondaryRefLabel).
    {
      key: 'secondaryRef',
      type: 'input',
      props: { label: ctx.dynamicSecondaryRefLabel ?? 'Reference No.', required: !!ctx.dynamicSecondaryRefLabel },
      hide: !ctx.dynamicSecondaryRefLabel,
    },
    {
      key: 'amount',
      type: 'input',
      props: {
        label: amountFromFullSettle
          ? "Amount (Full Settle — carried from the Acceptance's Available Balance, protected)"
          : amountFromSgRedeem
            ? "Amount (Full Redeem only — carried from the Shipping Guarantee's Available Balance, protected; Partial Redeem is no longer supported here)"
            : amountCappedAtAcceptance
              ? "Amount (defaults to the Acceptance's Available Balance — reduce for a Partial Settle, must not exceed it; also settles the matching Reimbursement Receivable for the same amount)"
              : strategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')
                ? 'Bill Amount (actual document amount — see SG Redemption Amount below)'
                : amountFromClose
                  ? 'Amount (Close — carried from the current Confirmed Balance, protected; writes it off to 0)'
                  : amountFromAmendExpiry
                    ? 'Amount (Extend Expiry never touches the Balance — locked to 0)'
                    : amountFromAmendMaturityCalendars
                      ? 'Amount (Update Clearing Bank Calendars never touches the Balance — locked to 0)'
                      : amountLocked
                      ? 'Amount (carried from the Document Arrival, protected)'
                      : 'Amount (face-level, per Design doc §6.2)',
        required: true,
        type: 'number',
        disabled: amountLocked,
        max: amountCappedAtAcceptance ? Number(selectedContractSnapshot!.availableBalance) : undefined,
        // Smallest representable positive value for the typed Currency — refuses 0/negative before the
        // real submit-time backstop (validateSubmit()'s "Amount must be greater than 0.").
        min: Math.pow(10, -decimalPlacesForCurrency(model.currency)),
        // Keeps the spinner/step granularity in sync with the typed Currency (e.g. JPY -> step 1).
        step: Math.pow(10, -decimalPlacesForCurrency(model.currency)),
      },
      // Uses Formly's expressions to keep props.step live as Currency changes, rather than a full field
      // rebuild (which would reassign `fields` on every keystroke and risk input-focus loss).
      expressions: {
        'props.step': (f: any) => Math.pow(10, -decimalPlacesForCurrency(f.model?.currency)),
      },
    },
    {
      key: 'currency',
      // Reuses the same Formly `type: 'select'` pattern the Tenor Type field uses below.
      type: currencyIsDropdown ? 'select' : 'input',
      props: {
        label: currencyLocked ? 'Currency (carried from the existing record, protected)' : 'Currency',
        required: true,
        disabled: currencyLocked,
        ...(currencyIsDropdown ? { options: CURRENCY_OPTIONS } : {}),
      },
    },
    {
      key: 'tolerancePct',
      type: 'input',
      props: { label: 'Tolerance % (Maximum Exposure Basis, only on ISSUE/AMEND*)', type: 'number' },
      hide: !toleranceApplicable(model),
    },
    // UI-only reorder (2026-08-23, user-requested) — Issue Date logically precedes Expiry Date (an LC
    // is issued, THEN it has an expiry), so it's shown first even though `expiryDate` is the field
    // required by A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §1; issueDate stays optional
    // (server defaults it to today).
    {
      key: 'issueDate',
      type: 'input',
      props: { label: 'Issue Date (optional — defaults to today)', type: 'date' },
      hide: !isRootIssue,
    },
    // UI-only reference field (2026-08-23, user-requested — originally "A2 and B2 修改Expiry date也將原來
    // 的Expiry Date顯示出來供參考", widened same day to "Current Expiry Date A3 A3S & B3 都要顯示" — the
    // Document Presentation functions need the same context, to judge UCP 14(c) presentation timing
    // against UCP 6(d) expiry). Shown BEFORE `expiryDate` below (also user-requested, same message —
    // "A2 & B2 Current Expiry Date & New Expiry Date位置對調一下"): the existing value logically precedes
    // the new one being typed. Read-only, never submitted (buildSubmitRequest() never reads this key).
    // Populated in maker-panel.component.ts: A2/B2/A3/A3S go through onSelectContract() (the flat Catalog
    // picker), B3 through onSelectParent() (its own instrumentType, EPLC_EXAMINATION, is in HAS_PARENT —
    // see the B3/A8 selectedContract-aliasing comment there) — never via Formly's own `defaultValue`, same
    // staleness reasoning as parentExpiryDateReference below.
    {
      key: 'originalExpiryDateReference',
      type: 'input',
      props: {
        label: amountFromAmendExpiry ? 'Current Expiry Date (reference — before this amendment)' : 'Current Expiry Date (reference — UCP 600 Art. 6(d)/14(c))',
        type: 'date',
        disabled: true,
      },
      hide: !amountFromAmendExpiry && !isDocumentPresentationFunction,
    },
    // §1 — expiryDate is the field's ONE point of entry into the whole system (every later Amend
    // Expiry/presentation/discovery-query use reads it back), so it's required here.
    // §2/§3 — the SAME model.expiryDate key doubles as A2/B2 Extend Expiry's own "New Expiry Date" input
    // (mutually exclusive with A1/B1 root ISSUE — a function is never both at once — so one field
    // definition with a context-dependent label covers both, rather than two fields sharing one key).
    {
      key: 'expiryDate',
      type: 'input',
      props: { label: amountFromAmendExpiry ? 'New Expiry Date' : 'Expiry Date (UCP 600 Art. 6(d))', type: 'date', required: true },
      hide: !isRootIssue && !amountFromAmendExpiry,
    },
    // §2/§3 — A3/A3S (Import) and B3 (Export) only. "取代目前隱含使用 createdAt 的行為" — the spec's own
    // reasoning for surfacing this as a real input rather than continuing to implicitly use createdAt.
    {
      key: 'documentPresentationDate',
      type: 'input',
      props: { label: 'Document Presentation Date (UCP 14(c))', type: 'date' },
      hide: !isDocumentPresentationFunction,
    },
    // UI-only reference field (2026-08-23) — read-only, never submitted (buildSubmitRequest() never
    // reads this key); see isMaturityDateFunction's own doc comment above for why A6/B4-Usance only.
    // Populated the same way tenorType/tenorDays are just below (never via Formly's own `defaultValue`,
    // which only applies once and would go stale across a re-pick) — see maker-panel.component.ts's own
    // onSelectParent(), which sets model.parentExpiryDateReference directly on every parent selection.
    {
      key: 'parentExpiryDateReference',
      type: 'input',
      props: { label: 'Parent LC/Confirmation Expiry Date (reference only, for Maturity Date entry)', type: 'date', disabled: true },
      hide: !isMaturityDateFunction,
    },
    // Clearing Bank Calendar Profile (2026-08-23, user-directed) — A1/B1's own single "Calendar Profile"
    // dropdown pick (see MATURITY_DATE_CALENDAR_PROFILES's own doc comment for why a preset dropdown,
    // not a generic calendars[] editor); doubles as A2/B2's own Update Clearing Bank Calendars input,
    // same "one field definition, context-dependent label" convention expiryDate uses for A1/B1 vs.
    // AMEND_EXPIRY above. Originally required for Usance only, widened same day (user-directed —
    // "SIGHT也要有這欄位 因為也要跟收款行清算收錢與付錢") — every LC settles through a paying/collecting
    // bank regardless of tenor, so this is now unconditionally required at A1/B1 (no more tenorType
    // `expressions` reactivity needed) and at AMEND_MATURITY_CALENDARS. Still used by A6/B4 to calculate
    // Acceptance Maturity Date on the Usance path (inherited automatically server-side from the parent
    // contract via getMaturityDateCalendarsFromParent(), never re-selected there) — on the Sight path the
    // same config identifies which calendars govern the immediate A4/A7 settlement itself, a separate
    // downstream piece not yet wired to Standing.
    {
      key: 'maturityDateProfile',
      type: 'select',
      props: {
        label: amountFromAmendMaturityCalendars ? 'New Clearing Bank Calendar Profile' : 'Clearing Bank Calendar Profile',
        options: [{ value: '', label: '— select —' }, ...MATURITY_DATE_CALENDAR_PROFILES],
        required: isRootIssue || amountFromAmendMaturityCalendars,
      },
      hide: !isRootIssue && !amountFromAmendMaturityCalendars,
    },
    // UI-only reference field (2026-08-23, user-directed) — read-only, never submitted; see
    // isDocumentPresentationFunction's own doc comment above. Populated in maker-panel.component.ts
    // the same way originalExpiryDateReference is (onSelectContract() for A3/A3S, onSelectParent()'s own
    // B3/A8 aliasing block for B3) — never via Formly's own `defaultValue`.
    {
      key: 'maturityDateCalendarsReference',
      type: 'input',
      props: { label: 'Clearing Bank Calendar Profile (reference only)', disabled: true },
      hide: !isDocumentPresentationFunction,
    },
    {
      key: 'tenorType',
      type: 'select',
      props: {
        label: tenorLocked ? 'Tenor Type (carried from the parent LC, protected)' : 'Tenor Type (Design doc §7 Tenor Type Routing)',
        required: !!selectedFunction?.tenorTypeOptions?.length,
        options: selectedFunction?.tenorTypeOptions ?? [],
        disabled: tenorLocked,
      },
      hide: !selectedFunction?.tenorTypeOptions?.length,
    },
    {
      key: 'tenorDays',
      type: 'input',
      props: { label: tenorLocked ? 'Tenor Days (carried from the parent LC, protected)' : 'Tenor Days', type: 'number', disabled: tenorLocked },
      hide: !selectedFunction?.tenorTypeOptions?.length,
      // A1/B1: Sight => Tenor Days = 0, protected; not Sight => must be > 0. Uses Formly's live
      // `expressions` rather than a full field rebuild, to avoid input-focus loss.
      ...((selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1') && !tenorLocked
        ? {
            expressions: {
              'props.disabled': (f: any) => f.model?.tenorType === 'SIGHT',
              'props.required': (f: any) => !!f.model?.tenorType && f.model.tenorType !== 'SIGHT',
              'props.min': (f: any) => (f.model?.tenorType && f.model.tenorType !== 'SIGHT' ? 1 : null),
              'props.label': (f: any) => (f.model?.tenorType === 'SIGHT' ? 'Tenor Days (Sight — always 0, protected)' : 'Tenor Days'),
              className: (f: any) => (f.model?.tenorType && f.model.tenorType !== 'SIGHT' ? 'tb-field--required' : ''),
              'model.tenorDays': (f: any) => (f.model?.tenorType === 'SIGHT' ? 0 : f.model?.tenorDays),
            },
          }
        : {}),
    },
    // Maturity-Date-Tenor-Basis-Decision-Review.md v31 §3.1 (business-confirmed routing matrix) — A1/B1
    // root ISSUE only. Reactive `expressions` (not a static hide/required) mirror tenorDays' own Sight
    // pattern just above: required for BUYERS_USANCE/SELLERS_USANCE, forced blank+disabled for SIGHT
    // (validateTenorBasisTypeCombination() rejects a non-null tenorBasis on a Sight contract).
    {
      key: 'tenorBasis',
      type: 'select',
      props: { label: 'Tenor Basis (UCP 600 Art. 3 date-calculation basis)', options: TENOR_BASIS_OPTIONS },
      hide: !isTenorBasisFunction,
      expressions: {
        'props.disabled': (f: any) => f.model?.tenorType === 'SIGHT',
        'props.required': (f: any) => !!f.model?.tenorType && f.model.tenorType !== 'SIGHT',
        'props.label': (f: any) =>
          f.model?.tenorType === 'SIGHT'
            ? 'Tenor Basis (Sight — not applicable, protected)'
            : f.model?.tenorBasis && !tenorBasisHasWorkingCalculation(f.model.tenorBasis)
              ? 'Tenor Basis (⚠ only Fixed Maturity Date is calculated today — any other basis leaves the eventual Acceptance Pending Base Date indefinitely)'
              : 'Tenor Basis (UCP 600 Art. 3 date-calculation basis)',
        'model.tenorBasis': (f: any) => (f.model?.tenorType === 'SIGHT' ? undefined : f.model?.tenorBasis),
      },
    },
    // §3.1 — required exactly when tenorBasis === 'FIXED_MATURITY_DATE'; the LC-stated contractual
    // Maturity Date itself (not a Base Date), so no computation runs on it beyond the passthrough to
    // Standing for calendar adjustment (see the microservice's own routes/balanceMovements.ts).
    {
      key: 'fixedMaturityDate',
      type: 'input',
      props: { label: 'Fixed Maturity Date', type: 'date' },
      hide: !isTenorBasisFunction,
      expressions: {
        'props.disabled': (f: any) => f.model?.tenorBasis !== 'FIXED_MATURITY_DATE',
        'props.required': (f: any) => f.model?.tenorBasis === 'FIXED_MATURITY_DATE',
        'model.fixedMaturityDate': (f: any) => (f.model?.tenorBasis === 'FIXED_MATURITY_DATE' ? f.model?.fixedMaturityDate : undefined),
      },
    },
    // UI-only read-only reference (2026-08-24) — see isAcceptanceContractSelected's own doc comment above.
    // Sourced directly from ctx.selectedContract, never typed/submitted.
    {
      key: 'maturityDateStatusReference',
      type: 'input',
      props: { label: 'Acceptance Maturity Date Status (reference only)', disabled: true },
      hide: !isAcceptanceContractSelected,
    },
    {
      key: 'contractualMaturityDateReference',
      type: 'input',
      props: { label: 'Contractual Maturity Date (reference only — never calendar-adjusted)', type: 'date', disabled: true },
      hide: !isAcceptanceContractSelected,
    },
    {
      key: 'operationalPaymentDateReference',
      type: 'input',
      props: { label: 'Operational Payment Date (reference only — Standing calendar-adjusted)', type: 'date', disabled: true },
      hide: !isAcceptanceContractSelected,
    },
    // Event Seq and Created By are system-derived and read-only on every screen — already populated
    // onto `model` before buildFields() runs; `disabled: true` only blocks editing, not derivation.
    {
      key: 'eventSeq',
      type: 'input',
      props: { label: 'Event Seq (system-generated, protected — idempotency key part, Design doc §8)', required: true, type: 'number', disabled: true },
    },
    { key: 'createdBy', type: 'input', props: { label: 'Created By (Maker, system-derived, protected)', required: true, disabled: true } },
  ];

  // Mandatory-field visual distinction (UI/UX best practice: don't rely on the tiny asterisk
  // alone) — applies uniformly to every function (A1-A9/B1-B5) since it reads props.required
  // rather than hardcoding field keys. See .tb-field--required in the stylesheet.
  for (const f of fields) {
    if (f.props?.required) f.className = [f.className, 'tb-field--required'].filter(Boolean).join(' ');
  }
  return fields;
}

/**
 * Inquire Events (OOD Decorator) — wraps buildFields()'s output to force every field read-only, without
 * touching buildFields() itself (Open/Closed). `expressions` is stripped, not left in place: Formly
 * re-evaluates them every cycle and some (e.g. tenorDays' `props.disabled`) would otherwise fight the
 * forced `disabled: true`. Safe here since Inquire Events' model is a static, one-time reconstruction.
 */
export function toReadOnlyFields(fields: FormlyFieldConfig[]): FormlyFieldConfig[] {
  return fields.map((f) => ({
    ...f,
    expressions: undefined,
    props: { ...f.props, disabled: true },
  }));
}
