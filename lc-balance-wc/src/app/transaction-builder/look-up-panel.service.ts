import { Injectable } from '@angular/core';
import { Observable, forkJoin } from 'rxjs';
import { BalanceComponentApiService, BalanceContract, BalanceSnapshot } from './balance-component-api.service';
import { InstrumentType, TransactionFunction, defaultLcInstrumentTypeForSide } from './balance-component.model';
import { describeApiError } from './api-error';
import { InquiredEvent, childMovementsOf$, functionForEvent, mergeAccountingEventRows, movementsOf$, primaryReferenceForEvent, secondaryReferenceForEvent, systemLabelForEvent } from './inquire-events.service';
import { PagedListState } from './paged-list-state';
import type { PendingAmendmentDisplay } from './balance-snapshot-box.component';
import { amendmentDirection, resultingTolerancePct } from './tolerance-change';

/**
 * Owns the "Look Up Current Balance" panel's own search criteria, results (LC/Acceptance/SG tabs), and
 * orchestration logic — a read-only balance/movement viewer, independent of the Maker/Checker
 * submit-release lifecycle it sits alongside.
 *
 * Deliberately a plain class with no template, not a `@Component` — a real child component would need
 * `@ViewChild`/`@Input`-`@Output()` wiring, but this codebase's tests construct
 * `TransactionBuilderComponent` via plain `new TransactionBuilderComponent(mockApi)`, no TestBed, so
 * `@ViewChild` would never resolve. Exposed as a public `readonly lookUp` field the template binds to
 * directly instead.
 *
 * `@Injectable()`, no `providedIn: 'root'` — genuinely per-component-instance mutable state; a
 * root-scoped singleton would share `lookupResult` etc. across every `TransactionBuilderComponent`
 * instance app-wide. Registered as a component-scoped provider on `TransactionBuilderComponent`'s own
 * `@Component({ providers: [...] })`; the constructor's own default value still serves the ~90 tests
 * that construct this component directly, bypassing Angular's compiled factory entirely.
 *
 * `onBeforeLookup` is a call-time parameter on `runLookup()`/`syncFrom()`, not a constructor callback —
 * a constructor-time closure over the component's own `this` would need the component to inject itself
 * into this service's factory provider, a circular-DI trap (`NG0200`).
 */
@Injectable()
export class LookUpPanelService {
  constructor(private readonly api: BalanceComponentApiService) {}

  lookup = { instrumentType: 'IPLC_LC' as InstrumentType, lcNumber: '', ibNumber: '', sgNumber: '' };
  lookupResult: { contract: BalanceContract; snapshot: BalanceSnapshot } | null = null;
  lookupError: string | null = null;

  /**
   * Event timeline, in true Event Date/Time order (`eventTime`, not `eventSeq` — see
   * `loadSnapshotAndMovements()`). `InquiredEvent[]`, not raw `BalanceMovement[]` — uses the same
   * `toEventRows()` Inquire Events uses, so the two screens can never disagree on status. For an Export
   * Confirmed LC, also includes every B3/EPLC_EXAMINATION event merged in from its own per-E01/E02/E03
   * contracts (B3 has no dedicated Balance Tab of its own, unlike Import LC's SG/Acceptance children).
   */
  lookupMovements: InquiredEvent[] = [];

  /** For a Usance IPLC_LC/EPLC_CONFIRMATION, a second tab lists every Acceptance carved out under it — the LC's Balance and its Acceptance's Balance are separate ledgers (Design doc §7). */
  lookupTab: 'LC' | 'ACCEPTANCE' | 'SG' = 'LC';
  acceptancesUnderLookup: BalanceContract[] = [];
  selectedLookupAcceptance: BalanceContract | null = null;
  acceptanceSnapshot: BalanceSnapshot | null = null;
  acceptanceMovements: InquiredEvent[] = [];

  /** SG applies to any IPLC_LC regardless of tenor (unlike Acceptance, which is Usance-only) — Import only, EPLC_LC has no SHGT equivalent. */
  sgsUnderLookup: BalanceContract[] = [];
  selectedLookupSg: BalanceContract | null = null;
  sgSnapshot: BalanceSnapshot | null = null;
  sgMovements: InquiredEvent[] = [];

