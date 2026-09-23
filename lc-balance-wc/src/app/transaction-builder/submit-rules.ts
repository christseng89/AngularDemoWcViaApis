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
type EnterableValue = string | number | null | undefined;

function hasEntered(value: EnterableValue): boolean {
  return value != null && String(value).trim() !== '';
}

function isMonetaryAmendment(model: BuilderModel): boolean {
  return ['AMEND_INCREASE', 'AMEND_DECREASE', 'AMEND'].includes(model.movementType ?? '');
}

function validateRequiredAndDates(
  ctx: SubmitRulesContext,
  isAmendExpiryDate: boolean,
  monetaryAmendment: boolean,
  amountWasEntered: boolean,
): string | null {
  const { model, selectedFunction } = ctx;
  if (!model.instrumentType || !model.movementType || (!isAmendExpiryDate && !monetaryAmendment && !amountWasEntered) || !model.currency || !model.createdBy) {
    return 'Fill in amount, currency, createdBy.';
  }
  if (isAmendExpiryDate && !model.newExpiryDate) return 'New Expiry Date is mandatory.';
  if ((selectedFunction?.requiresCloseEligibility || selectedFunction?.requiresReopenEligibility) && !model.reasonCode) {
    return `Reason Code is mandatory for ${selectedFunction?.code}.`;
  }
  const isIssue = selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1';
  if (isIssue && !model.expiryDate) return `Expiry Date is mandatory for ${selectedFunction?.code}.`;
  if (!isIssue || !model.expiryDate) return null;
  const reason = domesticNonBusinessDayReason(model.expiryDate);
  return reason ? `Expiry Date ${model.expiryDate} falls on a domestic non-business day (${reason}) — pick a genuine business day.` : null;
}

function validateAmountRules(model: BuilderModel, isAmendExpiryDate: boolean, monetaryAmendment: boolean, amountWasEntered: boolean): string | null {
  if (!isAmendExpiryDate && amountWasEntered && amountExceedsCurrencyDecimals(model.amount, model.currency)) {
    return `Amount ${model.amount} has more decimal places than ${model.currency!.toUpperCase()} allows (${decimalPlacesForCurrency(model.currency!)}).`;
  }
  const zeroAllowed = model.movementType === 'CLOSE' || model.movementType === 'REOPEN' || isAmendExpiryDate || monetaryAmendment;
  if (!zeroAllowed && Number(model.amount) <= 0) return 'Amount must be greater than 0.';
  if (monetaryAmendment && amountWasEntered && Number(model.amount) < 0) {
    return 'Amount must not be negative; use Increase or Decrease to choose the direction.';
  }
  return null;
}

function validateToleranceRules(ctx: SubmitRulesContext, monetaryAmendment: boolean): string | null {
  const { model } = ctx;
  const toleranceEntered = model.tolerancePct != null && model.tolerancePct !== '';
  if (toleranceApplicable(model) && toleranceEntered && Number(model.tolerancePct) < 0) return 'Tolerance % must not be negative.';
  if (toleranceApplicable(model) && toleranceEntered && !/^\d+$/.test(String(model.tolerancePct))) return 'Tolerance % must be a whole number.';

  const changeEntered = model.toleranceChangePct != null && model.toleranceChangePct !== '';
  if (monetaryAmendment && changeEntered && Number(model.toleranceChangePct) < 0) return 'Tolerance Change % must not be negative.';
  if (monetaryAmendment && changeEntered && !/^\d+$/.test(String(model.toleranceChangePct))) return 'Tolerance Change % must be a whole number.';
  if (!monetaryAmendment || !changeEntered) return null;

  const direction = amendmentDirection(model.movementType, ctx.amendDirection);
  if (direction === 'DECREASE' && !resultingTolerancePct(ctx.selectedContract?.tolerancePct ?? '0', model.toleranceChangePct!, direction).ok) {
    return `Decrease Tolerance cannot exceed the current Tolerance of ${ctx.selectedContract?.tolerancePct ?? '0'}%.`;
  }
  return null;
}

function validateAmendmentChange(model: BuilderModel, monetaryAmendment: boolean, amountWasEntered: boolean): string | null {
  if (!monetaryAmendment) return null;
  const amountChanged = amountWasEntered && Number(model.amount) !== 0;
  const toleranceChanged = hasEntered(model.toleranceChangePct) && Number(model.toleranceChangePct) !== 0;
  return amountChanged || toleranceChanged ? null : 'Enter an Amount change, a Tolerance change, or both.';
}

