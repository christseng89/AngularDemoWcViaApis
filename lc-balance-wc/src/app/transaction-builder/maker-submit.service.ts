import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot, CreateMovementRequest } from './balance-component-api.service';
import { InstrumentType, TransactionFunction } from './balance-component.model';
import { describeApiError } from './api-error';
import { deriveFunctionStrategy } from './function-strategy';

/**
 * BAL-003 (Quality-report-balance.md — 6th same-day OOD/SOLID pass, "Maker Submit service"): the four
 * compound Maker submission shapes (A3S/B3-Sight/B4-Usance/B5) plus the default single-call path —
 * previously ~230 lines of `TransactionBuilderComponent`'s own private methods
 * (`submitDocumentArrivalWithSg`, `submitConfirmationHonourWithReceivable`,
 * `submitConfirmationAcceptWithReceivable`, `submitAcceptanceSettleWithReceivable`, `submitPlain`) plus
 * the dispatch `if` chain that used to live directly inside `submit()` — now owns exactly the API-call
 * orchestration: WHICH `createMovement()`/`resolveContract()` call to make, in what order, under what
 * business condition. Mirrors `CheckerActionsService`'s own precedent exactly:
 *  - the service depends only on `MakerSubmitContext` (a narrow, read-only interface — Interface
 *    Segregation: exactly the fields these 5 flows read, nothing else) and the API client it already
 *    injects itself — never on `TransactionBuilderComponent`.
 *  - the service never mutates component state directly; every flow instead resolves to exactly one
 *    `MakerSubmitOutcome`, and the component's own `applyMakerSubmitOutcome()` (transaction-
 *    builder.component.ts) is the ONLY place that still touches `submitting`/`submitResult`/
 *    `submitError`/the five secondary movement fields and calls back into
 *    `refreshSelectedContractSnapshot()`/`syncCheckerToContext()`/`syncLookupToContext()` — Single
 *    Responsibility: this service only ever decides "what happened", never "what the UI does about it".
 *
 * `validateSubmit()`/`buildSubmitRequest()` deliberately stay on the component — they read/write
 * `model`/`naturalKey`/`selectedParent`/`selectedContractSnapshot`/etc. so deeply (including in-place
 * writes like deriving `model.movementType`/`model.tenorDays`) that a service extraction would just
 * relocate that coupling, not remove it — the exact same reasoning `submit()`'s own original BAL-003
 * split already recorded for keeping them where they are.
 *
 * Every guard condition, branch order, and error-message string below — INCLUDING the one genuinely
 * subtle rule this preserves exactly: only the call that submits `req` itself (never a secondary/
 * tertiary leg) ever sets the outcome's own `result` field on failure, mirroring the original code's own
 * `submitResult = err.error` placement precisely. A secondary leg's own failure leaves `result`
 * `undefined` (the component's own `applyMakerSubmitOutcome()` then knows to leave `submitResult`
 * untouched, exactly as the original nested-subscribe code already did) — is unchanged from the methods
 * it replaces. Pure code motion re-expressed as RxJS `switchMap`/`catchError` chains instead of nested
 * `.subscribe()` callbacks, so the exact same sequential-and-conditional shape survives.
 */
export interface MakerSubmitContext {
  readonly model: {
    readonly amount?: string;
    readonly currency?: string;
    readonly createdBy?: string;
    readonly secondaryRef?: string;
    readonly movementType?: string;
    readonly instrumentType?: InstrumentType;
  };
  readonly naturalKey: { readonly ibNumber: string };
  readonly selectedFunction: TransactionFunction | null;
  readonly selectedContract: BalanceContract | null;
  readonly selectedArrivalSg: BalanceContract | null;
  readonly arrivalSgSnapshot: BalanceSnapshot | null;
}

