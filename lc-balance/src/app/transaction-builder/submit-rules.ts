import { BalanceContract, BalanceMovement, BalanceSnapshot, CreateMovementRequest } from './balance-component-api.service';
import { MATURITY_DATE_CALENDAR_PROFILES, TransactionFunction, amountExceedsCurrencyDecimals, decimalPlacesForCurrency } from './balance-component.model';
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
  amendDirection: 'INCREASE' | 'DECREASE' | 'EXTEND_EXPIRY' | 'UPDATE_MATURITY_CALENDARS' | null;
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

export function validateSubmit(ctx: SubmitRulesContext): SubmitValidation {
  const { model, naturalKey, selectedFunction } = ctx;
  const patch: Partial<BuilderModel> = {};
  const fail = (error: string): SubmitValidation => ({ error, patch });
  const strategy = selectedFunction ? deriveFunctionStrategy(selectedFunction) : null;

  if (!model.instrumentType || !model.movementType || !model.amount || !model.currency || !model.createdBy) {
    return fail('Fill in amount, currency, createdBy.');
  }
  if (amountExceedsCurrencyDecimals(model.amount, model.currency)) {
    return fail(`Amount ${model.amount} has more decimal places than ${model.currency.toUpperCase()} allows (${decimalPlacesForCurrency(model.currency)}).`);
  }
  // Applies uniformly, including B2 (which used to accept a negative Amount to express Decrease — now
  // always positive; see the amendDirection guard below). Checked before that guard's own transform
  // runs, so this always validates the RAW typed value.
  //
  // A10/B6 (Close) exempted — its own Amount is system-derived from the current Confirmed Balance
  // (never user-typed, see builder-fields.ts's own amountFromClose), and 0 is a legitimate, common write-
  // off figure for an already fully-utilized LC (nothing left to reserve). A2/B2 Extend Expiry
  // (A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2/§3) is also exempted — its own Amount is
  // always exactly 0 (locked, see builder-fields.ts's own amountFromAmendExpiry), since it never touches
  // Balance/ceilingAmount. A2/B2 Update Maturity Date Calendars (AMEND_MATURITY_CALENDARS, 2026-08-23)
  // is the same shape as Extend Expiry — also always exactly 0 (amountFromAmendMaturityCalendars). Every
  // OTHER function still means "0 isn't a real transaction" here.
  if (model.movementType !== 'CLOSE' && model.movementType !== 'AMEND_EXPIRY' && model.movementType !== 'AMEND_MATURITY_CALENDARS' && Number(model.amount) <= 0) {
    return fail('Amount must be greater than 0.');
  }
  // §2/§3 — the new Expiry Date is mandatory for A2/B2 Extend Expiry (A2 sets model.movementType directly
  // via its own subChoice; B2 sets it via maker-panel.component.ts's own onSubChoice() override for the
  // EXTEND_EXPIRY direction — both converge on model.movementType === 'AMEND_EXPIRY' by the time this runs).
  if (model.movementType === 'AMEND_EXPIRY' && !model.expiryDate) {
    return fail('Expiry Date is mandatory for Extend Expiry.');
  }
  // A6/B4 Calculated Maturity Date (2026-08-23) — same shape as AMEND_EXPIRY's own check immediately
  // above.
  if (model.movementType === 'AMEND_MATURITY_CALENDARS' && !model.maturityDateProfile) {
    return fail('Clearing Bank Calendar Profile is mandatory for Update Clearing Bank Calendars.');
  }
  if (ctx.dynamicSecondaryRefLabel && !model.secondaryRef) {
    return fail(`${ctx.dynamicSecondaryRefLabel} is mandatory for ${selectedFunction?.code}.`);
  }
  if (isCreatingMovement(model) && model.instrumentType === 'SHGT' && !naturalKey.sgNumber) {
    return fail('SG Number is mandatory when issuing a Shipping Guarantee.');
  }
  if (lcNumberFromParent(model) && !naturalKey.lcNumber) {
    return fail("Pick the Parent LC first — that selection supplies this record's LC Number.");
  }
  // A1/B1 type the LC Number free-text — lcNumberFromParent above only covers A6/B4/A8 (Parent picker),
  // so nothing else stops a blank submission from silently creating a contract with lc_number=''.
  if (isCreatingMovement(model) && !lcNumberFromParent(model) && !naturalKey.lcNumber) {
    return fail('LC Number is mandatory.');
  }
  if (requiredNaturalKeyFields(model).includes('ibNumber') && isCreatingMovement(model) && !naturalKey.ibNumber) {
    return fail(`${ibNumberLabel(ctx.activeFunctionSide)} is mandatory.`);
  }
  if (selectedFunction?.tenorTypeOptions?.length && !model.tenorType) {
    return fail(`Tenor Type is mandatory for ${selectedFunction.code}.`);
  }
  // A1: Sight => Tenor Days = 0 (protected); not Sight => must be > 0. buildFields() already enforces
  // this reactively; this is the submit-time backstop (submit() never gates on form.valid).
  if (selectedFunction?.code === 'A1') {
    if (model.tenorType === 'SIGHT') {
      patch.tenorDays = 0;
    } else if (!model.tenorDays || Number(model.tenorDays) <= 0) {
      return fail("Tenor Days must be greater than 0 for Seller's/Buyer's Usance.");
    }
  }
  // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §1 — expiryDate is mandatory at A1/B1 root ISSUE
  // (server-side 400 backstop in resolveOrCreateContract()); this is the client-side pre-check. Dates
  // compare as plain 'YYYY-MM-DD' strings (the native HTML date input's own value format) rather than
  // via `new Date(...)`, deliberately — a Date-object comparison against `new Date()` would compare
  // against the CURRENT TIME OF DAY, not just today's date, so an expiryDate of exactly today would
  // wrongly fail depending what time the Maker happens to submit.
  if (selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1') {
    if (!model.expiryDate) {
      return fail(`Expiry Date is mandatory for ${selectedFunction.code}.`);
    }
    const issueBasis = model.issueDate || new Date().toISOString().slice(0, 10);
    if (model.expiryDate < issueBasis) {
      return fail(
        `Expiry Date (${model.expiryDate}) must not be earlier than ${model.issueDate ? 'Issue Date' : "today's date"} (${issueBasis}).`,
      );
    }
    // Clearing Bank Calendar Profile (2026-08-23, user-directed — originally Usance-only, widened same
    // day: "SIGHT也要有這欄位 因為也要跟收款行清算收錢與付錢" — a Sight LC still settles through a paying/
    // collecting bank, so the calendar check applies regardless of tenor). Client-side backstop matching
    // builder-fields.ts's own static `props.required: true` on this same field.
    if (!model.maturityDateProfile) {
      return fail(`Clearing Bank Calendar Profile is mandatory for ${selectedFunction.code}.`);
    }
    // Maturity-Date-Tenor-Basis-Decision-Review.md v31 §3.1 (business-confirmed) — client-side backstop
    // mirroring validateTenorBasisTypeCombination() on the microservice (resolveOrCreateContract()).
    // Sight itself is protected blank by builder-fields.ts's own reactive expression, so only the Usance
    // branch needs a real check here.
    if (model.tenorType && model.tenorType !== 'SIGHT') {
      if (!model.tenorBasis) {
        return fail(`Tenor Basis is mandatory for a ${model.tenorType} ${selectedFunction.code}.`);
      }
      if (model.tenorBasis === 'AFTER_SIGHT' && model.tenorType === 'SELLERS_USANCE') {
        return fail("AFTER_SIGHT cannot be combined with Seller's Usance — it is reserved for the Buyer's-Usance/UPAS settlement pattern.");
      }
      if (model.tenorBasis === 'FIXED_MATURITY_DATE' && !model.fixedMaturityDate) {
        return fail('Fixed Maturity Date is mandatory when Tenor Basis is Fixed Maturity Date.');
      }
    }
  }
  // A6/B4 must convert a SPECIFIC still-PENDING record, not create an Acceptance untethered from one.
  if (strategy?.checkerRelease.settlesDocumentArrival && !ctx.selectedPayMovement) {
    return fail(`Pick the still-PENDING ${selectedFunction?.pendingItemLabel ?? 'Document Arrival'} (2ndary Index) to convert first.`);
  }
  // A3S must be tied to a SPECIFIC Shipping Guarantee — same reasoning as A6 above, just against an
  // outstanding SG record instead of an existing PENDING Document Arrival.
  if (strategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg') && (!ctx.selectedArrivalSg || !ctx.arrivalSgSnapshot)) {
    return fail('Pick the Shipping Guarantee this Document Arrival is against first.');
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
      return fail('Search for the Shipping Guarantee to redeem first.');
    }
    const available = ctx.selectedContractSnapshot.availableBalance;
    if (Number(model.amount) !== Number(available)) {
      return fail(`A Shipping Guarantee Redemption (A9) must be for the FULL Available Balance (${available}) — Partial Redeem is no longer supported here.`);
    }
    patch.movementType = 'FULL_REDEEM';
  }
  // B5 only, same "derive Full/Partial from amount vs Available" shape as A9 above, targeting SETTLE.
  // Grounded in impl-spec-en.md's CNF_MATURE row — ONE event clears both the Acceptance liability and
  // its matching Reimbursement Receivable together, not two independent ones.
  if (strategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' && model.instrumentType === 'EPLC_ACCEPTANCE') {
    if (!ctx.selectedContractSnapshot) {
      return fail('Search for the Acceptance to settle first.');
    }
    const available = ctx.selectedContractSnapshot.availableBalance;
    if (Number(model.amount) > Number(available)) {
      return fail(`Amount must not exceed the Acceptance's Available Balance (${available}).`);
    }
    patch.movementType = Number(model.amount) === Number(available) ? 'FULL_SETTLE' : 'PARTIAL_SETTLE';
  }
  // Driven by SubChoice.key, not a hardcoded function code — applies to whatever function declares
  // `subChoice.key: 'amendDirection'` (today only B2). Deliberately does NOT patch `model.amount` here:
  // `model` is the same object the Formly form renders, so patching it would flip the visible Amount
  // negative right after Submit. The sign transform happens in buildSubmitRequest() instead, purely for
  // the outgoing wire request — `model.amount` always stays what the Maker typed.
  if (selectedFunction?.subChoice?.key === 'amendDirection' && !ctx.amendDirection) {
    return fail('Pick Increase, Decrease, or Extend Expiry for this Amendment.');
  }
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
/**
 * A6/B4 Calculated Maturity Date (2026-08-23, user-directed) — expands `model.maturityDateProfile`'s
 * single preset-dropdown pick (see MATURITY_DATE_CALENDAR_PROFILES's own doc comment) into the real
 * `maturityDateCalendars`/`maturityDateCombinationRule`/`maturityDateConvention` wire fields. A no-op
 * (mutates nothing) when no profile was picked — the blank `''` option and Sight LCs both land here.
 */
