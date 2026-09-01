import { FormlyFieldConfig } from '@ngx-formly/core';
import { BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';
import { CURRENCY_OPTIONS, TransactionFunction, decimalPlacesForCurrency, tenorTypeLabel } from './balance-component.model';
import { BuilderModel, carriedCurrency, hasParent, isCreatingMovement, toleranceApplicable } from './function-policy';
import { FixPendingEditableField, deriveFunctionStrategy, functionSupportsFixPending } from './function-strategy';

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
  /**
   * Fix Pending (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §2.2/§15/§19,
   * 2026-08-27; UX redesign per direct user feedback; shared-derivation redesign 2026-08-28, "頁面配置檔
   * 原先輸入或FIX PENDING可共用" — user-confirmed SOLID/DRY direction) — true while
   * `MakerPanelComponent.fixPendingMode` is showing this same screen in an editable state for an
   * existing PENDING/REJECTED record, rather than a fresh Submit. `secondaryRef`/`currency` are ALWAYS
   * force-disabled while this is true, unconditionally — per §15, the movement's own business "2ndary
   * Key" (`secondaryRef`) and Currency can never be changed via Fix Pending by ANY Function, so neither
   * is even expressible in `FixPendingEditableField` (`function-strategy.ts`) at all. Every other
   * Fix-Pending-relevant field (`amount`/`tolerancePct`/`tenorType`/`tenorDays`/`expiryDate`/
   * `newExpiryDate`/`reasonCode`) is instead gated per-field via `deriveFixPendingLockFlags()`/
   * `isFixPendingFieldEditable()` below — DERIVED from the SAME lock flags this function already
   * computes for a fresh Submit (`amountLocked`/`tenorLocked`), not a second, separately-declared list —
   * see those functions' own doc comments for the two Fix-Pending-specific facts layered on top.
   */
  fixPendingMode?: boolean;
  /** Rebuilds the original entry-screen shape after transient picker/snapshot state is gone. */
  readOnlyReconstruction?: boolean;
}

/**
 * Fix Pending field-level editability (2026-08-28, "頁面配置檔原先輸入或FIX PENDING可共用" — shares the
 * exact same lock flags `buildFields()` already computes for a fresh Submit, rather than maintaining a
 * second, independently-declared per-Function list): a field locked/carried at original Submit
 * (`amountLocked`/`tenorLocked`) stays locked in Fix Pending too, and a field free-typed/shown at
 * original Submit becomes Fix-Pending-editable automatically — extending Fix Pending to a new Function's
 * already-correct Submit-time field behavior therefore needs zero change here. `reasonCode`/
 * `newExpiryDate` similarly reuse `requiresReasonCode`/`isAmendExpiryDate` — the exact conditions
 * `buildFields()` already uses to decide whether those two fields are even SHOWN at original Submit (a
 * field never shown at Submit has nothing for Fix Pending to correct either). Two Fix-Pending-SPECIFIC
 * facts have no original-Submit equivalent to derive from, so they're layered on top explicitly: (1)
 * `functionSupportsFixPending()` — the trial-scope opt-in gate (`FunctionStrategy.fixPendingEnabled`,
 * A1/A2/A3/B1 today — widened from A1/A3 2026-08-28, "把這A1 A3 修改要求放置B1 A2試試看", zero
 * derivation change needed here, only the per-Function registry flag itself); (2) the 4 CONTRACT-level
 * fields (`tolerancePct`/`tenorType`/`tenorDays`/`expiryDate`)
 * additionally require `isCreatingMovement(model)` — §19: a still-PENDING/REJECTED CREATING movement
 * owns the contract it just created exclusively (see `BalanceContractStore.updateIssueFields()`'s own
 * doc comment on the microservice side), a non-creating movement's contract is shared history it never
 * owned, so those 4 fields stay locked regardless of whether they'd otherwise derive as free-typed.
 */