/** Only the fields a given flow actually resolved are present — `undefined` means "unchanged", never "clear this". */
export interface MakerSubmitSecondary {
  arrivalSgRedeemMovementId?: string;
  arrivalSgRedeemMovement?: BalanceMovement;
  dueFromIssuingBankMovementId?: string;
  acceptanceMovementId?: string;
  acceptanceMovement?: BalanceMovement;
  acceptanceReimbReceivableMovementId?: string;
  matchedReceivableMovementId?: string;
}

/**
 * Bug fixed 2026-08-19 (desiger-comments.md F-08, "one field carries the whole Maker flow with no
 * compile-time contract"). `result` on the 'failed' variant was already typed `BalanceMovement | null`,
 * but every `catchError` wrapping a PRIMARY submission call (the `req` this outcome's own caller passed
 * in — never a secondary/tertiary leg that only runs after the primary already succeeded) assigned
 * `err.error ?? null` — the raw HTTP error response body, not a real `BalanceMovement`. Since
 * `TransactionBuilderComponent.applyMakerSubmitOutcome()`'s own gating is `if ('result' in outcome &&
 * outcome.result !== undefined) this.submitResult = outcome.result;`, this let ANY primary-call Submit
 * failure carrying a JSON error body (which the microservice always returns for a validation/business-
 * rule rejection) incorrectly populate `submitResult` — and `formLocked` (`!!this.submitResult`) would
 * then wrongly lock the form after a failed Submit, not just a successful one. Fixed by omitting `result`
 * entirely at every PRIMARY-call failure site (this key's own absence, not `undefined`, is what the
 * `'result' in outcome` check needs to correctly leave `submitResult` untouched). A SECONDARY/tertiary
 * leg's own failure is unaffected — those already, correctly, assign `result` from the captured PRIMARY
 * response variable (e.g. `const result = res.body!;`), never from `err.error`, since the primary call
 * genuinely did succeed in that case.
 */
export type MakerSubmitOutcome =
  | { kind: 'submitted'; result: BalanceMovement; secondary: MakerSubmitSecondary }
  | { kind: 'failed'; message: string; result?: BalanceMovement | null; secondary: MakerSubmitSecondary };

@Injectable({ providedIn: 'root' })
export class MakerSubmitService {
  constructor(private readonly api: BalanceComponentApiService) {}

  submit(req: CreateMovementRequest, ctx: MakerSubmitContext): Observable<MakerSubmitOutcome> {
    // PR-4 of the F-01 Strategy refactoring (desiger-comments.md) — all 4 dispatch conditions below now
    // read through the Strategy instead of the raw flags (documentArrivalWithSg migrated in PR-3; the
    // other 3, B-series-exclusive, migrated here); behavior unchanged.
    const strategy = ctx.selectedFunction ? deriveFunctionStrategy(ctx.selectedFunction) : null;
    if (strategy?.compoundSubmission.possibleShapes.includes('documentArrivalWithSg') && ctx.selectedArrivalSg && ctx.arrivalSgSnapshot) {
      return this.submitDocumentArrivalWithSg(req, ctx);
    }
    if (
      strategy?.compoundSubmission.possibleShapes.includes('confirmationHonourWithReceivable') &&
      ctx.model.movementType === 'HONOUR' &&
      ctx.selectedContract
    ) {
      return this.submitConfirmationHonourWithReceivable(req, ctx);
    }
    if (strategy?.compoundSubmission.possibleShapes.includes('confirmationAcceptWithReceivable') && ctx.selectedContract) {
      return this.submitConfirmationAcceptWithReceivable(req, ctx);
    }
    if (strategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' && ctx.model.instrumentType === 'EPLC_ACCEPTANCE' && ctx.selectedContract) {
      return this.submitAcceptanceSettleWithReceivable(req, ctx);
    }
    return this.submitPlain(req);
  }