function applyMaturityDateProfile(request: CreateMovementRequest, model: SubmitRulesContext['model']): void {
  const profile = MATURITY_DATE_CALENDAR_PROFILES.find((p) => p.value === model.maturityDateProfile);
  if (!profile) return;
  request.maturityDateCalendars = profile.calendars;
  request.maturityDateCombinationRule = profile.combinationRule;
  request.maturityDateConvention = profile.convention;
}

export function buildSubmitRequest(ctx: SubmitRulesContext): { request: CreateMovementRequest | null; error: string | null } {
  const { model, selectedFunction } = ctx;
  const strategy = selectedFunction ? deriveFunctionStrategy(selectedFunction) : null;
  // A1-A10-B1-B5-Date-Control-Function-Revision-Spec.md §2/§3 — EXTEND_EXPIRY (B2) always wires amount
  // "0" (matches A2's own AMEND_EXPIRY, model.amount is locked to 0 there too — see builder-fields.ts's
  // own amountFromAmendExpiry) rather than deriving a signed figure from model.amount.
  const wireAmount =
    selectedFunction?.subChoice?.key === 'amendDirection'
      ? ctx.amendDirection === 'EXTEND_EXPIRY' || ctx.amendDirection === 'UPDATE_MATURITY_CALENDARS'
        ? '0'
        : ctx.amendDirection === 'DECREASE'
          ? String(-Math.abs(Number(model.amount)))
          : String(Math.abs(Number(model.amount)))
      : String(model.amount);
  const request: CreateMovementRequest = {
    instrumentType: model.instrumentType!,
    movementType: model.movementType!,
    eventSeq: model.eventSeq ?? Date.now(),
    amount: wireAmount,
    currency: model.currency!,
    createdBy: model.createdBy!,
  };
  // §2/§3 — A2 (direct subChoice pick) and B2 (via EXTEND_EXPIRY, see maker-panel.component.ts's own
  // onSubChoice() override) both converge on model.movementType === 'AMEND_EXPIRY' by this point.
  if (model.movementType === 'AMEND_EXPIRY') {
    request.expiryDate = model.expiryDate;
  }
  // A6/B4 Calculated Maturity Date (2026-08-23) — A2 (direct subChoice pick) and B2 (via
  // UPDATE_MATURITY_CALENDARS, see maker-panel.component.ts's own onSubChoice() override) both converge
  // on model.movementType === 'AMEND_MATURITY_CALENDARS' by this point, same convention as AMEND_EXPIRY
  // immediately above.
  if (model.movementType === 'AMEND_MATURITY_CALENDARS') {
    applyMaturityDateProfile(request, model);
  }
  // §2/§3 — A3/A3S/B3 only. Passthrough only when supplied — assertPresentationNotAfterExpiry() on the
  // server is itself a no-op when either side is absent, so omitting this for every other function is
  // harmless (matches builder-fields.ts's own hide condition scoping the input to A3/A3S/B3 only).
  if (selectedFunction?.code === 'A3' || selectedFunction?.code === 'A3S' || selectedFunction?.code === 'B3') {
    if (model.documentPresentationDate) request.documentPresentationDate = model.documentPresentationDate;
  }
  if (toleranceApplicable(model) && model.tolerancePct) request.tolerancePct = String(model.tolerancePct);
  if (model.secondaryRef) request.sourceTransactionRef = model.secondaryRef;
  if (selectedFunction?.tenorTypeOptions?.length) {
    request.tenorType = model.tenorType;
    if (model.tenorDays) request.tenorDays = Number(model.tenorDays);
  }

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
  if (selectedFunction?.code === 'A1' || selectedFunction?.code === 'B1') {
    request.expiryDate = model.expiryDate;
    if (model.issueDate) request.issueDate = model.issueDate;
    applyMaturityDateProfile(request, model);
    // Maturity-Date-Tenor-Basis-Decision-Review.md v31 §3.1 (business-confirmed) — omitted entirely for a
    // Sight tenor (builder-fields.ts's own reactive expression already blanks model.tenorBasis there),
    // matching the microservice's own soft-rollout (only validates when tenorBasis is actually supplied).
    if (model.tenorBasis) {
      request.tenorBasis = model.tenorBasis;
      if (model.tenorBasis === 'FIXED_MATURITY_DATE' && model.fixedMaturityDate) request.fixedMaturityDate = model.fixedMaturityDate;
    }
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
  // A6/A8/B3 (creating + hasParent) — the Parent LC itself must be picked first.
  if (lcNumberFromParent(model) && !ctx.selectedParent) return false;
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
