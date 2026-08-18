import { FormGroup } from '@angular/forms';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { BalanceComponentApiService, BalanceContract, BalanceMovement, BalanceSnapshot } from './balance-component-api.service';
import { BALANCE_SNAPSHOT_LABEL, InstrumentType, TransactionFunction, childInstrumentTypesOf, defaultLcInstrumentTypeForSide, payExistingUtilizeFunctionFor, resolveFunctionForMovement } from './balance-component.model';
import { BuilderFieldsContext, buildFields, toReadOnlyFields } from './builder-fields';
import { BuilderModel } from './function-policy';
import { describeApiError } from './api-error';
import { PagedListState } from './paged-list-state';

/**
 * Inquire Events (2026-08-17, user-requested, "使用OOD Design Patterns 新增 Inquire Events 功能") —
 * pairs a raw BalanceMovement with the BalanceContract that owns it (Adapter pattern): a movement alone
 * carries neither instrumentType nor naturalKey, both of which the merged cross-ledger timeline and the
 * read-only screen reconstruction below both need.
 *
 * Bug fixed 2026-08-18, business-reported live example — LC S01: "A1 Issue → A3 Document Arrival → A8
 * Shipping Guarantee Issue → A4 Sight Payment" is the real chronological order, but the merged timeline
 * only ever showed 3 rows (A1/A3/A8), with A4 nowhere to be found — because A4 (Sight Settlement) does
 * NOT create its own movement (`payExistingUtilize`, see balance-component.model.ts's own A4 entry): it
 * only Maker-Submits then Checker-Releases the SAME UTILIZE row A3 already created. That one row carries
 * only ONE `createdAt` (A3's own, at Document Arrival submission) — A4's own, much-later Release
 * (`releasedAt`) was invisible to the sort entirely, so the row stayed pinned at its EARLY, A3-labeled
 * position (`resolveFunctionForMovement` always resolves this (instrumentType, movementType) pair to A3,
 * the first registry match) even after A8 had already happened and A4 finalized hours later. Confirmed
 * live against the real DB (`balance-component.sqlite`): S01's own UTILIZE row —
 * `createdAt: 2026-08-17T11:30:35Z` (A3), `makerSubmittedAt: 2026-08-17T15:37:01Z` /
 * `releasedAt: 2026-08-17T15:37:08Z` (A4) — vs. S01's own SHGT ISSUE (A8) at `createdAt:
 * 2026-08-17T11:31:01Z`, sitting chronologically BETWEEN the two.
 *
 * `eventTime`/`eventStatus`/`phase` below are what fixes this: every OTHER movement in this app creates
 * a brand-new row for its own later completion (A6/B4's own compound `referencedTransactionId`
 * mechanism), so `phase` is 'primary' and `eventTime`/`eventStatus` are just the movement's own
 * `createdAt`/`status` — but A4 is the one function in the whole registry that finalizes an EXISTING
 * row instead of creating a new one, so THAT specific row is split into two InquiredEvent entries
 * sharing the same underlying `movement`, each with its own accurate position: `phase: 'create'` (A3's
 * own submission, `eventTime: movement.createdAt`) and `phase: 'finalize'` (A4's own Release,
 * `eventTime: movement.releasedAt`). `eventStatus` is `movement.status` on BOTH — see `toEventRows()`'s
 * own doc comment (settled 2026-08-18, business-mandated) for why an earlier same-day design that forced
 * the 'create' row's own status to 'PENDING' regardless of the movement's real current status was
 * reversed. See `selectEvent()`'s own doc comment for how `phase` still changes which function code (A3
 * vs A4) and which Balance SNAPSHOT (a separate, independently-frozen concept) the "View" screen shows
 * for each of the two rows.
 */
export interface InquiredEvent {
  movement: BalanceMovement;
  contract: BalanceContract;
  /** The true Event Date/Time this ROW represents — sort/display MUST use this, never movement.createdAt directly (see this file's own doc comment above). */
  eventTime: string;
  /**
   * The movement's own TRUE, CURRENT `status` — identical to `movement.status` for every phase,
   * including 'create' (2026-08-18, business-mandated — "RELEASE 是指該筆交易是否已完成 RELEASE...Status
   * 必須根據該筆交易實際的 RELEASE 狀態決定，不得...誤判為 RELEASED" — RELEASE means whether THIS
   * transaction has actually completed release; status must reflect that real fact, never a historical
   * reconstruction). Superseded an EARLIER same-day design (forcing 'PENDING' on the 'create' row for
   * "historical accuracy") once the business clarified live, reproducing LC S01's own B03 exactly, that
   * forcing a stale PENDING onto an ALREADY-RELEASED transaction's own row violates this rule outright —
   * see `toEventRows()`'s own doc comment for the full before/after.
   */
  eventStatus: BalanceMovement['status'];
  /** 'primary' — the common case, this row IS the movement's only real-world event. 'create'/'finalize' — see this file's own doc comment: A4 (Sight Settlement) finalizing an EXISTING A3/A3S row, the one case in this registry where one movement spans two materially separate, independently-timed business actions. */
  phase: 'primary' | 'create' | 'finalize';
}

