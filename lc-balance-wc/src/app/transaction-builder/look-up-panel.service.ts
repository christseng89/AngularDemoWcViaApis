import { Observable, forkJoin } from 'rxjs';
import { BalanceComponentApiService, BalanceContract, BalanceSnapshot } from './balance-component-api.service';
import { InstrumentType, TransactionFunction, defaultLcInstrumentTypeForSide } from './balance-component.model';
import { describeApiError } from './api-error';
import { InquiredEvent, childMovementsOf$, functionForEvent, movementsOf$ } from './inquire-events.service';
import { PagedListState } from './paged-list-state';

/**
 * BAL-003 (7th same-day OOD/SOLID pass, "Look Up panel"): the "Look Up Current Balance" panel's own
 * search criteria, results (LC/Acceptance/SG tabs), and orchestration logic — previously ~200 lines of
 * `TransactionBuilderComponent`'s own state fields and methods (`lookup`/`lookupResult`/`lookupTab`/
 * `runLookup()`/`selectLookupTab()`/`selectLookupAcceptance()`/`selectLookupSg()`/
 * `loadSnapshotAndMovements()`/`loadUnderLookupCandidates()`) — now owns exactly that: a read-only
 * balance/movement viewer, genuinely independent of the Maker/Checker submit-release lifecycle it sits
 * alongside on the same screen.
 *
 * Deliberately a PLAIN class, not an `@Component` with its own template — a genuine child component
 * would need `@ViewChild`/`@Input`-`@Output()` wiring to talk to the parent, but this file's own test
 * suite (`transaction-builder.component.spec.ts`/`.actions.spec.ts`) constructs
 * `TransactionBuilderComponent` via plain `new TransactionBuilderComponent(mockApi)` — no TestBed, no
 * Angular view rendering — so `@ViewChild` would never resolve in ~90 existing test assertions that read/
 * write this state directly. A plain class avoids that entirely: the component exposes it as a public
 * `readonly lookUp = new LookUpPanelService(api, ...)` field, the template binds straight to
 * `lookUp.xxx`, and existing tests only need a mechanical `comp.xxx` → `comp.lookUp.xxx` rename, not a
 * TestBed migration.
 *
 * `onBeforeLookup` (optional constructor callback) — the one piece of state this panel's own
 * `runLookup()` needs to reach OUTSIDE itself: closing any open Account Entries dialog before a fresh
 * lookup replaces the Event Timeline underneath it. The component wires this to
 * `() => (this.accountEntryDialogMovement = null)`.
 */
export class LookUpPanelService {
  constructor(
    private readonly api: BalanceComponentApiService,
    private readonly onBeforeLookup?: () => void,
  ) {}

  lookup = { instrumentType: 'IPLC_LC' as InstrumentType, lcNumber: '', ibNumber: '', sgNumber: '' };
  lookupResult: { contract: BalanceContract; snapshot: BalanceSnapshot } | null = null;
  lookupError: string | null = null;

  /**
   * Event timeline (business instruction 2026-08-14) — populated alongside lookupResult, in true Event
   * Date/Time order (`eventTime`, not `eventSeq` — see `loadSnapshotAndMovements()`'s own doc comment on
   * why, once B3/EPLC_EXAMINATION events can be merged in from a different contract entirely).
   * `InquiredEvent[]` (2026-08-18, "should use the SAME status/display logic as Inquire Events"), not a
   * raw `BalanceMovement[]` — a finalized Sight IPLC_LC/UTILIZE (A3/A3S earmarked, later A4-finalized)
   * splits into its own 'create' + 'finalize' rows via the SAME `toEventRows()` Inquire Events itself
   * uses (both rows show the movement's own real, current status — see `toEventRows()`'s own doc
   * comment), so the two screens can never disagree on what status the same underlying movement shows.
   * For an Export Confirmed LC specifically, this ALSO includes every B3/EPLC_EXAMINATION Earmark event
   * under this LC Number, merged in from their own separate per-E01/E02/E03 contracts (2026-08-18, bug
   * fix — see `loadSnapshotAndMovements()`'s own `mergeChildTypes` doc comment) — B3 has no dedicated
   * Balance Tab of its own to show them in otherwise, unlike Import LC's own SG/Acceptance children.
   */
  lookupMovements: InquiredEvent[] = [];

