import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement } from './balance-component-api.service';
import { EXPORT_FUNCTIONS, IMPORT_FUNCTIONS, TransactionFunction } from './balance-component.model';
import { deriveFunctionStrategy, functionSupportsFixPending, payExistingUtilizeFunctionFor, resolveFunctionForMovement } from './function-strategy';
import { describeApiError } from './api-error';
import { PagedListState } from './paged-list-state';

/**
 * Function ASC ordinal (user-directed 2026-08-28, "Order by Function ASC → LC Number ASC → Secondary
 * Reference Number ASC") — Import Functions (A-series) before Export (B-series), each in the SAME order
 * they're already registered/rendered as chips (A1, A2, A3, A3S, A4, A6, A7, A8, A9, A10, A11) — a plain
 * numeric-string sort would wrongly place "A10"/"A11" before "A2" (lexicographic "A1" < "A10" < "A11" <
 * "A2"), so this uses the registry's own array position instead of the code string.
 */
const FUNCTION_ORDER: string[] = [...IMPORT_FUNCTIONS, ...EXPORT_FUNCTIONS].map((f) => f.code);

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
 * User-directed 2026-08-28 ("Order by Function ASC → LC Number ASC → Secondary Reference Number ASC" /
 * "Search 後的結果必須維持與 Maker Queue 相同的排序規則") — `load()` now fetches EVERY matching row
 * unpaginated (`GET /balance-movements?createdBy=&status=&q=`), then groups/sorts/paginates entirely
 * client-side: Function has no server-side column (it's resolved from instrumentType+movementType+
 * makerSubmittedAt, see `functionFor()` below), so a true Function-first sort can only happen once every
 * row is loaded — same "Function is not a server-side concern" boundary
 * `InquireDeletePendingService`/`DeletePendingAuditStore.search()` already draw. `paging` now windows the
 * already-loaded `items` array (same "client-side pagination over an already-loaded array" convention
 * `InquireEventsService.pagedEvents` already established), not a re-fetch per page — `prevPage()`/
 * `nextPage()` below just move `paging.page`. Because Search and the unfiltered default Index now run
 * through this exact same `load()` → group → sort → window pipeline regardless of whether `q` is set,
 * the two can never disagree on ordering by construction, not by convention.
 *
 * `@Injectable()`, no `providedIn` — per-component-instance mutable state, not a singleton; same
 * reasoning as `LookUpPanelService`/`InquireEventsService`.
 */
@Injectable()
export class MakerQueueService {
  constructor(private readonly api: BalanceComponentApiService) {}

  /** No real auth in this demo app (same posture as every other hardcoded 'maker1'/'checker1' actor literal throughout this sub-project) — a plain overridable text field, not a login. */
  createdBy = 'maker1';
  /** User-directed 2026-08-28 ("Maker Queue 提供 LC Number Search 功能", "支援 LIKE / Partial Match") — plain text field, same "search box state lives on the service" convention `createdBy` above already uses; `load()` reads it directly rather than taking it as a param. */
  lcNumberSearch = '';
  /** Every matching row (BOTH sides), already grouped (compound legs merged) and sorted (Function ASC → LC Number ASC → Secondary Reference Number ASC) — the template iterates `pagedItems` below, not this directly. */
  items: MakerQueueRow[] = [];
  loading = false;
  error: string | null = null;
  /** Client-side windowing over the CURRENT side's own already-loaded, already-sorted rows (`sideFilteredItems` below) — not a re-fetch per page; `load()` already fetches/groups/sorts everything (both sides) at once. */
  readonly paging = new PagedListState(10);

