import { FormlyFieldConfig } from '@ngx-formly/core';
import { BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';
import { CURRENCY_OPTIONS, TransactionFunction, decimalPlacesForCurrency } from './balance-component.model';
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
  // A9 only — Amount defaults to the SG's Available Balance (nets an already-PENDING redemption on the
  // same SG) and is capped there, never disabled. FULL_REDEEM vs PARTIAL_REDEEM is derived at submit()
  // time (autoRedeemType), not picked by the user.
  const amountCappedAtSg = strategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM' && !!selectedContractSnapshot;
  // Same default-to-Available/capped shape as amountCappedAtSg above, for B5's own Usance branch.
  const amountCappedAtAcceptance =
    strategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' && model.instrumentType === 'EPLC_ACCEPTANCE' && !!selectedContractSnapshot;
  // A10/B6 only — Amount is NEVER typed, unlike amountCappedAtSg/amountCappedAtAcceptance above (which
  // stay editable, just capped); fully locked like amountFromDocArrival/amountFromFullSettle, since the
  // write-off must equal the current Confirmed Balance exactly (see submit-rules.ts's own closeShaped
  // exact-amount comment on the microservice side).
  const amountFromClose = strategy?.movementDerivation.amountAutoFilledFrom === 'confirmedBalance' && !!selectedContractSnapshot;
  const amountLocked = amountFromDocArrival || amountFromFullSettle || amountFromClose;
  const tenorLocked = !!selectedFunction?.tenorTypeOptions?.length && isCreatingMovement(model) && hasParent(model) && !!ctx.selectedParent;
  // A1/B1 = Input; every other function = carry from A1/B1 + protected — see carriedCurrency (function-policy.ts).
  const currencyLocked = !!carriedCurrency(ctx.selectedParent, ctx.selectedContract);
  // A1/B1 only — the only functions where Currency is actually being chosen (currencyLocked is always false for them).
  const currencyIsDropdown = selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1';

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
          : amountCappedAtSg
            ? "Amount (defaults to the Shipping Guarantee's Available Balance — reduce for a Partial Redeem, must not exceed it)"
            : amountCappedAtAcceptance
              ? "Amount (defaults to the Acceptance's Available Balance — reduce for a Partial Settle, must not exceed it; also settles the matching Reimbursement Receivable for the same amount)"
              : strategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')
                ? 'Bill Amount (actual document amount — see SG Redemption Amount below)'
                : amountFromClose
                  ? 'Amount (Close — carried from the current Confirmed Balance, protected; writes it off to 0)'
                  : amountLocked
                    ? 'Amount (carried from the Document Arrival, protected)'
                    : 'Amount (face-level, per Design doc §6.2)',
        required: true,
        type: 'number',
        disabled: amountLocked,
        max: amountCappedAtSg || amountCappedAtAcceptance ? Number(selectedContractSnapshot!.availableBalance) : undefined,
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
