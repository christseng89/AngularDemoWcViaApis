import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceMovement } from './balance-component-api.service';
import { TransactionFunction } from './balance-component.model';
import { describeApiError } from './api-error';
import { deriveFunctionStrategy } from './function-strategy';

/**
 * Owns Checker release/reject/cancel API orchestration — which call to make, in what order, under what
 * condition. Depends only on `CheckerActionContext` (Interface Segregation) and the API client, never on
 * `TransactionBuilderComponent`. Never mutates component state — resolves to a `CheckerActionOutcome`;
 * `applyCheckerActionOutcome()` on the component is the only place an outcome becomes a UI effect
 * (Single Responsibility: this service decides "what happened", not "what the UI does about it").
 */
export interface CheckerActionContext {
  readonly submitResult: BalanceMovement | null;
  readonly selectedFunction: TransactionFunction | null;
  readonly selectedPayMovement: BalanceMovement | null;
  readonly matchedReceivableMovementId: string | null;
  readonly dueFromIssuingBankMovementId: string | null;
  readonly acceptanceMovementId: string | null;
  readonly acceptanceReimbReceivableMovementId: string | null;
  readonly arrivalSgRedeemMovementId: string | null;
  readonly createdBy: string | null | undefined;
  /**
   * The item resolved by the Checker's own independent search — always real server data, unlike
   * `submitResult` which only exists in the Maker's own session. Used to resolve linked legs via
   * businessEventId for a genuinely separate Checker session — see `resolveLinkedMovementId`.
   */
  readonly selectedCheckerMovement: BalanceMovement | null;
}

export type CheckerActionOutcome =
  | { kind: 'released'; result: BalanceMovement }
  /** A3S's own acknowledgment-only path (releaseArrivalDocument's old shape) — no API call, no `result`. */
  | { kind: 'documentArrivalAcknowledged' }
  | { kind: 'failed'; message: string };

@Injectable({ providedIn: 'root' })
export class CheckerActionsService {
  constructor(private readonly api: BalanceComponentApiService) {}

  /** Shared constructor for every `{ kind: 'failed', message }` outcome — only the message differs per call site. */
  private fail(message: string): Observable<CheckerActionOutcome> {
    return of<CheckerActionOutcome>({ kind: 'failed', message });
  }