  /**
   * Business instruction 2026-08-14 ("`Look Up Current Balance` should be two tabs for Usance LC, one
   * for LC Balance and one for Acceptance Balance"): when the looked-up contract is an IPLC_LC/
   * EPLC_CONFIRMATION declared Usance, a second tab lists every IPLC_ACCEPTANCE/EPLC_ACCEPTANCE carved
   * out under it (one per IB Number, per A6) and lets the user pick which one's own balance/timeline to
   * view — a Usance LC's own Balance and its Acceptance's Balance are genuinely separate ledgers (Design
   * doc §7), so "the balance" is ambiguous without picking which one.
   */
  lookupTab: 'LC' | 'ACCEPTANCE' | 'SG' = 'LC';
  acceptancesUnderLookup: BalanceContract[] = [];
  selectedLookupAcceptance: BalanceContract | null = null;
  acceptanceSnapshot: BalanceSnapshot | null = null;
  acceptanceMovements: InquiredEvent[] = [];

  /**
   * Business instruction 2026-08-14 ("two tabs for Sight LC i.e. LC Balance SG Balance, for Usance LC...
   * three tabs, LC Balance, Acceptance Balance, and SG Balance") — SG applies to a Sight OR Usance
   * IPLC_LC alike (unlike Acceptance, which is Usance-only, Design doc §7), so this tab shows for any
   * IPLC_LC lookup regardless of tenor. EPLC_LC has no SHGT equivalent, so this stays Import-only.
   */
  sgsUnderLookup: BalanceContract[] = [];
  selectedLookupSg: BalanceContract | null = null;
  sgSnapshot: BalanceSnapshot | null = null;
  sgMovements: InquiredEvent[] = [];

  /**
   * Business instruction 2026-08-14 ("two/three tabs...") — whichever tab is active supplies the Event
   * Timeline table.
   *
   * UX enhancement (2026-08-19, "+ Event Timeline 使用PAGE BY PAGE PATTERN") — this getter ALSO keeps
   * `lookupMovementsPaging` (below) in sync via reference-identity tracking, deliberately placed HERE
   * rather than only inside `pagedLookupMovements`. `activeLookupMovements` is read unconditionally by the
   * template on every change-detection cycle (the `*ngIf="lookUp.activeLookupMovements.length"` table
   * wrapper AND the `.tb-hint`/"No movements yet" fallback both read it directly), while
   * `pagedLookupMovements` is read only from INSIDE that same `*ngIf` — i.e. only when the active array is
   * non-empty. A first implementation put the sync logic in `pagedLookupMovements` alone and shipped a
   * real bug, caught live: switching to a tab whose own array is currently EMPTY (e.g. the SG tab when an
   * LC has 2+ candidate SGs, so nothing auto-selects and `sgMovements` stays `[]`) meant
   * `pagedLookupMovements` was never called, so `lookupMovementsPaging` kept showing the PREVIOUS tab's
   * stale total/page ("Page 2/2 (12 total)") underneath a table that had already gone empty. Syncing here
   * instead guarantees the check runs every time the active array could possibly have changed, table
   * rendered or not.
   *
   * Deliberately NOT the same "the mutating method sets `.total`/resets `.page`" convention
   * `InquireEventsService.eventsPaging` itself uses — `InquireEventsService.events` is a single flat array
   * with exactly one mutation point (`loadEvents()`); this getter switches between THREE independent
   * arrays (`lookupMovements`/`acceptanceMovements`/`sgMovements`) across FOUR different call sites that
   * can each replace one of them (`runLookup()`'s own LC-tab fetch, `selectLookupAcceptance()`/
   * `selectLookupSg()`'s own fetches — including when auto-selected from `runLookup()` itself while the LC
   * tab is still active — and a plain `selectLookupTab()` switch with no new fetch at all, when the target
   * tab's data was already loaded earlier). Instrumenting all four by hand risks missing one (exactly the
   * class of bug this doc comment's own earlier drafting caught: `selectLookupSg()`'s auto-select path can
   * fire while `lookupTab` is still `'LC'`, so a naive "reset whenever SG movements are set" would wrongly
   * clobber the LC tab's own still-current paging). Reference-identity tracking sidesteps the whole
   * problem instead: every fetch assigns a BRAND NEW array to `lookupMovements`/`acceptanceMovements`/
   * `sgMovements` (via `groups.flat().sort(...)` in `loadSnapshotAndMovements()`), and switching tabs
   * changes which of those three references this getter returns — so simply noticing "the array reference
   * I'm windowing has changed since last read" and resetting exactly then is correct for every one of the
   * four cases at once, with no per-call-site bookkeeping to keep in sync. (A plain length comparison
   * would NOT be safe here — two different tabs' own timelines coincidentally having the same row count
   * would then wrongly look "unchanged" and carry over a stale page; an empty array is exactly this same
   * risk in miniature — length 0 both before and after a tab switch to another currently-empty tab — but
   * reference identity still correctly distinguishes them since each fetch/reset assigns its own new `[]`.)
   */
  private lastLookupMovementsRef: InquiredEvent[] | null = null;
  readonly lookupMovementsPaging = new PagedListState(10);