  /**
   * Whichever tab is active supplies the Event Timeline table. Also keeps `lookupMovementsPaging` in
   * sync via reference-identity tracking — placed HERE rather than in `pagedLookupMovements` because the
   * template reads this getter unconditionally every cycle but only reads `pagedLookupMovements` when
   * non-empty, so syncing only there missed a switch to a currently-empty tab (stale "Page 2/2" shown
   * under an empty table). Reference identity, not a length check, since two different tabs' timelines
   * (or two empty ones) could otherwise look "unchanged" — every fetch assigns a brand new array, so a
   * changed reference reliably means "reset the page".
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

  /** Whichever tab is active supplies the live Current Balance summary shown after the Event Timeline. */
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
   * Current Balance companion rows for every pending A2/B2 amendment on the active ledger. Keeping all
   * rows (rather than selecting the latest one) is important because one LC may legitimately carry
   * several independently referenced pending amendments.
   */
  get activeDisplayedAmendments(): readonly PendingAmendmentDisplay[] {
    const all = this.activeLookupMovements.filter((event) => ['AMEND_INCREASE', 'AMEND_DECREASE', 'AMEND'].includes(event.movement.movementType));
    const pending = all.filter((event) => event.eventStatus === 'PENDING');
    const latestReleased = [...all].reverse().find((event) => event.eventStatus === 'RELEASED');
    const displayed = pending.length ? pending : latestReleased ? [latestReleased] : [];
    return displayed.map((event) => {
        const movement = event.movement;
        let toleranceBeforePct = '0';
        for (const candidate of this.activeLookupMovements) {
          if (candidate.movement.movementId === movement.movementId && candidate.phase === event.phase) break;
          if (candidate.eventStatus !== 'RELEASED' || candidate.movement.balanceContractId !== movement.balanceContractId) continue;
          if (candidate.movement.movementType === 'ISSUE' || ['AMEND_INCREASE', 'AMEND_DECREASE', 'AMEND'].includes(candidate.movement.movementType)) {
            toleranceBeforePct = candidate.movement.tolerancePct ?? toleranceBeforePct;
          }
        }
        const balanceEffect =
          movement.movementType === 'AMEND_DECREASE' && Number(movement.ceilingAmount) !== 0
            ? movement.ceilingAmount.startsWith('-')
              ? movement.ceilingAmount.slice(1)
              : `-${movement.ceilingAmount}`
            : movement.ceilingAmount;
        const pendingResult = resultingTolerancePct(
          movement.tolerancePct ?? toleranceBeforePct,
          movement.toleranceChangePct ?? '0',
          amendmentDirection(movement.movementType, movement.toleranceChangeDirection ?? null),
        );
        return {
          reference: movement.sourceTransactionRef ?? null,
          balanceEffect,
          toleranceBeforePct,
          toleranceAfterPct: event.eventStatus === 'PENDING' && movement.toleranceChangePct != null && pendingResult.ok ? pendingResult.value : (movement.tolerancePct ?? null),
          isPending: event.eventStatus === 'PENDING',
        };
      });
  }

  /** Delegates to the same `functionForEvent()` free function `InquireEventsService.functionFor()` uses, so both screens resolve the Function badge identically by construction. */
  functionFor(event: InquiredEvent): TransactionFunction | undefined {
    return functionForEvent(event);
  }

  /** F1 — plain-text Function-column fallback for a row functionFor() can't resolve (EXPIRE/REVERSAL); delegates to the same systemLabelForEvent() free function InquireEventsService.systemLabelFor() uses. */
  systemLabelFor(event: InquiredEvent): string | null {
    return systemLabelForEvent(event);
  }

  /** Delegates to the same `secondaryReferenceForEvent()` free function `InquireEventsService.secondaryReferenceFor()` uses (user instruction 2026-08-21, "Lookup 除了 REFERENCE 還要有 SECONDARY REF"), so both screens resolve the Secondary Ref. column identically by construction. */
  secondaryReferenceFor(event: InquiredEvent): string {
    return secondaryReferenceForEvent(event);
  }

