import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement } from './balance-component-api.service';
import { TransactionFunction } from './balance-component.model';
import { payExistingUtilizeFunctionFor, resolveFunctionForMovement } from './function-strategy';
import { describeApiError } from './api-error';
import { PagedListState } from './paged-list-state';

/**
 * One row of the Maker Queue — pairs a movement with its own contract, same shape the API returns.
 *
 * `siblingMovementIds` (business-confirmed 2026-08-28, "1 只應該顯示一筆 2 一筆刪全部" — reversing this
 * queue's own former "3 separate rows, Delete Pending disabled" posture for a compound event, see
 * `isCompoundShape()`'s own updated doc comment) — present only on a MERGED representative row for a
 * compound submission (A3S/B4/B5): every movementId sharing this row's own `movement.businessEventId`,
 * INCLUDING this row's own `movement.movementId`. Absent (undefined) on a plain single-leg row.
 */
export interface MakerQueueRow {
  movement: BalanceMovement;
  contract: BalanceContract;
  siblingMovementIds?: string[];
}

/**
 * Fix Pending/Delete Pending Phase 2 (analysis/Balance-Component-FixPending-DeletePending-Proposal-zh.md
 * §2.1) — the Maker's own "My Pending/My Rejected" worklist, mirroring `CheckerPanelComponent`'s own
 * search+queue role but for the Maker side: without this, a Checker Reject only stays actionable within
 * the same browser session's own Maker Result panel (`submitResult`) — this service lets the Maker find
 * it again independent of that in-memory state.
 *
 * Server-side paginated (`GET /balance-movements?createdBy=&status=`, `BalanceComponentApiService.
 * listMyMovements()`), same convention as `InquireEventsService.loadIndex()`.
 *
 * `@Injectable()`, no `providedIn` — per-component-instance mutable state, not a singleton; same
 * reasoning as `LookUpPanelService`/`InquireEventsService`.
 */
@Injectable()
export class MakerQueueService {
  constructor(private readonly api: BalanceComponentApiService) {}

  /** No real auth in this demo app (same posture as every other hardcoded 'maker1'/'checker1' actor literal throughout this sub-project) — a plain overridable text field, not a login. */
  createdBy = 'maker1';
  items: MakerQueueRow[] = [];
  loading = false;
  error: string | null = null;
  readonly paging = new PagedListState(10);

  load(page: number = 1): void {
    if (!this.createdBy) return;
    this.loading = true;
    this.error = null;
    this.api.listMyMovements({ createdBy: this.createdBy, statuses: ['PENDING', 'REJECTED'], page, pageSize: this.paging.pageSize }).subscribe({
      next: (result) => {
        this.loading = false;
        this.items = this.groupCompoundRows(result.items);
        this.paging.total = result.total;
        this.paging.page = result.page;
      },
      error: (err) => {
        this.loading = false;
        this.error = describeApiError(err);
        this.items = [];
        this.paging.total = 0;
      },
    });
  }

  prevPage(): void {
    const target = this.paging.prevTarget();
    if (target) this.load(target);
  }

  nextPage(): void {
    const target = this.paging.nextTarget();
    if (target) this.load(target);
  }

