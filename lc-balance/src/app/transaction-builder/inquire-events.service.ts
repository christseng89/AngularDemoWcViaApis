import { Injectable } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';
import {
  BALANCE_SNAPSHOT_LABEL,
  InstrumentType,
  TransactionFunction,
  childInstrumentTypesOf,
  defaultLcInstrumentTypeForSide,
  systemMovementLabel,
  tenorTypeLabel,
} from './balance-component.model';
import { BuilderFieldsContext, buildFields, reconstructOriginalModel, toReadOnlyFields } from './builder-fields';
import { payExistingUtilizeFunctionFor, resolveFunctionForMovement } from './function-strategy';
import { BuilderModel } from './function-policy';
import { describeApiError } from './api-error';
import { PagedListState } from './paged-list-state';

/**
 * Adapter: pairs a raw BalanceMovement with its owning BalanceContract, since a movement alone carries
 * neither instrumentType nor naturalKey.
 *
 * `eventTime`/`eventStatus`/`phase` exist because A4 (Sight Settlement) finalizes an EXISTING A3/A3S
 * UTILIZE instead of creating a new one — sorting/displaying by `movement.createdAt`/`status` directly
 * would hide A4's own later completion. `toEventRows()` splits such a movement into 'create' (A3's
 * submission) and 'finalize' (A4's Release) rows sharing one `movement`. `eventStatus` is always the
 * movement's real current status on both rows, never frozen. See `selectEvent()` for how `phase` also
 * changes the resolved function and Balance Snapshot shown.
 */
export interface InquiredEvent {
  movement: BalanceMovement;
  contract: BalanceContract;
  /** The true Event Date/Time this ROW represents — sort/display MUST use this, never movement.createdAt directly. */
  eventTime: string;
  /** The movement's TRUE current `status`, same for every phase including 'create' — never a frozen historical value (see `toEventRows()`). */
  eventStatus: BalanceMovement['status'];
  /** 'primary' — the movement's only real-world event. 'create'/'finalize' — A4 finalizing an existing A3/A3S row, one movement spanning two independently-timed business actions. */
  phase: 'primary' | 'create' | 'finalize';
  /**
   * A6/B4 Accounting Event Ownership Rule (business-confirmed 2026-08-27/28, see CLAUDE.md's own entry
   * of the same name) — set only by `mergeAccountingEventRows()` below, only on the ONE surviving row for
   * an A6 or B4-Usance business event: the OTHER half of that event's own two Account Entries sets is
   * folded INTO this row rather than shown as a separate one, and its own `contingentAccountEntry` rides
   * along here so `AccountEntriesDialogComponent` can show BOTH sets for this single row — never present
   * on any other row shape.
   */
  linkedMovement?: BalanceMovement;
}

/**
 * Splits one BalanceMovement into one or two rows. Exactly two only for a finalized (`status !==
 * 'PENDING'`, `releasedAt` set) Sight-tenor IPLC_LC/UTILIZE — the shape `payExistingUtilize` (A4)
 * produces by finalizing an EXISTING movement later. 'create' = original submission (createdAt);
 * 'finalize' = the Release (releasedAt); `eventStatus` is the same real value on both. `releasedAt` is
 * reused for any second-actor outcome (release/reject/cancel), so a rejected/cancelled Sight arrival
 * still splits correctly.
 *
 * `eventStatus` is unconditionally `movement.status`, even on the 'create' row — must reflect the real
 * current release state, never a Create-time snapshot. Scoped to `eventStatus` only; the separately
 * frozen Balance Snapshot (`selectEvent()`'s `ownSnapshot`) is unrelated and unaffected.
 */
/** Module-level function, not a private method — LookUpPanelService's Event Timeline reuses the exact same split rather than a second copy. */
/** Shared with `InquireEventsService.functionFor()` below, which delegates to this — named distinctly to avoid an unqualified call silently shadowing that same-named method. */
export function functionForEvent(event: InquiredEvent): TransactionFunction | undefined {
  const { movement, contract } = event;
  return (
    (event.phase === 'finalize' ? payExistingUtilizeFunctionFor(contract.instrumentType, contract.tenorType) : undefined) ??
    resolveFunctionForMovement(contract.instrumentType, movement.movementType)
  );
}

/**
 * F1 — plain-text Function-column fallback for `EXPIRE`/`REVERSAL`, which `functionForEvent()` above can
 * never resolve to a real `TransactionFunction` (neither is ever human-selectable — see
 * `systemMovementLabel()`'s own doc comment). Callers check this ONLY when `functionForEvent()` itself
 * returns `undefined` — a real function match always wins.
 */
export function systemLabelForEvent(event: InquiredEvent): string | null {
  return systemMovementLabel(event.movement.movementType);
}

/**
 * A6/B4 Accounting Event Ownership Rule's own identity triple is **LC Number + Secondary Reference +
 * Event Seq, each independent** (business-confirmed 2026-08-28, "LC + 2ndary + Event Seq = Event Key
 * 各自獨立") — `sourceTransactionRef` on an `IPLC_LC/UTILIZE` (A3/A3S/A4/A6's shared record) or an
 * `EPLC_CONFIRMATION/HONOUR|ACCEPT` (B4's own primary leg) is semantically the IB/EB Number every one of
 * those functions' own `secondaryRefLabel` already calls it at INPUT time — never a free-text audit note
 * the way A2/B2's own "Amendment No./Times" (same wire field, different function, different meaning) is.
 * `secondaryReferenceForEvent()`/`primaryReferenceForEvent()` below are the two halves of one
 * reclassification: the value moves from the Reference column to the Secondary Ref. column for exactly
 * these two shapes, so the SAME IB/EB Number reads identically as "Secondary Ref." everywhere — the
 * merged A6/B4 row, Look Up's own per-tab LC/Confirmed-LC view, and (via the same UTILIZE record) A4's
 * finalize row too — rather than flipping between "Reference" and "Secondary Ref." depending on which
 * tab or row happens to carry it. Business-reported gap 2026-08-28 (Look Up's own LC Balance tab showed
 * "Reference: B01, Secondary Ref: —" for both A3 and A6's finalize row, while the Acceptance Balance tab
 * showed "Reference: —, Secondary Ref: B01" for the SAME event — same value, two different columns
 * depending on which unmerged tab a reader happened to be looking at).
 */