  /** A3S only — creates the matched SG's own redemption FIRST, still PENDING, then the LC's own UTILIZE (`req`). */
  private submitDocumentArrivalWithSg(req: CreateMovementRequest, ctx: MakerSubmitContext): Observable<MakerSubmitOutcome> {
    const businessEventId = crypto.randomUUID();
    req.businessEventId = businessEventId;
    const sgOutstanding = Number(ctx.arrivalSgSnapshot!.confirmedBalance);
    const sgRedeemAmount = Math.min(Number(ctx.model.amount), sgOutstanding);
    const redeemReq: CreateMovementRequest = {
      instrumentType: 'SHGT',
      balanceContractId: ctx.selectedArrivalSg!.balanceContractId,
      movementType: sgRedeemAmount >= sgOutstanding ? 'FULL_REDEEM' : 'PARTIAL_REDEEM',
      eventSeq: Date.now(),
      amount: String(sgRedeemAmount),
      currency: ctx.selectedArrivalSg!.currency,
      createdBy: ctx.model.createdBy!,
      businessEventId,
      sourceTransactionRef: ctx.model.secondaryRef || undefined,
    };
    return this.api.createMovement(redeemReq).pipe(
      switchMap((redeemRes) => {
        const secondary: MakerSubmitSecondary = { arrivalSgRedeemMovementId: redeemRes.body!.movementId, arrivalSgRedeemMovement: redeemRes.body! };
        return this.api.createMovement(req).pipe(
          map((res) => ({ kind: 'submitted' as const, result: res.body!, secondary })),
          catchError((err) =>
            of<MakerSubmitOutcome>({
              kind: 'failed',
              message: `Shipping Guarantee redemption reserved (PENDING), but the Document Arrival itself failed: ${describeApiError(err)}`,
              // Bug fixed 2026-08-19 (desiger-comments.md F-08, "one field carries the whole Maker flow
              // with no compile-time contract") — `req` itself (the primary submission) failed here, so no
              // real BalanceMovement was ever created for THIS leg; `result` must stay absent (never the
              // raw HTTP error body, which isn't a BalanceMovement at all) so applyMakerSubmitOutcome()'s
              // own `'result' in outcome && outcome.result !== undefined` check correctly leaves
              // submitResult untouched (null, per submit()'s own reset) rather than wrongly making
              // formLocked true off an error object. secondary.arrivalSgRedeemMovementId/Movement above
              // already carries the SG leg's own real, successful result — unaffected by this fix.
              secondary,
            }),
          ),
        );
      }),
      catchError((err) =>
        of<MakerSubmitOutcome>({ kind: 'failed', message: `Could not reserve the Shipping Guarantee redemption: ${describeApiError(err)}`, secondary: {} }),
      ),
    );
  }

  /** B3's Sight/HONOUR branch only — `req` (the Confirmation's own HONOUR) first, then the linked EPLC_DUE_FROM_ISSUING_BANK CREATE. */
  private submitConfirmationHonourWithReceivable(req: CreateMovementRequest, ctx: MakerSubmitContext): Observable<MakerSubmitOutcome> {
    const businessEventId = crypto.randomUUID();
    req.businessEventId = businessEventId;
    const cnfContract = ctx.selectedContract!;
    return this.api.createMovement(req).pipe(
      switchMap((res) => {
        const result = res.body!;
        const receivableReq: CreateMovementRequest = {
          instrumentType: 'EPLC_DUE_FROM_ISSUING_BANK',
          naturalKey: { lcNumber: cnfContract.naturalKey.lcNumber, ibNumber: ctx.naturalKey.ibNumber || ctx.model.secondaryRef || null, sgNumber: null },
          parentLogicalContractId: cnfContract.logicalContractId,
          movementType: 'CREATE',
          eventSeq: Date.now(),
          amount: String(ctx.model.amount),
          currency: ctx.model.currency!,
          createdBy: ctx.model.createdBy!,
          businessEventId,
        };
        return this.api.createMovement(receivableReq).pipe(
          map((receivableRes) => ({
            kind: 'submitted' as const,
            result,
            secondary: { dueFromIssuingBankMovementId: receivableRes.body!.movementId },
          })),
          catchError((err) =>
            of<MakerSubmitOutcome>({
              kind: 'failed',
              message: `Confirmation honoured (PENDING), but the Due from Issuing Bank asset failed to record: ${describeApiError(err)}`,
              result,
              secondary: {},
            }),
          ),
        );
      }),
      catchError((err) =>
        // Bug fixed 2026-08-19 (desiger-comments.md F-08) — `req` itself (the Confirmation's own HONOUR,
        // the primary submission) failed here, nothing was created yet; `result` omitted (never the raw
        // HTTP error body) for the same reason the inner catchError above already does this correctly —
        // see this file's own module note.
        of<MakerSubmitOutcome>({ kind: 'failed', message: err.error?.message ?? err.message ?? String(err), secondary: {} }),
      ),
    );
  }

