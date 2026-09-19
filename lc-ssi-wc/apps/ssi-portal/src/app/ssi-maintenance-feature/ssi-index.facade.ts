import { computed, signal } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { assertMaintenanceServerPage } from "../maintenance-index-server-page";
import {
  createMaintenanceIndexActionAdapter,
  type MaintenanceIndexActionId,
} from "../maintenance-index-action-policy";
import { currentStatusLabel } from "../current-status-contract";
import { requestTypeLabel as presentRequestTypeLabel } from "../governance-record-value";
import type {
  SsiIndexSummary,
  SsiPage,
  SsiRow,
} from "../ssi-maintenance.types";
import type { SsiMaintenanceApiService } from "../ssi-maintenance-api.service";
import {
  buildCounterpartyInbox,
  pageItems,
  queryCounterpartyInbox,
  sortSsiOwnershipRows,
  type CounterpartyInboxSort,
  type CounterpartySsiSummarySource,
  type SortDirection,
  type SsiOwnershipSort,
} from "../ssi-maintenance-index";
import { buildSsiIndexQuery } from "./ssi-index-query";
import type { SsiCounterpartyReference } from "./ssi-reference.types";
import { ariaSortDirection, sortDirectionIndicator } from "../app-presentation";

export type SsiIndexRefreshResult = "applied" | "stale" | "error";

/** State and list orchestration belong to SSI Maintenance, never the app shell. */
export class SsiIndexFacade {
  private requestSequence = 0;
  readonly ssiIndexLoading = signal(false);
  readonly rows = signal<readonly SsiRow[]>([]);
  readonly ssiIndexTotalItems = signal(0);
  readonly ssiIndexTotalPages = signal(1);
  readonly ssiIndexDistinctCurrencyCount = signal(0);
  readonly ssiSummary = signal<SsiIndexSummary>({
    currentOwn: 0,
    pendingApproval: 0,
    active: 0,
    archived: 0,
  });
  readonly ownershipTab = signal<"OWN" | "COUNTERPARTY">("OWN");
  readonly ownershipSearch = signal("");
  readonly ownershipStatus = signal<"ACTIVE" | "DRAFT" | "SUPPRESSED" | "ALL">(
    "ACTIVE",
  );
  readonly ownershipSort = signal<SsiOwnershipSort>("BOOKING_ENTITY");
  readonly ownershipSortDirection = signal<SortDirection>("ASC");
  readonly ownershipActionAdapter = createMaintenanceIndexActionAdapter("ssi");
  readonly ownershipActionColumns = computed(() =>
    this.ownershipActionAdapter.columnsFor(this.ownershipStatus()),
  );
  readonly selectedCounterpartyId = signal("");
  readonly indexPage = signal(1);
  readonly indexPageSize = 10;
  readonly deleteTarget = signal<SsiRow | null>(null);
  readonly deleteReason = signal("");
  readonly canConfirmDelete = computed(
    () => this.deleteReason().trim().length >= 5,
  );
  readonly counterpartyDirectoryLoading = signal(false);
  readonly counterpartyDirectory = signal<readonly SsiCounterpartyReference[]>(
    [],
  );
  readonly counterpartyCoverage = signal<
    readonly CounterpartySsiSummarySource[]
  >([]);
  readonly counterpartyInboxSearch = signal("");
  readonly counterpartyPartyType = signal<
    "BANK_SSI" | "BANK_NO_SSI" | "CUSTOMER"
  >("BANK_SSI");
  readonly counterpartyInboxSort = signal<CounterpartyInboxSort>("BIC_NAME");
  readonly counterpartyInboxSortDirection = signal<SortDirection>("ASC");
  readonly counterpartyInboxPage = signal(1);
  readonly counterpartyInboxPageSize = 10;
  readonly ownershipOf = (row: SsiRow): "OWN" | "COUNTERPARTY" =>
    row.ownershipType ??
    (row.route["counterpartyBic"] === "ANY" ? "OWN" : "COUNTERPARTY");
  readonly visibleRows = computed(() =>
    sortSsiOwnershipRows(
      this.rows(),
      this.ownershipSort(),
      this.ownershipSortDirection(),
    ),
  );
  readonly indexTotalPages = computed(() => this.ssiIndexTotalPages());
  readonly pagedVisibleRows = computed(() => this.visibleRows());
  readonly activeRows = computed(() =>
    this.rows().filter((row) => row.status === "ACTIVE"),
  );
  readonly activeCount = computed(() => this.ssiSummary().active);
  readonly archivedCount = computed(() => this.ssiSummary().archived);
  readonly counterpartyInbox = computed(() => {
    const selectedType = this.counterpartyPartyType();
    const partyType = selectedType === "CUSTOMER" ? "CUSTOMER" : "BANK";
    const inbox = buildCounterpartyInbox(
      this.counterpartyDirectory().filter(
        (party) => (party.partyType ?? "BANK") === partyType,
      ),
      this.counterpartyCoverage(),
    );
    if (selectedType === "BANK_SSI")
      return inbox.filter((party) => party.ssiCount > 0);
    if (selectedType === "BANK_NO_SSI")
      return inbox.filter((party) => party.ssiCount === 0);
    return inbox;
  });
  readonly filteredCounterpartyInbox = computed(() =>
    queryCounterpartyInbox(
      this.counterpartyInbox(),
      this.counterpartyInboxSearch(),
      this.counterpartyInboxSort(),
      this.counterpartyInboxSortDirection(),
    ),
  );
  readonly counterpartyInboxTotalPages = computed(() =>
    Math.max(
      1,
      Math.ceil(
        this.filteredCounterpartyInbox().length /
          this.counterpartyInboxPageSize,
      ),
    ),
  );
  readonly pagedCounterpartyInbox = computed(() =>
    pageItems(
      this.filteredCounterpartyInbox(),
      this.counterpartyInboxPage(),
      this.counterpartyInboxPageSize,
    ),
  );
  readonly selectedCounterparty = computed(
    () =>
      this.counterpartyInbox().find(
        (party) => party.counterpartyId === this.selectedCounterpartyId(),
      ) ?? null,
  );