function isReclassifiedSecondaryRefShape(event: InquiredEvent): boolean {
  if (event.contract.instrumentType === 'IPLC_LC' && event.movement.movementType === 'UTILIZE') return true;
  if (event.contract.instrumentType === 'EPLC_CONFIRMATION' && (event.movement.movementType === 'HONOUR' || event.movement.movementType === 'ACCEPT')) return true;
  return false;
}

/**
 * Module-level function, not a private method — LookUpPanelService's own Event Timeline reuses the
 * exact same mapping rather than a second copy (user instruction 2026-08-21, "Lookup 除了 REFERENCE
 * 還要有 SECONDARY REF"). Shared with `InquireEventsService.secondaryReferenceFor()` below, which
 * delegates to this — named distinctly to avoid an unqualified call silently shadowing that same-named
 * method, same convention as `functionForEvent()` above.
 *
 * EPLC_EXAMINATION's own `ibNumber` (B3's EB Number) is the same value B4's Honour/Accept later carries
 * as `sourceTransactionRef` — shown bare ("E01") so a reader can connect the two rows. SHGT's `sgNumber`
 * is shown prefixed ("SG G01"). IPLC_ACCEPTANCE/EPLC_ACCEPTANCE's own `ibNumber` completes the A6/B4
 * Accounting Event Ownership Rule's own identity triple (LC Number + Secondary Reference + the
 * finalizing function's own eventSeq, see CLAUDE.md) — added 2026-08-28, business-reported gap (a merged
 * A6/B4 row's own Secondary Ref. column read "—" even though the identity requires it). A3/A3S/A4's own
 * `IPLC_LC/UTILIZE` and B4's own `EPLC_CONFIRMATION/HONOUR|ACCEPT` are reclassified here too (see
 * `isReclassifiedSecondaryRefShape()`'s own doc comment above) — every other instrumentType returns "—".
 */
export function secondaryReferenceForEvent(event: InquiredEvent): string {
  if (event.contract.instrumentType === 'EPLC_EXAMINATION') return event.contract.naturalKey.ibNumber ?? '—';
  if (event.contract.instrumentType === 'SHGT') return event.contract.naturalKey.sgNumber ? `SG ${event.contract.naturalKey.sgNumber}` : '—';
  if (event.contract.instrumentType === 'IPLC_ACCEPTANCE' || event.contract.instrumentType === 'EPLC_ACCEPTANCE') return event.contract.naturalKey.ibNumber ?? '—';
  if (isReclassifiedSecondaryRefShape(event)) return event.movement.sourceTransactionRef ?? '—';
  return '—';
}

/**
 * The Reference column's own counterpart to `secondaryReferenceForEvent()` above — every call site that
 * renders a raw `event.movement.sourceTransactionRef` as "Reference" must route through this instead, so
 * the two columns can never both claim the same IB/EB Number (see `isReclassifiedSecondaryRefShape()`'s
 * own doc comment). Every other movementType (A2/B2's own Amendment No., etc.) is unaffected — still
 * shown here exactly as before.
 */
export function primaryReferenceForEvent(event: InquiredEvent): string {
  if (isReclassifiedSecondaryRefShape(event)) return '—';
  return event.movement.sourceTransactionRef ?? '—';
}

/**
 * Business-directed 2026-08-26 ("APPROVED/EARMARKED events are ordered by Checker Release/Approval Time
 * ... PENDING/EARMARKING events ... should use Maker Submit Time until a Checker Release/Approval Time
 * becomes available") — see `analysis/Balance-Component-InquireEvents-EventSeq-Effective-Order-
 * Proposal-zh.md` §6 for the full engineering feasibility assessment this implements (display-layer
 * only; `eventSeq`/idempotency/Balance calculation engine deliberately untouched). A second-actor time
 * (`releasedAt`, covering RELEASED/REJECTED per `toEventRows()`'s own established convention) always wins
 * once present; a still-PENDING/EARMARKING movement (not set) falls back to `createdAt`.
 *
 * `cancelledAt` deliberately dropped from this fallback chain (2026-08-27, analysis/Balance-Component-
 * FixPending-DeletePending-Proposal-zh.md §11, "Deleted Pending records 不應顯示在 INQUIRE EVENTS 中") —
 * `toEventRows()`'s own CANCELLED early-return below means this function is never actually called for a
 * CANCELLED movement any more, so a `cancelledAt` branch here would be unreachable dead code. It was
 * live code (and covered by a dedicated test) between the 2026-08-26 event-ordering feature and this
 * fix; superseded, not a mistake in that earlier change — that feature only became true dead weight once
 * CANCELLED movements stopped reaching this function at all.
 */
function effectiveEventTime(movement: BalanceMovement): string {
  return movement.releasedAt ?? movement.createdAt;
}