  get activeLookupMovements(): InquiredEvent[] {
    const events = this.lookupTab === 'ACCEPTANCE' ? this.acceptanceMovements : this.lookupTab === 'SG' ? this.sgMovements : this.lookupMovements;
    if (events !== this.lastLookupMovementsRef) {
      this.lastLookupMovementsRef = events;
      this.lookupMovementsPaging.total = events.length;
      this.lookupMovementsPaging.page = 1;
    }
    return events;
  }

  get pagedLookupMovements(): InquiredEvent[] {
    const events = this.activeLookupMovements;
    const start = (this.lookupMovementsPaging.page - 1) * this.lookupMovementsPaging.pageSize;
    return events.slice(start, start + this.lookupMovementsPaging.pageSize);
  }

  prevLookupMovementsPage(): void {
    const target = this.lookupMovementsPaging.prevTarget();
    if (target) this.lookupMovementsPaging.page = target;
  }

  nextLookupMovementsPage(): void {
    const target = this.lookupMovementsPaging.nextTarget();
    if (target) this.lookupMovementsPaging.page = target;
  }

  /** Business instruction 2026-08-14 ("don't show the JSON, start with Event Timeline") — whichever tab is active supplies the live Current Balance summary shown after the Event Timeline. */
  get activeLookupSnapshot(): BalanceSnapshot | null {
    if (this.lookupTab === 'ACCEPTANCE') return this.acceptanceSnapshot;
    if (this.lookupTab === 'SG') return this.sgSnapshot;
    return this.lookupResult?.snapshot ?? null;
  }

  get activeLookupContract(): BalanceContract | null {
    if (this.lookupTab === 'ACCEPTANCE') return this.selectedLookupAcceptance;
    if (this.lookupTab === 'SG') return this.selectedLookupSg;
    return this.lookupResult?.contract ?? null;
  }

  /**
   * Business instruction 2026-08-19 ("Look Up Current Balance → Event Timeline" gains a FUNCTION
   * column that "must use the same Function mapping as Inquire Events... Do not implement a separate
   * Function mapping") — delegates to the SAME `functionForEvent()` free function
   * `InquireEventsService.functionFor()` itself now delegates to (see that method's own doc comment),
   * so both screens resolve every event's own Function badge identically by construction, not by
   * convention.
   */
  functionFor(event: InquiredEvent): TransactionFunction | undefined {
    return functionForEvent(event);
  }

