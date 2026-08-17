import { FormGroup } from '@angular/forms';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';
import { BALANCE_SNAPSHOT_LABEL, InstrumentType, TransactionFunction, childInstrumentTypesOf, defaultLcInstrumentTypeForSide, resolveFunctionForMovement } from './balance-component.model';
import { BuilderFieldsContext, buildFields, toReadOnlyFields } from './builder-fields';
import { BuilderModel } from './function-policy';
import { describeApiError } from './api-error';

/**
 * Inquire Events (2026-08-17, user-requested, "使用OOD Design Patterns 新增 Inquire Events 功能") —
 * pairs a raw BalanceMovement with the BalanceContract that owns it (Adapter pattern): a movement alone
 * carries neither instrumentType nor naturalKey, both of which the merged cross-ledger timeline and the
 * read-only screen reconstruction below both need.
 */
export interface InquiredEvent {
  movement: BalanceMovement;
  contract: BalanceContract;
}

/** One Balance Tab (LC/Confirmed LC, Acceptance, or Shipping Guarantee) — see InquireEventsService's own doc comment. */
export interface EventBalanceTab {
  key: 'LC' | 'ACCEPTANCE' | 'SG';
  /** Static per-side label for the tab-strip button itself, e.g. "LC Balance" — never includes the LC Number/suffix. */
  label: string;
  /** "{label} — LC {lc}[/ SG {sg}]" — the box's own title once this tab is active. */
  title: string;
  snapshot: BalanceSnapshot | null;
  /** movement.balanceBefore/balanceAfter — set ONLY when `snapshot` is the event's own contract's own ledger, never when it's a redirected parent balance (see selectEvent()'s own doc comment). */
  impact: { before: string | null | undefined; after: string | null | undefined } | null;
}