  /** Delegates to the same `primaryReferenceForEvent()` free function `InquireEventsService.primaryReferenceFor()` uses — the Reference column's own counterpart to `secondaryReferenceFor()` above. */
  primaryReferenceFor(event: InquiredEvent): string {
    return primaryReferenceForEvent(event);
  }

  /** LC Number is the one natural-key field every instrumentType always carries (Design doc §3.1), so it's always the primary label; suffixed with IB#/SG# only when drilled into that specific Acceptance/SG. */
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

  /** Side-aware balance-type label (Import "Acceptance Balance" vs. Export "Confirmed LC Acceptance Balance"), same rule InquireEventsService applies for its own Balance Tab — derived from instrumentType since this service has no separate `side` field. */
  get acceptanceBalanceLabel(): string {
    return this.lookupResult?.contract.instrumentType === 'EPLC_CONFIRMATION' ? 'Confirmed LC Acceptance Balance' : 'Acceptance Balance';
  }

  /** Switching the Import/Export tab defaults this panel's instrumentType to that side's root LC type. */
  resetForSide(side: 'IMPORT' | 'EXPORT'): void {
    this.lookup.instrumentType = defaultLcInstrumentTypeForSide(side);
    if (side === 'EXPORT') this.lookup.sgNumber = ''; // SG# is Import-only.
  }

  /**
   * Syncs this panel's fields from whatever LC the Maker/Checker side currently has in context and
   * re-runs the lookup. Called after a Submit and whenever the Checker queue is (re)displayed — not on
   * every intermediate contract pick, to avoid firing lookups mid-search (that guard stays on the caller).
   */
  syncFrom(lcNumber: string, instrumentType: InstrumentType, onBeforeLookup?: () => void): void {
    this.lookup.lcNumber = lcNumber;
    this.lookup.instrumentType = this.lcInstrumentTypeFor(instrumentType);
    this.lookup.ibNumber = '';
    this.lookup.sgNumber = '';
    this.runLookup(onBeforeLookup);
  }

  /** `onBeforeLookup` (call-time, not a constructor callback) closes any open Account Entries dialog before it replaces the Event Timeline underneath it. */
  runLookup(onBeforeLookup?: () => void): void {
    onBeforeLookup?.();
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
      .resolveContract(
        this.lookup.instrumentType,
        {
          lcNumber: this.lookup.lcNumber,
          ibNumber: this.lookup.ibNumber || null,
          sgNumber: this.lookup.sgNumber || null,
        },
        // Inquiry, not an action — a CLOSED (A10/B6) LC must still resolve here (business-reported gap
        // 2026-08-21, "CLOSE LC => Release 後出現...LOOKUP也應該看到此LC 項下所有的交易包括CLOSE EVENT").
        true,
      )
      .subscribe({
        next: (contract) => {
          // Export Confirmed LC's own B3/EPLC_EXAMINATION events have no dedicated Balance Tab, so
          // they're merged directly into Tab 1 here; Import LC's SG/Acceptance children have their own
          // tabs below and need no merge.
          this.loadSnapshotAndMovements(
            contract.balanceContractId,
            contract,
            (snapshot) => (this.lookupResult = { contract, snapshot }),
            (movements) => (this.lookupMovements = movements),
            (err) => (this.lookupError = describeApiError(err)),
            contract.instrumentType === 'EPLC_CONFIRMATION' ? ['EPLC_EXAMINATION'] : [],
          );
          // Fetch every Acceptance carved out under this LC so the second tab has something to pick from.
          const acceptanceType = this.acceptanceInstrumentTypeFor(contract.instrumentType);
          if (acceptanceType) {
            this.loadUnderLookupCandidates(
              acceptanceType,
              contract.naturalKey.lcNumber,
              (items) => (this.acceptancesUnderLookup = items),
              (contractId) => this.selectLookupAcceptance(contractId),
            );
          }
          // Every SHGT under this LC, any tenor.
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

  /** Switching tabs with only one candidate under it jumps straight to it. */
  selectLookupTab(tab: 'LC' | 'ACCEPTANCE' | 'SG'): void {
    this.lookupTab = tab;
    if (tab === 'ACCEPTANCE' && !this.selectedLookupAcceptance && this.acceptancesUnderLookup.length === 1) {
      this.selectLookupAcceptance(this.acceptancesUnderLookup[0].balanceContractId);
    }
    if (tab === 'SG' && !this.selectedLookupSg && this.sgsUnderLookup.length === 1) {
      this.selectLookupSg(this.sgsUnderLookup[0].balanceContractId);
    }
  }

  /** SG tab — loads the picked SHGT's own snapshot + Event Timeline, independent of the LC's and any Acceptance's. */
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

  /** Acceptance tab — loads the picked Acceptance's own snapshot + Event Timeline, independent of the LC's own (Tab 1's lookupResult/lookupMovements are untouched). */
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
   * Shared body behind the three "fetch snapshot + fetch/sort movements" pairs (Tab 1 LC, Tab 2
   * Acceptance, Tab 3 SG). `mergeChildTypes` merges an extra child instrumentType's own movements
   * (across every one of its own contracts under this LC Number) into the timeline, the same way
   * InquireEventsService merges every child ledger — only the LC tab passes this
   * (`['EPLC_EXAMINATION']`, Export Confirmed LC only), since B3 has no dedicated Balance Tab of its
   * own. Sorts by `eventTime`, not `eventSeq` — eventSeq is only meaningful within a single contract
   * (Design doc §8), so merging cross-contract rows by eventSeq would interleave them incorrectly.
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
      next: (groups) => setMovements(mergeAccountingEventRows(groups.flat()).sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime())),
      error: () => setMovements([]),
    });
  }

