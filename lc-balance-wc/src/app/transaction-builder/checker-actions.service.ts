import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceMovement } from './balance-component-api.service';
import { TransactionFunction } from './balance-component.model';
import { describeApiError } from './api-error';

/**
 * BAL-003 (Quality-report-balance.md — 4th same-day OOD/SOLID pass, "Checker Actions service"):
 * the compound Maker/Checker release(); reject(); deleteMakerPending() chain — previously ~230 lines
 * of `TransactionBuilderComponent`'s own private methods (`releaseMatchedReceivable`,
 * `releaseDueFromIssuingBank`, `releaseAcceptance`, `releaseAcceptanceLiability`,
 * `releaseAcceptanceReimbReceivable`, `releaseArrivalDocument`) — now owns exactly the API-call
 * orchestration: WHICH release/reject/cancel call to make, in what order, under what business
 * condition. This was explicitly rejected as "not worth it" in an earlier pass this same session (see
 * `finishCheckerAction`'s own doc comment in transaction-builder.component.ts) because a naive move
 * would need to pass ~10 pieces of component state back and forth. Reversed here via genuine
 * Dependency Inversion instead of a naive move:
 *  - the service depends only on `CheckerActionContext` (a narrow, read-only interface — Interface
 *    Segregation: exactly the fields these 3 flows read, nothing else) and the API client it already
 *    injects itself — never on `TransactionBuilderComponent`.
 *  - the service never mutates component state directly; every flow instead resolves to exactly one
 *    `CheckerActionOutcome`, and the component's own `applyCheckerActionOutcome()` (transaction-
 *    builder.component.ts) is the ONLY place that still touches `actionBusy`/`submitResult`/
 *    `submitError`/`arrivalApproved` and calls back into `refreshSelectedContractSnapshot()`/
 *    `syncCheckerToContext()`/`syncLookupToContext()`/`reloadPayableMovementsAfterCompound()`/
 *    `loadSgsForArrival()` — Single Responsibility: this service only ever decides "what happened",
 *    never "what the UI should do about it".
 *
 * Every guard condition, branch order, and error-message string below is unchanged from the methods
 * it replaces — pure code motion re-expressed as RxJS `switchMap`/`catchError` chains instead of
 * nested `.subscribe()` callbacks, so the exact same sequential-and-conditional shape survives.
 */
export interface CheckerActionContext {
  readonly submitResult: any;
  readonly selectedFunction: TransactionFunction | null;
  readonly selectedPayMovement: BalanceMovement | null;
  readonly matchedReceivableMovementId: string | null;
  readonly dueFromIssuingBankMovementId: string | null;
  readonly acceptanceMovementId: string | null;
  readonly acceptanceReimbReceivableMovementId: string | null;
  readonly arrivalSgRedeemMovementId: string | null;
  readonly createdBy: string | null | undefined;
}

export type CheckerActionOutcome =
  | { kind: 'released'; result: any; syncLookup?: boolean; reloadPayables?: boolean }
  /** A3S's own acknowledgment-only path (releaseArrivalDocument's old shape) — no API call, no `result`. */
  | { kind: 'documentArrivalAcknowledged' }
  | { kind: 'failed'; message: string };

@Injectable({ providedIn: 'root' })
export class CheckerActionsService {
  constructor(private readonly api: BalanceComponentApiService) {}

  release(ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    const checkerId = ctx.createdBy === 'maker1' ? 'checker1' : 'checker2';

    // Business instruction 2026-08-14 (revised): "When Checker approve it, then LC Balance will be approved
    // and Acceptance Balance will be approved too." — A6/B4. Release the picked source record FIRST
    // (finalizes it), THEN release the Acceptance itself — only proceeding if the first genuinely succeeds.
    if (ctx.selectedFunction?.settlesDocumentArrival && ctx.selectedPayMovement) {
      return this.api.release(ctx.selectedPayMovement.movementId, checkerId).pipe(
        switchMap(() => this.releaseAcceptance(checkerId, ctx)),
        catchError((err) =>
          of<CheckerActionOutcome>({
            kind: 'failed',
            message: `Could not release the ${ctx.selectedFunction?.pendingItemLabel ?? 'Document Arrival'} (${ctx.selectedPayMovement?.sourceTransactionRef}) — Acceptance NOT approved: ${describeApiError(err)}`,
          }),
        ),
      );
    }

    // Business instruction 2026-08-14 ("Redemp SG Balance in Approved via Checker approved") — A3S only.
    // One Release click releases the SG's own redemption for real; the Document Arrival itself is only
    // acknowledged after (never a real release call — the movement stays PENDING for A4/A6 to finalize).
    if (ctx.selectedFunction?.documentArrivalWithSg && ctx.arrivalSgRedeemMovementId) {
      return this.api.release(ctx.arrivalSgRedeemMovementId, checkerId).pipe(
        switchMap(() => of<CheckerActionOutcome>({ kind: 'documentArrivalAcknowledged' })),
        catchError((err) =>
          of<CheckerActionOutcome>({
            kind: 'failed',
            message: `Could not release the Shipping Guarantee redemption — Document Arrival NOT acknowledged: ${describeApiError(err)}`,
          }),
        ),
      );
    }

    // B5's Usance/CNF_MATURE branch (settlesAcceptanceOnMature) only — one Release does both the
    // Acceptance's own FULL_SETTLE/PARTIAL_SETTLE and the matching Reimbursement Receivable's REIMBURSE,
    // same businessEventId, per the frozen spec's own CNF_MATURE event.
    if (ctx.selectedFunction?.settlesAcceptanceOnMature && ctx.matchedReceivableMovementId) {
      return this.api.release(ctx.submitResult.movementId, checkerId).pipe(
        switchMap((res) => this.releaseMatchedReceivable(checkerId, res, ctx)),
        catchError((err) => of<CheckerActionOutcome>({ kind: 'failed', message: describeApiError(err) })),
      );
    }

    return this.api.release(ctx.submitResult.movementId, checkerId).pipe(
      switchMap((res) => of<CheckerActionOutcome>({ kind: 'released', result: res })),
      catchError((err) => of<CheckerActionOutcome>({ kind: 'failed', message: describeApiError(err) })),
    );
  }

