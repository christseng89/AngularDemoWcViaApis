import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
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
   * Bug fixed 2026-08-16 — the actual item a Checker session resolved via its OWN independent search
   * (searchCheckerLc()), always real server data regardless of session. release()'s A3S/B5 branches use
   * this (its own businessEventId) to resolve their linked leg when arrivalSgRedeemMovementId/
   * matchedReceivableMovementId are unavailable (a genuinely separate Checker session) — see
   * resolveLinkedMovementId's own doc comment.
   */
  readonly selectedCheckerMovement: BalanceMovement | null;
}

export type CheckerActionOutcome =
  | { kind: 'released'; result: BalanceMovement; syncLookup?: boolean; reloadPayables?: boolean }
  /** A3S's own acknowledgment-only path (releaseArrivalDocument's old shape) — no API call, no `result`. */
  | { kind: 'documentArrivalAcknowledged' }
  | { kind: 'failed'; message: string };

@Injectable({ providedIn: 'root' })
export class CheckerActionsService {
  constructor(private readonly api: BalanceComponentApiService) {}

  /**
   * BAL-126 (Quality-report-balance.md): every `{ kind: 'failed', message }` outcome this service ever
   * constructs — whether from a `catchError` or a plain pre-check return — collapsed into this one
   * shared helper. Only the message text ever differed between the ~20 call sites it replaces.
   */
  private fail(message: string): Observable<CheckerActionOutcome> {
    return of<CheckerActionOutcome>({ kind: 'failed', message });
  }

