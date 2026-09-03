import { BalanceContract, BalanceMovement, BalanceSnapshot, CreateMovementRequest } from './balance-component-api.service';
import { TransactionFunction, amountExceedsCurrencyDecimals, decimalPlacesForCurrency } from './balance-component.model';
import { deriveFunctionStrategy } from './function-strategy';
import {
  BuilderModel,
  NaturalKeyFields,
  hasParent,
  ibNumberLabel,
  isCreatingMovement,
  lcNumberFromParent,
  requiredNaturalKeyFields,
  toleranceApplicable,
} from './function-policy';
import { domesticNonBusinessDayReason } from './domestic-calendar';
import { amendmentDirection, resultingTolerancePct } from './tolerance-change';

/**
 * BAL-003 (God Component) — Maker Submit's own validation and request assembly, extracted from
 * `TransactionBuilderComponent` as pure functions: reads become one explicit `SubmitRulesContext`
 * parameter, and the in-place `model` derivations become an explicit returned `patch` the caller
 * applies — a pure function removes the coupling a service extraction would only relocate.
 */

/** Everything the two rule functions below read. Assembled by the component; never mutated here. */
export interface SubmitRulesContext {
  model: BuilderModel;
  naturalKey: NaturalKeyFields;
  selectedFunction: TransactionFunction | null;
  dynamicSecondaryRefLabel: string | null;
  activeFunctionSide: 'IMPORT' | 'EXPORT';
  selectedPayMovement: BalanceMovement | null;
  selectedArrivalSg: BalanceContract | null;
  arrivalSgSnapshot: BalanceSnapshot | null;
  selectedContractSnapshot: BalanceSnapshot | null;
  selectedContract: BalanceContract | null;
  selectedParent: BalanceContract | null;
  exposureNature: 'ACTUAL' | 'MEMO';
  /**
   * Set via the shared `subChoice` mechanism (`key: 'amendDirection'`) for a function whose Amount
   * stays a positive magnitude and expresses Increase/Decrease via this pick instead of a distinct
   * movementType. Today only B2 declares that key; `null` for every other function.
   */
  amendDirection: 'INCREASE' | 'DECREASE' | null;
}

export interface SubmitValidation {
  /** The first failing guard's own message, or null when every guard passed. */
  error: string | null;
  /**
   * In-place `model` derivations (A1's Tenor-Days-0 normalization; A9/B5's FULL vs PARTIAL
   * movementType). Caller must apply this REGARDLESS of `error` — an early guard's mutation must
   * survive a later guard's own failure, matching the original inline-assignment behavior.
   */
  patch: Partial<BuilderModel>;
}

/**
 * `validateSubmit()`'s own mandatory-field guards — instrumentType/movementType/amount/currency/
 * createdBy, New Expiry Date (AMEND_EXPIRY_DATE), Reason Code (CLOSE/REOPEN), A1/B1's own Expiry Date
 * (mandatory + domestic-business-day), Amount decimal-places/positivity. Pure code motion out of
 * validateSubmit() (2026-08-26, SonarQube-scan-report.md — that function had grown to Cognitive
 * Complexity 60) — verbatim logic/messages/order preserved; returns the first failing message or `null`.
 */
