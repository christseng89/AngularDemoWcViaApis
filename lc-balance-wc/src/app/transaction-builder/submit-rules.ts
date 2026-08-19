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

/**
 * BAL-003 (God Component) — Maker Submit's own validation and request assembly, extracted from
 * `TransactionBuilderComponent` 2026-08-17 as pure functions.
 *
 * This reverses, for these two methods specifically, the reasoning `validateSubmit()`'s own prior doc
 * comment gave for keeping them on the component ("they read/write `model`/`naturalKey`/
 * `selectedParent`/`selectedContractSnapshot`/etc. so pervasively — including in-place derivations
 * like `model.movementType`/`model.tenorDays` — that a service extraction would only relocate that
 * coupling"). That argument holds against a *service* extraction, which would have to be handed
 * mutable component state and write back into it. It does not hold against a *pure function*: the
 * reads become one explicit `SubmitRulesContext` parameter, and the two in-place derivations become
 * an explicit returned `patch` the caller applies — the coupling is not relocated, it is made
 * visible in the signature and then removed.
 *
 * Every guard's order, condition, and error-message string is unchanged from the component version,
 * byte for byte. Same posture as `CheckerActionsService`/`MakerSubmitService`'s own extractions
 * earlier in this session: pure code motion, verified by the pre-existing suite passing unmodified.
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
   * B2 only (business requirement 2026-08-19, "Furthermore A1-A9, B1-B5 Amount figure should > 0" —
   * clarified via a follow-up: B2's Amount stays a plain positive magnitude like every other function;
   * a Decrease is now expressed by picking this Direction instead of by typing a negative number).
   * `null` for every other function, which never reads it.
   */
  amendDirection: 'INCREASE' | 'DECREASE' | null;
}

export interface SubmitValidation {
  /** The first failing guard's own message, or null when every guard passed. */
  error: string | null;
  /**
   * The in-place `model` derivations the component version made directly on `this.model` — A1's
   * Sight/Tenor-Days-0 normalization, and A9/B5's own FULL vs PARTIAL movementType derivation.
   *
   * The caller must apply this **regardless of `error`**, not only on success: in the component
   * version these assignments happened inline, so a mutation made by an EARLY guard survived a LATER
   * guard's own failure return. Accumulating the patch as validation proceeds and applying it
   * unconditionally reproduces that exactly.
   */
  patch: Partial<BuilderModel>;
}

