import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot, CreateMovementRequest } from './balance-component-api.service';
import { InstrumentType, TransactionFunction } from './balance-component.model';
import { describeApiError } from './api-error';
import { deriveFunctionStrategy } from './function-strategy';

/**
 * BAL-003 — the Maker submission shapes (A3S/B3-Sight/B4-Usance/B5 compound + the default single-call
 * path), extracted from `TransactionBuilderComponent`. Owns only the API-call orchestration; depends
 * solely on `MakerSubmitContext` (Interface Segregation) and the API client, never on the component.
 * Never mutates UI state — resolves to one `MakerSubmitOutcome`, which the component's own
 * `applyMakerSubmitOutcome()` turns into `submitting`/`submitResult`/the secondary movement fields plus
 * the refresh/sync calls (Single Responsibility).
 *
 * `validateSubmit()`/`buildSubmitRequest()` stay on the component — they read/write `model`/
 * `naturalKey`/`selectedParent`/etc. too pervasively for a service extraction to remove that coupling.
 *
 * Load-bearing rule: only the call submitting `req` itself (never a secondary/tertiary leg) sets the
 * failed outcome's own `result` — a secondary leg's own failure leaves `result` `undefined`, so
 * `applyMakerSubmitOutcome()` knows to leave `submitResult` untouched.
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
 * Bug fixed (desiger-comments.md F-08): every `catchError` on a PRIMARY submission call used to set
 * `result: err.error ?? null` — the raw HTTP error body, not a real `BalanceMovement` — which let a
 * failed Submit wrongly populate `submitResult` (and lock the form via `formLocked`). Fixed by omitting
 * `result` entirely on a primary-call failure; a secondary/tertiary leg's own failure still correctly
 * assigns `result` from the already-succeeded primary response.
 */
export type MakerSubmitOutcome =
  | { kind: 'submitted'; result: BalanceMovement; secondary: MakerSubmitSecondary }
  | { kind: 'failed'; message: string; result?: BalanceMovement | null; secondary: MakerSubmitSecondary };

@Injectable({ providedIn: 'root' })
export class MakerSubmitService {
  constructor(private readonly api: BalanceComponentApiService) {}

  submit(req: CreateMovementRequest, ctx: MakerSubmitContext): Observable<MakerSubmitOutcome> {
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
    return this.api.createCompoundMovements([redeemReq, req]).pipe(
      map(([redeem, result]) => ({
        kind: 'submitted' as const,
        result: result!,
        secondary: { arrivalSgRedeemMovementId: redeem!.movementId, arrivalSgRedeemMovement: redeem! },
      })),
      catchError((err) => of<MakerSubmitOutcome>({ kind: 'failed', message: describeApiError(err), secondary: {} })),
    );
  }

  /** B3's Sight/HONOUR branch only — `req` (the Confirmation's own HONOUR) first, then the linked EPLC_DUE_FROM_ISSUING_BANK CREATE. */
  private submitConfirmationHonourWithReceivable(req: CreateMovementRequest, ctx: MakerSubmitContext): Observable<MakerSubmitOutcome> {
    const businessEventId = crypto.randomUUID();
    req.businessEventId = businessEventId;
    const cnfContract = ctx.selectedContract!;
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
    return this.api.createCompoundMovements([req, receivableReq]).pipe(
      map(([result, receivable]) => ({ kind: 'submitted' as const, result: result!, secondary: { dueFromIssuingBankMovementId: receivable!.movementId } })),
      catchError((err) => of<MakerSubmitOutcome>({ kind: 'failed', message: describeApiError(err), secondary: {} })),
    );
  }

  /** B4's Usance branch only — `req` (the Confirmation's own ACCEPT) first, then EPLC_ACCEPTANCE liability CREATE, then EPLC_ACCEPTANCE_REIMB_RECEIVABLE CREATE. */
  private submitConfirmationAcceptWithReceivable(req: CreateMovementRequest, ctx: MakerSubmitContext): Observable<MakerSubmitOutcome> {
    const businessEventId = crypto.randomUUID();
    req.businessEventId = businessEventId;
    const cnfContract = ctx.selectedContract!;
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
    return this.api.createCompoundMovements([req, acceptanceReq, receivableReq]).pipe(
      map(([result, acceptanceMovement, receivable]) => ({
        kind: 'submitted' as const,
        result: result!,
        secondary: {
          acceptanceMovementId: acceptanceMovement!.movementId,
          acceptanceMovement: acceptanceMovement!,
          acceptanceReimbReceivableMovementId: receivable!.movementId,
        },
      })),
      catchError((err) => of<MakerSubmitOutcome>({ kind: 'failed', message: describeApiError(err), secondary: {} })),
    );
  }

  /** B5's Usance/CNF_MATURE branch only — `req` (the Acceptance's own FULL_SETTLE/PARTIAL_SETTLE) first, then resolves the matching EPLC_ACCEPTANCE_REIMB_RECEIVABLE contract and REIMBURSEs it. */
  private submitAcceptanceSettleWithReceivable(req: CreateMovementRequest, ctx: MakerSubmitContext): Observable<MakerSubmitOutcome> {
    const businessEventId = crypto.randomUUID();
    req.businessEventId = businessEventId;
    const acceptanceContract = ctx.selectedContract!;
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
          return this.api.createCompoundMovements([req, reimbReq]).pipe(
            map(([result, reimb]) => ({ kind: 'submitted' as const, result: result!, secondary: { matchedReceivableMovementId: reimb!.movementId } })),
          );
        }),
        catchError((err) => of<MakerSubmitOutcome>({ kind: 'failed', message: describeApiError(err), secondary: {} })),
      );
  }

  /** The default single-call path — every function that doesn't need one of the four compound shapes above. */
  private submitPlain(req: CreateMovementRequest): Observable<MakerSubmitOutcome> {
    return this.api.createMovement(req).pipe(
      map((res) => ({ kind: 'submitted' as const, result: res.body!, secondary: {} })),
      catchError((err) =>
        // `req` (primary) failed — result stays absent (F-08, see module doc comment).
        of<MakerSubmitOutcome>({ kind: 'failed', message: err.error?.message ?? err.message ?? String(err), secondary: {} }),
      ),
    );
  }
}