export function toEventRows(movement: BalanceMovement, contract: BalanceContract): InquiredEvent[] {
  // Inquire Events / Inquire Delete Pending rule (business-directed 2026-08-27, analysis/Balance-
  // Component-FixPending-DeletePending-Proposal-zh.md §11) — "Deleted Pending records 不應顯示在
  // INQUIRE EVENTS 中，包括 A1–A11 與 B1–B7" / "INQUIRE EVENTS 只顯示正常的交易生命週期事件". A CANCELLED
  // movement (Delete Pending / Maker EC — the ONLY action that ever sets this status, statusTransition.ts's
  // own CANCEL entries) never contributed to Confirmed/Available Balance in the first place (both only
  // ever sum RELEASED/PENDING respectively), so hiding it here is display-layer only, same posture as
  // every other change to this shared function. Shared by BOTH InquireEventsService and
  // LookUpPanelService's own Event Timeline (both call this via movementsOf$()) — filtering here, not at
  // either call site, keeps the two screens unable to disagree, matching this function's own established
  // "one shared rule" convention. Every Delete Pending that ever happened is still fully queryable via the
  // dedicated Inquire Delete Pending screen (delete_pending_audit), which reads independently of this list.
  if (movement.status === 'CANCELLED') return [];
  // Bug fixed (reviewer-reported, "A1 ISSUE S05 -> APPROVE. A3 S05 B01 -> Submit, Checker Reject 為何出現
  // 兩筆REJECTED?"): reject() shares the same releasedAt/releasedBy columns as release() (disambiguated
  // only by `status`), so `status !== 'PENDING'` wrongly matched a REJECTED movement too — a rejected
  // Sight Document Arrival was split into a phantom 'create'/'finalize' pair (two REJECTED rows) even
  // though A4 never finalized it. Narrowed to the actual RELEASED transition this split exists for.
  //
  // Widened 2026-08-27 (business-confirmed, "A6 必須... 承接並正式轉換 A3/A3S 的 EARMARKED exposure") from
  // Sight-only to any explicit tenorType — the backend's own `isUtilizeFinalize` (balanceService.ts's
  // release()) now genuinely finalizes a Usance UTILIZE too, via A6's own cascade (see
  // BalanceService.applyReleaseSideEffects()'s own doc comment), so this display-layer split must
  // recognize BOTH: A4 (Sight) directly, A6 (Usance) via the SAME underlying UTILIZE record.
  // `contract.tenorType != null` (not `=== 'SIGHT'`) — still excludes a legacy null-tenorType contract
  // (the Business Case Runner's own older Import Case #1/#3/#4/#5), which release a UTILIZE directly
  // with no maker-submit/finalize concept at all and must keep showing a single plain row, unaffected.
  //
  // Widened AGAIN 2026-08-27 (business-confirmed, "A6 Submit 時應該出兩套帳 但現在只出一套帳(ACCEPTANCE)")
  // from `status === 'RELEASED'` to `!!movement.makerSubmittedAt` — the split must happen the MOMENT
  // A4/A6 is Maker-Submitted, not only once genuinely Released: `MakerQueueService.isFinalizing()`/
  // `MakerPanelComponent.resultPhase` already key off `makerSubmittedAt` alone (a still-PENDING A4/A6
  // attempt already shows "PENDING" there, not "EARMARKED") — this was the one remaining call site still
  // gated on RELEASED, so the LC's own Event Timeline/Account Entries kept showing only A3/A3S's own
  // EARMARKED row (and, for A6, only the separate Acceptance's own PENDING entry) until Checker Approval,
  // instead of splitting into A3(EARMARKED, historical)/A4-or-A6(PENDING, in progress) immediately —
  // i.e. only ONE set of books instead of two. `makerSubmittedAt` also survives a Checker Reject (reject()
  // never clears it, same "unified logic" ruling `MakerQueueService.isWithdrawMakerSubmitCase()` already
  // relies on), so a rejected A4/A6 attempt correctly still splits and shows REJECTED on the finalize row
  // — consistent with Maker Queue, which already shows a rejected A4/A6 row the same way. The ORIGINAL
  // "S05 -> APPROVE... Checker Reject 為何出現兩筆REJECTED" bug this replaced is naturally still avoided:
  // that was A3's OWN Checker rejecting A3 itself, before A4/A6 was ever attempted — makerSubmittedAt is
  // never set in that case, so this condition is still false and no split happens.
  const isFinalizing = contract.instrumentType === 'IPLC_LC' && movement.movementType === 'UTILIZE' && contract.tenorType != null && !!movement.makerSubmittedAt;
  if (!isFinalizing) {
    return [{ movement, contract, eventTime: effectiveEventTime(movement), eventStatus: movement.status, phase: 'primary' }];
  }
  // A4's own pre-existing 'create'/'finalize' split (now also A6's) is a narrower, already-proven
  // instance of the SAME rule above — 'finalize' already used releasedAt before this change, unaffected;
  // 'create' deliberately stays createdAt (the real historical A3/A3S submission moment), not
  // effectiveEventTime(), as this assessment's own §6.4 concluded. The finalize row's own eventTime now
  // falls back to `makerSubmittedAt` while still PENDING (no releasedAt exists yet) — the real moment
  // THIS business event (A4/A6's own Submit) happened.
  return [
    { movement, contract, eventTime: movement.createdAt, eventStatus: movement.status, phase: 'create' },
    { movement, contract, eventTime: (movement.releasedAt ?? movement.makerSubmittedAt ?? movement.createdAt) as string, eventStatus: movement.status, phase: 'finalize' },
  ];
}

/**
 * **A6/B4 Accounting Event Ownership Rule** (business-confirmed 2026-08-27/28 — do not re-litigate
 * without new information; see CLAUDE.md's own entry of the same name for the full write-up).
 *
 * A Usance Acceptance business event — Import A3/A3S → A6, or Export B3 → B4 — always posts TWO
 * genuinely separate, independently-postable Account Entries sets ("LC Balance Entries" / "Confirmed
 * LC Balance Entries" and "Acceptance Entries") once both reach APPROVED. Both sets belong to the SAME
 * transaction event and must be identified together (LC/Confirmed-LC Number + Secondary Reference +
 * the FINALIZING function's own `eventSeq` — A6's or B4's, never A3/A3S's/B3's own historical
 * `eventSeq`, merely because the earmark originated there) — never split across two rows that could
 * read as two unrelated events, and never captioned as if they still belonged to the originating A3/A3S
 * earmark. This function is the single mechanical enforcement of that rule for every merged, all-ledgers
 * event list (`InquireEventsService.loadEvents()`; `LookUpPanelService`'s own Export LC tab, which
 * already merges `EPLC_EXAMINATION` the same way) — it folds the SECOND record of each such pair into
 * the FIRST as a new `linkedMovement` field, so the Account Entries dialog can show both sets while only
 * one row (identified by the finalizing function's own facts) ever renders.
 *
 * Two structurally different correlation mechanisms, same outcome:
 * - **A6 (Usance)** — `referencedTransactionId`. The referenced A3/A3S `IPLC_LC/UTILIZE`'s own
 *   'finalize' row (`toEventRows()`, keyed off `makerSubmittedAt`) is folded INTO A6's own separate
 *   `IPLC_ACCEPTANCE/CREATE` row (the finalizing function's own new record — kept as the surviving row's
 *   own identity, per the Ownership Rule above).
 * - **B4 (Usance ACCEPT)** — `businessEventId`. Both legs of B4's own compound Submit
 *   (`confirmationAcceptWithReceivable`) share one `businessEventId`: the primary `EPLC_CONFIRMATION/
 *   ACCEPT` (finalizing the root Confirmed LC's own exposure — B3/`EPLC_EXAMINATION` never carried a
 *   contingentAccountEntry of its own to begin with, "MEMO_ONLY", so there is nothing analogous to A3's
 *   own earmark to fold FROM here) is folded INTO the secondary `EPLC_ACCEPTANCE/CREATE` (the finalizing
 *   function's own new Acceptance liability record — again kept as the surviving row, matching A6's own
 *   choice of which side owns the merged identity). B4's own Sight leg (HONOUR) is structurally
 *   unaffected — its own second leg (`EPLC_DUE_FROM_ISSUING_BANK`) is an ON_BALANCE_ASSET instrument,
 *   already outside `deriveContingentAccountEntry()`'s own scope (returns `null`), so there is no second
 *   contingent set to merge.
 *
 * Deliberately NOT extended to A3S (`documentArrivalWithSg`) or B5 (`acceptanceSettleWithReceivable`) —
 * their own two legs are genuinely TWO DIFFERENT real economic events submitted together (redeeming an
 * SG vs. utilizing the LC; settling an Acceptance vs. its own on-balance-sheet receivable), not one
 * exposure transforming into two simultaneously-visible views of itself — merging those would misrepresent
 * two real events as one. The `phase === 'finalize'`-vs-`referencedTransactionId` branch above already
 * naturally excludes A4 (no separate referencing movement exists to fold into) and B3/every other
 * function (never produces a matching pair at all).
 */
