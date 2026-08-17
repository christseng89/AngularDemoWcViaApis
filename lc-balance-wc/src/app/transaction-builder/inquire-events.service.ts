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
 * 2026-08-17, revised same day (user-requested, "VIEW EVENT 只需 EVENT SNAPSHOT 即可"): an earlier
 * version of this feature also fetched a "Closing Snapshot" row per SIBLING ledger (Acceptance/SG under
 * the same LC), alongside a separate one-line "Balance Impact" delta. Simplified to exactly ONE snapshot
 * — the selected event's own ledger, closing balance merged with its own before/after impact — per the
 * same "avoid duplicate/redundant views" principle behind the Event List's own Account Entries button
 * removal above. Viewing a SIBLING ledger's own state is already one click away: select ITS OWN event
 * from the same merged timeline.
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
  /** "Event Snapshot — {label} — LC {lc}[/IB.../SG...]" — see selectEvent()'s own doc comment. */
  selectedEventSnapshotTitle = '';
  selectedEventSnapshot: BalanceSnapshot | null = null;

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
    this.selectedEventSnapshotTitle = '';
    this.selectedEventSnapshot = null;
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
   * Also fetches the ONE Event Snapshot this event's own ledger closed at (api.getBalanceAsOfMovement(),
   * reusing an already-existing, already-tested backend capability — see that method's own doc comment
   * for the full history) — a single, exact, same-contract point-in-time query; no cross-contract
   * cutoff ambiguity to worry about, since this is always asking about the event's own contract.
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

    this.selectedEventSnapshotTitle = this.snapshotTitleFor(event);
    this.selectedEventSnapshot = null;
    this.api.getBalanceAsOfMovement(movement.movementId).subscribe({
      next: (snapshot) => (this.selectedEventSnapshot = snapshot),
      error: () => (this.selectedEventSnapshot = null),
    });
  }

  /**
   * "Event Snapshot — {label} — LC {lc}" / "... / IB {ib}" / "... / SG {sg}" — LC/IB/SG suffix mirrors
   * LookUpPanelService.activeLookupLabel's own convention, kept independently implemented rather than
   * extracted into a shared helper: risking a behavior change to that already-shipped, already-tested
   * Look Up panel wasn't justified for a cosmetic label string.
   */
  private snapshotTitleFor(event: InquiredEvent): string {
    const label = BALANCE_SNAPSHOT_LABEL[event.contract.instrumentType] ?? event.contract.instrumentType;
    const { lcNumber, ibNumber, sgNumber } = event.contract.naturalKey;
    const suffix = ibNumber ? ` / IB ${ibNumber}` : sgNumber ? ` / SG ${sgNumber}` : '';
    return `Event Snapshot — ${label} — LC ${lcNumber}${suffix}`;
  }
}