/**
 * Facade over BalanceComponentApiService + the existing function registry + builder-fields.ts's
 * buildFields() — same role LookUpPanelService already plays for "Look Up Current Balance", and built
 * as a plain class for the exact same reason (see that file's own doc comment): a genuine child
 * component would need @ViewChild/@Input-@Output wiring this file's own test suite (constructed via
 * plain `new TransactionBuilderComponent(mockApi)`, no TestBed) can't resolve.
 *
 * Design principle (user-stated): reuse existing transaction inquiry/view screens, event data
 * retrieval logic, and accounting-entry components/services rather than duplicating logic. This service
 * introduces exactly two genuinely new pieces of behavior — merging movements across an LC's own child
 * ledgers into one chronological timeline, and resolving+reconstructing a historical movement's own
 * original screen — and reuses everything else: BalanceComponentApiService.resolveContract/catalog/
 * listMovements/getBalanceAsOfMovement (no new HTTP methods), buildFields() (builder-fields.ts,
 * unchanged, wrapped by the new toReadOnlyFields() Decorator there), and IMPORT_FUNCTIONS/
 * EXPORT_FUNCTIONS as a Strategy table via the new resolveFunctionForMovement() (balance-component.
 * model.ts). The Account Entries half of the requirement is not implemented here at all — the
 * component calls its own existing openAccountEntryDialog(event.movement) directly, reusing
 * accountEntryDialogMovement/the existing dialog template verbatim.
 *
 * Scope, matching the user's own wording ("適用於 Import LC 及 Confirmed LC"): the root LC is always
 * IPLC_LC (Import) or EPLC_CONFIRMATION (Export Confirmed) — defaultLcInstrumentTypeForSide(), shared
 * with LookUpPanelService.resetForSide(). Child ledgers are discovered via childInstrumentTypesOf(),
 * which inverts the existing PARENT_INSTRUMENT_OPTIONS map — for IPLC_LC that's IPLC_ACCEPTANCE/SHGT;
 * for EPLC_CONFIRMATION that's EPLC_ACCEPTANCE/EPLC_EXAMINATION. The three ON_BALANCE_ASSET
 * instrumentTypes (EPLC_DUE_FROM_ISSUING_BANK/EPLC_ACCEPTANCE_REIMB_RECEIVABLE/
 * EPLC_EXPORT_BILLS_DISCOUNTED) are out of Balance Component's own "只負責 Contingent Liability" scope
 * (same boundary contingentAccountEntry already enforces) and so are correctly excluded from this
 * timeline too — childInstrumentTypesOf() never returns them, since PARENT_INSTRUMENT_OPTIONS never
 * names EPLC_CONFIRMATION as their parent.
 *
 * 2026-08-17, third revision same day — **Balance Tabs**, precisely specified by the user after two
 * earlier passes (a per-sibling "Closing Snapshot" design, then a single merged "Event Snapshot" box)
 * each proved incomplete: up to 3 tabs — LC/Confirmed LC (always), Acceptance (Usance tenor only),
 * Shipping Guarantee (Import only, any tenor) — gated purely by the root LC's own product type/tenor,
 * mirroring `LookUpPanelService.lookupIsUsanceLc`/`lookupHasSg` exactly (`selectedEventIsUsanceLc`/
 * `selectedEventHasSg` below — same rule, reused rather than reinvented). Confirmed via AskUserQuestion:
 * a child tab (Acceptance/SG) is only ever POPULATED when the selected Event belongs to that specific
 * child; the LC tab is always populated (the event's own contract's own eventSnapshot when the event IS
 * the root, otherwise its rootEventSnapshot — see BalanceMovement's own doc comment on both fields).
 * Business instruction, final framing: "不複雜 就是交易處理時 Look Up Current Balance 的SNAPSHOT
 * (PENDING OR APPROVED) SAVED TO DB == EVENT BALANCE SNAPSHOT" — each tab's content is exactly what Look
 * Up Current Balance would show for that same contract if queried live at that moment; no synthetic
 * decoration beyond the pre-existing Confirmed Balance before→after (`impact`, from
 * movement.balanceBefore/balanceAfter — unrelated to this feature, confirmed wanted earlier this
 * session), which only ever applies to a tab showing the event's own ledger, never a redirected parent.
 *
 * 2026-08-17, fourth revision same day — live example (LC S02's 3rd event: a plain A3 Document Arrival
 * UTILIZE with no direct SG movement, SG G01 already existing on the LC) surfaced that "only POPULATED
 * when the selected Event belongs to that specific child" (above) was too narrow: a root-level event
 * still needs the Acceptance/SG tab populated whenever exactly one such child exists under the LC — the
 * Maker already sees both balances together at input time (A3's own sufficiency check nets the SG's
 * exposure into Tight Available Balance), so Inquire Events should too ("就是交易當時LC所有的BALANCE的
 * 拍照存檔" — a snapshot of ALL the LC family's balances at transaction time, saved to DB). Confirmed via
 * AskUserQuestion, twice: first that this is the CURRENT balance (not a historical "as of this event"
 * cross-contract computation), then — correcting an initial live-fetch implementation — that it must be
 * PERSISTED at createMovement()/release() time (`movement.acceptanceEventSnapshot`/`sgEventSnapshot`,
 * captured server-side by `BalanceService.captureSiblingSnapshots` whenever exactly one candidate
 * exists), not fetched live when later viewed — consistent with every other field this class reads.
 */
export class InquireEventsService {
  constructor(private readonly api: BalanceComponentApiService) {}

  side: 'IMPORT' | 'EXPORT' = 'IMPORT';
  lcNumber = '';
  searching = false;
  searchError: string | null = null;
  rootContract: BalanceContract | null = null;

  /** Every Event under the searched LC — root contract plus every child ledger's own movements — sorted by createdAt (true Event Date/Time), not the per-contract-scoped eventSeq. */
  events: InquiredEvent[] = [];
  eventsLoading = false;

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