  /**
   * Shared body behind runLookup()'s two "fetch candidates under this LC, auto-pick if exactly one"
   * catalog calls (Acceptance tab / SG tab).
   *
   * Business-confirmed 2026-08-27 ("Look Up Current Balance 各式 BALANCES 如果交易是 CANCELLED 不須顯示
   * 出來") — `excludeCancelled: true`, same flag `InquireEventsService.loadIndex()` already uses. Only
   * became reachable today: A6/A8/B3's own `markCancelled()` widening means a Delete-Pending'd child
   * SG/Acceptance contract can now genuinely reach `CANCELLED` (previously only a root A1/B1 ever could)
   * — without this, such a contract still showed up as its own selectable tab here, offering an all-zero
   * balance (Confirmed/Available never summed a CANCELLED contract's own sole, cancelled movement) for a
   * transaction that no longer exists in any business sense.
   */
  private loadUnderLookupCandidates(
    instrumentType: InstrumentType,
    lcNumber: string,
    setCandidates: (items: BalanceContract[]) => void,
    autoSelect: (contractId: string) => void,
  ): void {
    this.api.catalog(instrumentType, undefined, undefined, 1, 50, lcNumber, undefined, undefined, true).subscribe({
      next: (result) => {
        setCandidates(result.items);
        if (result.items.length === 1) autoSelect(result.items[0].balanceContractId);
      },
      error: () => setCandidates([]),
    });
  }

  private acceptanceInstrumentTypeFor(lcInstrumentType: InstrumentType): InstrumentType | null {
    if (lcInstrumentType === 'IPLC_LC') return 'IPLC_ACCEPTANCE';
    if (lcInstrumentType === 'EPLC_CONFIRMATION') return 'EPLC_ACCEPTANCE';
    return null;
  }

  /** This panel is an LC-level view (Acceptance/SG as sub-tabs) — a child instrumentType still looks up its PARENT LC's contract, not itself. EPLC_EXAMINATION (B3) is MEMO_ONLY and never itself worth looking up. */
  private lcInstrumentTypeFor(instrumentType: InstrumentType): InstrumentType {
    if (instrumentType === 'IPLC_ACCEPTANCE' || instrumentType === 'SHGT') return 'IPLC_LC';
    if (instrumentType === 'EPLC_ACCEPTANCE') return 'EPLC_CONFIRMATION';
    if (instrumentType === 'EPLC_EXAMINATION') return 'EPLC_CONFIRMATION';
    return instrumentType;
  }
}