/**
 * Splits one BalanceMovement into its one or two real-world event rows — see InquiredEvent's own doc
 * comment for the full "A4 Sight Payment" bug this originally fixed. Every movement produces exactly one
 * 'primary' row UNLESS it is a Sight-tenor IPLC_LC UTILIZE (A3/A3S's own Document Arrival earmark) that
 * has since been finalized (`status !== 'PENDING'`, `releasedAt` set) — the one case A4's own
 * `payExistingUtilize` flag identifies, where a LATER business action (Maker-Submit + Checker-Release)
 * completes an EXISTING movement instead of creating a new one — in which case it produces two: 'create'
 * (the original submission, at its own createdAt) and 'finalize' (the Release, at releasedAt). `phase`
 * alone is what still differs between the two — WHICH function/time each row is attributed to (A3 at
 * createdAt vs. A4 at releasedAt) — `eventStatus` is now the SAME real value on both, see below.
 * `releasedAt` is reused (not a new field) — it's set for ANY second-actor outcome on this row (release/
 * reject/cancel, see balanceService.ts's own release()/reject() — both call updateStatus() with
 * releasedAt: this.now()), not release specifically, so a Sight Document Arrival that was instead
 * rejected/cancelled still correctly splits into its own 'create' + 'finalize' pair.
 *
 * **`eventStatus` is `movement.status` unconditionally, including for the 'create' row — settled
 * 2026-08-18, business-mandated, reversing this SAME function's own earlier same-day design.** The
 * ORIGINAL version of this fix forced the 'create' row's own `eventStatus` to `'PENDING'` regardless of
 * the movement's real current status, reasoning "historically accurate — Confirmed Balance genuinely
 * hadn't moved yet at that earlier moment." The business found this live, reproducing LC S01's own B03
 * exactly (a fully-RELEASED, A4-finalized Document Arrival whose OWN 'create' row still displayed
 * "EARMARKING" — i.e. "not yet released" — days after it genuinely had been), and ruled it out flatly:
 * "RELEASE 是指該筆交易是否已完成 RELEASE...Status 必須根據該筆交易實際的 RELEASE 狀態決定，不得因為
 * Event 已建立、Balance 已更新或其他條件而誤判為 RELEASED" (RELEASE means whether THIS transaction has
 * actually completed release; Status must reflect that real fact — never a historical reconstruction,
 * and never inferred from Event/Balance side effects). The historical-accuracy framing was a genuine,
 * good-faith design choice for the ORIGINAL "A4 Sight Payment" bug (which was about the row's own
 * eventTIME/ordering and Function attribution, not its status) — but extending that same historical
 * framing to the STATUS field itself directly violated this later, more specific, explicitly-confirmed
 * requirement once the business examined it closely. Deliberately scoped to `eventStatus` ONLY — the
 * separately-confirmed "Balance SNAPSHOT stays frozen at Create-time" behavior (`selectEvent()`'s own
 * `ownSnapshot`/sibling-snapshot logic, "SNAP SHOT保留當時...不會因為後續交易改變") is a DIFFERENT,
 * independently business-confirmed requirement and is UNCHANGED by this fix — only the raw PENDING/
 * RELEASED status this function itself controls was ever in scope here.
 *
 * Module-level exported function (2026-08-18, user-requested — "Look Up Current Balance's own Event
 * Timeline should use the SAME status/display logic as Inquire Events... must not maintain its own
 * independent STATUS mapping") — was a private InquireEventsService method; extracted so
 * LookUpPanelService can call the exact same split, not a second, separately-maintained copy of it. Both
 * services import it from here rather than either owning it, since the underlying "A4 finalizes an
 * existing A3/A3S row" business rule this encodes belongs to neither screen specifically.
 */