  /**
   * Business-confirmed 2026-08-28 — collapses every compound submission's own multiple raw movements
   * (A3S/B4/B5, all sharing one `businessEventId`) into ONE display row, same "one Business Event, one
   * row" principle `mergeAccountingEventRows()` (inquire-events.service.ts) already applies to A6/B4 on
   * the merged event timeline. The representative row is whichever leg is a DIRECT registry match — its
   * own `contract.instrumentType` equals `functionFor()`'s resolved function's own registered
   * `instrumentType` — so the secondary asset/liability legs (which only ever resolve via
   * `resolveFunctionForMovement()`'s fallback branches) never get picked as the one shown; this also
   * naturally carries the correct Reference (`sourceTransactionRef` lives on the primary leg, not its
   * secondary legs) and avoids ever surfacing one of those fallback-less legs (e.g. B5's own Receivable
   * RECLASSIFY_OUT) as its own blank-Function row, since it's never displayed standalone at all now.
   *
   * Known limitation: grouping is client-side, over only the CURRENT page's own fetched items — a
   * compound event's legs could in principle land on different pages if enough unrelated PENDING/REJECTED
   * items from other functions interleave between them in `created_at DESC` order. In practice every leg
   * of one compound submission is created within the same `createMovement()` call sequence (millisecond-
   * apart timestamps), so they are always adjacent in that ordering and this doesn't happen at this
   * app's scale; a server-side GROUP BY businessEventId would be the real fix if that ever changes.
   */
  private groupCompoundRows(rawItems: MakerQueueRow[]): MakerQueueRow[] {
    const byEvent = new Map<string, MakerQueueRow[]>();
    // `ordered` holds exactly one slot per distinct businessEventId (at its first-seen position, so the
    // merged row's own list position still matches the server's own created_at DESC order), plus every
    // plain (no businessEventId) row in place — never a second slot for a group's later-seen members.
    const ordered: MakerQueueRow[] = [];
    for (const item of rawItems) {
      const key = item.movement.businessEventId;
      if (!key) {
        ordered.push(item);
        continue;
      }
      const group = byEvent.get(key);
      if (group) {
        group.push(item);
      } else {
        byEvent.set(key, [item]);
        ordered.push(item);
      }
    }
    return ordered.map((item) => {
      const key = item.movement.businessEventId;
      if (!key) return item;
      const group = byEvent.get(key)!;
      if (group.length === 1) return item;
      const representative = group.find((r) => this.isDirectMatch(r)) ?? group[0];
      return { ...representative, siblingMovementIds: group.map((r) => r.movement.movementId) };
    });
  }

  private isDirectMatch(row: MakerQueueRow): boolean {
    const fn = resolveFunctionForMovement(row.contract.instrumentType, row.movement.movementType);
    return !!fn && fn.instrumentType === row.contract.instrumentType;
  }

  /**
   * Unified Earmarking display model (lc-balance/CLAUDE.md's own "Event Status Display Mapping"
   * requirement — A3/A3S/B3 are EARMARKING/EARMARKED, every other Function is PENDING/REJECTED/APPROVED)
   * — once the Maker has already Maker-Submitted A4 (Sight Settlement) against this A3/A3S UTILIZE
   * (BAL-122: A4 finalizes the SAME movement A3 created, no movement of its own), this queue's own "which
   * screen does the Maker act on next" question is A4's, not A3's — `resolveFunctionForMovement()`'s own
   * first-registry-match-wins always resolves IPLC_LC/UTILIZE to plain A3, which is correct only BEFORE
   * `makerSubmittedAt` is set. Deliberately keyed off `makerSubmittedAt`, not `acknowledgedAt` alone — a
   * merely-acknowledged (EARMARKED) row is still A3's own business until the Maker actually acts on A4.
   */
  functionFor(row: MakerQueueRow): TransactionFunction | undefined {
    if (this.isFinalizing(row)) {
      const finalizing = payExistingUtilizeFunctionFor(row.contract.instrumentType, row.contract.tenorType);
      if (finalizing) return finalizing;
    }
    return resolveFunctionForMovement(row.contract.instrumentType, row.movement.movementType);
  }

  /** Shared by functionFor() and displayPhaseFor() — the one condition under which this row's own business identity has moved from A3/A3S to A4. */
  private isFinalizing(row: MakerQueueRow): boolean {
    return !!row.movement.makerSubmittedAt;
  }

  /**
   * This queue never passed `phase`/`acknowledgedAt` at all to `displayStatus()`/`statusBadgeClass()`
   * (`balance-component.model.ts`) — those already implement the unified Earmarking model (`
   * isEarmarkFunction()` already covers A3/A3S's IPLC_LC/UTILIZE, same mapping B3's EPLC_EXAMINATION/
   * CREATE gets), so without `acknowledgedAt` a Checker-acknowledged A3/A3S row wrongly stayed
   * "EARMARKING" instead of "EARMARKED" here, and without `phase` a row already relabeled to A4 by
   * functionFor() above kept showing A3's own EARMARKING/EARMARKED vocabulary instead of A4's plain
   * PENDING/REJECTED. Deliberately the SAME `isFinalizing()` condition `functionFor()` uses, not a
   * separate one — the Function label and the Status text must never disagree about which lifecycle this
   * row is currently in.
   */
  displayPhaseFor(row: MakerQueueRow): 'finalize' | null {
    return this.isFinalizing(row) && payExistingUtilizeFunctionFor(row.contract.instrumentType, row.contract.tenorType) ? 'finalize' : null;
  }