function deriveFixPendingLockFlags(
  ctx: BuilderFieldsContext,
  strategy: ReturnType<typeof deriveFunctionStrategy> | null,
  amountLocked: boolean,
  tenorLocked: boolean,
  requiresReasonCode: boolean,
  isAmendExpiryDate: boolean,
): Record<FixPendingEditableField, boolean> {
  const fixPendingModeOn = !!ctx.fixPendingMode;
  const enabled = fixPendingModeOn && functionSupportsFixPending(strategy);
  const remarksOnly = enabled && strategy?.fixPendingMode === 'REMARKS_ONLY';
  if (remarksOnly) {
    return {
      amount: true,
      tolerancePct: true,
      tenorType: true,
      tenorDays: true,
      expiryDate: true,
      newExpiryDate: true,
      reasonCode: true,
      remarks: false,
    };
  }
  const contractLevelEditable = enabled && isCreatingMovement(ctx.model);
  return {
    amount: enabled && amountLocked,
    // tolerancePct is a deliberate exception to the shared contractLevelEditable rule below (2026-08-28,
    // "A2 Tolerance % FIX PENDING INCREASE/DECREASE時准許修改") — unlike tenorType/tenorDays/expiryDate,
    // Tolerance is ALSO genuinely applicable to a non-creating AMEND_INCREASE/AMEND_DECREASE/AMEND edit
    // (toleranceApplicable(ctx.model), the SAME check already gating whether this field is even SHOWN —
    // see that field's own `hide` a few lines below), not exclusively a creating-movement-owns-the-
    // contract fact. User-confirmed scope: the edited value only affects THIS movement's own
    // ceilingAmount/contingentAccountEntry, never the contract's own stored tolerancePct — see
    // balanceService.ts's own buildEditedRequest() doc comment for the server-side half of this.
    tolerancePct: enabled && !toleranceApplicable(ctx.model),
    tenorType: enabled && (tenorLocked || !contractLevelEditable),
    tenorDays: enabled && (tenorLocked || !contractLevelEditable),
    expiryDate: enabled && !contractLevelEditable,
    newExpiryDate: fixPendingModeOn && (!enabled || !isAmendExpiryDate),
    reasonCode: fixPendingModeOn && (!enabled || !requiresReasonCode),
    remarks: fixPendingModeOn,
  };
}

/**
 * Public entry point for a caller outside `buildFields()` itself (`MakerPanelComponent.
 * confirmFixPending()`, deciding which fields to include in the outgoing Fix Pending patch) that needs
 * to know whether ONE field is currently Fix-Pending-editable, without duplicating
 * `deriveFixPendingLockFlags()`'s own derivation logic.
 */
export function isFixPendingFieldEditable(ctx: BuilderFieldsContext, field: FixPendingEditableField): boolean {
  const strategy = ctx.selectedFunction ? deriveFunctionStrategy(ctx.selectedFunction) : null;
  const { amountLocked } = deriveAmountLockFlags(ctx, strategy);
  const tenorLocked = !!ctx.selectedFunction?.tenorTypeOptions?.length && isCreatingMovement(ctx.model) && hasParent(ctx.model) && !!ctx.selectedParent;
  const requiresReasonCode = !!ctx.selectedFunction?.requiresCloseEligibility || !!ctx.selectedFunction?.requiresReopenEligibility;
  const isAmendExpiryDate = ctx.model.movementType === 'AMEND_EXPIRY_DATE';
  return !deriveFixPendingLockFlags(ctx, strategy, amountLocked, tenorLocked, requiresReasonCode, isAmendExpiryDate)[field];
}

/**
 * `buildFields()`'s own Amount-field lock derivation — which of A6/B4/A7/A9/A10/B6/A11/B7's own
 * mutually-independent "Amount is carried/locked" rules applies, if any. Pure code motion out of
 * `buildFields()` (2026-08-26, SonarQube-scan-report.md — that function had grown to Cognitive
 * Complexity 63) — verbatim logic/comments preserved, just relocated.
 */