export function toEventRows(movement: BalanceMovement, contract: BalanceContract): InquiredEvent[] {
  const isFinalizedSightUtilize = contract.instrumentType === 'IPLC_LC' && movement.movementType === 'UTILIZE' && contract.tenorType === 'SIGHT' && movement.status !== 'PENDING' && !!movement.releasedAt;
  if (!isFinalizedSightUtilize) {
    return [{ movement, contract, eventTime: movement.createdAt, eventStatus: movement.status, phase: 'primary' }];
  }
  return [
    { movement, contract, eventTime: movement.createdAt, eventStatus: movement.status, phase: 'create' },
    { movement, contract, eventTime: movement.releasedAt as string, eventStatus: movement.status, phase: 'finalize' },
  ];
}

/**
 * Fetches one contract's own movements, flattened into InquiredEvent rows via toEventRows() — the base
 * unit both InquireEventsService's own loadEvents() and LookUpPanelService's own Export Confirmed LC
 * merge (see childMovementsOf$'s own doc comment below) build on. Exported as a free function, not a
 * private class method, so both services call the exact same implementation rather than maintaining two
 * copies — the same "share the function, not the behavior" convention toEventRows() itself already
 * established for this pair of services.
 */
export function movementsOf$(api: BalanceComponentApiService, contract: BalanceContract): Observable<InquiredEvent[]> {
  return api.listMovements(contract.balanceContractId).pipe(
    map((movements) => movements.flatMap((movement) => toEventRows(movement, contract))),
    catchError(() => of([] as InquiredEvent[])),
  );
}

/**
 * Fetches every movement under every contract of the given instrumentType matching lcNumber, flattened
 * via movementsOf$() above. Used by InquireEventsService's own loadEvents() (every child instrumentType,
 * to build its one merged cross-ledger timeline) and, since 2026-08-18, by LookUpPanelService's own LC
 * tab for an Export Confirmed LC specifically (EPLC_EXAMINATION only) — bug fix, reviewer-reported live:
 * "Look Up Current Balance → Event Timeline 明顯有漏資料...主要漏掉的是 B3 Present Docs /
 * EPLC_EXAMINATION 的 Earmark Events". Root cause: B3/EPLC_EXAMINATION is MEMO_ONLY with no
 * BALANCE_SNAPSHOT_LABEL entry, so it has no dedicated Balance Tab of its own in Look Up Current
 * Balance (unlike Import LC's own SG/Acceptance children, which each already have one) — its own
 * movements live on separate per-E01/E02/E03 BalanceContract rows the Confirmed LC's own Tab 1 Event
 * Timeline never fetched, so they were invisible everywhere in that panel even though Inquire Events'
 * own already-merged timeline (via childInstrumentTypesOf()) already showed them correctly. See
 * LookUpPanelService's own loadSnapshotAndMovements() doc comment for the fix itself.
 */