  reject(ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    return this.api.reject(ctx.submitResult.movementId, 'checker1', 'MANUAL_TEST_REJECT').pipe(
      switchMap((res) => of<CheckerActionOutcome>({ kind: 'released', result: res })),
      catchError((err) => of<CheckerActionOutcome>({ kind: 'failed', message: describeApiError(err) })),
    );
  }

  /**
   * Business instruction 2026-08-15 ("need a option for Maker to Delete Pending... for all functions")
   * — Maker-initiated withdrawal of their own just-submitted item while still PENDING, via /cancel
   * (distinct from /reject's Checker-side decline). For A3S/B3/B4-usance/B5, cancels the linked
   * secondary/asset leg(s) FIRST (reverse creation order) so an EC never leaves a later leg orphaned.
   */
  deleteMakerPending(ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    const cancelledBy = ctx.createdBy!;
    const cancelPrimary = (): Observable<CheckerActionOutcome> =>
      this.api.cancel(ctx.submitResult.movementId, cancelledBy, 'MAKER_EC').pipe(
        switchMap((res) => of<CheckerActionOutcome>({ kind: 'released', result: res, syncLookup: true })),
        catchError((err) => of<CheckerActionOutcome>({ kind: 'failed', message: describeApiError(err) })),
      );

    if (ctx.selectedFunction?.documentArrivalWithSg && ctx.arrivalSgRedeemMovementId) {
      return this.api.cancel(ctx.arrivalSgRedeemMovementId, cancelledBy, 'MAKER_EC').pipe(
        switchMap(() => cancelPrimary()),
        catchError((err) =>
          of<CheckerActionOutcome>({
            kind: 'failed',
            message: `Could not delete the Shipping Guarantee redemption — Document Arrival NOT deleted: ${describeApiError(err)}`,
          }),
        ),
      );
    }

    // B3 (createsIssuingBankReceivableOnHonour) — cancel the linked Due from Issuing Bank asset FIRST,
    // so an EC on the Confirmation Honour never leaves it orphaned.
    if (ctx.selectedFunction?.createsIssuingBankReceivableOnHonour && ctx.dueFromIssuingBankMovementId) {
      return this.api.cancel(ctx.dueFromIssuingBankMovementId, cancelledBy, 'MAKER_EC').pipe(
        switchMap(() => cancelPrimary()),
        catchError((err) =>
          of<CheckerActionOutcome>({
            kind: 'failed',
            message: `Could not delete the Due from Issuing Bank asset — Confirmation Honour NOT deleted: ${describeApiError(err)}`,
          }),
        ),
      );
    }

    // B4's Usance/ACCEPT branch (createsAcceptanceReimbReceivableOnCreate) — reverse creation order:
    // cancel the Reimbursement Receivable asset FIRST, then the Acceptance liability, THEN the primary
    // Confirmation ACCEPT.
    if (ctx.selectedFunction?.createsAcceptanceReimbReceivableOnCreate && ctx.acceptanceReimbReceivableMovementId && ctx.acceptanceMovementId) {
      return this.api.cancel(ctx.acceptanceReimbReceivableMovementId, cancelledBy, 'MAKER_EC').pipe(
        switchMap(() =>
          this.api.cancel(ctx.acceptanceMovementId!, cancelledBy, 'MAKER_EC').pipe(
            switchMap(() => cancelPrimary()),
            catchError((err) =>
              of<CheckerActionOutcome>({
                kind: 'failed',
                message: `Reimbursement Receivable deleted, but the Acceptance liability could not be — Confirmation Accept NOT deleted: ${describeApiError(err)}`,
              }),
            ),
          ),
        ),
        catchError((err) =>
          of<CheckerActionOutcome>({
            kind: 'failed',
            message: `Could not delete the Reimbursement Receivable asset — Acceptance NOT deleted: ${describeApiError(err)}`,
          }),
        ),
      );
    }

    // B5's Usance/CNF_MATURE branch (settlesAcceptanceOnMature) — cancel the matching Reimbursement
    // Receivable's REIMBURSE FIRST, then the primary Acceptance FULL_SETTLE/PARTIAL_SETTLE.
    if (ctx.selectedFunction?.settlesAcceptanceOnMature && ctx.matchedReceivableMovementId) {
      return this.api.cancel(ctx.matchedReceivableMovementId, cancelledBy, 'MAKER_EC').pipe(
        switchMap(() => cancelPrimary()),
        catchError((err) =>
          of<CheckerActionOutcome>({
            kind: 'failed',
            message: `Could not delete the matching Reimbursement Receivable — Acceptance Settle NOT deleted: ${describeApiError(err)}`,
          }),
        ),
      );
    }

    return cancelPrimary();
  }

