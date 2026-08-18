import { BalanceComponentApiService, BalanceContract, BalanceSnapshot } from './balance-component-api.service';
import { InstrumentType, defaultLcInstrumentTypeForSide } from './balance-component.model';
import { describeApiError } from './api-error';
import { InquiredEvent, toEventRows } from './inquire-events.service';

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
   * Event timeline (business instruction 2026-08-14) — populated alongside lookupResult, in eventSeq
   * (time) order. `InquiredEvent[]` (2026-08-18, "should use the SAME status/display logic as Inquire
   * Events"), not a raw `BalanceMovement[]` — a finalized Sight IPLC_LC/UTILIZE (A3/A3S earmarked, later
   * A4-finalized) splits into its own 'create' + 'finalize' rows via the SAME `toEventRows()` Inquire
   * Events itself uses (both rows show the movement's own real, current status — see `toEventRows()`'s
   * own doc comment), so the two screens can never disagree on what status the same underlying movement
   * shows.
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

  /** Business instruction 2026-08-14 ("two/three tabs...") — whichever tab is active supplies the Event Timeline table. */
  get activeLookupMovements(): InquiredEvent[] {
    if (this.lookupTab === 'ACCEPTANCE') return this.acceptanceMovements;
    if (this.lookupTab === 'SG') return this.sgMovements;
    return this.lookupMovements;
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
          this.loadSnapshotAndMovements(
            contract.balanceContractId,
            contract,
            (snapshot) => (this.lookupResult = { contract, snapshot }),
            (movements) => (this.lookupMovements = movements),
            (err) => (this.lookupError = describeApiError(err)),
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
   * Shared body behind this panel's three near-identical "fetch snapshot + fetch/sort movements by
   * eventSeq" pairs (Tab 1 LC, Tab 2 Acceptance, Tab 3 SG). `contract` (2026-08-18) is required by
   * `toEventRows()` (a finalized Sight IPLC_LC/UTILIZE splits into two rows — see that function's own
   * doc comment) — each of the 3 call sites already has the relevant contract on hand.
   */
  private loadSnapshotAndMovements(
    contractId: string,
    contract: BalanceContract,
    setSnapshot: (snapshot: BalanceSnapshot) => void,
    setMovements: (events: InquiredEvent[]) => void,
    onSnapshotError: (err: unknown) => void,
  ): void {
    this.api.getSnapshot(contractId).subscribe({
      next: setSnapshot,
      error: onSnapshotError,
    });
    // Event timeline, in eventSeq (time) order — Design doc §8: eventSeq is strictly increasing per
    // contract; a stable sort (guaranteed since ES2019) preserves toEventRows()'s own [create, finalize]
    // ordering for the two rows a split movement produces, since both share the same eventSeq.
    this.api.listMovements(contractId).subscribe({
      next: (movements) =>
        setMovements(
          movements
            .flatMap((movement) => toEventRows(movement, contract))
            .sort((a, b) => a.movement.eventSeq - b.movement.eventSeq),
        ),
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