function validateMandatoryFields(ctx: SubmitRulesContext, isAmendExpiryDate: boolean): string | null {
  const { model, selectedFunction } = ctx;
  const isMonetaryAmendment = ['AMEND_INCREASE', 'AMEND_DECREASE', 'AMEND'].includes(model.movementType ?? '');
  const toleranceDirection = amendmentDirection(model.movementType, ctx.amendDirection);
  const amountWasEntered = model.amount != null && String(model.amount).trim() !== '';
  if (!model.instrumentType || !model.movementType || (!isAmendExpiryDate && !isMonetaryAmendment && !amountWasEntered) || !model.currency || !model.createdBy) {
    return 'Fill in amount, currency, createdBy.';
  }
  if (isAmendExpiryDate && !model.newExpiryDate) {
    return 'New Expiry Date is mandatory.';
  }
  // F1 proposal §13.1 item 4 (CLOSE)/item 3(a) (REOPEN), BA-ratified 2026-08-25 — A10/B6 and A11/B7 both
  // require a caller-supplied Reason Code; the microservice rejects a bare Submit with none (see
  // BalanceService.assertReasonCodeRequired). AUTO CLOSE never reaches this client-side path at all
  // (it auto-fills its own fixed reasonCode server-side), so no exemption is needed here.
  if ((selectedFunction?.requiresCloseEligibility || selectedFunction?.requiresReopenEligibility) && !model.reasonCode) {
    return `Reason Code is mandatory for ${selectedFunction?.code}.`;
  }
  // User-directed 2026-08-26 ("A1 B1 Expiry Date 是必輸欄位... 不然AUTO EXPIRY無法處理") — mirrors the
  // microservice's own BalanceService.assertExpiryDateRequired(); without it, a contract ISSUEd with no
  // expiryDate could never be picked up by runAutoExpirySweep()'s own candidate query.
  if ((selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1') && !model.expiryDate) {
    return `Expiry Date is mandatory for ${selectedFunction?.code}.`;
  }
  // User-directed 2026-08-26 ("Expiry Date也不可以是本國的假日或周末... FOR A1 B1... UI API都需要") —
  // mirrors the microservice's own BalanceService.assertExpiryDateIsBusinessDay(); this client-side guard
  // is a convenience only, the server-side check is the authoritative enforcement.
  if ((selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1') && model.expiryDate) {
    const reason = domesticNonBusinessDayReason(model.expiryDate);
    if (reason) {
      return `Expiry Date ${model.expiryDate} falls on a domestic non-business day (${reason}) — pick a genuine business day.`;
    }
  }
  if (!isAmendExpiryDate && amountWasEntered && amountExceedsCurrencyDecimals(model.amount, model.currency)) {
    return `Amount ${model.amount} has more decimal places than ${model.currency.toUpperCase()} allows (${decimalPlacesForCurrency(model.currency)}).`;
  }
  // Applies uniformly, including B2 (which used to accept a negative Amount to express Decrease — now
  // always positive; see the amendDirection guard below). Checked before that guard's own transform
  // runs, so this always validates the RAW typed value.
  //
  // A10/B6 (Close) exempted — its own Amount is system-derived from the current Confirmed Balance
  // (never user-typed, see builder-fields.ts's own amountFromClose), and 0 is a legitimate, common write-
  // off figure for an already fully-utilized LC (nothing left to reserve). A11/B7 (Reopen, F1) and
  // AMEND_EXPIRY_DATE (F1) exempted too — both are always exactly 0 by construction (see
  // builder-fields.ts's own amountFromFixed/isAmendExpiryDate). Every OTHER function still means "0 isn't
  // a real transaction" here.
  if (model.movementType !== 'CLOSE' && model.movementType !== 'REOPEN' && !isAmendExpiryDate && !isMonetaryAmendment && Number(model.amount) <= 0) {
    return 'Amount must be greater than 0.';
  }
  if (isMonetaryAmendment && amountWasEntered && Number(model.amount) < 0) {
    return 'Amount must not be negative; use Increase or Decrease to choose the direction.';
  }
  // User-directed 2026-08-28 ("Tolerance MUST >= 0") — mirrors the microservice's own
  // BalanceService.assertToleranceNonNegative(); empty/absent is untouched (Tolerance stays optional even
  // where applicable, see builder-fields.ts's own tolerancePct field) — this only rejects a typed negative.
  if (toleranceApplicable(model) && model.tolerancePct != null && model.tolerancePct !== '' && Number(model.tolerancePct) < 0) {
    return 'Tolerance % must not be negative.';
  }
  if (toleranceApplicable(model) && model.tolerancePct != null && model.tolerancePct !== '' && !/^\d+$/.test(String(model.tolerancePct))) {
    return 'Tolerance % must be a whole number.';
  }
  if (isMonetaryAmendment && model.toleranceChangePct != null && model.toleranceChangePct !== '' && Number(model.toleranceChangePct) < 0) {
    return 'Tolerance Change % must not be negative.';
  }
  if (isMonetaryAmendment && model.toleranceChangePct != null && model.toleranceChangePct !== '' && !/^\d+$/.test(String(model.toleranceChangePct))) {
    return 'Tolerance Change % must be a whole number.';
  }
  if (isMonetaryAmendment && toleranceDirection === 'DECREASE' && model.toleranceChangePct != null && model.toleranceChangePct !== '' && !resultingTolerancePct(ctx.selectedContract?.tolerancePct ?? '0', model.toleranceChangePct, toleranceDirection).ok) {
    return `Decrease Tolerance cannot exceed the current Tolerance of ${ctx.selectedContract?.tolerancePct ?? '0'}%.`;
  }
  if (isMonetaryAmendment) {
    const amountChanged = amountWasEntered && Number(model.amount) !== 0;
    const toleranceWasEntered = model.toleranceChangePct != null && String(model.toleranceChangePct).trim() !== '';
    const toleranceChanged = toleranceWasEntered && Number(model.toleranceChangePct) !== 0;
    if (!amountChanged && !toleranceChanged) {
      return 'Enter an Amount change, a Tolerance change, or both.';
    }
  }
  return null;
}

/**
 * `validateSubmit()`'s own natural-key-field guards — secondaryRef, SHGT's own SG Number, LC Number
 * (both the Parent-picker-supplied and free-text-typed shapes), IB/EB Number, Tenor Type. Pure code
 * motion out of validateSubmit() (2026-08-26, SonarQube-scan-report.md) — verbatim logic/messages/order
 * preserved; returns the first failing message or `null`.
 */
function validateNaturalKeyFields(ctx: SubmitRulesContext): string | null {
  const { model, naturalKey, selectedFunction } = ctx;
  if (ctx.dynamicSecondaryRefLabel && !model.secondaryRef) {
    return `${ctx.dynamicSecondaryRefLabel} is mandatory for ${selectedFunction?.code}.`;
  }
  if (isCreatingMovement(model) && model.instrumentType === 'SHGT' && !naturalKey.sgNumber) {
    return 'SG Number is mandatory when issuing a Shipping Guarantee.';
  }
  if (lcNumberFromParent(model) && !naturalKey.lcNumber) {
    return "Pick the Parent LC first — that selection supplies this record's LC Number.";
  }
  // A1/B1 type the LC Number free-text — lcNumberFromParent above only covers A6/B4/A8 (Parent picker),
  // so nothing else stops a blank submission from silently creating a contract with lc_number=''.
  if (isCreatingMovement(model) && !lcNumberFromParent(model) && !naturalKey.lcNumber) {
    return 'LC Number is mandatory.';
  }
  if (requiredNaturalKeyFields(model).includes('ibNumber') && isCreatingMovement(model) && !naturalKey.ibNumber) {
    return `${ibNumberLabel(ctx.activeFunctionSide)} is mandatory.`;
  }
  if (selectedFunction?.tenorTypeOptions?.length && !model.tenorType) {
    return `Tenor Type is mandatory for ${selectedFunction.code}.`;
  }
  return null;
}

/**
 * `validateSubmit()`'s own function-specific guards that also derive `patch` (A1's Tenor-Days-0
 * normalization; A9/B5's FULL vs PARTIAL movementType) — A1 Tenor Days, A6/B4's settlesDocumentArrival
 * target, A3S's own SG pick, A9 Full-Redeem-only, B5 Full/Partial Settle, B2's own amendDirection pick.
 * Pure code motion out of validateSubmit() (2026-08-26, SonarQube-scan-report.md) — verbatim logic/
 * messages/order preserved; mutates `patch` in place (same object validateSubmit() returns), returns the
 * first failing message or `null`.
 */
function validateFunctionSpecificRules(
  ctx: SubmitRulesContext,
  strategy: ReturnType<typeof deriveFunctionStrategy> | null,
  patch: Partial<BuilderModel>,
): string | null {
  const { model, selectedFunction } = ctx;
  // A1: Sight => Tenor Days = 0 (protected); not Sight => must be > 0. buildFields() already enforces
  // this reactively; this is the submit-time backstop (submit() never gates on form.valid).
  if (selectedFunction?.code === 'A1') {
    if (model.tenorType === 'SIGHT') {
      patch.tenorDays = 0;
    } else if (!model.tenorDays || Number(model.tenorDays) <= 0) {
      return "Tenor Days must be greater than 0 for Seller's/Buyer's Usance.";
    }
  }
  // A6/B4 must convert a SPECIFIC still-PENDING record, not create an Acceptance untethered from one.
  if (strategy?.checkerRelease.settlesDocumentArrival && !ctx.selectedPayMovement) {
    return `Pick the still-PENDING ${selectedFunction?.pendingItemLabel ?? 'Document Arrival'} (2ndary Index) to convert first.`;
  }
  // A3S must be tied to a SPECIFIC Shipping Guarantee — same reasoning as A6 above, just against an
  // outstanding SG record instead of an existing PENDING Document Arrival.
  if (strategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg') && (!ctx.selectedArrivalSg || !ctx.arrivalSgSnapshot)) {
    return 'Pick the Shipping Guarantee this Document Arrival is against first.';
  }
  if (
    strategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg') &&
    ctx.arrivalSgSnapshot &&
    Number(model.amount) < Number(ctx.arrivalSgSnapshot.confirmedBalance)
  ) {
    return `Bill Amount must be greater than or equal to the Shipping Guarantee Balance (${ctx.arrivalSgSnapshot.confirmedBalance}).`;
  }
  // A9 only. BA-confirmed 2026-08-21 (TF_Balance_Component_Mapping Rule #1, "SG discharge is
  // instrument-based, not amount-based" — SG_RELEASE is always the FULL amount, no residual): movementType
  // is now hardcoded FULL_REDEEM, never derived/picked — Partial Redeem is no longer reachable through
  // this function. Checked against Available (not Confirmed), same distinction as shgtRedeem.ts's own
  // commitment-control fix. This is a defense-in-depth backstop for builder-fields.ts's own field lock
  // (amountFromSgRedeem, now disabled) — a mismatch here should only ever happen if the SG's own Available
  // Balance moved between snapshot-resolve and Submit (e.g. a concurrent transaction), not from ordinary
  // UI use. A3S's own matched SG redemption leg (documentArrivalWithSg) is a completely separate code
  // path — genuinely MIN(Bill Amount, SG Available)-capped and tied to a real Document Arrival via
  // businessEventId — and never routes through this branch at all.
  if (strategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM') {
    if (!ctx.selectedContractSnapshot) {
      return 'Search for the Shipping Guarantee to redeem first.';
    }
    const available = ctx.selectedContractSnapshot.availableBalance;
    if (Number(model.amount) !== Number(available)) {
      return `A Shipping Guarantee Redemption (A9) must be for the FULL Available Balance (${available}) — Partial Redeem is no longer supported here.`;
    }
    patch.movementType = 'FULL_REDEEM';
  }
  // B5 only, same "derive Full/Partial from amount vs Available" shape as A9 above, targeting the
  // selected Acceptance. No Reimbursement Receivable lookup or companion movement is part of B5.
  if (strategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' && model.instrumentType === 'EPLC_ACCEPTANCE') {
    if (!ctx.selectedContractSnapshot) {
      return 'Search for the Acceptance to settle first.';
    }
    const available = ctx.selectedContractSnapshot.availableBalance;
    if (Number(model.amount) > Number(available)) {
      return `Amount must not exceed the Acceptance's Available Balance (${available}).`;
    }
    patch.movementType = Number(model.amount) === Number(available) ? 'FULL_SETTLE' : 'PARTIAL_SETTLE';
  }
  // Driven by SubChoice.key, not a hardcoded function code — applies to whatever function declares
  // `subChoice.key: 'amendDirection'` (today only B2). Deliberately does NOT patch `model.amount` here:
  // `model` is the same object the Formly form renders, so patching it would flip the visible Amount
  // negative right after Submit. The sign transform happens in buildSubmitRequest() instead, purely for
  // the outgoing wire request — `model.amount` always stays what the Maker typed.
  if (selectedFunction?.subChoice?.key === 'amendDirection' && !ctx.amendDirection) {
    return 'Pick Increase or Decrease for this Amendment.';
  }
  return null;
}

/**
 * Maker-side capacity backstop for every function whose authoritative API rule is based on the
 * parent/selected contract's Tight Available Balance. The live warning remains useful while typing,
 * but a warning alone must never permit a submission that would make Tight Available Balance negative.
 *
 * A3S is the one widening rule: redeeming the specifically selected SG releases that SG's outstanding
 * capacity as part of the same business event, so its upper limit is current Tight Available plus that
 * SG balance. The base Tight Available itself must still be non-negative; never clamp corrupt data to 0.
 */
function validateTightAvailableCapacity(ctx: SubmitRulesContext): string | null {
  const { selectedFunction, model, selectedContractSnapshot } = ctx;
  const code = selectedFunction?.code;
  const applies =
    (code === 'A2' && model.movementType === 'AMEND_DECREASE') ||
    (code === 'B2' && ctx.amendDirection === 'DECREASE') ||
    code === 'A3' ||
    code === 'A3S' ||
    code === 'A8' ||
    code === 'B3';
  if (!applies) return null;
  // Preserve the more specific target-selection error from buildSubmitRequest()/the selection gate.
  // There is no balance to validate until the required contract/parent has actually been selected.
  if (!ctx.selectedContract && !ctx.selectedParent) return null;

  const tight = selectedContractSnapshot?.tightAvailableBalance;
  if (tight === null || tight === undefined || tight === '') {
    return 'Current Tight Available Balance is unavailable. Wait for the balance lookup to complete, then submit again.';
  }

  const tightAmount = Number(tight);
  if (!Number.isFinite(tightAmount) || tightAmount < 0) {
    return `Current Tight Available Balance (${tight}) is invalid. Submission is blocked; please investigate the balance data.`;
  }

  const sgOutstanding = code === 'A3S' ? Number(ctx.arrivalSgSnapshot?.confirmedBalance ?? 0) : 0;
  const limit = tightAmount + sgOutstanding;
  if (Number(model.amount) > limit) {
    const limitExplanation = code === 'A3S' ? `Tight Available Balance plus selected SG Balance (${limit})` : `Tight Available Balance (${tight})`;
    return `Amount must not exceed ${limitExplanation}; the transaction cannot make Tight Available Balance negative.`;
  }
  return null;
}

export function validateSubmit(ctx: SubmitRulesContext): SubmitValidation {
  const { model, selectedFunction } = ctx;
  const patch: Partial<BuilderModel> = {};
  const strategy = selectedFunction ? deriveFunctionStrategy(selectedFunction) : null;
  // F1 — AMEND_EXPIRY_DATE (A2/B2's third subChoice option) never has a real Amount at all (the field is
  // hidden — see builder-fields.ts's own isAmendExpiryDate) — buildSubmitRequest() below sends a fixed
  // '0' regardless of what model.amount currently holds, so the blank-amount guard below must not fire.
  const isAmendExpiryDate = model.movementType === 'AMEND_EXPIRY_DATE';

  // 2026-08-26 (SonarQube-scan-report.md, Cognitive Complexity 60 -> decomposed) — three grouped guard
  // functions called in the SAME order their checks used to run inline, so an early failure short-
  // circuits later groups exactly like the original single top-to-bottom function did; `patch` is one
  // shared object threaded through all three, so a mutation from an earlier-running group (e.g. A1's own
  // `patch.tenorDays`) still survives into the returned `SubmitValidation` even when a LATER group's own
  // guard is what actually fails — same "apply patch regardless of error" contract this function's own
  // doc comment already establishes.
  const mandatoryError = validateMandatoryFields(ctx, isAmendExpiryDate);
  if (mandatoryError) return { error: mandatoryError, patch };

  const naturalKeyError = validateNaturalKeyFields(ctx);
  if (naturalKeyError) return { error: naturalKeyError, patch };

  const functionError = validateFunctionSpecificRules(ctx, strategy, patch);
  if (functionError) return { error: functionError, patch };

  const tightAvailableError = validateTightAvailableCapacity(ctx);
  if (tightAvailableError) return { error: tightAvailableError, patch };

  return { error: null, patch };
}

/**
 * Assembles the base CreateMovementRequest. Must be called only after validateSubmit()'s own `patch`
 * has been applied to `ctx.model` (A9/B5 movementType, A1 tenorDays both feed fields read here).
 *
 * `amount` is the one field NOT read straight off `ctx.model`: for an `amendDirection` function (B2),
 * the signed wire value is derived here from `ctx.amendDirection` — `model.amount` itself stays
 * whatever the Maker typed (positive, never mutated), since it's rendered back into the form.
 */
export function buildSubmitRequest(ctx: SubmitRulesContext): { request: CreateMovementRequest | null; error: string | null } {
  const { model, selectedFunction } = ctx;
  const isMonetaryAmendment = ['AMEND_INCREASE', 'AMEND_DECREASE', 'AMEND'].includes(model.movementType ?? '');
  const toleranceDirection = amendmentDirection(model.movementType, ctx.amendDirection);
  const strategy = selectedFunction ? deriveFunctionStrategy(selectedFunction) : null;
  // F1 — AMEND_EXPIRY_DATE's own Amount is always '0' by construction, regardless of whatever
  // model.amount currently holds (the field is hidden — see builder-fields.ts's own isAmendExpiryDate).
  const typedAmount = model.amount == null || String(model.amount).trim() === '' ? 0 : Number(model.amount);
  const wireAmount =
    model.movementType === 'AMEND_EXPIRY_DATE'
      ? '0'
      : selectedFunction?.subChoice?.key === 'amendDirection'
        ? ctx.amendDirection === 'DECREASE'
          ? String(-Math.abs(typedAmount))
          : String(Math.abs(typedAmount))
        : ['AMEND_INCREASE', 'AMEND_DECREASE'].includes(model.movementType ?? '')
          ? String(typedAmount)
          : String(model.amount);
  const request: CreateMovementRequest = {
    instrumentType: model.instrumentType!,
    movementType: model.movementType!,
    eventSeq: model.eventSeq ?? Date.now(),
    amount: wireAmount,
    currency: model.currency!,
    createdBy: model.createdBy!,
  };
  if (!isMonetaryAmendment && toleranceApplicable(model) && model.tolerancePct != null && String(model.tolerancePct).trim() !== '') {
    request.tolerancePct = String(model.tolerancePct);
  }
  if (isMonetaryAmendment && model.toleranceChangePct != null && String(model.toleranceChangePct).trim() !== '') {
    request.toleranceChangePct = String(model.toleranceChangePct);
    request.toleranceChangeDirection = toleranceDirection;
  }
  if (model.secondaryRef) request.sourceTransactionRef = model.secondaryRef;
  if (selectedFunction?.tenorTypeOptions?.length) {
    request.tenorType = model.tenorType;
    if (model.tenorDays) request.tenorDays = Number(model.tenorDays);
  }
  // F1 — A1/B1 (ISSUE) only, optional.
  if ((selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1') && model.expiryDate) {
    request.expiryDate = model.expiryDate;
  }
  // F1 — AMEND_EXPIRY_DATE only (A2/B2's third subChoice option).
  if (model.movementType === 'AMEND_EXPIRY_DATE' && model.newExpiryDate) {
    request.newExpiryDate = model.newExpiryDate;
  }
  // F1 proposal §13.1 — A10/B6/A11/B7 only (validateSubmit() above already made it mandatory for them).
  if (model.reasonCode) request.reasonCode = model.reasonCode;

  if (isCreatingMovement(model)) {
    request.naturalKey = {
      lcNumber: ctx.naturalKey.lcNumber,
      ibNumber: ctx.naturalKey.ibNumber || null,
      sgNumber: ctx.naturalKey.sgNumber || null,
    };
  } else if (ctx.selectedContract) {
    request.balanceContractId = ctx.selectedContract.balanceContractId;
  } else {
    return { request: null, error: 'Pick a contract from the Catalog below.' };
  }

  if (hasParent(model) && ctx.selectedParent) {
    request.parentLogicalContractId = ctx.selectedParent.logicalContractId;
  }
  if (model.instrumentType === 'EPLC_ACCEPTANCE' && model.movementType === 'CREATE') {
    request.exposureNature = ctx.exposureNature;
  }
  // A6/B4 only: stamps the picked source record's own movementId onto the new primary movement, so an
  // independent Checker session can resolve/release it without this Maker's own in-memory state — see
  // CreateMovementRequest.referencedTransactionId's own doc comment.
  if (strategy?.checkerRelease.settlesDocumentArrival && ctx.selectedPayMovement) {
    request.referencedTransactionId = ctx.selectedPayMovement.movementId;
  }
  return { request, error: null };
}

/**
 * "No Eligible Records" gate — disables input fields/Submit until a target record is picked. A1/B1
 * are exempt (they create a brand-new contract, nothing to pick).
 *
 * Deliberately NOT a call into validateSubmit() — that also gates on typed field VALUES, which this
 * must not (the point is to unlock fields once a target is picked, not require them already filled).
 * A4 never calls validateSubmit() at all, so each condition below is re-derived from the same
 * Strategy fields independently.
 */
export function hasEligibleTargetSelected(ctx: SubmitRulesContext): boolean {
  const { model, selectedFunction } = ctx;
  if (!selectedFunction) return false;
  if (isCreatingMovement(model) && !hasParent(model)) return true; // A1/B1 — requirement doesn't apply
  const strategy = deriveFunctionStrategy(selectedFunction);
  // A6/A8/B3 (creating + hasParent) — the Parent LC itself must be picked first. `selectedContract` is
  // also accepted (not just `selectedParent`) — bug found live 2026-08-28 ("Maker Queue -> Fix Pending
  // -> Save... 不得再次要求使用者選擇 LC / Index Record"): A8/B3's own Fix Pending reconstruction
  // (`reconstructScreenForSubmitResult()`) sets `selectedContract` but never `selectedParent` (no Parent
  // LC picker interaction happens during a Fix-Pending-driven screen), so once Fix Pending Save completes
  // (`fixPendingMode` flips back to `false`, no longer masking this via `isExternalReviewMode`), this
  // check alone would have re-reported "no target selected" and re-shown the LC Index picker for a
  // record that was never actually un-selected. Safe to accept `selectedContract` here for this
  // shape specifically — `onSelectParent()`'s own existing alias (`this.selectedContract =
  // this.selectedParent`, the same A8/B3-only shape documented on that assignment) already means the two
  // agree throughout a normal live flow too, so this never accepts a genuinely different target. A6
  // (the other lcNumberFromParent function, not Fix-Pending-enabled) is unaffected — its own
  // `settlesDocumentArrival` check right below still requires a real `selectedPayMovement`, and its own
  // `selectedContract` is never set before `selectedParent` in the first place.
  if (lcNumberFromParent(model) && !ctx.selectedParent && !ctx.selectedContract) return false;
  // A4 — the specific still-PENDING record to finalize, not just the LC it lives on.
  if (strategy.checkerRelease.releasesExistingMovementInPlace && !ctx.selectedPayMovement) return false;
  // A6/B4 — the specific PENDING Document Arrival / Present Docs record to convert.
  if (strategy.checkerRelease.settlesDocumentArrival && !ctx.selectedPayMovement) return false;
  // A3S — the specific Shipping Guarantee this Document Arrival is against.
  if (strategy.compoundSubmission.possibleShapes.includes('documentArrivalWithSg') && (!ctx.selectedArrivalSg || !ctx.arrivalSgSnapshot)) return false;
  // A9 — the Shipping Guarantee to redeem.
  if (strategy.movementDerivation.amountVsAvailableDerivation === 'REDEEM' && !ctx.selectedContractSnapshot) return false;
  // B5 — the Acceptance to settle.
  if (strategy.movementDerivation.amountVsAvailableDerivation === 'SETTLE' && model.instrumentType === 'EPLC_ACCEPTANCE' && !ctx.selectedContractSnapshot)
    return false;
  // Every other non-creating function (A2/A3/A4/A7/B2/B4) — the flat-Catalog / two-field-search target.
  if (!isCreatingMovement(model) && !ctx.selectedContract) return false;
  return true;
}
