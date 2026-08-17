import { FormlyFieldConfig } from '@ngx-formly/core';
import { BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';
import { TransactionFunction, decimalPlacesForCurrency } from './balance-component.model';
import { BuilderModel, carriedCurrency, hasParent, isCreatingMovement, toleranceApplicable } from './function-policy';

/**
 * BAL-003 (God Component) — the Transaction Builder's own Formly field factory, extracted from
 * `TransactionBuilderComponent.rebuildFields()` 2026-08-17.
 *
 * `rebuildFields()` was never really a method: it read eight pieces of state and assigned one array,
 * mutating nothing else. As a pure `(context) => FormlyFieldConfig[]` function it is directly
 * unit-testable without instantiating the component at all — which matters more here than in most of
 * this session's other extractions, because this is where the Amount/Currency/Tenor "carried forward
 * and protected" business instructions are actually enforced in the UI.
 *
 * Every label string, `hide`/`disabled`/`required` condition, and Formly `expressions` callback is
 * unchanged from the component version, byte for byte.
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
  // Business instruction 2026-08-14: "The amount should carry from the related LC number + IB number and
  // protected. The Tenor Type and Tenor days should carry from the LC Number and protected as well." — A6/B4
  // only, and only once the source has actually been picked (before that, they're normal editable inputs).
  // Also A7 Full Settle ("the amount should be carried from IB record and protected... if full settle") —
  // Partial Settle stays free-typed, it's a genuine amount decision each time, not a carried-over value.
  //
  // BAL-135 fix: excludes settlesAcceptanceOnMature (B5) explicitly. B5's own registry entry declares
  // `movementType: 'FULL_SETTLE'` as a placeholder default (the real FULL_SETTLE/PARTIAL_SETTLE value is
  // DERIVED at submit() time from Amount vs Available — same pattern as A9's own `autoRedeemType`, see
  // amountCappedAtSg's own doc comment below), never picked by the user via a subChoice the way A7's own
  // FULL_SETTLE/PARTIAL_SETTLE subChoice is. Before this fix, that shared literal 'FULL_SETTLE' value
  // made B5 ALSO match this A7-only rule — locking/disabling the Amount field and showing the "Full
  // Settle — carried... protected" label — which silently pre-empted the dedicated, more specific,
  // and correct amountCappedAtAcceptance rule below (added 2026-08-16, after this rule was first
  // written) that the business instruction there explicitly calls for: "freely-editable... reduce for
  // a Partial Settle". Confirmed unreachable in practice, not just in theory: nothing between
  // afterResolved() and buildFields() ever changes B5's own model.movementType away from its registry
  // default before Submit, so amountFromFullSettle matched on every single B5 render.
  const amountFromDocArrival = !!selectedFunction?.settlesDocumentArrival && !!ctx.selectedPayMovement;
  const amountFromFullSettle = !selectedFunction?.settlesAcceptanceOnMature && model.movementType === 'FULL_SETTLE' && !!selectedContractSnapshot;
  // Business instruction 2026-08-15 ("There is no need to select Full or Partial as long as the
  // amount is not greater than the SG Balance. The defaulted amount is the SG Balance and
  // mandatory.", refined same day: "Amount default to SG Available Balance") — A9 only, replacing
  // the earlier Full-Redeem-locked/Partial-Redeem-free split with a single freely-editable Amount,
  // pre-filled to the SG's Available Balance (refreshSelectedContractSnapshot()/afterResolved() set
  // this on selection — Available, not Confirmed, so an already-PENDING redemption on the same SG
  // is correctly netted out) and capped at it (props.max below) — never disabled. FULL_REDEEM vs
  // PARTIAL_REDEEM is derived at submit() time from whether the typed amount still equals that
  // Available Balance, not picked by the user (autoRedeemType — see its own doc comment).
  const amountCappedAtSg = !!selectedFunction?.autoRedeemType && !!selectedContractSnapshot;
  // Business instruction 2026-08-16 ("B6改成B5選資料為有Acceptance Balance>0的EB交易") — same
  // default-to-Available/freely-editable-down-to-Partial/capped-at-it shape as amountCappedAtSg above,
  // just for B5's own Usance/CNF_MATURE branch (model.instrumentType === 'EPLC_ACCEPTANCE', B5's own
  // fixed registry type — see settlesAcceptanceOnMature's own doc comment for why this is always true
  // for a real B5 submission, not a conditional fallback resolution).
  const amountCappedAtAcceptance = !!selectedFunction?.settlesAcceptanceOnMature && model.instrumentType === 'EPLC_ACCEPTANCE' && !!selectedContractSnapshot;
  const amountLocked = amountFromDocArrival || amountFromFullSettle;
  const tenorLocked = !!selectedFunction?.tenorTypeOptions?.length && isCreatingMovement(model) && hasParent(model) && !!ctx.selectedParent;
  // Business instruction 2026-08-16 ("A1/B1 = Input; every other function = Carry from A1/B1 +
  // Protected") — see carriedCurrency's own doc comment (function-policy.ts).
  const currencyLocked = !!carriedCurrency(ctx.selectedParent, ctx.selectedContract);

  const fields: FormlyFieldConfig[] = [
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
              : selectedFunction?.documentArrivalWithSg
                ? // Business instruction 2026-08-15 ("Bill Amount = actual Document Arrival amount... SG
                  // Redemption Amount = system-calculated MIN(Bill Amount, SG Outstanding)") — reverses the
                  // prior full-match-only design (Bill Amount used to be locked to the SG's outstanding).
                  'Bill Amount (actual document amount — see SG Redemption Amount below)'
                : amountLocked
                  ? 'Amount (carried from the Document Arrival, protected)'
                  : 'Amount (face-level, per Design doc §6.2)',
        required: true,
        type: 'number',
        disabled: amountLocked,
        max: amountCappedAtSg || amountCappedAtAcceptance ? Number(selectedContractSnapshot!.availableBalance) : undefined,
        // Keeps the input's own spinner/step granularity in sync with whichever Currency is typed
        // alongside it (e.g. JPY -> step 1, no cents) — see decimalPlacesForCurrency's own doc
        // comment (balance-component.model.ts) for the ISO 4217 minor-unit table this reads.
        step: Math.pow(10, -decimalPlacesForCurrency(model.currency)),
      },
      // Currency is a free-typed sibling field (no fixed dropdown to hook a (change) event off of),
      // so — same as tenorDays' own props.min/props.disabled below — this uses Formly's expressions
      // to keep props.step live as the user types a Currency, rather than a full field rebuild (which
      // would reassign the whole `fields` array on every keystroke and risk input-focus loss).
      expressions: {
        'props.step': (f: any) => Math.pow(10, -decimalPlacesForCurrency(f.model?.currency)),
      },
    },
    {
      key: 'currency',
      type: 'input',
      props: {
        label: currencyLocked ? 'Currency (carried from the existing record, protected)' : 'Currency',
        required: true,
        disabled: currencyLocked,
      },
    },
    {
      key: 'tolerancePct',
      type: 'input',
      props: { label: 'Tolerance % (Maximum Exposure Basis, only on ISSUE/AMEND*)', type: 'number' },
      hide: !toleranceApplicable(model),
    },
    {
      key: 'secondaryRef',
      type: 'input',
      props: { label: ctx.dynamicSecondaryRefLabel ?? 'Reference No.', required: !!ctx.dynamicSecondaryRefLabel },
      hide: !ctx.dynamicSecondaryRefLabel,
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
      // Business instruction 2026-08-15 ("A1: Sight => Tenor Days = 0 and protected; not Sight
      // => Tenor Days must be > 0, mandatory") — extended same-day to B1 (Confirm LC) since it
      // declares its own Tenor Type/Days independently, same as A1. Uses Formly's `expressions`
      // (reacts live to the Tenor Type dropdown, evaluated internally by Formly on every model
      // change) rather than a full field rebuild, which would reassign `fields` on every
      // keystroke and risk the same input-focus loss as a live-reordered *ngFor.
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
    // Protected System-Controlled Fields (business instruction 2026-08-17): Event Seq and Created By
    // must be system-derived and read-only on every A1-A9/B1-B5 screen, never manually typed/edited —
    // this applies uniformly here for the same reason the mandatory-field tagging loop below does
    // (one shared field factory, not per-function overrides). Both are already auto-populated onto
    // `model` before buildFields() ever runs (constructor / selectFunction()'s own reset: `createdBy:
    // 'maker1'`, `eventSeq: Date.now()`) — `disabled: true` only stops the UI from letting a Maker
    // change those system-derived values, it doesn't affect how they're derived or submitted.
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