  /**
   * Business instruction 2026-08-14 ("always use the LC Number if exists") — the LC Number is the one
   * natural-key field every instrumentType always carries (Design doc §3.1's natural key table), so
   * it's always the primary label, never a UUID. Suffixed with IB#/SG# only when the active tab is
   * drilled into that specific Acceptance/SG.
   */
  get activeLookupLabel(): string {
    const lcNumber = this.lookupResult?.contract.naturalKey.lcNumber ?? this.lookup.lcNumber;
    if (this.lookupTab === 'ACCEPTANCE') {
      const ibNumber = this.selectedLookupAcceptance?.naturalKey.ibNumber;
      return ibNumber ? `LC ${lcNumber} / IB ${ibNumber}` : `LC ${lcNumber}`;
    }
    if (this.lookupTab === 'SG') {
      const sgNumber = this.selectedLookupSg?.naturalKey.sgNumber;
      return sgNumber ? `LC ${lcNumber} / SG ${sgNumber}` : `LC ${lcNumber}`;
    }
    return `LC ${lcNumber}`;
  }

  /** A Sight LC never has an Acceptance (Design doc §7 Tenor Type Routing) — that tab is only meaningful for Usance. */
  get lookupIsUsanceLc(): boolean {
    const contract = this.lookupResult?.contract;
    if (!contract || (contract.instrumentType !== 'IPLC_LC' && contract.instrumentType !== 'EPLC_CONFIRMATION')) return false;
    return !!contract.tenorType && contract.tenorType !== 'SIGHT';
  }

  /** SG applies to any IPLC_LC regardless of tenor (unlike Acceptance) — Import only. */
  get lookupHasSg(): boolean {
    return this.lookupResult?.contract.instrumentType === 'IPLC_LC';
  }

  /**
   * UX enhancement (2026-08-18, "SG Balance — Inquiry Catalog Design") — the Acceptance picker's own
   * catalog rows need a side-aware balance-type label (Import "Acceptance Balance" vs. Export "Confirmed
   * LC Acceptance Balance"), same rule InquireEventsService.selectEvent() already applies for its own
   * identically-named Balance Tab — reused via the resolved contract's own instrumentType (this service
   * has no separate `side` field of its own, unlike InquireEventsService) rather than duplicated.
   */
  get acceptanceBalanceLabel(): string {
    return this.lookupResult?.contract.instrumentType === 'EPLC_CONFIRMATION' ? 'Confirmed LC Acceptance Balance' : 'Acceptance Balance';
  }

  /**
   * Business instruction 2026-08-15 ("Look Up Current Balance... 如果選 Import LC Tab, 不用選 直接
   * Default Import LC 輸入LC Number... 如果選 Export Confirmed Tab, 不用選 直接Default Export
   * Confirmed") — switching the Import/Export tab also defaults this panel's own instrumentType to
   * that side's root LC type. Was duplicated identically in `selectFunctionSide()`/`selectFunction()`
   * before this extraction — now one shared method.
   */
  resetForSide(side: 'IMPORT' | 'EXPORT'): void {
    this.lookup.instrumentType = defaultLcInstrumentTypeForSide(side);
    // Business instruction 2026-08-15 ("Export LC LC No, EB No 沒有 SG No") — SG# is Import-only.
    if (side === 'EXPORT') this.lookup.sgNumber = '';
  }

