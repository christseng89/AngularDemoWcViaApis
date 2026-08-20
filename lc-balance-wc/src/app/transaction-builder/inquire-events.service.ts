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
  tenorTypeLabel,
} from './balance-component.model';
import { BuilderFieldsContext, buildFields, toReadOnlyFields } from './builder-fields';
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
    (event.phase === 'finalize' ? payExistingUtilizeFunctionFor(contract.instrumentType) : undefined) ??
    resolveFunctionForMovement(contract.instrumentType, movement.movementType)
  );
}

export function toEventRows(movement: BalanceMovement, contract: BalanceContract): InquiredEvent[] {
  const isFinalizedSightUtilize =
    contract.instrumentType === 'IPLC_LC' &&
    movement.movementType === 'UTILIZE' &&
    contract.tenorType === 'SIGHT' &&
    movement.status !== 'PENDING' &&
    !!movement.releasedAt;
  if (!isFinalizedSightUtilize) {
    return [{ movement, contract, eventTime: movement.createdAt, eventStatus: movement.status, phase: 'primary' }];
  }
  return [
    { movement, contract, eventTime: movement.createdAt, eventStatus: movement.status, phase: 'create' },
    { movement, contract, eventTime: movement.releasedAt as string, eventStatus: movement.status, phase: 'finalize' },
  ];
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

  /**
   * EPLC_EXAMINATION's own `ibNumber` (B3's EB Number) is the same value B4's Honour/Accept later
   * carries as `sourceTransactionRef` — shown bare ("E01") so a reader can connect the two rows. SHGT's
   * `sgNumber` is shown prefixed ("SG G01"). Every other instrumentType returns "—".
   */
  secondaryReferenceFor(event: InquiredEvent): string {
    if (event.contract.instrumentType === 'EPLC_EXAMINATION') return event.contract.naturalKey.ibNumber ?? '—';
    if (event.contract.instrumentType === 'SHGT') return event.contract.naturalKey.sgNumber ? `SG ${event.contract.naturalKey.sgNumber}` : '—';
    return '—';
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
        this.events = groups.flat().sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
        this.eventsPaging.total = this.events.length;
        this.eventsPaging.page = 1;
      },
    );
  }

  /**
   * One page of the current side's catalog, then per row fans out Available Balance + events
   * (movementsOf$/childMovementsOf$) to derive `lcAmount`/`lastEventAt`. No `status`/`requireIssueReleased`
   * filter — this is an inquiry browse, every status is legitimate to look up.
   */
  loadIndex(page: number = this.indexPaging.page): void {
    this.indexLoading = true;
    this.indexError = null;
    this.api.catalog(defaultLcInstrumentTypeForSide(this.side), undefined, this.indexSearch.trim() || undefined, page, this.indexPaging.pageSize).subscribe({
      next: (result) => {
        this.indexPaging.total = result.total;
        this.indexPaging.page = result.page;
        if (!result.items.length) {
          this.indexRows = [];
          this.indexLoading = false;
          return;
        }
        forkJoin(result.items.map((contract) => this.loadIndexRow(contract))).subscribe((rows) => {
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

  private loadIndexRow(contract: BalanceContract): Observable<LcIndexRow> {
    const childTypes = childInstrumentTypesOf(contract.instrumentType);
    return forkJoin({
      snapshot: this.api.getSnapshot(contract.balanceContractId).pipe(catchError(() => of(null))),
      root: movementsOf$(this.api, contract),
      children: childTypes.length
        ? forkJoin(childTypes.map((childType) => childMovementsOf$(this.api, childType, contract.naturalKey.lcNumber)))
        : of([] as InquiredEvent[][]),
    }).pipe(
      map(({ snapshot, root, children }) => {
        const allEvents = [...root, ...children.flat()];
        const lastEventAt = allEvents.length
          ? allEvents.reduce((latest, e) => (new Date(e.eventTime).getTime() > new Date(latest).getTime() ? e.eventTime : latest), allEvents[0].eventTime)
          : null;
        return {
          contract,
          currency: contract.currency,
          tenorType: tenorTypeLabel(contract.tenorType, this.side),
          lcAmount: deriveLcAmount(root),
          availableBalance: snapshot ? snapshot.availableBalance : '—',
          status: contract.status,
          lastEventAt,
        };
      }),
    );
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

  selectEvent(event: InquiredEvent): void {
    this.selectedEvent = event;
    const { movement, contract } = event;
    const fn = this.functionFor(event) ?? null;
    this.selectedEventFunction = fn;

    const model: BuilderModel = {
      instrumentType: contract.instrumentType,
      movementType: movement.movementType,
      amount: movement.amount,
      currency: movement.currency,
      tolerancePct: contract.tolerancePct ?? undefined,
      eventSeq: movement.eventSeq,
      createdBy: movement.createdBy,
      secondaryRef: movement.sourceTransactionRef ?? undefined,
      tenorType: contract.tenorType ?? undefined,
      tenorDays: contract.tenorDays ?? undefined,
    };
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