export function mergeAccountingEventRows(events: readonly InquiredEvent[]): InquiredEvent[] {
  const cascadeOwnerOf = (finalizeMovementId: string): InquiredEvent | undefined =>
    events.find((e) => e.movement.referencedTransactionId === finalizeMovementId);
  const isConfirmationAccept = (e: InquiredEvent) => e.contract.instrumentType === 'EPLC_CONFIRMATION' && e.movement.movementType === 'ACCEPT';
  const isAcceptanceCreate = (e: InquiredEvent) => e.contract.instrumentType === 'EPLC_ACCEPTANCE' && e.movement.movementType === 'CREATE';
  const b4PartnerOf = (event: InquiredEvent): InquiredEvent | undefined => {
    if (!isConfirmationAccept(event) || !event.movement.businessEventId) return undefined;
    return events.find((e) => isAcceptanceCreate(e) && e.movement.businessEventId === event.movement.businessEventId);
  };

  return events
    .filter((event) => {
      if (event.phase === 'finalize' && cascadeOwnerOf(event.movement.movementId)) return false; // A6's own shape
      if (isConfirmationAccept(event) && b4PartnerOf(event)) return false; // B4's own shape
      return true;
    })
    .map((event) => {
      const linkedFinalize = events.find((e) => e.phase === 'finalize' && event.movement.referencedTransactionId === e.movement.movementId);
      if (linkedFinalize) return { ...event, linkedMovement: linkedFinalize.movement };
      if (isAcceptanceCreate(event) && event.movement.businessEventId) {
        const linkedAccept = events.find((e) => isConfirmationAccept(e) && e.movement.businessEventId === event.movement.businessEventId);
        if (linkedAccept) return { ...event, linkedMovement: linkedAccept.movement };
      }
      return event;
    });
}

/** One contract's movements, flattened via toEventRows() — the shared base both loadEvents() and LookUpPanelService's Export Confirmed LC merge build on. */
export function movementsOf$(api: BalanceComponentApiService, contract: BalanceContract): Observable<InquiredEvent[]> {
  return api.listMovements(contract.balanceContractId).pipe(
    map((movements) => movements.flatMap((movement) => toEventRows(movement, contract))),
    catchError(() => of([] as InquiredEvent[])),
  );
}

/**
 * Every movement under every contract of the given instrumentType matching lcNumber. Used by loadEvents()
 * (merged timeline) and by LookUpPanelService's LC tab for Export Confirmed LC (EPLC_EXAMINATION only) —
 * B3 is MEMO_ONLY with no dedicated Balance Tab, so its movements live on separate per-EB-Number
 * contracts the Confirmed LC's own timeline would otherwise miss.
 */
export function childMovementsOf$(api: BalanceComponentApiService, instrumentType: InstrumentType, lcNumber: string): Observable<InquiredEvent[]> {
  return api.catalog(instrumentType, undefined, undefined, 1, 50, lcNumber).pipe(
    switchMap((page) => (page.items.length ? forkJoin(page.items.map((c) => movementsOf$(api, c))) : of([] as InquiredEvent[][]))),
    map((groups) => groups.flat()),
    catchError(() => of([] as InquiredEvent[])),
  );
}

/** One row of the LC Master Records Index — side-agnostic, selected by `InquireEventsService.side`. */
export interface LcIndexRow {
  contract: BalanceContract;
  currency: string;
  /** Human label ("Sight"/"Seller's Usance"/"Buyer's Usance"/Export's "Usance") — see tenorTypeLabel(). */
  tenorType: string;
  /** Face amount (Design doc §3.3/§6.2) — see deriveLcAmount(). */
  lcAmount: string;
  availableBalance: string;
  status: string;
  lastEventAt: string | null;
  /**
   * User-requested 2026-08-22 ("Highlight LC Close Event", extended to the Index — "U03 應該是CLOSING狀態").
   * True only while a `movementType === 'CLOSE'` root movement is genuinely still PENDING — `status` itself
   * stays ACTIVE the whole time (ContractStatus only flips to CLOSED at Release), so this is the Index's
   * own signal to show CLOSING instead of a plain ACTIVE that looks identical to any unrelated LC.
   * Deliberately re-derived from `root` fresh on every load rather than cached — if the Checker later
   * REJECTs that CLOSE (user-confirmed follow-up, same day), the movement's own status is no longer
   * PENDING, this naturally becomes false again next load, and the row correctly reverts to plain ACTIVE
   * with no special-casing needed for the reject path.
   */
  closingPending: boolean;
}

/**
 * Client-side mirror of the microservice's dead (never-wired) computeFaceAmount() — no API field exists
 * to read this from. Sums RELEASED face-amount movements across the root contract's own rows.
 * - IPLC_LC/EPLC_LC: ISSUE(+)/AMEND_INCREASE(+)/AMEND_DECREASE(-), amount always positive.
 * - EPLC_CONFIRMATION: ISSUE(+)/AMEND — no Increase/Decrease split; direction is the SIGN of `amount`
 *   itself, summed as-is.
 *
 * Deliberate simplification: plain JS `Number`, not decimal.js (this app has no such dependency) —
 * acceptable since this is DISPLAY-ONLY, never fed into any balance-affecting calculation.
 */