  /**
   * Import LC／Export Confirmed split (user-directed 2026-08-28, "Maker Queue進口 出口 分開 (similar as
   * Inquire Events)") — mirrors `InquireEventsService.side`/`selectSide()`, but the filter itself is a
   * simpler, purely client-side operation here: Inquire Events' own Index is a server-paginated browse of
   * ROOT LC/Confirmation contracts, so its side switch re-fetches via `defaultLcInstrumentTypeForSide()`.
   * Maker Queue already loads and groups EVERY matching row up front (2026-08-28, Function ASC sort —
   * see this class's own doc comment above), and every row already resolves a `TransactionFunction` with
   * its own `side` field (`functionFor(row)?.side`) — so splitting by side needs no new server round trip
   * at all, just an additional filter layered onto the SAME already-loaded `items` array `pagedItems`
   * already windows. A row whose Function can't be resolved (`functionFor()` returns `undefined` — the
   * same rare/degenerate case `sortRows()`'s own doc comment already flags) has no `side` either, so it
   * is invisible on BOTH tabs rather than guessed onto one — same "never guess, show nothing rather than
   * something possibly wrong" posture as `functionOrdinal()`'s own unresolved-sorts-last fallback.
   */
  side: 'IMPORT' | 'EXPORT' = 'IMPORT';

  /** `items`, filtered to the current `side` — the actual list `pagedItems`/`paging.total` operate over. */
  get sideFilteredItems(): MakerQueueRow[] {
    return this.items.filter((row) => this.functionFor(row)?.side === this.side);
  }

  /** The current page's own slice of `sideFilteredItems` — the template iterates this instead of `items`/`sideFilteredItems` directly. */
  get pagedItems(): MakerQueueRow[] {
    const filtered = this.sideFilteredItems;
    const start = (this.paging.page - 1) * this.paging.pageSize;
    return filtered.slice(start, start + this.paging.pageSize);
  }

  /** Import LC／Export Confirmed tab click — `items` itself is already fully loaded (both sides), so this never re-fetches, just re-derives `paging.total` for the newly-selected side and resets to page 1 (same "a genuinely new view starts at page 1" convention `load()`'s own `resetToFirstPage` already uses). */
  selectSide(side: 'IMPORT' | 'EXPORT'): void {
    this.side = side;
    this.paging.page = 1;
    this.paging.total = this.sideFilteredItems.length;
  }

  /** `resetToFirstPage` (default `true`) — a genuinely new search (a fresh createdBy Load, or an LC Number Search) starts from page 1; a same-search refresh (e.g. after `deletePending()` settles) stays on whatever page the Maker was already viewing. */
  load(resetToFirstPage: boolean = true): void {
    if (!this.createdBy) return;
    this.loading = true;
    this.error = null;
    if (resetToFirstPage) this.paging.page = 1;
    this.api.listMyMovements({ createdBy: this.createdBy, statuses: ['PENDING', 'REJECTED'], q: this.lcNumberSearch || undefined }).subscribe({
      next: (result) => {
        this.loading = false;
        this.items = this.sortRows(this.groupCompoundRows(result.items));
        this.paging.total = this.sideFilteredItems.length;
        if (this.paging.page > this.paging.totalPages) this.paging.page = this.paging.totalPages;
      },
      error: (err) => {
        this.loading = false;
        this.error = describeApiError(err);
        this.items = [];
        this.paging.total = 0;
      },
    });
  }

  /** Function ASC → LC Number ASC → Secondary Reference Number ASC (user-directed 2026-08-28) — applied AFTER grouping, over the representative row of each compound event, so the sort key always matches what's actually displayed. A row whose Function can't be resolved sorts last, never first — an unresolvable row is the rare/degenerate case, not one that should visually jump to the top. */
  private sortRows(rows: MakerQueueRow[]): MakerQueueRow[] {
    return [...rows].sort((a, b) => {
      const fnDiff = this.functionOrdinal(a) - this.functionOrdinal(b);
      if (fnDiff !== 0) return fnDiff;
      const lcDiff = a.contract.naturalKey.lcNumber.localeCompare(b.contract.naturalKey.lcNumber);
      if (lcDiff !== 0) return lcDiff;
      return (a.movement.sourceTransactionRef ?? '').localeCompare(b.movement.sourceTransactionRef ?? '');
    });
  }

  private functionOrdinal(row: MakerQueueRow): number {
    const fn = this.functionFor(row);
    if (!fn) return Number.MAX_SAFE_INTEGER;
    const idx = FUNCTION_ORDER.indexOf(fn.code);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  }

  /** Both just move `paging.page` locally — `items` is already fully loaded and sorted, no re-fetch needed. */
  prevPage(): void {
    const target = this.paging.prevTarget();
    if (target) this.paging.page = target;
  }