  release(ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    const checkerId = ctx.createdBy === 'maker1' ? 'checker1' : 'checker2';
    const strategy = ctx.selectedFunction ? deriveFunctionStrategy(ctx.selectedFunction) : null;

    // A6/B4: release the picked source record first, then the new primary. B4's own source (a B3
    // Present Docs record) is already independently Checker-Released before B4 ever picks it, so
    // re-releasing it here would be illegal (409) — release() marks it "consumed" as a side effect of
    // releasing the primary instead. A6's own source (a Usance Document Arrival, acknowledgment-only)
    // has no such flag and always takes the release-the-source-first path below.
    if (strategy?.checkerRelease.settlesDocumentArrival) {
      if (strategy?.checkerRelease.sourceAlreadyReleasedBeforePick) {
        return this.resolveSettlesDocumentArrivalIds(ctx).pipe(switchMap((ids) => this.releaseAcceptance(checkerId, ctx, ids)));
      }
      return this.resolveSettlesDocumentArrivalIds(ctx).pipe(
        switchMap((ids) => {
          if (!ids.sourceMovementId) {
            return this.fail(
              `Could not find the ${ctx.selectedFunction?.pendingItemLabel ?? 'Document Arrival'} record this was created from (no referencedTransactionId correlation found) — release it separately first.`,
            );
          }
          return this.api.release(ids.sourceMovementId, checkerId).pipe(
            switchMap(() => this.releaseAcceptance(checkerId, ctx, ids)),
            catchError((err) =>
              this.fail(
                `Could not release the ${ctx.selectedFunction?.pendingItemLabel ?? 'Document Arrival'} (${ctx.selectedPayMovement?.sourceTransactionRef ?? ctx.selectedCheckerMovement?.sourceTransactionRef ?? ''}) — Acceptance NOT approved: ${describeApiError(err)}`,
              ),
            ),
          );
        }),
      );
    }

    // A3S only: one Release click releases the SG's own redemption for real, THEN persists the Checker's
    // own acknowledgment on the LC's own UTILIZE (restored 2026-08-20, "A3 A3S 交易 Approve 過後 不要再顯示")
    // — the Document Arrival itself stays PENDING (acknowledgment only) for A4/A6 to finalize later.
    // arrivalSgRedeemMovementId is only populated in the same session that Submitted A3S, so a
    // cross-session Checker resolves it via businessEventId instead — see resolveLinkedMovementId.
    if (ctx.selectedFunction && deriveFunctionStrategy(ctx.selectedFunction).compoundSubmission.possibleShapes.includes('documentArrivalWithSg')) {
      return this.resolveLinkedMovementId(ctx, ctx.arrivalSgRedeemMovementId, 'FULL_REDEEM', 'PARTIAL_REDEEM').pipe(
        switchMap((arrivalSgRedeemMovementId) => {
          if (!arrivalSgRedeemMovementId) {
            return this.fail(
              'Could not find the matched Shipping Guarantee redemption linked to this Document Arrival (no businessEventId correlation found) — release it separately first.',
            );
          }
          return this.api.release(arrivalSgRedeemMovementId, checkerId).pipe(
            switchMap(() => this.acknowledgeUtilize(ctx, checkerId)),
            switchMap(() => of<CheckerActionOutcome>({ kind: 'documentArrivalAcknowledged' })),
            catchError((err) => this.fail(`Could not release the Shipping Guarantee redemption — Document Arrival NOT acknowledged: ${describeApiError(err)}`)),
          );
        }),
      );
    }

    // B5's Usance/CNF_MATURE branch only — one Release does both the Acceptance's own FULL_SETTLE/
    // PARTIAL_SETTLE and the matching Reimbursement Receivable's REIMBURSE, per the CNF_MATURE event.
    // matchedReceivableMovementId resolves via businessEventId when unavailable, same as A3S above.
    if (strategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE') {
      return this.resolveLinkedMovementId(ctx, ctx.matchedReceivableMovementId, 'REIMBURSE').pipe(
        switchMap((matchedReceivableMovementId) => {
          if (!matchedReceivableMovementId) {
            return this.fail(
              'Could not find the matching Reimbursement Receivable linked to this Acceptance Settle (no businessEventId correlation found) — release it separately first.',
            );
          }
          const primaryMovementId = ctx.selectedCheckerMovement?.movementId ?? ctx.submitResult?.movementId;
          return this.api.release(primaryMovementId!, checkerId).pipe(
            switchMap((res) => this.releaseMatchedReceivable(checkerId, res, matchedReceivableMovementId)),
            catchError((err) => this.fail(describeApiError(err))),
          );
        }),
      );
    }

    const plainMovementId = ctx.selectedCheckerMovement?.movementId ?? ctx.submitResult?.movementId;
    return this.api.release(plainMovementId!, checkerId).pipe(
      switchMap((res) => of<CheckerActionOutcome>({ kind: 'released', result: res })),
      catchError((err) => this.fail(describeApiError(err))),
    );
  }

  /**
   * A3 only (plain, deferSettlement without an SG match) — restored 2026-08-20 ("A3 A3S 交易 Approve
   * 過後 不要再顯示"): persists the Checker's own acknowledgment on the LC's own UTILIZE instead of the
   * former purely client-side `approveArrival()` flag, so the Checker Queue can filter it out once
   * approved (see checker-panel.component.ts's own loadCheckerQueue()). Never releases the movement —
   * A4 (Sight) / A6 (Usance) still does that, later, for real.
   */
  acknowledgeArrival(ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    const checkerId = ctx.createdBy === 'maker1' ? 'checker1' : 'checker2';
    return this.acknowledgeUtilize(ctx, checkerId).pipe(
      switchMap(() => of<CheckerActionOutcome>({ kind: 'documentArrivalAcknowledged' })),
      catchError((err) => this.fail(describeApiError(err))),
    );
  }

  /** Shared by acknowledgeArrival() (plain A3) and release()'s own documentArrivalWithSg branch (A3S) above. */
  private acknowledgeUtilize(ctx: CheckerActionContext, checkerId: string): Observable<BalanceMovement> {
    const movementId = ctx.selectedCheckerMovement?.movementId ?? ctx.submitResult?.movementId;
    return this.api.acknowledge(movementId!, checkerId);
  }

  reject(ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    // Prefers selectedCheckerMovement (real server data) over submitResult (session-only), same as
    // release()'s A3S/B5 branches; falls back to submitResult for A6/B4's settlesDocumentArrival path.
    const movementId = ctx.selectedCheckerMovement?.movementId ?? ctx.submitResult?.movementId;
    return this.api.reject(movementId!, 'checker1', 'MANUAL_TEST_REJECT').pipe(
      switchMap((res) => of<CheckerActionOutcome>({ kind: 'released', result: res })),
      catchError((err) => this.fail(describeApiError(err))),
    );
  }