function deriveAmountLockFlags(ctx: BuilderFieldsContext, strategy: ReturnType<typeof deriveFunctionStrategy> | null) {
  const { model, selectedContractSnapshot } = ctx;
  // A6/B4 (once the source is picked) and A7 Full Settle — Amount carries from the source record and
  // is protected. Partial Settle stays free-typed.
  //
  // BAL-135 fix: excludes settlesAcceptanceOnMature (B5) explicitly. B5's registry entry declares
  // `movementType: 'FULL_SETTLE'` only as a placeholder (the real value is DERIVED at submit() time,
  // same as A9's `autoRedeemType`) — without this exclusion the shared literal wrongly matched B5 too,
  // locking its Amount field and pre-empting the correct amountCappedAtAcceptance rule below.
  //
  // 2026-08-28 ("A4 銀幕改成配置方式" — mirror A1/A2's own config-driven screen) — also covers A4
  // (`releasesExistingMovementInPlace`): A4's own Amount is likewise carried from the SAME picked
  // `ctx.selectedPayMovement` (via `applyPayMovementOutcome()`'s `modelAmount` assignment, shared code
  // with A6) — it had never been folded into this shared derivation before, so A4's own template used to
  // duplicate this exact same "carried from the Document Arrival, protected" fact in a bespoke
  // `tb-balance-box` readout instead of the generic Amount field every other carried-Amount Function uses.
  const sourceWasSelected = !!ctx.selectedPayMovement || !!ctx.readOnlyReconstruction;
  const balanceWasSelected = !!selectedContractSnapshot || !!ctx.readOnlyReconstruction;
  const amountFromDocArrival =
    (!!strategy?.checkerRelease.settlesDocumentArrival || !!strategy?.checkerRelease.releasesExistingMovementInPlace) && sourceWasSelected;
  const amountFromFullSettle =
    strategy?.movementDerivation.amountVsAvailableDerivation !== 'SETTLE' && model.movementType === 'FULL_SETTLE' && balanceWasSelected;
  // A9 only. BA-confirmed 2026-08-21 (TF_Balance_Component_Mapping Rule #1, "SG discharge is
  // instrument-based, not amount-based" — SG_RELEASE is always the FULL amount, no residual): Amount is
  // now fully LOCKED to the SG's own Available Balance (nets an already-PENDING redemption on the same
  // SG), not merely capped-but-editable — Partial Redeem is no longer reachable through this function at
  // all (see submit-rules.ts's own hard-reject backstop). Previously stayed editable/capped here with
  // FULL_REDEEM vs PARTIAL_REDEEM derived at submit() time (autoRedeemType); A3S's own matched SG
  // redemption leg (documentArrivalWithSg) is a completely separate code path and is unaffected — it
  // never sets amountVsAvailableDerivation, so this flag is still exclusively an A9 marker.
  const amountFromSgRedeem = strategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM' && balanceWasSelected;
  // Same default-to-Available/capped shape amountFromSgRedeem used to have, for B5's own Usance branch —
  // B5 keeps the original editable-but-capped Partial Settle behavior; only A9 was locked down.
  const amountCappedAtAcceptance =
    strategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' && model.instrumentType === 'EPLC_ACCEPTANCE' && balanceWasSelected;
  // A10/B6 only — Amount is NEVER typed, same fully-locked shape amountFromSgRedeem now also has (unlike
  // amountCappedAtAcceptance above, which stays editable, just capped); the write-off must equal the
  // current Confirmed Balance exactly (see submit-rules.ts's own closeShaped exact-amount comment on the
  // microservice side).
  const amountFromClose = strategy?.movementDerivation.amountAutoFilledFrom === 'confirmedBalance' && balanceWasSelected;
  // A11/B7 (Reopen, F1) only — redesigned 2026-08-25 after live UAT ("REOPEN ui不用輸入金額 但是會用lc
  // balance出帳 account entries, 給checker review"): the real restoration amount is entirely server-
  // computed at Submit time from the LC's own write-off history (domain/reopenRestoration.ts on the
  // microservice side) — there is nothing for a Maker to see or type, so the Amount field is hidden
  // outright (same treatment as isAmendExpiryDate below), not merely locked/disabled-but-visible like
  // amountFromClose. `model.amount` still carries a harmless '0' placeholder (see
  // FunctionStrategy.movementDerivation.amountFixed's own doc comment) purely because the wire schema
  // requires SOME valid MonetaryAmount string — the server discards it and substitutes its own computed
  // figure regardless of what's sent.
  const amountFromFixed = strategy?.movementDerivation.amountFixed != null;
  const amountLocked = amountFromDocArrival || amountFromFullSettle || amountFromClose || amountFromSgRedeem || amountFromFixed;
  return { amountFromFullSettle, amountFromSgRedeem, amountCappedAtAcceptance, amountFromClose, amountFromFixed, amountLocked };
}