function deriveLcAmount(rootEvents: readonly InquiredEvent[]): string {
  const total = rootEvents.reduce((sum, e) => {
    if (e.eventStatus !== 'RELEASED') return sum;
    const amount = Number(e.movement.amount);
    if (!Number.isFinite(amount)) return sum;
    switch (e.movement.movementType) {
      case 'ISSUE':
      case 'AMEND_INCREASE':
        return sum + amount;
      case 'AMEND_DECREASE':
        return sum - amount;
      case 'AMEND':
        // EPLC_CONFIRMATION only — already signed, add as-is.
        return sum + amount;
      default:
        return sum;
    }
  }, 0);
  return String(total);
}

/**
 * Inquire Delete Pending's own "LC Amount" (business-directed 2026-08-29, "比較USER FRIENDLY") — the
 * typed/input face amount of the contract's own root/creating movement (`ISSUE`), unconditional on
 * status. `deriveLcAmount()` above is RELEASED-only, correct for Inquire Events (reflects confirmed
 * exposure) but wrong for Delete Pending's own catalog: its whole point is a transaction that was
 * CANCELLED before ever being released, so the RELEASED-only figure is always `"0"` there — telling a
 * reviewer nothing about what was actually typed. A contract has exactly one creating movement
 * (`ISSUE`, for both IPLC_LC/EPLC_LC and EPLC_CONFIRMATION) — its own `amount` is genuinely what the
 * Maker typed. Falls back to `"0"` only if no ISSUE is found at all (should not happen in practice —
 * every contract this catalog lists was created by one).
 */
function deriveLcInputAmount(rootMovements: readonly BalanceMovement[]): string {
  return rootMovements.find((m) => m.movementType === 'ISSUE')?.amount ?? '0';
}

/**
 * One catalog row's own Face Amount/Available Balance/Last Event Date (+ closingPending) — module-level,
 * not a private method, so `InquireDeletePendingService`'s own LC Catalog step (via
 * `LcCatalogIndexService`'s `decorate` hook) can share this exact computation instead of duplicating it
 * (SOLID/DRY, business-directed 2026-08-27 — "應與 INQUIRE EVENTS 保持一致" extends to reusing the same
 * Face Amount/Last Event Date figures, not just the same navigation shape). Inquire Delete Pending's own
 * template only displays a subset of this shape's fields (LC Number/Tenor Type/Currency/LC Amount/Last
 * Event Date/Time — no Available Balance/Status/closingPending) — cheaper to share one computation than
 * maintain two overlapping ones for a screen that just ignores the fields it doesn't need.
 *
 * `amountSource` (business-directed 2026-08-29, "比較USER FRIENDLY") — the one field whose semantics
 * genuinely diverge between the two callers: `'released'` (default, InquireEventsService's own catalog)
 * sums only confirmed/RELEASED face amount via `deriveLcAmount()`; `'input'`
 * (InquireDeletePendingService) shows the typed/input amount via `deriveLcInputAmount()` instead, since
 * a Delete Pending row's whole point is a transaction cancelled before ever being released — the
 * RELEASED-only figure is always `"0"` there.
 */
export function computeLcIndexRow(
  api: BalanceComponentApiService,
  contract: BalanceContract,
  side: 'IMPORT' | 'EXPORT',
  amountSource: 'released' | 'input' = 'released',
): Observable<LcIndexRow> {
  const childTypes = childInstrumentTypesOf(contract.instrumentType);
  return forkJoin({
    snapshot: api.getSnapshot(contract.balanceContractId).pipe(catchError(() => of(null))),
    rootMovements: api.listMovements(contract.balanceContractId).pipe(catchError(() => of([] as BalanceMovement[]))),
    children: childTypes.length
      ? forkJoin(childTypes.map((childType) => childMovementsOf$(api, childType, contract.naturalKey.lcNumber)))
      : of([] as InquiredEvent[][]),
  }).pipe(
    map(({ snapshot, rootMovements, children }) => {
      const root = rootMovements.flatMap((movement) => toEventRows(movement, contract));
      const allEvents = [...root, ...children.flat()];
      const displayLastEventAt = allEvents.length
        ? allEvents.reduce((latest, e) => (new Date(e.eventTime).getTime() > new Date(latest).getTime() ? e.eventTime : latest), allEvents[0].eventTime)
        : null;
      // Inquire Delete Pending's own LC Catalog (via this same shared function) passes contracts whose
      // ONLY activity is a CANCELLED root movement — toEventRows() deliberately excludes CANCELLED from
      // the true Event Timeline (see its own doc comment), which would otherwise leave `root`/`allEvents`
      // empty and Last Event Date/Time blank even though a real Delete Pending action clearly happened.
      // Falls back to the raw movement list's own timestamp (never filtered by toEventRows()) so this
      // column is never blank for a contract this specific catalog exists to surface. A no-op for every
      // OTHER caller (InquireEventsService's own catalog never passes a CANCELLED contract to begin with).
      const rawLastEventAt = rootMovements.length
        ? rootMovements.reduce((latest: string, m) => {
            const t = m.cancelledAt ?? m.releasedAt ?? m.createdAt;
            return new Date(t).getTime() > new Date(latest).getTime() ? t : latest;
          }, rootMovements[0]!.cancelledAt ?? rootMovements[0]!.releasedAt ?? rootMovements[0]!.createdAt)
        : null;
      const lastEventAt =
        displayLastEventAt && rawLastEventAt
          ? new Date(displayLastEventAt).getTime() >= new Date(rawLastEventAt).getTime()
            ? displayLastEventAt
            : rawLastEventAt
          : (displayLastEventAt ?? rawLastEventAt);
      // A10/B6 Close is always a ROOT-level movement (see closeEligibility.ts — only IPLC_LC/EPLC_LC/
      // EPLC_CONFIRMATION are eligible) — checking `root` alone, not `allEvents`, is correct and cheaper.
      const closingPending = root.some((e) => e.movement.movementType === 'CLOSE' && e.eventStatus === 'PENDING');
      return {
        contract,
        currency: contract.currency,
        tenorType: tenorTypeLabel(contract.tenorType, side),
        lcAmount: amountSource === 'input' ? deriveLcInputAmount(rootMovements) : deriveLcAmount(root),
        availableBalance: snapshot ? snapshot.availableBalance : '—',
        status: contract.status,
        lastEventAt,
        closingPending,
      };
    }),
  );
}