  constructor(private readonly api: SsiMaintenanceApiService) {}

  isOwnershipActionPresented(
    action: MaintenanceIndexActionId,
    row: SsiRow,
  ): boolean {
    return this.ownershipActionAdapter.isPresented(action, row);
  }

  ownershipCurrentStatusLabel(row: SsiRow): string {
    return currentStatusLabel(row.currentStatus ?? "EMPTY");
  }

  requestTypeLabel(row: SsiRow): "ADD" | "EDIT" | "SUPPRESSED" {
    return presentRequestTypeLabel(row);
  }

  counterpartyAriaSort(
    sort: CounterpartyInboxSort,
  ): "ascending" | "descending" | "none" {
    return ariaSortDirection(
      this.counterpartyInboxSort() === sort,
      this.counterpartyInboxSortDirection(),
    );
  }

  ownershipAriaSort(
    sort: SsiOwnershipSort,
  ): "ascending" | "descending" | "none" {
    return ariaSortDirection(
      this.ownershipSort() === sort,
      this.ownershipSortDirection(),
    );
  }

  counterpartySortIndicator(sort: CounterpartyInboxSort): string {
    return sortDirectionIndicator(
      this.counterpartyInboxSort() === sort,
      this.counterpartyInboxSortDirection(),
    );
  }

  ownershipSortIndicator(sort: SsiOwnershipSort): string {
    return sortDirectionIndicator(
      this.ownershipSort() === sort,
      this.ownershipSortDirection(),
    );
  }

  requestDelete(row: SsiRow): void {
    this.deleteTarget.set(row);
    this.deleteReason.set("");
  }

  requestDraftRevoke(row: SsiRow): void {
    if (row.status !== "DRAFT") return;
    this.requestDelete(row);
  }

  closeDeleteDialog(): void {
    this.deleteTarget.set(null);
    this.deleteReason.set("");
  }

  moveIndexPage(delta: number): void {
    this.indexPage.set(
      Math.min(
        this.ssiIndexTotalPages(),
        Math.max(1, this.indexPage() + delta),
      ),
    );
  }

  selectOwnershipTab(tab: "OWN" | "COUNTERPARTY"): void {
    this.ownershipTab.set(tab);
    this.ownershipSort.set(tab === "OWN" ? "BOOKING_ENTITY" : "CURRENCY");
    this.ownershipSortDirection.set("ASC");
    this.indexPage.set(1);
    if (tab === "OWN") this.selectedCounterpartyId.set("");
  }

  searchCounterpartyInbox(query: string): void {
    this.counterpartyInboxSearch.set(query);
    this.counterpartyInboxPage.set(1);
  }

  selectCounterpartyPartyType(
    partyType: "BANK_SSI" | "BANK_NO_SSI" | "CUSTOMER",
  ): void {
    this.counterpartyPartyType.set(partyType);
    this.selectedCounterpartyId.set("");
    this.counterpartyInboxPage.set(1);
  }

  sortCounterpartyInbox(sort: CounterpartyInboxSort): void {
    if (this.counterpartyInboxSort() === sort)
      this.counterpartyInboxSortDirection.update((direction) =>
        direction === "ASC" ? "DESC" : "ASC",
      );
    else {
      this.counterpartyInboxSort.set(sort);
      this.counterpartyInboxSortDirection.set("ASC");
    }
    this.counterpartyInboxPage.set(1);
  }

  sortOwnershipIndex(sort: SsiOwnershipSort): void {
    if (this.ownershipSort() === sort)
      this.ownershipSortDirection.update((direction) =>
        direction === "ASC" ? "DESC" : "ASC",
      );
    else {
      this.ownershipSort.set(sort);
      this.ownershipSortDirection.set("ASC");
    }
    this.indexPage.set(1);
  }