  release(ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    const checkerId = ctx.createdBy === 'maker1' ? 'checker1' : 'checker2';

    // Business instruction 2026-08-14 (revised): "When Checker approve it, then LC Balance will be approved
    // and Acceptance Balance will be approved too." — A6/B4. Release the picked source record FIRST
    // (finalizes it), THEN release the Acceptance itself — only proceeding if the first genuinely succeeds.
    // Bug fixed 2026-08-16 ("A6/B4 也修一下", extending the A3S/B5 fix above): selectedPayMovement
    // (the source) and dueFromIssuingBankMovementId/acceptanceMovementId/acceptanceReimbReceivableMovementId
    // (the downstream legs) are all only ever populated in the SAME session that Submitted — a
    // genuinely separate Checker session always had them null, same root cause as A3S/B5. Now resolved
    // via resolveSettlesDocumentArrivalIds() (source: referencedTransactionId, stamped on the primary
    // at Submit time — businessEventId can't help here since the source predates this submission;
    // downstream legs: businessEventId lookup, same mechanism as A3S/B5) before this chain runs at all.
    if (ctx.selectedFunction?.settlesDocumentArrival) {
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

    // Business instruction 2026-08-14 ("Redemp SG Balance in Approved via Checker approved") — A3S only.
    // One Release click releases the SG's own redemption for real; the Document Arrival itself is only
    // acknowledged after (never a real release call — the movement stays PENDING for A4/A6 to finalize).
    // Bug fixed 2026-08-16: arrivalSgRedeemMovementId is only ever populated in the SAME browser
    // session that just Submitted A3S — a genuinely separate Checker session (the normal case for real
    // Maker/Checker 4-eyes separation) always had it null, silently skipping this branch entirely and
    // leaving the SG's own redemption PENDING forever. Now resolves it via businessEventId when the
    // in-memory id is missing — see resolveLinkedMovementId's own doc comment.
    if (ctx.selectedFunction?.documentArrivalWithSg) {
      return this.resolveLinkedMovementId(ctx, ctx.arrivalSgRedeemMovementId, 'FULL_REDEEM', 'PARTIAL_REDEEM').pipe(
        switchMap((arrivalSgRedeemMovementId) => {
          if (!arrivalSgRedeemMovementId) {
            return this.fail(
              'Could not find the matched Shipping Guarantee redemption linked to this Document Arrival (no businessEventId correlation found) — release it separately first.',
            );
          }
          return this.api.release(arrivalSgRedeemMovementId, checkerId).pipe(
            switchMap(() => of<CheckerActionOutcome>({ kind: 'documentArrivalAcknowledged' })),
            catchError((err) => this.fail(`Could not release the Shipping Guarantee redemption — Document Arrival NOT acknowledged: ${describeApiError(err)}`)),
          );
        }),
      );
    }

    // B5's Usance/CNF_MATURE branch (settlesAcceptanceOnMature) only — one Release does both the
    // Acceptance's own FULL_SETTLE/PARTIAL_SETTLE and the matching Reimbursement Receivable's REIMBURSE,
    // same businessEventId, per the frozen spec's own CNF_MATURE event. Bug fixed 2026-08-16: same root
    // cause and same fix shape as documentArrivalWithSg above — matchedReceivableMovementId resolved via
    // businessEventId when the in-memory id is missing, and the primary release uses
    // selectedCheckerMovement (always real server data) instead of submitResult (session-only).
    if (ctx.selectedFunction?.settlesAcceptanceOnMature) {
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

  reject(ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    // Bug fixed 2026-08-16: prefer selectedCheckerMovement (always real server data from the Checker's
    // OWN independent search) over submitResult (session-only) — same reasoning as release()'s A3S/B5
    // branches above. Falls back to submitResult for parity with the pre-existing behavior on the one
    // path that still relies on it (A6/B4's settlesDocumentArrival, unchanged by this fix).
    const movementId = ctx.selectedCheckerMovement?.movementId ?? ctx.submitResult?.movementId;
    return this.api.reject(movementId!, 'checker1', 'MANUAL_TEST_REJECT').pipe(
      switchMap((res) => of<CheckerActionOutcome>({ kind: 'released', result: res })),
      catchError((err) => this.fail(describeApiError(err))),
    );
  }

  /**
   * Business instruction 2026-08-15 ("need a option for Maker to Delete Pending... for all functions")
   * — Maker-initiated withdrawal of their own just-submitted item while still PENDING, via /cancel
   * (distinct from /reject's Checker-side decline). For A3S/B3/B4-usance/B5, cancels the linked
   * secondary/asset leg(s) FIRST (reverse creation order) so an EC never leaves a later leg orphaned.
   */
  deleteMakerPending(ctx: CheckerActionContext): Observable<CheckerActionOutcome> {
    // BAL-132 (Quality-report-balance.md): was `const cancelledBy = ctx.createdBy!;` — asserted away
    // `CheckerActionContext.createdBy`'s own declared `string | null | undefined` type instead of
    // proving it can't happen. Safe in practice today (the component's own submit() already requires
    // model.createdBy before a Maker submission can exist to delete), but a real runtime guard costs
    // nothing and doesn't silently mask a future caller reaching this method with it unset.
    if (!ctx.createdBy) return this.fail('Cannot delete this Maker submission — no Maker (createdBy) is known for it.');
    const cancelledBy = ctx.createdBy;
    const cancelPrimary = (): Observable<CheckerActionOutcome> =>
      this.api.cancel(ctx.submitResult!.movementId, cancelledBy, 'MAKER_EC').pipe(
        switchMap((res) => of<CheckerActionOutcome>({ kind: 'released', result: res, syncLookup: true })),
        catchError((err) => this.fail(describeApiError(err))),
      );

    if (ctx.selectedFunction?.documentArrivalWithSg && ctx.arrivalSgRedeemMovementId) {
      return this.api.cancel(ctx.arrivalSgRedeemMovementId, cancelledBy, 'MAKER_EC').pipe(
        switchMap(() => cancelPrimary()),
        catchError((err) => this.fail(`Could not delete the Shipping Guarantee redemption — Document Arrival NOT deleted: ${describeApiError(err)}`)),
      );
    }

    // B3 (createsIssuingBankReceivableOnHonour) — cancel the linked Due from Issuing Bank asset FIRST,
    // so an EC on the Confirmation Honour never leaves it orphaned.
    if (ctx.selectedFunction?.createsIssuingBankReceivableOnHonour && ctx.dueFromIssuingBankMovementId) {
      return this.api.cancel(ctx.dueFromIssuingBankMovementId, cancelledBy, 'MAKER_EC').pipe(
        switchMap(() => cancelPrimary()),
        catchError((err) => this.fail(`Could not delete the Due from Issuing Bank asset — Confirmation Honour NOT deleted: ${describeApiError(err)}`)),
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
              this.fail(`Reimbursement Receivable deleted, but the Acceptance liability could not be — Confirmation Accept NOT deleted: ${describeApiError(err)}`),
            ),
          ),
        ),
        catchError((err) => this.fail(`Could not delete the Reimbursement Receivable asset — Acceptance NOT deleted: ${describeApiError(err)}`)),
      );
    }

    // B5's Usance/CNF_MATURE branch (settlesAcceptanceOnMature) — cancel the matching Reimbursement
    // Receivable's REIMBURSE FIRST, then the primary Acceptance FULL_SETTLE/PARTIAL_SETTLE.
    if (ctx.selectedFunction?.settlesAcceptanceOnMature && ctx.matchedReceivableMovementId) {
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
      switchMap(() => of<CheckerActionOutcome>({ kind: 'released', result: settleRes, syncLookup: true })),
      catchError((err) => this.fail(`Acceptance settled, but the matching Reimbursement Receivable failed to release: ${describeApiError(err)}`)),
    );
  }