  /**
   * Business-confirmed 2026-08-28 ("1 只應該顯示一筆 2 一筆刪全部") — reverses this queue's former
   * Phase-2-era posture (A3S/B4/B5 compound rows shown separately, Delete Pending disabled on all of
   * them — see the superseded doc comment this replaces, in the same session's own CLAUDE.md decision
   * log). The original blocker (`checker-actions.service.ts`'s own `deleteMakerPending()` cascade relies
   * on same-session-only `arrivalSgRedeemMovementId`/`acceptanceMovementId`/etc. state) no longer applies
   * — `BalanceComponentApiService.findByBusinessEventId()` (added the same day, for the Account Entries
   * linked-resolution fix) already lets this cross-session queue reconstruct a compound event's own
   * sibling movementIds server-side, which is exactly what `groupCompoundRows()` above now does at load
   * time. `isCompoundShape()` itself (still `!!row.movement.businessEventId`) is kept only for
   * `deletePending()` below to know whether to cascade; it no longer gates a `[disabled]` anywhere in the
   * template.
   */
  isCompoundShape(row: MakerQueueRow): boolean {
    return !!row.movement.businessEventId;
  }

  /**
   * Business-confirmed 2026-08-27 ("做 A4 或 A6 DELETE PENDING 後 交易退回到 A4 或 A6 SUBMIT 前即可") — an
   * A4 row (isFinalizing()) has no movement of its own to cancel; its Delete Pending must undo just the
   * Maker Submit (`withdrawMakerSubmit()`) rather than cancel the underlying A3/A3S UTILIZE. A6 needs no
   * equivalent case here — it creates its own genuinely separate movement, so plain cancel() below already
   * reverts to "before A6 Submit" without touching A3S's own record.
   */
  isWithdrawMakerSubmitCase(row: MakerQueueRow): boolean {
    return this.isFinalizing(row);
  }

  /**
   * Plain (non-compound) rows call `/cancel` directly, same MAKER_EC reason the same-session Delete
   * Pending button already uses. A merged compound row (`row.siblingMovementIds` set — see
   * `groupCompoundRows()` above) cascades: every sibling FIRST, in reverse-creation-order proxy (whatever
   * order `findByBusinessEventId()` returned them in, excluding the representative), THEN the
   * representative's own movement last — same "never leave a later leg orphaned" ordering
   * `checker-actions.service.ts`'s own same-session `deleteMakerPending()` uses, just driven by the
   * reconstructed sibling list instead of in-memory context fields. If a sibling cancel fails partway,
   * the chain stops there (via switchMap) and reports the error — whatever already cancelled stays
   * cancelled (Delete Pending audit rows are independent per leg, same as every other cascade in this
   * codebase), and `load()` afterward shows the actual resulting state rather than assuming success.
   */
  deletePending(row: MakerQueueRow): void {
    this.error = null;
    if (this.isWithdrawMakerSubmitCase(row)) {
      this.api.withdrawMakerSubmit(row.movement.movementId, this.createdBy).subscribe({
        next: () => this.load(this.paging.page),
        error: (err) => {
          this.error = describeApiError(err);
        },
      });
      return;
    }
    const primaryId = row.movement.movementId;
    const siblingIds = (row.siblingMovementIds ?? []).filter((id) => id !== primaryId);
    const cancelOne = (id: string) => this.api.cancel(id, this.createdBy, 'MAKER_EC');
    const chain: Observable<BalanceMovement> = siblingIds.reduce(
      (acc, id) => acc.pipe(switchMap(() => cancelOne(id))),
      of(null as unknown as BalanceMovement),
    );
    chain.pipe(switchMap(() => cancelOne(primaryId))).subscribe({
      next: () => this.load(this.paging.page),
      error: (err) => {
        this.error = describeApiError(err);
      },
    });
  }
}