/**
 * `buildFields()`'s own Amount-field label — was a single 6-level-deep nested ternary (2026-08-26,
 * SonarQube-scan-report.md — flagged individually as 5 separate `typescript:S3358` findings, and the
 * single largest contributor to that function's own Cognitive Complexity 63). Converted to a flat
 * sequence of independent guard clauses, same order of precedence, verbatim strings preserved.
 */
function amountFieldLabel(
  flags: Pick<ReturnType<typeof deriveAmountLockFlags>, 'amountFromFullSettle' | 'amountFromSgRedeem' | 'amountCappedAtAcceptance' | 'amountFromClose' | 'amountLocked'>,
  strategy: ReturnType<typeof deriveFunctionStrategy> | null,
): string {
  if (flags.amountFromFullSettle) return "Amount (Full Settle — carried from the Acceptance's Available Balance, protected)";
  if (flags.amountFromSgRedeem) {
    return "Amount (Full Redeem — carried from the SG's Available Balance, protected)";
  }
  if (flags.amountCappedAtAcceptance) {
    return "Amount (defaults to the Acceptance's Available Balance — reduce for a Partial Settle; must not exceed it)";
  }
  if (strategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg')) {
    return 'Bill Amount (actual document amount — see SG Redemption Amount below)';
  }
  if (flags.amountFromClose) return 'Amount (Close — carried from the current Confirmed Balance, protected; writes it off to 0)';
  if (flags.amountLocked) return 'Amount (carried from the Document Arrival, protected)';
  return 'Amount (face-level, per Design doc §6.2)';
}