/** One Balance Tab (LC/Confirmed LC, Acceptance, or Shipping Guarantee) — see InquireEventsService's own doc comment. */
export interface EventBalanceTab {
  key: 'LC' | 'ACCEPTANCE' | 'SG';
  /** Static per-side tab-strip label, e.g. "LC Balance" — never includes the LC Number. */
  label: string;
  /** "{label} — LC {lc}[/ SG {sg}]". */
  title: string;
  snapshot: BalanceSnapshot | null;
  /** movement.balanceBefore/balanceAfter — set only when `snapshot` is the event's own ledger, never a redirected parent (see selectEvent()). */
  impact: { before: string | null | undefined; after: string | null | undefined } | null;
}

/**
 * Facade over BalanceComponentApiService + the function registry + buildFields() — same role
 * LookUpPanelService plays, and a plain class for the same reason: a real child component's
 * @ViewChild/@Input-@Output wiring can't resolve under this project's no-TestBed test convention.
 *
 * Reuses existing HTTP methods, buildFields() (wrapped read-only via toReadOnlyFields()), and the
 * function registry as a Strategy table via resolveFunctionForMovement() — introduces only two new
 * behaviors: merging an LC's own child-ledger movements into one timeline, and reconstructing a
 * historical movement's original screen.
 *
 * Scope: root is always IPLC_LC or EPLC_CONFIRMATION; children come from childInstrumentTypesOf()
 * (inverts PARENT_INSTRUMENT_OPTIONS). The three ON_BALANCE_ASSET instrumentTypes are out of Balance
 * Component's contingent-only scope and never returned as children.
 *
 * **Balance Tabs**: up to 3 — LC/Confirmed LC (always), Acceptance (Usance only), SG (Import only) —
 * gated by product type/tenor, mirroring `LookUpPanelService.lookupIsUsanceLc`/`lookupHasSg`. A child
 * tab populates when the event belongs to it, OR when exactly one such child exists under the LC even
 * for a root-level event. Content is PERSISTED at createMovement()/release() time
 * (`acceptanceEventSnapshot`/`sgEventSnapshot`, via `BalanceService.captureSiblingSnapshots`), never
 * fetched live.
 *
 * `@Injectable()`, no `providedIn` — per-component-instance mutable state, not a singleton;
 * `TransactionBuilderComponent`'s own `providers: [InquireEventsService, ...]` gives each component
 * instance its own copy (see `LookUpPanelService` for why a missing `providers` array breaks this live).
 */
@Injectable()
export class InquireEventsService {
  constructor(private readonly api: BalanceComponentApiService) {}

  side: 'IMPORT' | 'EXPORT' = 'IMPORT';
  lcNumber = '';
  searching = false;
  searchError: string | null = null;
  rootContract: BalanceContract | null = null;

  /** Every Event under the searched LC — root plus every child ledger's own movements — sorted by createdAt (true Event Date/Time), not the per-contract eventSeq. */
  events: InquiredEvent[] = [];
  eventsLoading = false;

  /** Client-side windowing over the already-loaded, sorted `events` array — not a re-fetch per page; loadEvents() already merges everything into memory at once. */
  readonly eventsPaging = new PagedListState(10);

  /** The current page's own slice of `events` — the template iterates this instead of `events` directly. */
  get pagedEvents(): InquiredEvent[] {
    const start = (this.eventsPaging.page - 1) * this.eventsPaging.pageSize;
    return this.events.slice(start, start + this.eventsPaging.pageSize);
  }

  prevEventsPage(): void {
    const target = this.eventsPaging.prevTarget();
    if (target) this.eventsPaging.page = target;
  }

  nextEventsPage(): void {
    const target = this.eventsPaging.nextTarget();
    if (target) this.eventsPaging.page = target;
  }

  /** 'INDEX' — paginated browse of every LC on the current side, shown before any LC is picked. 'EVENTS' — the single-LC merged timeline after selectLcFromIndex(). search()/lcNumber are retired from the UI but kept for display/tests. */
  indexView: 'INDEX' | 'EVENTS' = 'INDEX';
  /** Server-paginated (unlike eventsPaging above, which windows an already-fully-loaded array) — each page/search change re-fetches via loadIndex(). */
  readonly indexPaging = new PagedListState(10);
  indexRows: LcIndexRow[] = [];
  /** Index's own filter/search box — substring match via catalog()'s `q` param, applied server-side across all records. */
  indexSearch = '';
  indexLoading = false;
  indexError: string | null = null;

  /** Side-aware entity label for the Index's own heading/hint text. */
  get indexEntityLabel(): string {
    return this.side === 'IMPORT' ? 'Import LC' : 'Export Confirmed LC';
  }

  selectedEvent: InquiredEvent | null = null;
  /** Null when resolveFunctionForMovement() found no match (e.g. legacy data) — the read-only screen still renders, using buildFields()'s own selectedFunction-null fallback path rather than guessing. */
  selectedEventFunction: TransactionFunction | null = null;
  selectedEventFields: FormlyFieldConfig[] = [];
  selectedEventModel: BuilderModel = {};
  /** A fresh, throwaway FormGroup per selection — Formly requires one; nothing is ever submitted through it. */
  selectedEventForm = new FormGroup({});

  /** Up to 3 Balance Tabs, in fixed order (LC, then Acceptance if applicable, then SG if applicable) — see this class's own doc comment. */
  selectedEventTabs: EventBalanceTab[] = [];
  selectedEventTab: 'LC' | 'ACCEPTANCE' | 'SG' = 'LC';

  get activeEventTab(): EventBalanceTab | null {
    return this.selectedEventTabs.find((t) => t.key === this.selectedEventTab) ?? null;
  }

  /** A Sight LC never has an Acceptance (Design doc §7 Tenor Type Routing) — mirrors LookUpPanelService.lookupIsUsanceLc, keyed off rootContract instead of a picked lookupResult. */
  get selectedEventIsUsanceLc(): boolean {
    const contract = this.rootContract;
    if (!contract || (contract.instrumentType !== 'IPLC_LC' && contract.instrumentType !== 'EPLC_CONFIRMATION')) return false;
    return !!contract.tenorType && contract.tenorType !== 'SIGHT';
  }

  /** SG applies to any IPLC_LC regardless of tenor (unlike Acceptance) — Import only. Mirrors LookUpPanelService.lookupHasSg. */
  get selectedEventHasSg(): boolean {
    return this.rootContract?.instrumentType === 'IPLC_LC';
  }