  /** B4's Usance branch only — `req` (the Confirmation's own ACCEPT) first, then EPLC_ACCEPTANCE liability CREATE, then EPLC_ACCEPTANCE_REIMB_RECEIVABLE CREATE. */
  private submitConfirmationAcceptWithReceivable(req: CreateMovementRequest, ctx: MakerSubmitContext): Observable<MakerSubmitOutcome> {
    const businessEventId = crypto.randomUUID();
    req.businessEventId = businessEventId;
    const cnfContract = ctx.selectedContract!;
    return this.api.createMovement(req).pipe(
      switchMap((res) => {
        const result = res.body!;
        const acceptanceReq: CreateMovementRequest = {
          instrumentType: 'EPLC_ACCEPTANCE',
          naturalKey: { lcNumber: cnfContract.naturalKey.lcNumber, ibNumber: ctx.naturalKey.ibNumber || ctx.model.secondaryRef || null, sgNumber: null },
          parentLogicalContractId: cnfContract.logicalContractId,
          movementType: 'CREATE',
          eventSeq: Date.now(),
          amount: String(ctx.model.amount),
          currency: ctx.model.currency!,
          createdBy: ctx.model.createdBy!,
          businessEventId,
          exposureNature: 'ACTUAL',
          tenorType: cnfContract.tenorType ?? undefined,
          tenorDays: cnfContract.tenorDays ?? undefined,
        };
        return this.api.createMovement(acceptanceReq).pipe(
          switchMap((acceptanceRes) => {
            const acceptanceMovement = acceptanceRes.body!;
            const receivableReq: CreateMovementRequest = {
              instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE',
              naturalKey: { lcNumber: cnfContract.naturalKey.lcNumber, ibNumber: ctx.naturalKey.ibNumber || ctx.model.secondaryRef || null, sgNumber: null },
              parentLogicalContractId: cnfContract.logicalContractId,
              movementType: 'CREATE',
              eventSeq: Date.now(),
              amount: String(ctx.model.amount),
              currency: ctx.model.currency!,
              createdBy: ctx.model.createdBy!,
              businessEventId,
            };
            return this.api.createMovement(receivableReq).pipe(
              map((receivableRes) => ({
                kind: 'submitted' as const,
                result,
                secondary: {
                  acceptanceMovementId: acceptanceMovement.movementId,
                  acceptanceMovement,
                  acceptanceReimbReceivableMovementId: receivableRes.body!.movementId,
                },
              })),
              catchError((err) =>
                of<MakerSubmitOutcome>({
                  kind: 'failed',
                  message: `Confirmation accepted (PENDING) and Acceptance created (PENDING), but the Reimbursement Receivable asset failed to record: ${describeApiError(err)}`,
                  result,
                  secondary: { acceptanceMovementId: acceptanceMovement.movementId, acceptanceMovement },
                }),
              ),
            );
          }),
          catchError((err) =>
            of<MakerSubmitOutcome>({
              kind: 'failed',
              message: `Confirmation accepted (PENDING), but the Acceptance liability failed to record: ${describeApiError(err)}`,
              result,
              secondary: {},
            }),
          ),
        );
      }),
      catchError((err) =>
        // Bug fixed 2026-08-19 (desiger-comments.md F-08) — `req` itself (the primary submission) failed
        // here, so `result` must stay absent, never the raw HTTP error body — see this file's own module
        // note above `MakerSubmitOutcome` for the full reasoning.
        of<MakerSubmitOutcome>({ kind: 'failed', message: err.error?.message ?? err.message ?? String(err), secondary: {} }),
      ),
    );
  }