  /**
   * Maker-initiated withdrawal of their own just-submitted item while still PENDING, via /cancel
   * (distinct from /reject's Checker-side decline). For A3S/B3/B4-usance/B5, cancels the linked
   * secondary/asset leg(s) FIRST (reverse creation order) so an EC never leaves a later leg orphaned.
   */
  deleteMakerPending(ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    // Runtime guard rather than a non-null assertion — submit() already requires model.createdBy before
    // a Maker submission can exist to delete, but this proves it rather than assuming it.
    if (!ctx.createdBy) return this.fail('Cannot delete this Maker submission — no Maker (createdBy) is known for it.');
    const cancelledBy = ctx.createdBy;
    const strategy = ctx.selectedFunction ? deriveFunctionStrategy(ctx.selectedFunction) : null;
    const cancelPrimary = (): Observable<CheckerActionOutcome> =>
      this.api.cancel(ctx.submitResult!.movementId, cancelledBy, 'MAKER_EC').pipe(
        switchMap((res) => of<CheckerActionOutcome>({ kind: 'released', result: res })),
        catchError((err) => this.fail(describeApiError(err))),
      );

    if (ctx.selectedFunction && deriveFunctionStrategy(ctx.selectedFunction).compoundSubmission.possibleShapes.includes('documentArrivalWithSg') && ctx.arrivalSgRedeemMovementId) {
      return this.api.cancel(ctx.arrivalSgRedeemMovementId, cancelledBy, 'MAKER_EC').pipe(
        switchMap(() => cancelPrimary()),
        catchError((err) => this.fail(`Could not delete the Shipping Guarantee redemption — Document Arrival NOT deleted: ${describeApiError(err)}`)),
      );
    }

    // B3 (createsIssuingBankReceivableOnHonour) — cancel the linked Due from Issuing Bank asset FIRST,
    // so an EC on the Confirmation Honour never leaves it orphaned.
    if (strategy?.compoundSubmission.possibleShapes.includes('confirmationHonourWithReceivable') && ctx.dueFromIssuingBankMovementId) {
      return this.api.cancel(ctx.dueFromIssuingBankMovementId, cancelledBy, 'MAKER_EC').pipe(
        switchMap(() => cancelPrimary()),
        catchError((err) => this.fail(`Could not delete the Due from Issuing Bank asset — Confirmation Honour NOT deleted: ${describeApiError(err)}`)),
      );
    }

    // B4's Usance/ACCEPT branch (createsAcceptanceReimbReceivableOnCreate) — reverse creation order:
    // cancel the Reimbursement Receivable asset FIRST, then the Acceptance liability, THEN the primary
    // Confirmation ACCEPT.
    if (strategy?.compoundSubmission.possibleShapes.includes('confirmationAcceptWithReceivable') && ctx.acceptanceReimbReceivableMovementId && ctx.acceptanceMovementId) {
      return this.api.cancel(ctx.acceptanceReimbReceivableMovementId, cancelledBy, 'MAKER_EC').pipe(
        switchMap(() =>
          this.api.cancel(ctx.acceptanceMovementId!, cancelledBy, 'MAKER_EC').pipe(
            switchMap(() => cancelPrimary()),
            catchError((err) =>
              this.fail(
                `Reimbursement Receivable deleted, but the Acceptance liability could not be — Confirmation Accept NOT deleted: ${describeApiError(err)}`,
              ),
            ),
          ),
        ),
        catchError((err) => this.fail(`Could not delete the Reimbursement Receivable asset — Acceptance NOT deleted: ${describeApiError(err)}`)),
      );
    }

    // B5's Usance/CNF_MATURE branch (settlesAcceptanceOnMature) — cancel the matching Reimbursement
    // Receivable's REIMBURSE FIRST, then the primary Acceptance FULL_SETTLE/PARTIAL_SETTLE.
    if (strategy?.movementDerivation.amountVsAvailableDerivation === 'SETTLE' && ctx.matchedReceivableMovementId) {
      return this.api.cancel(ctx.matchedReceivableMovementId, cancelledBy, 'MAKER_EC').pipe(
        switchMap(() => cancelPrimary()),
        catchError((err) => this.fail(`Could not delete the matching Reimbursement Receivable — Acceptance Settle NOT deleted: ${describeApiError(err)}`)),
      );
    }

    return cancelPrimary();
  }