  /**
   * Business instruction 2026-08-15 ("Look Up Current Balance should use the existing LC Number on
   * Screen... Once Maker Submit or Checker display, it will just use the LC Number instead of keyin")
   * — syncs this panel's own fields from whatever LC the Maker/Checker side currently has in context and
   * re-runs the lookup. The component calls this after a Submit and whenever the Checker queue is
   * (re)displayed — not on every intermediate contract pick while still browsing, to avoid firing
   * lookups mid-search; that guard (`contextLcNumber`/`model.instrumentType` presence) stays on the
   * component's own caller, since both concepts belong to the Maker-side selection state this panel
   * deliberately doesn't own.
   */
  syncFrom(lcNumber: string, instrumentType: InstrumentType): void {
    this.lookup.lcNumber = lcNumber;
    this.lookup.instrumentType = this.lcInstrumentTypeFor(instrumentType);
    this.lookup.ibNumber = '';
    this.lookup.sgNumber = '';
    this.runLookup();
  }

  runLookup(): void {
    this.onBeforeLookup?.();
    this.lookupError = null;
    this.lookupResult = null;
    this.lookupMovements = [];
    this.lastLookupMovementsRef = null;
    this.lookupTab = 'LC';
    this.acceptancesUnderLookup = [];
    this.selectedLookupAcceptance = null;
    this.acceptanceSnapshot = null;
    this.acceptanceMovements = [];
    this.sgsUnderLookup = [];
    this.selectedLookupSg = null;
    this.sgSnapshot = null;
    this.sgMovements = [];
    this.api
      .resolveContract(this.lookup.instrumentType, {
        lcNumber: this.lookup.lcNumber,
        ibNumber: this.lookup.ibNumber || null,
        sgNumber: this.lookup.sgNumber || null,
      })
      .subscribe({
        next: (contract) => {
          // Bug fix 2026-08-18 (see loadSnapshotAndMovements()'s own doc comment) — Export Confirmed
          // LC's own B3/EPLC_EXAMINATION Earmark events have no dedicated Balance Tab of their own, so
          // they're merged directly into the Confirmed LC's own Tab 1 Event Timeline here; Import LC's
          // own SG/Acceptance children already have dedicated tabs further below and need no such merge.
          this.loadSnapshotAndMovements(
            contract.balanceContractId,
            contract,
            (snapshot) => (this.lookupResult = { contract, snapshot }),
            (movements) => (this.lookupMovements = movements),
            (err) => (this.lookupError = describeApiError(err)),
            contract.instrumentType === 'EPLC_CONFIRMATION' ? ['EPLC_EXAMINATION'] : [],
          );
          // Business instruction 2026-08-14 ("two tabs for Usance LC, one for LC Balance and one for
          // Acceptance Balance") — fetch every Acceptance carved out under this LC so the second tab has
          // something to pick from as soon as it's a Usance-tenor LC.
          const acceptanceType = this.acceptanceInstrumentTypeFor(contract.instrumentType);
          if (acceptanceType) {
            this.loadUnderLookupCandidates(
              acceptanceType,
              contract.naturalKey.lcNumber,
              (items) => (this.acceptancesUnderLookup = items),
              (contractId) => this.selectLookupAcceptance(contractId),
            );
          }
          // Business instruction 2026-08-14 ("two tabs for Sight LC i.e. LC Balance SG Balance, for
          // Usance LC... three tabs...") — every SHGT under this LC, any tenor.
          if (contract.instrumentType === 'IPLC_LC') {
            this.loadUnderLookupCandidates(
              'SHGT',
              contract.naturalKey.lcNumber,
              (items) => (this.sgsUnderLookup = items),
              (contractId) => this.selectLookupSg(contractId),
            );
          }
        },
        error: (err) => (this.lookupError = describeApiError(err)),
      });
  }

  /** Business instruction 2026-08-14 ("two/three tabs...") — switching tabs with only one candidate under it jumps straight to it. */
  selectLookupTab(tab: 'LC' | 'ACCEPTANCE' | 'SG'): void {
    this.lookupTab = tab;
    if (tab === 'ACCEPTANCE' && !this.selectedLookupAcceptance && this.acceptancesUnderLookup.length === 1) {
      this.selectLookupAcceptance(this.acceptancesUnderLookup[0].balanceContractId);
    }
    if (tab === 'SG' && !this.selectedLookupSg && this.sgsUnderLookup.length === 1) {
      this.selectLookupSg(this.sgsUnderLookup[0].balanceContractId);
    }
  }