export function buildFields(ctx: BuilderFieldsContext): FormlyFieldConfig[] {
  const { model, selectedFunction, selectedContractSnapshot } = ctx;
  const strategy = selectedFunction ? deriveFunctionStrategy(selectedFunction) : null;
  const { amountFromFullSettle, amountFromSgRedeem, amountCappedAtAcceptance, amountFromClose, amountFromFixed, amountLocked } = deriveAmountLockFlags(
    ctx,
    strategy,
  );
  // F1 — A2/B2's third subChoice option (AMEND_EXPIRY_DATE). Amount has no meaning here (always '0' by
  // construction, same reasoning as amountFromFixed above) — the Amount field is swapped out entirely for
  // the new newExpiryDate date field below, not merely locked in place like amountFromClose/amountFromFixed.
  const isAmendExpiryDate = model.movementType === 'AMEND_EXPIRY_DATE';
  // F1 proposal §13.1 item 4 (CLOSE)/item 3(a) (REOPEN), BA-ratified 2026-08-25 — A10/B6/A11/B7 only.
  const requiresReasonCode = !!selectedFunction?.requiresCloseEligibility || !!selectedFunction?.requiresReopenEligibility;
  // A1/B1 only — F1's own new optional Expiry Date input (UCP 600 Art.6(d)); mailFloatGraceDays is
  // captured server-side from config, never a client-side field.
  const showsExpiryDateInput = selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1';
  const tenorLocked =
    !!selectedFunction?.tenorTypeOptions?.length && isCreatingMovement(model) && hasParent(model) && (!!ctx.selectedParent || !!ctx.readOnlyReconstruction);
  // 2026-08-28, "Tenor Type 改的不對 應該跟Currency欄位一樣 是輸入欄位但是PROTECTED for B2-B7 A2 - A11" —
  // every Function WITHOUT tenorTypeOptions of its own (A1/B1 choose it freely; A6 has its own dedicated
  // tenorLocked-driven field above) now also shows Tenor Type, carried from the resolved contract
  // (MakerPanelComponent.applyCarriedContractFields() writes it into model.tenorType at the same call
  // sites carriedCurrency already fires from — this function just reads it, same as Currency).
  const tenorTypeCarried = !tenorLocked && !selectedFunction?.tenorTypeOptions?.length && !!model.tenorType;
  // A1/B1 = Input; every other function = carry from A1/B1 + protected — see carriedCurrency (function-policy.ts).
  const currencyLocked = ctx.readOnlyReconstruction
    ? selectedFunction?.code !== 'A1' && selectedFunction?.code !== 'B1'
    : !!carriedCurrency(ctx.selectedParent, ctx.selectedContract);
  // A1/B1 only — the only functions where Currency is actually being chosen (currencyLocked is always false for them).
  const currencyIsDropdown = selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1';
  // secondaryRef/currency are unconditionally locked whenever Fix Pending is active, regardless of which
  // Function is selected — see BuilderFieldsContext.fixPendingMode's own doc comment (§15: never
  // expressible in FixPendingEditableField at all). Every other Fix-Pending-relevant field below instead
  // reads deriveFixPendingLockFlags()'s own per-field result, shared with isFixPendingFieldEditable().
  const fixPendingLocked = !!ctx.fixPendingMode;
  const fixPendingFlags = deriveFixPendingLockFlags(ctx, strategy, amountLocked, tenorLocked, requiresReasonCode, isAmendExpiryDate);
  const amountFixPendingLocked = fixPendingFlags.amount;
  const tolerancePctFixPendingLocked = fixPendingFlags.tolerancePct;
  const tenorTypeFixPendingLocked = fixPendingFlags.tenorType;
  const tenorDaysFixPendingLocked = fixPendingFlags.tenorDays;
  const expiryDateFixPendingLocked = fixPendingFlags.expiryDate;
  const newExpiryDateFixPendingLocked = fixPendingFlags.newExpiryDate;
  const reasonCodeFixPendingLocked = fixPendingFlags.reasonCode;
  const remarksFixPendingLocked = fixPendingFlags.remarks;

  const fields: FormlyFieldConfig[] = [
    // Must be the first field on the entry screen (Amendment No. for A2/B2, IB Number for A3/A3S, EB
    // Number for B4) — mandatory, validated on blur like Amount. A no-op for A1/B1 (no secondaryRefLabel).
    {
      key: 'secondaryRef',
      type: 'input',
      // 2026-08-28, "2NDARY NUMBER在FIX PENDING or DELETE PENDING顯示要求與LC NUMBER一樣" — same bold/
      // enlarged emphasis the protected LC Number/2ndary readout (maker-panel.component.html) gives
      // every other function's own natural key, applied here too since THIS field is the "2ndary Ref"
      // for a Function that doesn't use the two-field-search natural key (A2/B2 Amendment No., A3/A3S
      // IB Number, B4 EB Number, etc.) — already genuinely protected either way (toReadOnlyFields()
      // forces every field disabled whenever fieldsLocked, independent of this field's own `disabled`
      // prop below), this only adds the matching visual treatment.
      //
      // Widened 2026-08-29 (user-directed, "A3 交易 2NDARY REF加大加粗明顯") from review-mode-only to
      // unconditional — same "genuinely typed natural-key input gets this treatment always, not just
      // during Fix/Delete Pending review" posture A1/B1's own LC Number input already has. Config-driven
      // (`ctx.dynamicSecondaryRefLabel` alone, not per-function), so every Function sharing this field
      // (A2/A3/A3S/B2/B4/etc.) gets it uniformly.
      className: ctx.dynamicSecondaryRefLabel ? 'tb-natural-key--emphasized' : undefined,
      props: {
        label: fixPendingLocked ? `${ctx.dynamicSecondaryRefLabel ?? 'Reference No.'} (locked — Fix Pending cannot change the 2ndary Key)` : (ctx.dynamicSecondaryRefLabel ?? 'Reference No.'),
        required: !!ctx.dynamicSecondaryRefLabel,
        disabled: fixPendingLocked,
      },
      hide: !ctx.dynamicSecondaryRefLabel,
    },
    {
      key: 'amount',
      type: amountLocked || amountFixPendingLocked ? 'protected-monetary' : 'input',
      props: {
        label: amountFixPendingLocked
          ? 'Amount (not editable via Fix Pending for this Function)'
          : amountFieldLabel({ amountFromFullSettle, amountFromSgRedeem, amountCappedAtAcceptance, amountFromClose, amountLocked }, strategy),
        required: !isAmendExpiryDate && !amountFromFixed,
        type: 'number',
        disabled: amountLocked || amountFixPendingLocked,
        max: amountCappedAtAcceptance && selectedContractSnapshot ? Number(selectedContractSnapshot.availableBalance) : undefined,
        // Smallest representable positive value for the typed Currency — refuses 0/negative before the
        // real submit-time backstop (validateSubmit()'s "Amount must be greater than 0.").
        min: Math.pow(10, -decimalPlacesForCurrency(model.currency)),
        // Keeps the spinner/step granularity in sync with the typed Currency (e.g. JPY -> step 1).
        step: Math.pow(10, -decimalPlacesForCurrency(model.currency)),
      },
      // Hidden outright for A2/B2's third subChoice option (AMEND_EXPIRY_DATE — swapped for newExpiryDate
      // below) and for A11/B7 (amountFromFixed — see that flag's own doc comment above: nothing for a
      // Maker to see or type, the real amount is entirely server-computed at Submit).
      hide: isAmendExpiryDate || amountFromFixed,
      // Formly's default resetOnHide:true wipes model.amount the moment this (freshly rebuilt) field
      // initializes hidden — which clobbers the '0' placeholder onSelectContract() just set for A11/B7
      // (amountFromFixed), since rebuildFields() runs right after that assignment. Safe to disable here:
      // selectFunction() already replaces `model` wholesale on every function switch, so nothing depends
      // on Formly's own hide-triggered clearing to keep amount clean between functions.
      resetOnHide: false,
      // Uses Formly's expressions to keep props.step live as Currency changes, rather than a full field
      // rebuild (which would reassign `fields` on every keystroke and risk input-focus loss).
      expressions: {
        'props.step': (f: any) => Math.pow(10, -decimalPlacesForCurrency(f.model?.currency)),
      },
    },
    {
      // F1 — A2/B2's third subChoice option (AMEND_EXPIRY_DATE), also the Expiry Extension Amendment entry
      // point once the resolved contract is EXPIRED — the UI never distinguishes the two, the server does
      // (see BalanceComponentApiService.CreateMovementRequest.newExpiryDate's own doc comment).
      key: 'newExpiryDate',
      type: 'input',
      props: {
        label: newExpiryDateFixPendingLocked ? 'New Expiry Date (not editable via Fix Pending for this Function)' : 'New Expiry Date',
        type: 'date',
        required: isAmendExpiryDate,
        disabled: newExpiryDateFixPendingLocked,
      },
      hide: !isAmendExpiryDate,
    },
    // F1 — A1/B1 only. The LC's own UCP 600 Art.6(d) expiry/validity date; mailFloatGraceDays itself is
    // captured server-side from config at ISSUE time, never a client-side field. Made mandatory
    // (user-directed 2026-08-26, "A1 B1 Expiry Date 是必輸欄位... 不然AUTO EXPIRY無法處理") — a contract
    // ISSUEd with none could never be picked up by runAutoExpirySweep()'s own candidate query on the
    // microservice side (it only scans contracts whose expiry_date IS NOT NULL); server-side enforcement
    // lives in BalanceService.assertExpiryDateRequired(), this is just the matching UI-side mirror.
    {
      key: 'expiryDate',
      type: 'input',
      props: {
        label: expiryDateFixPendingLocked ? 'Expiry Date (not editable via Fix Pending for this Function)' : 'Expiry Date (UCP 600 Art.6(d))',
        type: 'date',
        required: showsExpiryDateInput,
        disabled: expiryDateFixPendingLocked,
      },
      hide: !showsExpiryDateInput,
    },
    {
      // F1 proposal §13.1 item 4 (CLOSE)/item 3(a) (REOPEN), BA-ratified 2026-08-25 — A10/B6 Close and
      // A11/B7 Reopen both require a caller-supplied Reason Code (the microservice rejects a bare
      // Submit with none — see BalanceService.assertReasonCodeRequired). AUTO CLOSE is exempt — it
      // auto-fills its own fixed reasonCode server-side (config.ts's AUTO_CLOSE_REASON_CODE) and never
      // reaches this UI at all.
      key: 'reasonCode',
      type: 'input',
      props: {
        label: reasonCodeFixPendingLocked ? 'Reason Code (not editable via Fix Pending for this Function)' : 'Reason Code',
        required: requiresReasonCode,
        disabled: reasonCodeFixPendingLocked,
      },
      hide: !requiresReasonCode,
    },
    {
      key: 'remarks',
      type: 'textarea',
      props: {
        label: 'Remarks',
        description: 'Required correction note. Monetary, accounting and linked movement fields remain unchanged.',
        required: true,
        maxLength: 500,
        rows: 4,
        disabled: remarksFixPendingLocked,
      },
      hide: !ctx.fixPendingMode || strategy?.fixPendingMode !== 'REMARKS_ONLY',
    },
    {
      key: 'currency',
      // Reuses the same Formly `type: 'select'` pattern the Tenor Type field uses below.
      type: currencyIsDropdown ? 'select' : 'input',
      props: {
        label: fixPendingLocked
          ? 'Currency (locked — Fix Pending can never change Currency, see §15)'
          : currencyLocked
            ? 'Currency (carried from the existing record, protected)'
            : 'Currency',
        required: true,
        disabled: currencyLocked || fixPendingLocked,
        ...(currencyIsDropdown ? { options: CURRENCY_OPTIONS } : {}),
      },
    },
    {
      key: 'tolerancePct',
      type: 'input',
      props: {
        label: tolerancePctFixPendingLocked
          ? 'Tolerance % (not editable via Fix Pending for this Function)'
          : 'Tolerance % (Maximum Exposure Basis, only on ISSUE/AMEND*)',
        type: 'number',
        disabled: tolerancePctFixPendingLocked,
      },
      hide: !toleranceApplicable(model),
    },
    {
      key: 'tenorType',
      // Always rendered as a `select` — even the carried (non-tenorTypeOptions) case, since Tenor Type's
      // own raw enum values ('SELLERS_USANCE' etc.) aren't human-readable on their own the way Currency's
      // ISO codes already are; a single-option select shows the real formatted label instead.
      type: 'select',
      props: {
        label: tenorTypeFixPendingLocked
          ? 'Tenor Type (not editable via Fix Pending for this Function)'
          : tenorLocked
            ? 'Tenor Type (carried from the parent LC, protected)'
            : tenorTypeCarried
              ? 'Tenor Type (carried from the existing record, protected)'
              : 'Tenor Type (Design doc §7 Tenor Type Routing)',
        required: !!selectedFunction?.tenorTypeOptions?.length,
        options: selectedFunction?.tenorTypeOptions?.length
          ? selectedFunction.tenorTypeOptions
          : model.tenorType
            ? [{ value: model.tenorType, label: tenorTypeLabel(model.tenorType, selectedFunction?.side ?? 'IMPORT') }]
            : [],
        disabled: tenorLocked || tenorTypeFixPendingLocked || tenorTypeCarried,
      },
      hide: !selectedFunction?.tenorTypeOptions?.length && !tenorTypeCarried,
    },
    {
      key: 'tenorDays',
      type: 'input',
      props: {
        label: tenorDaysFixPendingLocked
          ? 'Tenor Days (not editable via Fix Pending for this Function)'
          : tenorLocked
            ? 'Tenor Days (carried from the parent LC, protected)'
            : 'Tenor Days',
        type: 'number',
        disabled: tenorLocked || tenorDaysFixPendingLocked,
      },
      hide: !selectedFunction?.tenorTypeOptions?.length,
      // A1/B1: Sight => Tenor Days = 0, protected; not Sight => must be > 0. Uses Formly's live
      // `expressions` rather than a full field rebuild, to avoid input-focus loss. Excluded (same as
      // the existing !tenorLocked guard) when tenorDaysFixPendingLocked — a live `props.disabled`
      // expression re-evaluates every change-detection cycle and would otherwise fight/override the
      // static `disabled: true` set above.
      ...((selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1') && !tenorLocked && !tenorDaysFixPendingLocked
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
  const applicableFields = strategy?.fixPendingMode === 'REMARKS_ONLY' && ctx.fixPendingMode
    ? fields
    : fields.filter((field) => field.key !== 'remarks');
  for (const f of applicableFields) {
    if (f.props?.required) f.className = [f.className, 'tb-field--required'].filter(Boolean).join(' ');
  }
  return applicableFields;
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
    type: f.key === 'amount' ? 'protected-monetary' : f.type,
    expressions: undefined,
    props: { ...f.props, disabled: true },
  }));
}

/**
 * Generic Requirement (reviewer-reported 2026-08-26, "Original Transaction Screen Must Display All Saved
 * Fields") — one exhaustive source-of-truth mapping from every `BuilderModel` key to the movement/contract
 * property that actually saved it, so `InquireEventsService.selectEvent()`'s reconstructed read-only model
 * can never again silently omit a field the way it originally did for `expiryDate` (fixed same day, then
 * generalized here once the reviewer flagged it as a systemic gap, not a one-off).
 *
 * `Required<BuilderModel>` in the mapped type is the enforcement mechanism: adding a new key to
 * `BuilderModel` (function-policy.ts) — the same interface `buildFields()` itself reads every field key
 * from — without adding its source here is a TypeScript compile error, not a silent runtime omission. This
 * is the intentionally-generic fix the reviewer asked for; there is no reflection/JSON-schema layer in this
 * client (movement/contract are plain typed interfaces, not a dynamic bag of fields), so an exhaustive,
 * compiler-enforced table is the idiomatic equivalent here.
 */
const MODEL_FIELD_SOURCES: { [K in keyof Required<BuilderModel>]: (movement: BalanceMovement, contract: BalanceContract) => BuilderModel[K] } = {
  instrumentType: (_movement, contract) => contract.instrumentType,
  movementType: (movement) => movement.movementType,
  amount: (movement) => movement.amount,
  currency: (movement) => movement.currency,
  tolerancePct: (_movement, contract) => contract.tolerancePct ?? undefined,
  eventSeq: (movement) => movement.eventSeq,
  createdBy: (movement) => movement.createdBy,
  secondaryRef: (movement) => movement.sourceTransactionRef ?? undefined,
  tenorType: (_movement, contract) => contract.tenorType ?? undefined,
  tenorDays: (_movement, contract) => contract.tenorDays ?? undefined,
  expiryDate: (_movement, contract) => contract.expiryDate ?? undefined,
  newExpiryDate: (movement) => movement.newExpiryDate ?? undefined,
  reasonCode: (movement) => movement.reasonCode ?? undefined,
  remarks: (movement) => movement.remarks ?? undefined,
};

/** Rebuilds the full `BuilderModel` a historical Event's Original Transaction Screen should show, straight off the saved movement/contract — see MODEL_FIELD_SOURCES' own doc comment for why this is exhaustive by construction rather than hand-picked. */
export function reconstructOriginalModel(movement: BalanceMovement, contract: BalanceContract): BuilderModel {
  const model = {} as { [K in keyof Required<BuilderModel>]: BuilderModel[K] };
  (Object.keys(MODEL_FIELD_SOURCES) as (keyof BuilderModel)[]).forEach((key) => {
    (model as any)[key] = MODEL_FIELD_SOURCES[key](movement, contract);
  });
  return model;
}