function validateMandatoryFields(ctx: SubmitRulesContext, isAmendExpiryDate: boolean): string | null {
  const monetaryAmendment = isMonetaryAmendment(ctx.model);
  const amountWasEntered = hasEntered(ctx.model.amount);
  return validateRequiredAndDates(ctx, isAmendExpiryDate, monetaryAmendment, amountWasEntered)
    ?? validateAmountRules(ctx.model, isAmendExpiryDate, monetaryAmendment, amountWasEntered)
    ?? validateToleranceRules(ctx, monetaryAmendment)
    ?? validateAmendmentChange(ctx.model, monetaryAmendment, amountWasEntered);
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
function validateTenorRules(ctx: SubmitRulesContext, patch: Partial<BuilderModel>): string | null {
  const { model, selectedFunction } = ctx;
  if (selectedFunction?.code !== 'A1') return null;
  if (model.tenorType === 'SIGHT') {
    patch.tenorDays = 0;
    return null;
  }
  return !model.tenorDays || Number(model.tenorDays) <= 0
    ? "Tenor Days must be greater than 0 for Seller's/Buyer's Usance."
    : null;
}

function validateSourceSelection(ctx: SubmitRulesContext, strategy: ReturnType<typeof deriveFunctionStrategy> | null): string | null {
  const { model, selectedFunction } = ctx;
  if (strategy?.checkerRelease.settlesDocumentArrival && !ctx.selectedPayMovement) {
    return `Pick the still-PENDING ${selectedFunction?.pendingItemLabel ?? 'Document Arrival'} (2ndary Index) to convert first.`;
  }
  const arrivalWithSg = strategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg') ?? false;
  if (arrivalWithSg && (!ctx.selectedArrivalSg || !ctx.arrivalSgSnapshot)) {
    return 'Pick the Shipping Guarantee this Document Arrival is against first.';
  }
  if (arrivalWithSg && ctx.arrivalSgSnapshot && Number(model.amount) < Number(ctx.arrivalSgSnapshot.confirmedBalance)) {
    return `Bill Amount must be greater than or equal to the Shipping Guarantee Balance (${ctx.arrivalSgSnapshot.confirmedBalance}).`;
  }
  return null;
}

function applyRedeemDerivation(
  ctx: SubmitRulesContext,
  strategy: ReturnType<typeof deriveFunctionStrategy> | null,
  patch: Partial<BuilderModel>,
): string | null {
  if (strategy?.movementDerivation.amountVsAvailableDerivation !== 'REDEEM') return null;
  if (!ctx.selectedContractSnapshot) return 'Search for the Shipping Guarantee to redeem first.';
  const available = ctx.selectedContractSnapshot.availableBalance;
  if (Number(ctx.model.amount) !== Number(available)) {
    return `A Shipping Guarantee Redemption (A9) must be for the FULL Available Balance (${available}) — Partial Redeem is no longer supported here.`;
  }
  patch.movementType = 'FULL_REDEEM';
  return null;
}

function applySettleDerivation(
  ctx: SubmitRulesContext,
  strategy: ReturnType<typeof deriveFunctionStrategy> | null,
  patch: Partial<BuilderModel>,
): string | null {
  if (strategy?.movementDerivation.amountVsAvailableDerivation !== 'SETTLE' || ctx.model.instrumentType !== 'EPLC_ACCEPTANCE') return null;
  if (!ctx.selectedContractSnapshot) return 'Search for the Acceptance to settle first.';
  const available = ctx.selectedContractSnapshot.availableBalance;
  if (Number(ctx.model.amount) > Number(available)) return `Amount must not exceed the Acceptance's Available Balance (${available}).`;
  patch.movementType = Number(ctx.model.amount) === Number(available) ? 'FULL_SETTLE' : 'PARTIAL_SETTLE';
  return null;
}

function validateAmendDirection(ctx: SubmitRulesContext): string | null {
  const requiresDirection = ctx.selectedFunction?.subChoice?.key === 'amendDirection' && ctx.model.movementType !== 'AMEND_EXPIRY_DATE';
  return requiresDirection && !ctx.amendDirection ? 'Pick Increase or Decrease for this Amendment.' : null;
}

function validateFunctionSpecificRules(
  ctx: SubmitRulesContext,
  strategy: ReturnType<typeof deriveFunctionStrategy> | null,
  patch: Partial<BuilderModel>,
): string | null {
  return validateTenorRules(ctx, patch)
    ?? validateSourceSelection(ctx, strategy)
    ?? applyRedeemDerivation(ctx, strategy, patch)
    ?? applySettleDerivation(ctx, strategy, patch)
    ?? validateAmendDirection(ctx);
}

/**
 * Legacy Maker-side capacity backstop for functions that have not moved to the authoritative Excess
 * preview. A3/A3S/B3 are intentionally absent: their server preview owns booking-rate conversion,
 * allowance aggregation, and eligibility, so this browser must not recreate those calculations.
 */
function validateTightAvailableCapacity(ctx: SubmitRulesContext): string | null {
  const { selectedFunction, model, selectedContractSnapshot } = ctx;
  const code = selectedFunction?.code;
  const applies =
    (code === 'A2' && model.movementType === 'AMEND_DECREASE') ||
    (code === 'B2' && ctx.amendDirection === 'DECREASE') ||
    code === 'A8';
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

  if (Number(model.amount) > tightAmount) {
    return `Amount must not exceed Tight Available Balance (${tight}); the transaction cannot make Tight Available Balance negative.`;
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
function wireAmountFor(ctx: SubmitRulesContext, typedAmount: number): string {
  const { model, selectedFunction } = ctx;
  if (model.movementType === 'AMEND_EXPIRY_DATE') return '0';
  if (selectedFunction?.subChoice?.key === 'amendDirection') {
    return ctx.amendDirection === 'DECREASE' ? String(-Math.abs(typedAmount)) : String(Math.abs(typedAmount));
  }
  if (['AMEND_INCREASE', 'AMEND_DECREASE'].includes(model.movementType ?? '')) return String(typedAmount);
  return String(model.amount);
}

function applyToleranceRequestFields(request: CreateMovementRequest, ctx: SubmitRulesContext): void {
  const { model } = ctx;
  const monetaryAmendment = isMonetaryAmendment(model);
  const toleranceDirection = amendmentDirection(model.movementType, ctx.amendDirection);
  if (!monetaryAmendment && toleranceApplicable(model) && hasEntered(model.tolerancePct)) {
    request.tolerancePct = String(model.tolerancePct);
  }
  if (monetaryAmendment && hasEntered(model.toleranceChangePct)) {
    request.toleranceChangePct = String(model.toleranceChangePct);
    request.toleranceChangeDirection = toleranceDirection;
  }
}

function applyTenorAndLifecycleFields(request: CreateMovementRequest, ctx: SubmitRulesContext): void {
  const { model, selectedFunction } = ctx;
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
}

function applyRelationshipFields(
  request: CreateMovementRequest,
  ctx: SubmitRulesContext,
  strategy: ReturnType<typeof deriveFunctionStrategy> | null,
): void {
  const { model } = ctx;
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
}

function applyOptionalRequestFields(
  request: CreateMovementRequest,
  ctx: SubmitRulesContext,
  strategy: ReturnType<typeof deriveFunctionStrategy> | null,
): void {
  applyToleranceRequestFields(request, ctx);
  applyTenorAndLifecycleFields(request, ctx);
  applyRelationshipFields(request, ctx, strategy);
}

function bindRequestTarget(request: CreateMovementRequest, ctx: SubmitRulesContext): string | null {
  if (isCreatingMovement(ctx.model)) {
    request.naturalKey = {
      lcNumber: ctx.naturalKey.lcNumber,
      ibNumber: ctx.naturalKey.ibNumber || null,
      sgNumber: ctx.naturalKey.sgNumber || null,
    };
    return null;
  }
  if (!ctx.selectedContract) return 'Pick a contract from the Catalog below.';
  request.balanceContractId = ctx.selectedContract.balanceContractId;
  return null;
}

export function buildSubmitRequest(ctx: SubmitRulesContext): { request: CreateMovementRequest | null; error: string | null } {
  const { model, selectedFunction } = ctx;
  const strategy = selectedFunction ? deriveFunctionStrategy(selectedFunction) : null;
  const typedAmount = hasEntered(model.amount) ? Number(model.amount) : 0;
  const request: CreateMovementRequest = {
    instrumentType: model.instrumentType!,
    movementType: model.movementType!,
    eventSeq: model.eventSeq ?? Date.now(),
    amount: wireAmountFor(ctx, typedAmount),
    currency: model.currency!,
    createdBy: model.createdBy!,
  };

  const targetError = bindRequestTarget(request, ctx);
  if (targetError) return { request: null, error: targetError };
  applyOptionalRequestFields(request, ctx, strategy);
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
  if (!hasStrategySpecificTarget(ctx, strategy)) return false;
  // Every other non-creating function (A2/A3/A4/A7/B2/B4) — the flat-Catalog / two-field-search target.
  if (!isCreatingMovement(model) && !ctx.selectedContract) return false;
  return true;
}

function hasStrategySpecificTarget(ctx: SubmitRulesContext, strategy: ReturnType<typeof deriveFunctionStrategy>): boolean {
  // A4 — the specific still-PENDING record to finalize, not just the LC it lives on.
  if (strategy.checkerRelease.releasesExistingMovementInPlace && !ctx.selectedPayMovement) return false;
  // A6/B4 — the specific PENDING Document Arrival / Present Docs record to convert.
  if (strategy.checkerRelease.settlesDocumentArrival && !ctx.selectedPayMovement) return false;
  // A3S — the specific Shipping Guarantee this Document Arrival is against.
  if (strategy.compoundSubmission.possibleShapes.includes('documentArrivalWithSg') && (!ctx.selectedArrivalSg || !ctx.arrivalSgSnapshot)) return false;
  // A9 — the Shipping Guarantee to redeem.
  if (strategy.movementDerivation.amountVsAvailableDerivation === 'REDEEM' && !ctx.selectedContractSnapshot) return false;
  // B5 — the Acceptance to settle.
  if (
    strategy.movementDerivation.amountVsAvailableDerivation === 'SETTLE' &&
    ctx.model.instrumentType === 'EPLC_ACCEPTANCE' &&
    !ctx.selectedContractSnapshot
  )
    return false;
  return true;
}