  /** B5's Usance/CNF_MATURE branch only — second leg, releasing the matching Reimbursement Receivable's REIMBURSE after the Acceptance's own FULL_SETTLE/PARTIAL_SETTLE was already released above. */
  private releaseMatchedReceivable(checkerId: string, settleRes: any, ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    return this.api.release(ctx.matchedReceivableMovementId!, checkerId).pipe(
      switchMap(() => of<CheckerActionOutcome>({ kind: 'released', result: settleRes, syncLookup: true })),
      catchError((err) =>
        of<CheckerActionOutcome>({
          kind: 'failed',
          message: `Acceptance settled, but the matching Reimbursement Receivable failed to release: ${describeApiError(err)}`,
        }),
      ),
    );
  }

  /**
   * A6/B4 — second leg of the compound Checker action, releasing the primary movement (A6: the newly-
   * created Acceptance; B4: the Confirmation's own HONOUR or ACCEPT) after its source record was
   * already released above. Branches into whichever third leg the function needs.
   */
  private releaseAcceptance(checkerId: string, ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    return this.api.release(ctx.submitResult.movementId, checkerId).pipe(
      switchMap((res) => {
        if (ctx.selectedFunction?.createsIssuingBankReceivableOnHonour && ctx.dueFromIssuingBankMovementId) {
          return this.releaseDueFromIssuingBank(checkerId, res, ctx);
        }
        if (ctx.selectedFunction?.createsAcceptanceReimbReceivableOnCreate && ctx.acceptanceMovementId) {
          return this.releaseAcceptanceLiability(checkerId, res, ctx);
        }
        // Both the picked source record and the Parent LC's own hints/snapshots are stale otherwise
        // until the user navigates away and back.
        return of<CheckerActionOutcome>({ kind: 'released', result: res, reloadPayables: true });
      }),
      catchError((err) =>
        of<CheckerActionOutcome>({
          kind: 'failed',
          message: `${ctx.selectedFunction?.pendingItemLabel ?? 'Document Arrival'} released, but the Confirmation Honour/Accept itself failed to release: ${describeApiError(err)}`,
        }),
      ),
    );
  }

  /** B4's Sight/HONOUR branch only — final leg, releasing the new Due from Issuing Bank asset after the Confirmation's own Honour (and, before that, the B3 Present Docs record) were already released above. */
  private releaseDueFromIssuingBank(checkerId: string, honourRes: any, ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    return this.api.release(ctx.dueFromIssuingBankMovementId!, checkerId).pipe(
      switchMap(() => of<CheckerActionOutcome>({ kind: 'released', result: honourRes, syncLookup: true, reloadPayables: true })),
      catchError((err) =>
        of<CheckerActionOutcome>({
          kind: 'failed',
          message: `Confirmation Honour released, but the Due from Issuing Bank asset failed to release: ${describeApiError(err)}`,
        }),
      ),
    );
  }

  /** B4's Usance/ACCEPT branch only — third leg, releasing the new EPLC_ACCEPTANCE liability after the Confirmation's own ACCEPT was already released above. Chains a fourth leg from here once this succeeds. */
  private releaseAcceptanceLiability(checkerId: string, acceptRes: any, ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    return this.api.release(ctx.acceptanceMovementId!, checkerId).pipe(
      switchMap(() => this.releaseAcceptanceReimbReceivable(checkerId, acceptRes, ctx)),
      catchError((err) =>
        of<CheckerActionOutcome>({
          kind: 'failed',
          message: `Confirmation accepted, but the Acceptance liability failed to release: ${describeApiError(err)}`,
        }),
      ),
    );
  }

  /** B4's Usance/ACCEPT branch only — fourth and final leg, releasing the linked Reimbursement Receivable asset after the Acceptance liability was already released above (Gap Analysis Row 6). */
  private releaseAcceptanceReimbReceivable(checkerId: string, acceptRes: any, ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    return this.api.release(ctx.acceptanceReimbReceivableMovementId!, checkerId).pipe(
      switchMap(() => of<CheckerActionOutcome>({ kind: 'released', result: acceptRes, syncLookup: true, reloadPayables: true })),
      catchError((err) =>
        of<CheckerActionOutcome>({
          kind: 'failed',
          message: `Acceptance released, but the Reimbursement Receivable asset failed to release: ${describeApiError(err)}`,
        }),
      ),
    );
  }
}