  /**
   * Bug fixed 2026-08-16 — resolves a compound submission's linked leg movementId, preferring the
   * caller's own already-known id (set moments earlier in the SAME session's Submit — the common case,
   * zero extra HTTP call) and falling back to a businessEventId lookup only when that's unavailable (a
   * genuinely separate Checker session, or the same session after navigating away/reloading). Matches
   * by movementType alone (never instrumentType — not present on this DTO) — safe ONLY when every
   * candidate movementType passed in is exclusive to one instrument in this service's own
   * MOVEMENT_DIRECTION vocabulary (balanceDerivation.ts) AND at most one linked movement can ever match
   * — true for FULL_REDEEM/PARTIAL_REDEEM (SHGT) and REIMBURSE (EPLC_ACCEPTANCE_REIMB_RECEIVABLE) here,
   * but NOT true for B4 Usance's own two CREATE-typed downstream legs (both share the same movementType
   * string) — see resolveSettlesDocumentArrivalIds's own doc comment for how those are disambiguated
   * instead. Resolves `null` (not an error) when nothing can be found — the caller decides how to
   * surface that as a CheckerActionOutcome.
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
   * Bug fixed 2026-08-16 ("A6/B4 也修一下") — resolves everything settlesDocumentArrival's own release
   * chain needs in one pass: the SOURCE record (A3's own Document Arrival / B3's own Present Docs —
   * predates this submission, so it's correlated via referencedTransactionId, never businessEventId)
   * plus, for B4 specifically, its downstream leg(s) created ALONGSIDE the primary (Sight/HONOUR: one
   * Due from Issuing Bank CREATE; Usance/ACCEPT: an Acceptance liability CREATE then its Reimbursement
   * Receivable CREATE, in that fixed creation order). Both downstream shapes share the identical
   * movementType string 'CREATE', so unlike resolveLinkedMovementId's other callers they can't be told
   * apart by movementType alone — this method instead first branches on the PRIMARY's own movementType
   * (`selectedCheckerMovement.movementType`: 'HONOUR' vs 'ACCEPT', always exactly one) to decide WHICH
   * shape to even look for, then relies on findByBusinessEventId's own oldest-first ordering (which
   * submitConfirmationAcceptWithReceivable() guarantees matches submission order: primary ACCEPT, then
   * liability, then receivable) to tell the Usance pair apart. Getting this branch wrong would silently
   * cross-wire a Usance liability into the Sight due-from-issuing-bank slot (or vice versa) — confirmed
   * live by a failing test before this fix, not just a theoretical risk. Makes at most ONE
   * findByBusinessEventId call even when multiple ids need resolving.
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
    const isHonour = ctx.selectedCheckerMovement?.movementType === 'HONOUR';
    const isAccept = ctx.selectedCheckerMovement?.movementType === 'ACCEPT';
    const needsDownstreamLookup =
      (isHonour && !!ctx.selectedFunction?.createsIssuingBankReceivableOnHonour && !ctx.dueFromIssuingBankMovementId) ||
      (isAccept && !!ctx.selectedFunction?.createsAcceptanceReimbReceivableOnCreate && (!ctx.acceptanceMovementId || !ctx.acceptanceReimbReceivableMovementId));
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
   * A6/B4 — second leg of the compound Checker action, releasing the primary movement (A6: the newly-
   * created Acceptance; B4: the Confirmation's own HONOUR or ACCEPT) after its source record was
   * already released above. Branches into whichever third leg the function needs. Bug fixed
   * 2026-08-16: prefers selectedCheckerMovement (always real server data from the Checker's own
   * independent search) over submitResult (session-only) for the primary's own movementId — same
   * reasoning as the A3S/B5 fix above; `ids` (the downstream legs, already resolved by
   * resolveSettlesDocumentArrivalIds) is threaded through instead of each helper re-reading `ctx`.
   */
  private releaseAcceptance(
    checkerId: string,
    ctx: CheckerActionContext,
    ids: { dueFromIssuingBankMovementId: string | null; acceptanceMovementId: string | null; acceptanceReimbReceivableMovementId: string | null },
  ): Observable<CheckerActionOutcome> {
    const primaryMovementId = ctx.selectedCheckerMovement?.movementId ?? ctx.submitResult?.movementId;
    return this.api.release(primaryMovementId!, checkerId).pipe(
      switchMap((res) => {
        if (ctx.selectedFunction?.createsIssuingBankReceivableOnHonour && ids.dueFromIssuingBankMovementId) {
          return this.releaseDueFromIssuingBank(checkerId, res, ids.dueFromIssuingBankMovementId);
        }
        if (ctx.selectedFunction?.createsAcceptanceReimbReceivableOnCreate && ids.acceptanceMovementId) {
          return this.releaseAcceptanceLiability(checkerId, res, ids.acceptanceMovementId, ids.acceptanceReimbReceivableMovementId);
        }
        // Both the picked source record and the Parent LC's own hints/snapshots are stale otherwise
        // until the user navigates away and back.
        return of<CheckerActionOutcome>({ kind: 'released', result: res, reloadPayables: true });
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
      switchMap(() => of<CheckerActionOutcome>({ kind: 'released', result: honourRes, syncLookup: true, reloadPayables: true })),
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
      switchMap(() => of<CheckerActionOutcome>({ kind: 'released', result: acceptRes, syncLookup: true, reloadPayables: true })),
      catchError((err) => this.fail(`Acceptance released, but the Reimbursement Receivable asset failed to release: ${describeApiError(err)}`)),
    );
  }
}