  /** B5's Usance/CNF_MATURE branch only — `req` (the Acceptance's own FULL_SETTLE/PARTIAL_SETTLE) first, then resolves the matching EPLC_ACCEPTANCE_REIMB_RECEIVABLE contract and REIMBURSEs it. */
  private submitAcceptanceSettleWithReceivable(req: CreateMovementRequest, ctx: MakerSubmitContext): Observable<MakerSubmitOutcome> {
    const businessEventId = crypto.randomUUID();
    req.businessEventId = businessEventId;
    const acceptanceContract = ctx.selectedContract!;
    return this.api.createMovement(req).pipe(
      switchMap((res) => {
        const result = res.body!;
        return this.api
          .resolveContract('EPLC_ACCEPTANCE_REIMB_RECEIVABLE', {
            lcNumber: acceptanceContract.naturalKey.lcNumber,
            ibNumber: acceptanceContract.naturalKey.ibNumber,
          })
          .pipe(
            switchMap((receivableContract) => {
              const reimbReq: CreateMovementRequest = {
                instrumentType: 'EPLC_ACCEPTANCE_REIMB_RECEIVABLE',
                balanceContractId: receivableContract.balanceContractId,
                movementType: 'REIMBURSE',
                eventSeq: Date.now(),
                amount: String(ctx.model.amount),
                currency: ctx.model.currency!,
                createdBy: ctx.model.createdBy!,
                businessEventId,
              };
              return this.api.createMovement(reimbReq).pipe(
                map((reimbRes) => ({ kind: 'submitted' as const, result, secondary: { matchedReceivableMovementId: reimbRes.body!.movementId } })),
                catchError((err) =>
                  of<MakerSubmitOutcome>({
                    kind: 'failed',
                    message: `Acceptance settled (PENDING), but the matching Reimbursement Receivable failed to record: ${describeApiError(err)}`,
                    result,
                    secondary: {},
                  }),
                ),
              );
            }),
            catchError((err) =>
              of<MakerSubmitOutcome>({
                kind: 'failed',
                message: `Acceptance settled (PENDING), but its matching Reimbursement Receivable could not be found: ${describeApiError(err)}`,
                result,
                secondary: {},
              }),
            ),
          );
      }),
      catchError((err) =>
        // Bug fixed 2026-08-19 (desiger-comments.md F-08) — `req` itself (the primary submission) failed
        // here, so `result` must stay absent, never the raw HTTP error body — see this file's own module
        // note above `MakerSubmitOutcome` for the full reasoning.
        of<MakerSubmitOutcome>({ kind: 'failed', message: err.error?.message ?? err.message ?? String(err), secondary: {} }),
      ),
    );
  }

  /** The default single-call path — every function that doesn't need one of the four compound shapes above. */
  private submitPlain(req: CreateMovementRequest): Observable<MakerSubmitOutcome> {
    return this.api.createMovement(req).pipe(
      map((res) => ({ kind: 'submitted' as const, result: res.body!, secondary: {} })),
      catchError((err) =>
        // Bug fixed 2026-08-19 (desiger-comments.md F-08) — `req` itself (the primary submission) failed
        // here, so `result` must stay absent, never the raw HTTP error body — see this file's own module
        // note above `MakerSubmitOutcome` for the full reasoning.
        of<MakerSubmitOutcome>({ kind: 'failed', message: err.error?.message ?? err.message ?? String(err), secondary: {} }),
      ),
    );
  }
}