export function childMovementsOf$(api: BalanceComponentApiService, instrumentType: InstrumentType, lcNumber: string): Observable<InquiredEvent[]> {
  return api.catalog(instrumentType, undefined, undefined, 1, 50, lcNumber).pipe(
    switchMap((page) => (page.items.length ? forkJoin(page.items.map((c) => movementsOf$(api, c))) : of([] as InquiredEvent[][]))),
    map((groups) => groups.flat()),
    catchError(() => of([] as InquiredEvent[])),
  );
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

  /**
   * UX enhancement (2026-08-18, "Inquire Event可以設計成Page by Page方式嗎?" — can Inquire Events be
   * designed page-by-page?) — CLIENT-SIDE windowing over the already-fully-loaded, already-sorted
   * `events` array, NOT a re-fetch per page (unlike CatalogPickerService's own use of the same
   * PagedListState class): the whole point of loadEvents() is merging every contract's own movements
   * into ONE globally-sorted timeline, so there is no per-page API call that would make sense here —
   * everything is already in memory by the time pagination applies. Reused rather than reinvented:
   * PagedListState already owns exactly the page/total/pageSize math this needs.
   */
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
    forkJoin([movementsOf$(this.api, root), ...childTypes.map((childType) => childMovementsOf$(this.api, childType, root.naturalKey.lcNumber))]).subscribe((groups) => {
      this.eventsLoading = false;
      this.events = groups.flat().sort((a, b) => new Date(a.eventTime).getTime() - new Date(b.eventTime).getTime());
      this.eventsPaging.total = this.events.length;
      this.eventsPaging.page = 1;
    });
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
   *
   * `event.phase` (2026-08-18, "A4 Sight Payment" ordering fix — see InquiredEvent's own doc comment):
   * a 'finalize' row resolves its function via payExistingUtilizeFunctionFor() instead of the generic
   * resolveFunctionForMovement() (which would always return A3, the earlier-registered, identically-
   * shaped function) — so the "View" screen correctly shows "A4 · Sight Settlement" for that row, "A3 ·
   * Document Arrival" for its sibling 'create' row. `impact` (movement.balanceBefore/balanceAfter) is the
   * SAME real value on both rows (2026-08-18, business-mandated — see toEventRows()'s own doc comment
   * for the full reversal of an earlier same-day design that forced the 'create' row's own impact to
   * `{before: null, after: null}`; a 'create' row can only exist for an already-finalized movement in the
   * first place, so these values are always genuinely populated).
   *
   * The Balance Tabs' own LC-tab `snapshot` IS also adjusted per phase (2026-08-18, business instruction
   * "做完A4 A3 的EVENT SNAPSHOT應該跟當初A3交易時一樣 不應改變" — closes what was, until this date, an
   * honestly-flagged limitation right here): a 'finalize' row reads `movement.finalizeEventSnapshot`
   * (falling back to `movement.eventSnapshot` for a movement created before that field existed) instead
   * of `movement.eventSnapshot` directly — the microservice's own release() no longer overwrites
   * eventSnapshot for this specific case, so `ownSnapshot` below is what makes the 'create' row's LC tab
   * (still reading plain `eventSnapshot`) stay frozen at A3's own original value while the 'finalize'
   * row's own tab correctly shows the RELEASED-state figures instead.
   */
  /**
   * UX enhancement (2026-08-18, "Inquire Events 把Function name放在Event 的第一個欄位" — put the
   * Function name in the Events table's own first column) — the SAME per-phase resolution rule
   * selectEvent() below already applies (payExistingUtilizeFunctionFor() for a 'finalize' row, else the
   * generic resolveFunctionForMovement() Strategy-table lookup), extracted so the merged Events table
   * can show it directly per row instead of only after clicking through to "View". Returns undefined for
   * legacy data no current function produces — the template shows "—" for that case, same convention
   * every other unresolved-function fallback in this file already uses.
   */
  functionFor(event: InquiredEvent): TransactionFunction | undefined {
    const { movement, contract } = event;
    return (event.phase === 'finalize' ? payExistingUtilizeFunctionFor(contract.instrumentType) : undefined) ?? resolveFunctionForMovement(contract.instrumentType, movement.movementType);
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
    // 2026-08-18, business-mandated (same fix as toEventRows()'s own eventStatus change) — no more
    // 'create'-phase forcing to {null, null}. That forcing was justified purely by "impact next to a
    // historically-forced Pending status would be self-contradictory"; now that eventStatus itself
    // reflects the movement's real current status (see toEventRows()'s own doc comment for the full
    // reversal), showing the SAME real before/after this row's own sibling 'finalize' row already shows
    // is no longer contradictory — it's the same movement's own single real impact, visible from either
    // row. A 'create' row can only ever exist for an ALREADY-finalized movement in the first place (see
    // toEventRows()'s own isFinalizedSightUtilize condition — status !== 'PENDING' is a precondition of
    // the split itself), so balanceBefore/balanceAfter are always genuinely populated here, never null.
    const ownImpact = { before: movement.balanceBefore, after: movement.balanceAfter };
    // 'finalize' reads finalizeEventSnapshot (falling back to eventSnapshot for a pre-migration
    // movement) — release() no longer overwrites eventSnapshot for this case, so 'create'/'primary'
    // correctly keep reading plain eventSnapshot below, unaffected.
    const ownSnapshot = event.phase === 'finalize' ? (movement.finalizeEventSnapshot ?? movement.eventSnapshot ?? null) : (movement.eventSnapshot ?? null);
    // Same "'finalize' reads the finalize-time figure, 'create'/'primary' stay frozen at whatever was
    // captured at Create" rule as ownSnapshot above, extended to the SIBLING snapshots (2026-08-18,
    // "SNAP SHOT保留當時 LC, SG, ACCEPTANCE BALANCE 不會因為後續交易改變") — reproduces LC S01 exactly: a
    // 'create' row (A3) submitted before its LC's own SG even existed must keep showing "none", not
    // A4's own much-later Release picture of it.
    const siblingAcceptanceSnapshot = event.phase === 'finalize' ? (movement.finalizeAcceptanceEventSnapshot ?? movement.acceptanceEventSnapshot ?? null) : (movement.acceptanceEventSnapshot ?? null);
    const siblingSgSnapshot = event.phase === 'finalize' ? (movement.finalizeSgEventSnapshot ?? movement.sgEventSnapshot ?? null) : (movement.sgEventSnapshot ?? null);
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