  /** SG tab — business instruction 2026-08-14 ("SG Balance"): loads the picked SHGT's own snapshot + Event Timeline, independent of the LC's own and any Acceptance's. */
  selectLookupSg(contractId: string): void {
    this.selectedLookupSg = this.sgsUnderLookup.find((c) => c.balanceContractId === contractId) ?? null;
    if (!this.selectedLookupSg) {
      this.sgSnapshot = null;
      this.sgMovements = [];
      return;
    }
    this.loadSnapshotAndMovements(
      this.selectedLookupSg.balanceContractId,
      this.selectedLookupSg,
      (snapshot) => (this.sgSnapshot = snapshot),
      (movements) => (this.sgMovements = movements),
      () => (this.sgSnapshot = null),
    );
  }

  /** Acceptance tab — business instruction 2026-08-14 ("one for Acceptance Balance"): loads the picked Acceptance's own snapshot + Event Timeline, independent of the LC's own (Tab 1's lookupResult/lookupMovements are untouched). */
  selectLookupAcceptance(contractId: string): void {
    this.selectedLookupAcceptance = this.acceptancesUnderLookup.find((c) => c.balanceContractId === contractId) ?? null;
    if (!this.selectedLookupAcceptance) {
      this.acceptanceSnapshot = null;
      this.acceptanceMovements = [];
      return;
    }
    this.loadSnapshotAndMovements(
      this.selectedLookupAcceptance.balanceContractId,
      this.selectedLookupAcceptance,
      (snapshot) => (this.acceptanceSnapshot = snapshot),
      (movements) => (this.acceptanceMovements = movements),
      () => (this.acceptanceSnapshot = null),
    );
  }

