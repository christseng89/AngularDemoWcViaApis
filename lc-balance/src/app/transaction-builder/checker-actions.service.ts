import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceMovement, EditMovementRequest } from './balance-component-api.service';
import { TransactionFunction } from './balance-component.model';
import { describeApiError } from './api-error';
import { deriveFunctionStrategy } from './function-strategy';
import { MakerSubmitSecondary } from './maker-submit.service';

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
  /**
   * `secondary` (2026-08-28, Phase 4) — populated ONLY by `editPending()` below, and only when the edited
   * movement's own `businessEventId` resolves a linked SG redemption leg (A3S's own compound cascade);
   * every other `'released'` producer (`release()`/`reject()`/the plain single-leg `editPending()` path)
   * leaves it `undefined`, same "only present when a flow actually resolved it" convention
   * `MakerSubmitSecondary` itself already establishes for `maker-submit.service.ts`'s own compound Submit.
   */
  | { kind: 'released'; result: BalanceMovement; secondary?: MakerSubmitSecondary }
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
      return this.resolveSettlesDocumentArrivalIds(ctx).pipe(
        switchMap((ids) => this.releaseSettlesDocumentArrival(checkerId, ctx, ids)),
      );
    }

    // A3S only: one Release click releases the SG's own redemption for real, THEN persists the Checker's
    // own acknowledgment on the LC's own UTILIZE (restored 2026-08-20, "A3 A3S 交易 Approve 過後 不要再顯示")
    // — the Document Arrival itself stays PENDING, acknowledged but not genuinely released, for A4/A6 to
    // finalize later.
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
          const utilizeId = ctx.selectedCheckerMovement?.movementId ?? ctx.submitResult?.movementId;
          return this.api.executeCompoundActions(
            [
              { kind: 'release', movementId: arrivalSgRedeemMovementId },
              { kind: 'acknowledge', movementId: utilizeId! },
            ],
            checkerId,
          ).pipe(
            map(() => ({ kind: 'documentArrivalAcknowledged' as const })),
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
          return this.api.releaseCompoundMovements([primaryMovementId!, matchedReceivableMovementId], checkerId).pipe(
            map(([res]) => ({ kind: 'released' as const, result: res! })),
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
   * Fix Pending (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md §2.2/§15/§19,
   * 2026-08-27; per-field config 2026-08-28, "頁面配置檔 for A1-A11/B1-B7"; widened A1/A3 → A1/A2/A3/B1
   * same day, "把這A1 A3 修改要求放置B1 A2試試看"; A3S/B2 widened further the same day, "使用同樣方式處理
   * A3 A35 A4 & B2") — corrects `ctx.submitResult`'s own PENDING/REJECTED movement in place of a Delete
   * Pending + full re-Submit. `api.editPending()` is generic across every movementType/compound shape
   * already (the microservice's own `BalanceService.editPending()` decides internally whether a compound
   * A3S cascade applies) — this method's only own job beyond the plain pass-through is resolving the SG
   * leg's own FRESH replacement afterward (`resolveArrivalSgLegAfterEdit()` below) so the caller's own
   * `compoundLegs.arrivalSgRedeemMovement` doesn't keep pointing at the replaced predecessor SG row — same
   * "re-resolve via businessEventId, never trust stale in-memory state" convention
   * `resolveLinkedAccountingMovement()` (`transaction-builder.component.ts`) already established for the
   * Account Entries dialog. `patch` carries whichever fields `MakerPanelComponent.confirmFixPending()`
   * decided to send, per the current Function's own `fixPendingEditableFields` set — this service is a
   * pure pass-through, it never re-derives which fields are editable itself. Reuses the `'released'`
   * outcome kind — a generic "successful mutation, here's the resulting movement to display" signal, not
   * literally "released" in the Checker sense (same convention `release()`/`reject()` above already
   * establish).
   */
  editPending(ctx: CheckerActionContext, patch: Omit<EditMovementRequest, 'editedBy'>): Observable<CheckerActionOutcome> {
    if (!ctx.submitResult) return this.fail('Cannot Fix Pending — no submission is known for it.');
    const editedBy = ctx.createdBy || 'maker1';
    return this.api.editPending(ctx.submitResult.movementId, { ...patch, editedBy }).pipe(
      switchMap((res) => this.resolveArrivalSgLegAfterEdit(res).pipe(map((secondary) => ({ kind: 'released' as const, result: res, secondary })))),
      catchError((err) => this.fail(describeApiError(err))),
    );
  }

  /**
   * Best-effort refresh of an A3S compound edit's own linked SG redemption leg — `res.businessEventId`
   * is non-null ONLY for a compound-shaped movement (A3S's UTILIZE, or a passthrough test value; either
   * way a harmless no-sibling-found `{}` for anything that isn't genuinely A3S's own matched pair). A
   * lookup failure here does NOT fail the edit itself — the edit already succeeded server-side by the
   * time this runs; `compoundLegs` simply stays whatever it was, same as it always has for every OTHER
   * Fix Pending edit before this one existed.
   */
  private resolveArrivalSgLegAfterEdit(res: BalanceMovement): Observable<MakerSubmitSecondary> {
    if (!res.businessEventId) return of<MakerSubmitSecondary>({});
    return this.api.findByBusinessEventId(res.businessEventId).pipe(
      map((movements) => {
        // findByBusinessEventId() returns every movement sharing this businessEventId — status: 'PENDING'
        // picks the genuine SG redeem leg, not one that (independently) already RELEASED/REJECTED.
        const sg = movements.find((m) => m.status === 'PENDING' && (m.movementType === 'FULL_REDEEM' || m.movementType === 'PARTIAL_REDEEM'));
        return sg ? { arrivalSgRedeemMovementId: sg.movementId, arrivalSgRedeemMovement: sg } : {};
      }),
      catchError(() => of<MakerSubmitSecondary>({})),
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
    const primaryMovementType = ctx.selectedCheckerMovement?.movementType ?? ctx.submitResult?.movementType;
    const isHonour = primaryMovementType === 'HONOUR' || !!ctx.dueFromIssuingBankMovementId;
    const isAccept = primaryMovementType === 'ACCEPT' || !!ctx.acceptanceMovementId || !!ctx.acceptanceReimbReceivableMovementId;
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

  private releaseSettlesDocumentArrival(
    checkerId: string,
    ctx: CheckerActionContext,
    ids: { sourceMovementId: string | null; dueFromIssuingBankMovementId: string | null; acceptanceMovementId: string | null; acceptanceReimbReceivableMovementId: string | null },
  ): Observable<CheckerActionOutcome> {
    const strategy = ctx.selectedFunction ? deriveFunctionStrategy(ctx.selectedFunction) : null;
    const primaryMovementId = ctx.selectedCheckerMovement?.movementId ?? ctx.submitResult?.movementId;
    const primaryMovementType = ctx.selectedCheckerMovement?.movementType ?? ctx.submitResult?.movementType;
    const isHonour = primaryMovementType === 'HONOUR' || !!ctx.dueFromIssuingBankMovementId;
    const isAccept = primaryMovementType === 'ACCEPT' || !!ctx.acceptanceMovementId || !!ctx.acceptanceReimbReceivableMovementId;
    if (!primaryMovementId) return this.fail('Could not find the primary movement for this compound release.');

    const actions: { kind: 'release'; movementId: string }[] = [];
    if (!strategy?.checkerRelease.sourceAlreadyReleasedBeforePick) {
      if (!ids.sourceMovementId) {
        return this.fail(
          `Could not find the ${ctx.selectedFunction?.pendingItemLabel ?? 'Document Arrival'} record this was created from (no referencedTransactionId correlation found) — release it separately first.`,
        );
      }
      actions.push({ kind: 'release', movementId: ids.sourceMovementId });
    }
    actions.push({ kind: 'release', movementId: primaryMovementId });

    if (isHonour && strategy?.compoundSubmission.possibleShapes.includes('confirmationHonourWithReceivable')) {
      if (!ids.dueFromIssuingBankMovementId) return this.fail('Could not find the linked Due from Issuing Bank movement.');
      actions.push({ kind: 'release', movementId: ids.dueFromIssuingBankMovementId });
    }
    if (isAccept && strategy?.compoundSubmission.possibleShapes.includes('confirmationAcceptWithReceivable')) {
      if (!ids.acceptanceMovementId || !ids.acceptanceReimbReceivableMovementId) {
        return this.fail('Could not find every linked Acceptance and Reimbursement Receivable movement.');
      }
      actions.push({ kind: 'release', movementId: ids.acceptanceMovementId });
      actions.push({ kind: 'release', movementId: ids.acceptanceReimbReceivableMovementId });
    }

    return this.api.executeCompoundActions(actions, checkerId).pipe(
      map((results) => ({ kind: 'released' as const, result: results[strategy?.checkerRelease.sourceAlreadyReleasedBeforePick ? 0 : 1]! })),
      catchError((err) => this.fail(`Compound event failed to release atomically: ${describeApiError(err)}`)),
    );
  }

}