  selectOwnershipStatus(
    status: "ACTIVE" | "DRAFT" | "SUPPRESSED" | "ALL",
  ): void {
    if (
      !this.ownershipActionAdapter.isVisibleSort(status, this.ownershipSort())
    ) {
      this.ownershipSort.set(
        this.ownershipTab() === "OWN" ? "BOOKING_ENTITY" : "CURRENCY",
      );
      this.ownershipSortDirection.set("ASC");
    }
    this.ownershipStatus.set(status);
    this.indexPage.set(1);
  }

  searchOwnershipIndex(value: string): void {
    this.ownershipSearch.set(value);
    this.indexPage.set(1);
  }

  moveCounterpartyInboxPage(delta: number): void {
    this.counterpartyInboxPage.set(
      Math.min(
        this.counterpartyInboxTotalPages(),
        Math.max(1, this.counterpartyInboxPage() + delta),
      ),
    );
  }

  openCounterpartySsi(counterpartyId: string): boolean {
    const party = this.counterpartyInbox().find(
      (item) => item.counterpartyId === counterpartyId,
    );
    if (party?.ssiCount === 0) return false;
    this.selectedCounterpartyId.set(counterpartyId);
    this.ownershipSearch.set("");
    this.ownershipStatus.set("ACTIVE");
    this.ownershipSort.set("CURRENCY");
    this.ownershipSortDirection.set("ASC");
    this.indexPage.set(1);
    return true;
  }

  closeCounterpartySsi(): void {
    this.selectedCounterpartyId.set("");
    this.ownershipSearch.set("");
    this.indexPage.set(1);
  }

  async loadCounterpartyDirectory(): Promise<"applied" | "error"> {
    this.counterpartyDirectoryLoading.set(true);
    try {
      const [response, coverage] = await Promise.all([
        firstValueFrom(this.api.lookupCounterparties()),
        firstValueFrom(this.api.counterpartyCoverage()),
      ]);
      this.counterpartyDirectory.set(response.items);
      this.counterpartyCoverage.set(coverage);
      return "applied";
    } catch {
      this.counterpartyDirectory.set([]);
      this.counterpartyCoverage.set([]);
      return "error";
    } finally {
      this.counterpartyDirectoryLoading.set(false);
    }
  }

  async applyAction(row: SsiRow, action: "submit" | "approve"): Promise<void> {
    const actor = action === "submit" ? row.maker : "checker.demo";
    await firstValueFrom(this.api.act(row.id, action, actor));
  }

  async revokeOrSuppress(row: SsiRow, reason: string): Promise<void> {
    if (row.status === "DRAFT")
      await firstValueFrom(this.api.revokeDraft(row.id, row.maker, reason));
    else
      await firstValueFrom(
        this.api.suppress(row.id, "maker.suppression", reason),
      );
  }

  async refresh(): Promise<SsiIndexRefreshResult> {
    const requestSequence = ++this.requestSequence;
    this.ssiIndexLoading.set(true);
    if (this.selectedCounterpartyId()) {
      this.rows.set([]);
      this.ssiIndexTotalItems.set(0);
      this.ssiIndexTotalPages.set(1);
      this.ssiIndexDistinctCurrencyCount.set(0);
    }
    try {
      const query = buildSsiIndexQuery({
        status: this.ownershipStatus(),
        page: this.indexPage(),
        pageSize: this.indexPageSize,
        sortBy: this.ownershipSort(),
        sortDirection: this.ownershipSortDirection(),
        ownershipType: this.ownershipTab(),
        search: this.ownershipSearch(),
        counterpartyId: this.selectedCounterpartyId(),
      });
      const [response, summary] = await Promise.all([
        firstValueFrom(this.api.list(query)),
        firstValueFrom(this.api.summary()),
      ]);
      const page: SsiPage = Array.isArray(response)
        ? {
            items: response,
            page: 1,
            pageSize: response.length || this.indexPageSize,
            totalItems: response.length,
            totalPages: 1,
            hasPrevious: false,
            hasNext: false,
            distinctCurrencyCount: new Set(
              response.map((row) => row.route["currency"]).filter(Boolean),
            ).size,
          }
        : response;
      assertMaintenanceServerPage(page.items, this.ownershipStatus());
      if (requestSequence !== this.requestSequence) return "stale";
      this.rows.set(page.items);
      this.ssiIndexTotalItems.set(page.totalItems);
      this.ssiIndexTotalPages.set(Math.max(1, page.totalPages));
      this.ssiIndexDistinctCurrencyCount.set(page.distinctCurrencyCount);
      this.ssiSummary.set(summary);
      this.indexPage.set(
        Math.min(this.indexPage(), Math.max(1, page.totalPages)),
      );
      return "applied";
    } catch {
      return "error";
    } finally {
      if (requestSequence === this.requestSequence)
        this.ssiIndexLoading.set(false);
    }
  }
}