  /**
   * Shared body behind this panel's three near-identical "fetch snapshot + fetch/sort movements" pairs
   * (Tab 1 LC, Tab 2 Acceptance, Tab 3 SG). `contract` is required by `movementsOf$()`/`toEventRows()`
   * (a finalized Sight IPLC_LC/UTILIZE splits into two rows — see that function's own doc comment) —
   * each of the 3 call sites already has the relevant contract on hand.
   *
   * `mergeChildTypes` (2026-08-18, bug fix, reviewer-reported live — "Look Up Current Balance →
   * Event Timeline 明顯有漏資料...主要漏掉的是 B3 Present Docs / EPLC_EXAMINATION 的 Earmark Events"):
   * optional extra child instrumentTypes whose OWN movements (across every one of their own contracts
   * under this LC Number) get merged directly into this tab's own Event Timeline, exactly the way
   * InquireEventsService's own loadEvents() already merges every child ledger into its one timeline —
   * see childMovementsOf$()'s own doc comment for the full root cause. Only the LC tab's own call site
   * passes this (`['EPLC_EXAMINATION']`, Export Confirmed LC only) — B3/EPLC_EXAMINATION is MEMO_ONLY
   * with no dedicated Balance Tab of its own (unlike Import LC's own SG/Acceptance children, which
   * already have one each further below), so merging its events directly into the Confirmed LC's own
   * Tab 1 timeline is the only place they can ever be seen in this panel. The sort key switches from
   * plain `eventSeq` to `eventTime` (a real timestamp) once more than one contract can contribute rows —
   * eventSeq is only meaningful WITHIN a single contract (Design doc §8), so merging Confirmed LC events
   * with B3's own, separately-eventSeq'd Examination events by eventSeq alone would interleave them
   * incorrectly; `eventTime` is the same "true Event Date/Time" sort key InquireEventsService's own
   * merged timeline already uses, and it degrades to the exact same chronological order eventSeq gave
   * for the single-contract case (SG/Acceptance tabs, and the LC tab whenever nothing is merged in).
   */
  private loadSnapshotAndMovements(
    contractId: string,
    contract: BalanceContract,
    setSnapshot: (snapshot: BalanceSnapshot) => void,
    setMovements: (events: InquiredEvent[]) => void,
    onSnapshotError: (err: unknown) => void,
    mergeChildTypes: InstrumentType[] = [],
  ): void {
    this.api.getSnapshot(contractId).subscribe({
      next: setSnapshot,
      error: onSnapshotError,
    });
    const sources: Observable<InquiredEvent[]>[] = [
      movementsOf$(this.api, contract),
      ...mergeChildTypes.map((childType) => childMovementsOf$(this.api, childType, contract.naturalKey.lcNumber)),
    ];
    forkJoin(sources).subscribe({
      next: (groups) => setMovements(groups.flat().sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime())),
      error: () => setMovements([]),
    });
  }

  /** Shared body behind runLookup()'s two near-identical "fetch candidates under this LC, auto-pick if exactly one" catalog calls (Acceptance tab / SG tab). */
  private loadUnderLookupCandidates(
    instrumentType: InstrumentType,
    lcNumber: string,
    setCandidates: (items: BalanceContract[]) => void,
    autoSelect: (contractId: string) => void,
  ): void {
    this.api.catalog(instrumentType, undefined, undefined, 1, 50, lcNumber).subscribe({
      next: (result) => {
        setCandidates(result.items);
        if (result.items.length === 1) autoSelect(result.items[0].balanceContractId);
      },
      error: () => setCandidates([]),
    });
  }

  private acceptanceInstrumentTypeFor(lcInstrumentType: InstrumentType): InstrumentType | null {
    if (lcInstrumentType === 'IPLC_LC') return 'IPLC_ACCEPTANCE';
    // Business instruction 2026-08-15: EPLC_ACCEPTANCE's parent is now EPLC_CONFIRMATION, not EPLC_LC.
    if (lcInstrumentType === 'EPLC_CONFIRMATION') return 'EPLC_ACCEPTANCE';
    return null;
  }

  /** This panel is an LC-level view (with Acceptance/SG as sub-tabs) — a function whose own instrumentType IS a child (Acceptance/SG) still looks up its PARENT LC's own contract, not itself. */
  private lcInstrumentTypeFor(instrumentType: InstrumentType): InstrumentType {
    if (instrumentType === 'IPLC_ACCEPTANCE' || instrumentType === 'SHGT') return 'IPLC_LC';
    // Business instruction 2026-08-15: EPLC_ACCEPTANCE's parent is always EPLC_CONFIRMATION now.
    if (instrumentType === 'EPLC_ACCEPTANCE') return 'EPLC_CONFIRMATION';
    // Bug fixed 2026-08-18, reviewer-reported ("B3 Present Docs -> Submit -> Release -> Look Up Current
    // Balance" showed "No Logical Contract exists yet for this natural key"): EPLC_EXAMINATION (B3) was
    // missing from this map, so it fell through to the `return instrumentType` default below and
    // syncFrom() left lookup.instrumentType as EPLC_EXAMINATION itself — but EPLC_EXAMINATION's own
    // natural key requires ibNumber (the EB Number) too, which syncFrom() always clears to '' before
    // calling runLookup(), so resolveContract('EPLC_EXAMINATION', {lcNumber, ibNumber: null, ...}) could
    // never match anything. EPLC_EXAMINATION is MEMO_ONLY and never itself a real Balance Component
    // ledger worth looking up (same boundary contingentAccountEntry/BALANCE_SNAPSHOT_LABEL already
    // enforce) — Look Up Current Balance should show its PARENT Confirmation instead, same as every
    // other child instrumentType above.
    if (instrumentType === 'EPLC_EXAMINATION') return 'EPLC_CONFIRMATION';
    return instrumentType;
  }
}