  /** A Sight LC never has an Acceptance (Design doc §7 Tenor Type Routing) — mirrors LookUpPanelService.lookupIsUsanceLc exactly, keyed off rootContract instead of a picked lookupResult. */
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
  }

  private clearResults(): void {
    this.searchError = null;
    this.rootContract = null;
    this.events = [];
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
   * 2026-08-17, Trade Finance lifecycle/audit-trail business instruction ("EPLC_EXAMINATION should carry
   * E01/E02 as the Secondary Reference so that each Examination event can be clearly linked to its
   * subsequent Honour/Acceptance event") — EPLC_EXAMINATION's own natural key (`ibNumber`, B3's own "EB
   * Number" field) IS the exact same value B4's own Honour/Accept later carries as its own
   * `sourceTransactionRef` (B4's `secondaryRefLabel: 'EB Number'`, carried-and-protected from the picked
   * Present Docs record — see balance-component.model.ts's own B4 doc comment) — surfacing it here as a
   * "Secondary Ref." column lets a reader visually connect "Examination E01" to "Honour E01" in the same
   * merged timeline, without cross-referencing anything.
   *
   * Extended same day for SHGT ("the corresponding Shipping Guarantee Number (SG Number) should be
   * displayed so the user can identify which Shipping Guarantee the event belongs to") — same purpose,
   * SHGT's own natural key (`sgNumber`, A8's own "SG Number" field) prefixed "SG " per the business's own
   * worked example ("SG G01"), unlike EPLC_EXAMINATION's bare "E01" — each type's own display format
   * follows its own literal example rather than an imposed cross-type convention. Every other
   * instrumentType still returns "—" — either its own identity is just the LC Number (root), it's
   * already surfaced once a LATER event's own Reference column refers back to it (as for
   * EPLC_EXAMINATION → HONOUR), or it hasn't been asked for yet (Acceptance's own IB Number).
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

  /**
   * Root's own movements, plus every child ledger's — same "catalog by lcNumber, then listMovements()
   * per candidate" shape loadUnderLookupCandidates()/loadSgsForArrival() (look-up-panel.service.ts)
   * already use, reused here rather than re-derived. No outer error handler: every source observable
   * below (movementsOf()/childMovementsOf()) already catches its own errors and always emits a value,
   * so the combined forkJoin can never itself error.
   */
  private loadEvents(root: BalanceContract): void {
    this.eventsLoading = true;
    const childTypes = childInstrumentTypesOf(root.instrumentType);
    forkJoin([this.movementsOf(root), ...childTypes.map((childType) => this.childMovementsOf(childType, root.naturalKey.lcNumber))]).subscribe((groups) => {
      this.eventsLoading = false;
      this.events = groups.flat().sort((a, b) => new Date(a.movement.createdAt).getTime() - new Date(b.movement.createdAt).getTime());
    });
  }

  private movementsOf(contract: BalanceContract): Observable<InquiredEvent[]> {
    return this.api.listMovements(contract.balanceContractId).pipe(
      map((movements) => movements.map((movement) => ({ movement, contract }))),
      catchError(() => of([] as InquiredEvent[])),
    );
  }

  private childMovementsOf(instrumentType: InstrumentType, lcNumber: string): Observable<InquiredEvent[]> {
    return this.api.catalog(instrumentType, undefined, undefined, 1, 50, lcNumber).pipe(
      switchMap((page) => (page.items.length ? forkJoin(page.items.map((c) => this.movementsOf(c))) : of([] as InquiredEvent[][]))),
      map((groups) => groups.flat()),
      catchError(() => of([] as InquiredEvent[])),
    );
  }

  /**
   * Resolves which function produced this event (resolveFunctionForMovement — Strategy table lookup)
   * and reconstructs its original screen data via the SAME buildFields() the live Maker form uses,
   * decorated read-only (toReadOnlyFields()). tolerancePct/tenorType/tenorDays are read from the
   * event's own CONTRACT (they're contract-level, not per-movement, in the underlying data model) —
   * amount/currency/movementType/eventSeq/createdBy/sourceTransactionRef come from the movement itself.
   * selectedPayMovement/selectedContractSnapshot/selectedParent are deliberately left null — those only
   * ever affect buildFields()'s own cosmetic label wording (e.g. "carried from the Document Arrival,
   * protected"), never which fields exist or their values, and every field is forced read-only
   * regardless via toReadOnlyFields().
   *
   * Balance Tabs (see this class's own doc comment): builds up to 3 tabs, each reading directly off the
   * already-loaded movement — zero extra network calls except the legacy-data fallback below.
   * - LC tab: `movement.eventSnapshot` when the event IS the root, else `movement.rootEventSnapshot`.
   * - Acceptance/SG tab: `movement.eventSnapshot` when the event belongs to that specific child; else
   *   `movement.acceptanceEventSnapshot`/`movement.sgEventSnapshot` — the one unambiguous sibling's own
   *   CURRENT balance, captured server-side at createMovement()/release() time (2026-08-17, "就是交易
   *   當時LC所有的BALANCE的拍照存檔" — business-confirmed live example: LC S02's 3rd event, a plain A3
   *   Document Arrival UTILIZE with no direct SG movement, still needs SG G01's own balance shown; then
   *   explicitly confirmed via AskUserQuestion that this must be PERSISTED at transaction time, not a
   *   live fetch when later viewed — see BalanceMovement.acceptanceEventSnapshot/sgEventSnapshot's own
   *   doc comments and BalanceService.captureSiblingSnapshots on the microservice side).
   * `impact` (movement.balanceBefore/balanceAfter) is attached ONLY alongside a tab showing
   * `movement.eventSnapshot` (this movement's own ledger) — never alongside a sibling/redirected
   * snapshot, where a different contract's own before/after would be meaningless. Legacy-data fallback
   * (api.getBalanceAsOfMovement()) applies only to the ONE tab matching the event's own ledger, only
   * when its eventSnapshot is null (a movement created before that field existed) — the LC/Acceptance/SG
   * sibling fields have no live-fallback equivalent for such pre-migration rows; they simply stay empty.
   */
  selectEvent(event: InquiredEvent): void {
    this.selectedEvent = event;
    const { movement, contract } = event;
    const fn = resolveFunctionForMovement(contract.instrumentType, movement.movementType) ?? null;
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
    const ownImpact = { before: movement.balanceBefore, after: movement.balanceAfter };
    const lcNumber = this.rootContract?.naturalKey.lcNumber ?? this.lcNumber;
    const rootLabel = this.rootContract ? (BALANCE_SNAPSHOT_LABEL[this.rootContract.instrumentType] ?? this.rootContract.instrumentType) : 'Balance';

    const tabs: EventBalanceTab[] = [
      {
        key: 'LC',
        label: rootLabel,
        title: `${rootLabel} — LC ${lcNumber}`,
        snapshot: isRootEvent ? movement.eventSnapshot ?? null : (movement.rootEventSnapshot ?? null),
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
        snapshot: isAcceptanceEvent ? (movement.eventSnapshot ?? null) : (movement.acceptanceEventSnapshot ?? null),
        impact: isAcceptanceEvent ? ownImpact : null,
      });
    }
    if (this.selectedEventHasSg) {
      const suffix = isSgEvent && contract.naturalKey.sgNumber ? ` / SG ${contract.naturalKey.sgNumber}` : '';
      tabs.push({
        key: 'SG',
        label: 'Shipping Guarantee Balance',
        title: `Shipping Guarantee Balance — LC ${lcNumber}${suffix}`,
        snapshot: isSgEvent ? (movement.eventSnapshot ?? null) : (movement.sgEventSnapshot ?? null),
        impact: isSgEvent ? ownImpact : null,
      });
    }
    this.selectedEventTabs = tabs;
    this.selectedEventTab = isSgEvent ? 'SG' : isAcceptanceEvent ? 'ACCEPTANCE' : 'LC';

    if (!movement.eventSnapshot) {
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