export function validateSubmit(ctx: SubmitRulesContext): SubmitValidation {
  const { model, naturalKey, selectedFunction } = ctx;
  const patch: Partial<BuilderModel> = {};
  const fail = (error: string): SubmitValidation => ({ error, patch });
  // PR-3 of the F-01 Strategy refactoring (desiger-comments.md) — the two A-series-exclusive flag reads
  // below (documentArrivalWithSg/autoRedeemType) now go through the Strategy instead of the raw flag;
  // settlesDocumentArrival (shared with B-series) deliberately stays on the old flag path until PR-4.
  const strategy = selectedFunction ? deriveFunctionStrategy(selectedFunction) : null;

  if (!model.instrumentType || !model.movementType || !model.amount || !model.currency || !model.createdBy) {
    return fail('Fill in amount, currency, createdBy.');
  }
  if (amountExceedsCurrencyDecimals(model.amount, model.currency)) {
    return fail(`Amount ${model.amount} has more decimal places than ${model.currency.toUpperCase()} allows (${decimalPlacesForCurrency(model.currency)}).`);
  }
  // Business requirement 2026-08-19 ("Furthermore A1-A9, B1-B5 Amount figure should > 0") — applies
  // uniformly to every function's own TYPED magnitude, including B2: B2 used to accept a negative
  // Amount directly (the sign itself expressed Increase vs. Decrease, per this file's own EPLC_
  // CONFIRMATION AMEND doc history) — clarified via a follow-up business instruction that B2's own
  // typed Amount should ALSO always be a positive magnitude, with the new Direction guard below
  // deriving the actual signed value via `patch` instead. Checked here, before that patch runs, so
  // this always validates the RAW typed value, never an already-negated one.
  if (Number(model.amount) <= 0) {
    return fail('Amount must be greater than 0.');
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
  // Business-reported gap 2026-08-14: A1/B1 (LC Issue) never had this check — lcNumberFromParent
  // above only covers A6/B4/A8, which get the LC Number from the Parent picker. A1/B1 type it
  // free-text and had nothing stopping a blank submission, silently creating a Logical Contract with
  // lc_number='' (found live via a blank-LC-Number row in the Catalog during that session's testing).
  if (isCreatingMovement(model) && !lcNumberFromParent(model) && !naturalKey.lcNumber) {
    return fail('LC Number is mandatory.');
  }
  if (requiredNaturalKeyFields(model).includes('ibNumber') && isCreatingMovement(model) && !naturalKey.ibNumber) {
    return fail(`${ibNumberLabel(ctx.activeFunctionSide)} is mandatory.`);
  }
  if (selectedFunction?.tenorTypeOptions?.length && !model.tenorType) {
    return fail(`Tenor Type is mandatory for ${selectedFunction.code}.`);
  }
  // Business instruction 2026-08-15 ("A1: Sight => Tenor Days = 0, protected; not Sight => Tenor
  // Days must be > 0, mandatory") — the tenorDays field's expressions (buildFields()) already
  // enforce this visually/reactively; this is the submit-time backstop, matching how every other
  // mandatory field in this function is checked (submit() never gates on form.valid).
  if (selectedFunction?.code === 'A1') {
    if (model.tenorType === 'SIGHT') {
      patch.tenorDays = 0;
    } else if (!model.tenorDays || Number(model.tenorDays) <= 0) {
      return fail("Tenor Days must be greater than 0 for Seller's/Buyer's Usance.");
    }
  }
  // Business instruction 2026-08-14 ("A6 => Approved LC Balance and Create Acceptance Balance"),
  // generalized 2026-08-15 for B4 ("B4 should index records from B3") — A6/B4 must convert a
  // SPECIFIC still-PENDING record, not create an Acceptance untethered from one.
  // PR-4 of the F-01 Strategy refactoring (desiger-comments.md) — settlesDocumentArrival (shared with
  // A6, deliberately left on the old path by PR-3 until B-series had its own wiring) now reads through
  // the Strategy too; behavior unchanged.
  if (strategy?.checkerRelease.settlesDocumentArrival && !ctx.selectedPayMovement) {
    return fail(`Pick the still-PENDING ${selectedFunction?.pendingItemLabel ?? 'Document Arrival'} (2ndary Index) to convert first.`);
  }
  // A3S must be tied to a SPECIFIC Shipping Guarantee — same reasoning as A6 above, just against an
  // outstanding SG record instead of an existing PENDING Document Arrival.
  if (strategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg') && (!ctx.selectedArrivalSg || !ctx.arrivalSgSnapshot)) {
    return fail('Pick the Shipping Guarantee this Document Arrival is against first.');
  }
  // Business instruction 2026-08-15 ("no need to select Full or Partial as long as the amount is not
  // greater than the SG Balance. The defaulted amount is the SG Balance and mandatory.", refined same
  // day: "Amount default to SG Available Balance") — A9 only. props.max in buildFields() already
  // guards this reactively; this is the submit-time backstop, matching how every other mandatory rule
  // here is checked. Checked against Available (Confirmed minus any other already-PENDING redemption
  // on this same SG), not Confirmed — same distinction as shgtRedeem.ts's commitment-control fix,
  // otherwise this could offer/accept an amount the server's own sufficiency check would reject.
  // movementType is DERIVED here — never picked by the user — FULL_REDEEM when the typed amount still
  // equals the SG's current Available Balance, PARTIAL_REDEEM when it's been reduced below it.
  if (strategy?.movementDerivation.amountVsAvailableDerivation === 'REDEEM') {
    if (!ctx.selectedContractSnapshot) {
      return fail('Search for the Shipping Guarantee to redeem first.');
    }
    const available = ctx.selectedContractSnapshot.availableBalance;
    if (Number(model.amount) > Number(available)) {
      return fail(`Amount must not exceed the SG's Available Balance (${available}).`);
    }
    patch.movementType = Number(model.amount) === Number(available) ? 'FULL_REDEEM' : 'PARTIAL_REDEEM';
  }
  // Business instruction 2026-08-16 ("從Balance Component角度來看B5不需要，B6改成B5選資料為有Acceptance
  // Balance>0的EB交易，交易會解除EB交易的Acceptance Balance") — B5 only, same "derive Full/Partial from
  // amount vs Available" shape as autoRedeemType above, just targeting SETTLE instead of REDEEM. B5's
  // own instrumentType is fixed to EPLC_ACCEPTANCE (Usance held-to-maturity — B5 has no Sight branch
  // of its own, see settlesAcceptanceOnMature's own doc comment), so this condition is always true for
  // a real B5 submission. Grounded in the frozen spec's own event table (impl-spec-en.md CNF_MATURE
  // row): "−CONFIRMED_ACCEPTANCE_DPU_OUTSTANDING | −BENEFICIARY_ACCOUNT; +NOSTRO / −ACCEPTANCE_REIMB_
  // RECEIVABLE_ISSUING_BANK" — ONE event clearing both the Acceptance liability and its matching
  // Reimbursement Receivable together, not two independent ones the way CNF_REIMB (Sight/Nego'd) is.
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
  // Business requirement 2026-08-19, follow-up clarification ("Would it be possible that 1. Input the
  // Decrease Amount > 0, then it turns to negative figure to call the APIs?") — B2 only
  // (EPLC_CONFIRMATION/AMEND is the one movementType this whole registry shares between Increase and
  // Decrease, per the direction-from-sign design this reverses; every other function's own direction
  // is already carried by a distinct movementType — A2's own AMEND_INCREASE/AMEND_DECREASE subChoice,
  // for one — so none of them need this). Amount itself was already proven > 0 above; this patch
  // negates it for the wire request when Decrease is picked, same "raw input stays positive, the real
  // signed/derived value travels via `patch`" shape as A9/B5's own FULL/PARTIAL derivation above.
  if (selectedFunction?.code === 'B2') {
    if (!ctx.amendDirection) {
      return fail('Pick Increase or Decrease for this Amendment.');
    }
    patch.amount = ctx.amendDirection === 'DECREASE' ? String(-Math.abs(Number(model.amount))) : String(Math.abs(Number(model.amount)));
  }
  return { error: null, patch };
}

/**
 * Assembles the base CreateMovementRequest, same field-by-field logic as the component version.
 * Returns an `error` (and a null `request`) only for the "no contract picked" case — every other
 * precondition was already checked by validateSubmit().
 *
 * MUST be called only after `validateSubmit()`'s own `patch` has been applied to `ctx.model`: the
 * A9/B5 movementType derivation and A1's tenorDays normalization both feed fields read here.
 */
export function buildSubmitRequest(ctx: SubmitRulesContext): { request: CreateMovementRequest | null; error: string | null } {
  const { model, selectedFunction } = ctx;
  // PR-4 of the F-01 Strategy refactoring (desiger-comments.md) — settlesDocumentArrival below now
  // reads through the Strategy instead of the raw flag; behavior unchanged.
  const strategy = selectedFunction ? deriveFunctionStrategy(selectedFunction) : null;
  const request: CreateMovementRequest = {
    instrumentType: model.instrumentType!,
    movementType: model.movementType!,
    eventSeq: model.eventSeq ?? Date.now(),
    amount: String(model.amount),
    currency: model.currency!,
    createdBy: model.createdBy!,
  };
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
  if (model.instrumentType === 'EPLC_ACCEPTANCE' && model.movementType === 'CREATE') {
    request.exposureNature = ctx.exposureNature;
  }
  // Bug fixed 2026-08-16 ("A6/B4 也修一下") — A6/B4 only: stamps the picked source Document
  // Arrival/Present Docs record's own movementId onto the new primary movement, so a genuinely
  // independent Checker session can later resolve and release it without needing this Maker's own
  // in-memory selectedPayMovement — see CreateMovementRequest.referencedTransactionId's own doc
  // comment for the full rule.
  if (strategy?.checkerRelease.settlesDocumentArrival && ctx.selectedPayMovement) {
    request.referencedTransactionId = ctx.selectedPayMovement.movementId;
  }
  return { request, error: null };
}

/**
 * Business requirement 2026-08-19 ("A2–A9 / B2–B5 — No Eligible Records" — "Protect/disable all
 * transaction input fields... Disable the Submit button... only be enabled after an eligible record
 * has been selected"). A1/B1 are exempt by the requirement's own wording (they create a brand-new
 * Logical Contract with no existing target to pick, same boundary `carriedCurrency`/every other
 * "carried, once resolved" rule in this file already uses) — every OTHER function needs a genuinely
 * resolved target before its own Amount/Currency/etc. fields and Submit button unlock.
 *
 * Deliberately NOT a call into `validateSubmit()` — that function only ever runs for the generic
 * `submit()`/`submitPlain()` path and also gates on typed field VALUES (Amount/Currency/createdBy),
 * which this check must not: the whole point is to unlock those fields once a target is picked, not
 * require they already be filled in. A4 (`releasesExistingMovementInPlace`) never calls
 * `validateSubmit()` at all (its own `submitA4()` bypasses the generic flow entirely) but still needs
 * this same gate, so each "no target selected" condition below is re-derived directly from the same
 * Strategy fields `validateSubmit()`/`buildSubmitRequest()` already use for their own "pick a record
 * first" guards, rather than delegating to either of them.
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