  nextPage(): void {
    const target = this.paging.nextTarget();
    if (target) this.paging.page = target;
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
   * Runs over the FULL matching set `load()` fetches (2026-08-28, pagination moved client-side) — the
   * former "grouping only sees the current server page" known limitation no longer applies, since every
   * matching row is loaded before grouping ever runs; a compound event's legs can no longer land on
   * different pages by construction, not just by this app's own scale staying small.
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
   * Fix Pending's own Maker Queue entry point (2026-08-28, "Maker Queue Need to provide Fix Pending
   * button as well") — reuses `functionSupportsFixPending()`/`FunctionStrategy.fixPendingEnabled`
   * (function-strategy.ts), the exact same trial-scope gate the in-session Transaction Builder screen's
   * own Fix Pending button already reads, so extending Fix Pending to another Function later needs zero
   * change here either. EXCLUDES a compound row (`isCompoundShape()`) UNLESS it's specifically the
   * `documentArrivalWithSg` (A3S) shape (`isArrivalWithSgCompound()` below) — Fix Pending's own
   * `editPending()` generally only ever corrects ONE movement, so single-leg-editing a row that really
   * represents two linked records would silently desync them for every OTHER compound shape (B4/B5) —
   * but A3S's own Phase 4 cascade (`BalanceService.applyArrivalWithSgCompoundEdit()`, 2026-08-28)
   * specifically handles this ONE shape correctly, recomputing/replacing the SG's own matched leg
   * alongside the LC's own UTILIZE. A merged A3S row's own representative leg structurally resolves to
   * plain "A3" (`resolveFunctionForMovement()` matches only on instrumentType+movementType, blind to the
   * compound submission it's actually part of) — that's fine here, since A3's own `fixPendingEnabled` is
   * already `true` and identical to A3S's own; the distinguishing gate is entirely `isArrivalWithSgCompound()`,
   * not which of the two codes `functionFor()` happens to resolve to.
   */
  fixPendingSupported(row: MakerQueueRow): boolean {
    if (this.isCompoundShape(row) && !this.isArrivalWithSgCompound(row)) return false;
    const fn = this.functionFor(row);
    return functionSupportsFixPending(fn ? deriveFunctionStrategy(fn) : null);
  }

  /** The one compound shape Fix Pending's own Phase 4 cascade actually supports — mirrors the exact same detection `BalanceService.editPending()` uses server-side (contract.instrumentType/movement.movementType/businessEventId), so the two can never disagree about which rows are safe to Fix Pending. */
  private isArrivalWithSgCompound(row: MakerQueueRow): boolean {
    return row.contract.instrumentType === 'IPLC_LC' && row.movement.movementType === 'UTILIZE' && !!row.movement.businessEventId;
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
   *
   * `onSettled` (2026-08-28, Maker Queue's own Delete Pending review screen) — an optional plain
   * callback, same "no Observable exposed" convention `pickerSelection.loadSgsForArrival(lcNumber,
   * callback)` already uses elsewhere in this sub-project; called once EITHER way (success or failure)
   * so a caller that navigated away to show a review screen (`TransactionBuilderComponent.
   * onDeletePendingReviewConfirmed()`) knows when it's safe to navigate back, without this method itself
   * needing to know anything about that caller's own navigation.
   */
  deletePending(row: MakerQueueRow, onSettled?: (success: boolean) => void): void {
    this.error = null;
    if (this.isWithdrawMakerSubmitCase(row)) {
      this.api.withdrawMakerSubmit(row.movement.movementId, this.createdBy).subscribe({
        next: () => {
          this.load(false); // stays on the same page — see load()'s own doc comment for resetToFirstPage
          onSettled?.(true);
        },
        error: (err) => {
          this.error = describeApiError(err);
          onSettled?.(false);
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
      next: () => {
        this.load(false); // stays on the same page — see load()'s own doc comment for resetToFirstPage
        onSettled?.(true);
      },
      error: (err) => {
        this.error = describeApiError(err);
        onSettled?.(false);
      },
    });
  }
}