  /** B5's Usance/CNF_MATURE branch only — second leg, releasing the matching Reimbursement Receivable's REIMBURSE after the Acceptance's own FULL_SETTLE/PARTIAL_SETTLE was already released above. */
  private releaseMatchedReceivable(checkerId: string, settleRes: BalanceMovement, matchedReceivableMovementId: string): Observable<CheckerActionOutcome> {
    return this.api.release(matchedReceivableMovementId, checkerId).pipe(
      switchMap(() => of<CheckerActionOutcome>({ kind: 'released', result: settleRes })),
      catchError((err) => this.fail(`Acceptance settled, but the matching Reimbursement Receivable failed to release: ${describeApiError(err)}`)),
    );
  }

  /**
   * Resolves a linked leg's movementId — prefers the caller's already-known id (same-session Submit),
   * falls back to a businessEventId lookup for a cross-session Checker. Matches by movementType alone
   * (never instrumentType) — safe only when every candidate movementType is exclusive to one instrument
   * AND at most one linked movement can match (true for FULL_REDEEM/PARTIAL_REDEEM/REIMBURSE, NOT true
   * for B4 Usance's two CREATE-typed downstream legs — see resolveSettlesDocumentArrivalIds). Resolves
   * `null`, not an error, when nothing is found.
   */
  private resolveLinkedMovementId(ctx: CheckerActionContext, knownId: string | null, ...movementTypes: string[]): Observable<string | null> {
    if (knownId) return of(knownId);
    const businessEventId = ctx.selectedCheckerMovement?.businessEventId;
    if (!businessEventId) return of(null);
    return this.api.findByBusinessEventId(businessEventId).pipe(
      map((movements) => movements.find((m) => movementTypes.includes(m.movementType) && m.status === 'PENDING')?.movementId ?? null),
      catchError(() => of(null)),
    );
  }

  /**
   * Resolves everything settlesDocumentArrival's release chain needs in one pass: the SOURCE (correlated
   * via referencedTransactionId, since it predates this submission) plus, for B4, its downstream leg(s)
   * created alongside the primary. B4 Usance's two downstream CREATEs share the same movementType, so
   * they're disambiguated by the primary's own HONOUR-vs-ACCEPT branch plus findByBusinessEventId's
   * oldest-first ordering (liability before receivable), not by movementType. At most one
   * findByBusinessEventId call regardless of how many ids need resolving.
   */
  private resolveSettlesDocumentArrivalIds(ctx: CheckerActionContext): Observable<{
    sourceMovementId: string | null;
    dueFromIssuingBankMovementId: string | null;
    acceptanceMovementId: string | null;
    acceptanceReimbReceivableMovementId: string | null;
  }> {
    const sourceMovementId = ctx.selectedPayMovement?.movementId ?? ctx.selectedCheckerMovement?.referencedTransactionId ?? null;
    const asIs = () =>
      of({
        sourceMovementId,
        dueFromIssuingBankMovementId: ctx.dueFromIssuingBankMovementId,
        acceptanceMovementId: ctx.acceptanceMovementId,
        acceptanceReimbReceivableMovementId: ctx.acceptanceReimbReceivableMovementId,
      });
    const strategy = ctx.selectedFunction ? deriveFunctionStrategy(ctx.selectedFunction) : null;
    const isHonour = ctx.selectedCheckerMovement?.movementType === 'HONOUR';
    const isAccept = ctx.selectedCheckerMovement?.movementType === 'ACCEPT';
    const needsDownstreamLookup =
      (isHonour && !!strategy?.compoundSubmission.possibleShapes.includes('confirmationHonourWithReceivable') && !ctx.dueFromIssuingBankMovementId) ||
      (isAccept && !!strategy?.compoundSubmission.possibleShapes.includes('confirmationAcceptWithReceivable') && (!ctx.acceptanceMovementId || !ctx.acceptanceReimbReceivableMovementId));
    if (!needsDownstreamLookup) return asIs();
    const businessEventId = ctx.selectedCheckerMovement?.businessEventId;
    if (!businessEventId) return asIs();
    return this.api.findByBusinessEventId(businessEventId).pipe(
      map((linked) => {
        const creates = linked.filter((m) => m.movementType === 'CREATE' && m.status === 'PENDING');
        return {
          sourceMovementId,
          dueFromIssuingBankMovementId: isHonour ? (ctx.dueFromIssuingBankMovementId ?? creates[0]?.movementId ?? null) : ctx.dueFromIssuingBankMovementId,
          acceptanceMovementId: isAccept ? (ctx.acceptanceMovementId ?? creates[0]?.movementId ?? null) : ctx.acceptanceMovementId,
          acceptanceReimbReceivableMovementId: isAccept
            ? (ctx.acceptanceReimbReceivableMovementId ?? creates[1]?.movementId ?? null)
            : ctx.acceptanceReimbReceivableMovementId,
        };
      }),
      catchError(asIs),
    );
  }