  selectSide(side: 'IMPORT' | 'EXPORT'): void {
    this.side = side;
    this.lcNumber = '';
    this.clearResults();
    // Auto-populates its own Index on selection.
    this.indexView = 'INDEX';
    this.indexSearch = '';
    this.loadIndex(1);
  }

  private clearResults(): void {
    this.searchError = null;
    this.rootContract = null;
    this.events = [];
    this.eventsPaging.reset();
    this.closeEvent();
  }

  closeEvent(): void {
    this.selectedEvent = null;
    this.selectedEventFunction = null;
    this.selectedEventFields = [];
    this.selectedEventModel = {};
    this.selectedEventForm = new FormGroup({});
    this.selectedEventTabs = [];
    this.selectedEventTab = 'LC';
  }

  selectEventTab(tab: 'LC' | 'ACCEPTANCE' | 'SG'): void {
    this.selectedEventTab = tab;
  }

  /** Delegates to the same `secondaryReferenceForEvent()` free function `LookUpPanelService.secondaryReferenceFor()` uses, so both screens resolve the Secondary Ref. column identically by construction. */
  secondaryReferenceFor(event: InquiredEvent): string {
    return secondaryReferenceForEvent(event);
  }

  /** Delegates to the same `primaryReferenceForEvent()` free function `LookUpPanelService.primaryReferenceFor()` uses — the Reference column's own counterpart to `secondaryReferenceFor()` above. */
  primaryReferenceFor(event: InquiredEvent): string {
    return primaryReferenceForEvent(event);
  }

  search(): void {
    this.clearResults();
    const lcNumber = this.lcNumber.trim();
    if (!lcNumber) return;
    this.searching = true;
    this.api.resolveContract(defaultLcInstrumentTypeForSide(this.side), { lcNumber }).subscribe({
      next: (contract) => {
        this.searching = false;
        this.rootContract = contract;
        this.loadEvents(contract);
      },
      error: (err) => {
        this.searching = false;
        this.searchError = describeApiError(err);
      },
    });
  }

  /** Root's movements plus every child ledger's. No outer error handler — movementsOf$()/childMovementsOf$() already catch their own errors and always emit. */
  private loadEvents(root: BalanceContract): void {
    this.eventsLoading = true;
    const childTypes = childInstrumentTypesOf(root.instrumentType);
    forkJoin([movementsOf$(this.api, root), ...childTypes.map((childType) => childMovementsOf$(this.api, childType, root.naturalKey.lcNumber))]).subscribe(
      (groups) => {
        this.eventsLoading = false;
        this.events = mergeAccountingEventRows(groups.flat()).sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
        this.eventsPaging.total = this.events.length;
        this.eventsPaging.page = 1;
      },
    );
  }

  /**
   * One page of the current side's catalog, then per row fans out Available Balance + events
   * (movementsOf$/childMovementsOf$) to derive `lcAmount`/`lastEventAt`. No `status`/`requireIssueReleased`
   * filter — this is an inquiry browse, every status is legitimate to look up, EXCEPT CANCELLED
   * (`excludeCancelled: true`, business-reported gap 2026-08-27) — a contract whose root ISSUE was
   * Delete-Pending'd never had any real Released event by construction, so listing it here is pure noise;
   * its own Delete Pending history is fully queryable via the dedicated Inquire Delete Pending screen
   * instead. See `BalanceComponentApiService.catalog()`'s own `excludeCancelled` doc comment.
   */
  loadIndex(page: number = this.indexPaging.page): void {
    this.indexLoading = true;
    this.indexError = null;
    this.api
      .catalog(defaultLcInstrumentTypeForSide(this.side), undefined, this.indexSearch.trim() || undefined, page, this.indexPaging.pageSize, undefined, undefined, undefined, true)
      .subscribe({
        next: (result) => {
          this.indexPaging.total = result.total;
          this.indexPaging.page = result.page;
          if (!result.items.length) {
            this.indexRows = [];
            this.indexLoading = false;
            return;
          }
          forkJoin(result.items.map((contract) => computeLcIndexRow(this.api, contract, this.side))).subscribe((rows) => {
            this.indexRows = rows;
            this.indexLoading = false;
          });
        },
        error: (err) => {
          this.indexLoading = false;
          this.indexError = describeApiError(err);
          this.indexRows = [];
          this.indexPaging.total = 0;
        },
      });
  }

  /** Resets to page 1 and re-fetches — the LC Number Search/Filter box's own Search button and Enter key. */
  searchIndex(): void {
    this.loadIndex(1);
  }

  prevIndexPage(): void {
    const target = this.indexPaging.prevTarget();
    if (target) this.loadIndex(target);
  }

  nextIndexPage(): void {
    const target = this.indexPaging.nextTarget();
    if (target) this.loadIndex(target);
  }

  /** Drill-down from an already-resolved Index row — skips the redundant resolveContract() round trip. Leaves `indexRows`/`indexPaging`/`indexSearch` untouched so backToIndex() restores the same Page/Search/Sorting state. */
  selectLcFromIndex(contract: BalanceContract): void {
    this.clearResults();
    this.lcNumber = contract.naturalKey.lcNumber;
    this.rootContract = contract;
    this.indexView = 'EVENTS';
    this.loadEvents(contract);
  }

  /** Returns to the Index — `indexRows`/`indexPaging`/`indexSearch` are untouched (never cleared by selectLcFromIndex()/clearResults() above), so this alone is what preserves Page/Search/Sorting across the round trip. */
  backToIndex(): void {
    this.indexView = 'INDEX';
  }

  /**
   * Resolves the producing function (Strategy lookup) and reconstructs its original screen via the same
   * buildFields() the live form uses, forced read-only. tolerancePct/tenorType/tenorDays come from the
   * event's own contract; amount/currency/movementType/etc. from the movement.
   *
   * Balance Tabs read directly off the already-loaded movement (see class doc comment) — LC tab:
   * `eventSnapshot` if root, else `rootEventSnapshot`. Acceptance/SG tab: `eventSnapshot` if own child,
   * else the persisted sibling snapshot. `impact` attaches only alongside the event's own ledger tab.
   * Legacy fallback (getBalanceAsOfMovement()) applies only to that one tab, only when its snapshot is
   * null.
   *
   * `phase`: a 'finalize' row resolves via payExistingUtilizeFunctionFor() (not the generic lookup, which
   * would always return A3) so "View" correctly shows A4 vs A3. `impact` is the same real value on both
   * rows — a 'create' row only exists for an already-finalized movement. The LC tab's own snapshot also
   * reads `finalizeEventSnapshot` on a 'finalize' row (falling back to `eventSnapshot`), so the 'create'
   * row stays frozen at A3's original figures.
   */
  /** Same per-phase resolution selectEvent() uses, extracted so the merged Events table can show it per row without clicking through to "View". Undefined for legacy data with no matching function. */
  functionFor(event: InquiredEvent): TransactionFunction | undefined {
    return functionForEvent(event);
  }

  /** F1 — plain-text Function-column fallback for a row functionFor() can't resolve (EXPIRE/REVERSAL) — see systemLabelForEvent()'s own doc comment. Null for every other unresolved case (e.g. legacy data), same as before. */
  systemLabelFor(event: InquiredEvent): string | null {
    return systemLabelForEvent(event);
  }

  selectEvent(event: InquiredEvent): void {
    this.selectedEvent = event;
    const { movement, contract } = event;
    const fn = this.functionFor(event) ?? null;
    this.selectedEventFunction = fn;

    // Generic Requirement (reviewer-reported 2026-08-26, "Original Transaction Screen Must Display All
    // Saved Fields") — reconstructOriginalModel() is exhaustive over every BuilderModel key by
    // construction (see its own doc comment in builder-fields.ts); this replaced an earlier hand-picked
    // field list here that silently dropped expiryDate (fixed same day) and would have kept dropping any
    // future field the same way.
    const model: BuilderModel = reconstructOriginalModel(movement, contract);
    this.selectedEventModel = model;

    const ctx: BuilderFieldsContext = {
      model,
      selectedFunction: fn,
      selectedPayMovement: null,
      selectedContract: contract,
      selectedContractSnapshot: null,
      selectedParent: null,
      dynamicSecondaryRefLabel: fn?.secondaryRefLabel ?? (movement.sourceTransactionRef ? 'Reference No.' : null),
    };
    this.selectedEventFields = toReadOnlyFields(buildFields(ctx));
    this.selectedEventForm = new FormGroup({});

    const isRootEvent = contract.instrumentType === this.rootContract?.instrumentType;
    const isAcceptanceEvent = contract.instrumentType === 'IPLC_ACCEPTANCE' || contract.instrumentType === 'EPLC_ACCEPTANCE';
    const isSgEvent = contract.instrumentType === 'SHGT';
    // Real before/after on both rows — a 'create' row only exists for an already-finalized movement.
    const ownImpact = { before: movement.balanceBefore, after: movement.balanceAfter };
    // 'finalize' reads finalizeEventSnapshot (falls back to eventSnapshot pre-migration); 'create'/'primary' read eventSnapshot directly.
    const ownSnapshot = event.phase === 'finalize' ? (movement.finalizeEventSnapshot ?? movement.eventSnapshot ?? null) : (movement.eventSnapshot ?? null);
    // Same finalize/create split as ownSnapshot, applied to the SIBLING snapshots.
    const siblingAcceptanceSnapshot =
      event.phase === 'finalize'
        ? (movement.finalizeAcceptanceEventSnapshot ?? movement.acceptanceEventSnapshot ?? null)
        : (movement.acceptanceEventSnapshot ?? null);
    const siblingSgSnapshot =
      event.phase === 'finalize' ? (movement.finalizeSgEventSnapshot ?? movement.sgEventSnapshot ?? null) : (movement.sgEventSnapshot ?? null);
    const lcNumber = this.rootContract?.naturalKey.lcNumber ?? this.lcNumber;
    const rootLabel = this.rootContract ? (BALANCE_SNAPSHOT_LABEL[this.rootContract.instrumentType] ?? this.rootContract.instrumentType) : 'Balance';

    const tabs: EventBalanceTab[] = [
      {
        key: 'LC',
        label: rootLabel,
        title: `${rootLabel} — LC ${lcNumber}`,
        snapshot: isRootEvent ? ownSnapshot : (movement.rootEventSnapshot ?? null),
        impact: isRootEvent ? ownImpact : null,
      },
    ];
    if (this.selectedEventIsUsanceLc) {
      const acceptanceLabel = this.side === 'IMPORT' ? 'Acceptance Balance' : 'Confirmed LC Acceptance Balance';
      const suffix = isAcceptanceEvent && contract.naturalKey.ibNumber ? ` / IB ${contract.naturalKey.ibNumber}` : '';
      tabs.push({
        key: 'ACCEPTANCE',
        label: acceptanceLabel,
        title: `${acceptanceLabel} — LC ${lcNumber}${suffix}`,
        snapshot: isAcceptanceEvent ? ownSnapshot : siblingAcceptanceSnapshot,
        impact: isAcceptanceEvent ? ownImpact : null,
      });
    }
    if (this.selectedEventHasSg) {
      const suffix = isSgEvent && contract.naturalKey.sgNumber ? ` / SG ${contract.naturalKey.sgNumber}` : '';
      tabs.push({
        key: 'SG',
        label: 'Shipping Guarantee Balance',
        title: `Shipping Guarantee Balance — LC ${lcNumber}${suffix}`,
        snapshot: isSgEvent ? ownSnapshot : siblingSgSnapshot,
        impact: isSgEvent ? ownImpact : null,
      });
    }
    this.selectedEventTabs = tabs;
    this.selectedEventTab = isSgEvent ? 'SG' : isAcceptanceEvent ? 'ACCEPTANCE' : 'LC';

    if (!ownSnapshot) {
      const ownTabKey: 'LC' | 'ACCEPTANCE' | 'SG' = isSgEvent ? 'SG' : isAcceptanceEvent ? 'ACCEPTANCE' : 'LC';
      this.api.getBalanceAsOfMovement(movement.movementId).subscribe({
        next: (snapshot) => this.applyFallbackSnapshot(event, ownTabKey, snapshot),
        error: () => {},
      });
    }
  }

  /** Guards against a stale async fallback response landing after the user has already selected a different Event. */
  private applyFallbackSnapshot(forEvent: InquiredEvent, tabKey: 'LC' | 'ACCEPTANCE' | 'SG', snapshot: BalanceSnapshot): void {
    if (this.selectedEvent !== forEvent) return;
    const tab = this.selectedEventTabs.find((t) => t.key === tabKey);
    if (tab) tab.snapshot = snapshot;
  }
}