  /**
   * A6/B4 — second leg, releasing the primary (A6: the new Acceptance; B4: HONOUR/ACCEPT) after the
   * source was released above, then branches into whichever third leg the function needs. `ids` (the
   * downstream legs, already resolved by resolveSettlesDocumentArrivalIds) is threaded through rather
   * than re-read from `ctx`.
   */
  private releaseAcceptance(
    checkerId: string,
    ctx: CheckerActionContext,
    ids: { dueFromIssuingBankMovementId: string | null; acceptanceMovementId: string | null; acceptanceReimbReceivableMovementId: string | null },
  ): Observable<CheckerActionOutcome> {
    const strategy = ctx.selectedFunction ? deriveFunctionStrategy(ctx.selectedFunction) : null;
    const primaryMovementId = ctx.selectedCheckerMovement?.movementId ?? ctx.submitResult?.movementId;
    return this.api.release(primaryMovementId!, checkerId).pipe(
      switchMap((res) => {
        if (strategy?.compoundSubmission.possibleShapes.includes('confirmationHonourWithReceivable') && ids.dueFromIssuingBankMovementId) {
          return this.releaseDueFromIssuingBank(checkerId, res, ids.dueFromIssuingBankMovementId);
        }
        if (strategy?.compoundSubmission.possibleShapes.includes('confirmationAcceptWithReceivable') && ids.acceptanceMovementId) {
          return this.releaseAcceptanceLiability(checkerId, res, ids.acceptanceMovementId, ids.acceptanceReimbReceivableMovementId);
        }
        return of<CheckerActionOutcome>({ kind: 'released', result: res });
      }),
      catchError((err) =>
        this.fail(
          `${ctx.selectedFunction?.pendingItemLabel ?? 'Document Arrival'} released, but the Confirmation Honour/Accept itself failed to release: ${describeApiError(err)}`,
        ),
      ),
    );
  }

  /** B4's Sight/HONOUR branch only — final leg, releasing the new Due from Issuing Bank asset after the Confirmation's own Honour (and, before that, the B3 Present Docs record) were already released above. */
  private releaseDueFromIssuingBank(checkerId: string, honourRes: BalanceMovement, dueFromIssuingBankMovementId: string): Observable<CheckerActionOutcome> {
    return this.api.release(dueFromIssuingBankMovementId, checkerId).pipe(
      switchMap(() => of<CheckerActionOutcome>({ kind: 'released', result: honourRes })),
      catchError((err) => this.fail(`Confirmation Honour released, but the Due from Issuing Bank asset failed to release: ${describeApiError(err)}`)),
    );
  }

  /** B4's Usance/ACCEPT branch only — third leg, releasing the new EPLC_ACCEPTANCE liability after the Confirmation's own ACCEPT was already released above. Chains a fourth leg from here once this succeeds. */
  private releaseAcceptanceLiability(
    checkerId: string,
    acceptRes: BalanceMovement,
    acceptanceMovementId: string,
    acceptanceReimbReceivableMovementId: string | null,
  ): Observable<CheckerActionOutcome> {
    return this.api.release(acceptanceMovementId, checkerId).pipe(
      switchMap(() => this.releaseAcceptanceReimbReceivable(checkerId, acceptRes, acceptanceReimbReceivableMovementId)),
      catchError((err) => this.fail(`Confirmation accepted, but the Acceptance liability failed to release: ${describeApiError(err)}`)),
    );
  }

  /** B4's Usance/ACCEPT branch only — fourth and final leg, releasing the linked Reimbursement Receivable asset after the Acceptance liability was already released above (Gap Analysis Row 6). */
  private releaseAcceptanceReimbReceivable(
    checkerId: string,
    acceptRes: BalanceMovement,
    acceptanceReimbReceivableMovementId: string | null,
  ): Observable<CheckerActionOutcome> {
    if (!acceptanceReimbReceivableMovementId) {
      return this.fail(
        'Acceptance liability released, but the matching Reimbursement Receivable could not be found (no businessEventId correlation found) — release it separately first.',
      );
    }
    return this.api.release(acceptanceReimbReceivableMovementId, checkerId).pipe(
      switchMap(() => of<CheckerActionOutcome>({ kind: 'released', result: acceptRes })),
      catchError((err) => this.fail(`Acceptance released, but the Reimbursement Receivable asset failed to release: ${describeApiError(err)}`)),
    );
  }
}
