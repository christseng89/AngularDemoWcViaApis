import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import type {
  PageParameterBusinessDomain,
  ResolutionPageDefinitionQuery,
  ResolutionPageDefinitionIndexEnvelope,
  ResolutionPageDefinitionIndexItem,
} from "@ssi/contracts";
import { firstValueFrom } from "rxjs";
import {
  RESOLUTION_PAGE_PARAMETER_CLIENT,
  provideResolutionPageParameterClient,
  type ResolutionPageParameterClient,
} from "./page-parameter.client";
import {
  groupPageDefinitions,
  assertPageDefinitionDomain,
  scenarioNavigation,
  scenarioSelection,
  scenarioRows,
  type MessageDefinitionGroup,
  type ScenarioIndexRow,
} from "./page-definition-index";
import type { WorkbenchFailure } from "./page-parameter.contract";
import { ResolutionFailureComponent } from "./resolution-failure.component";
import { ResolutionWorkbenchComponent } from "./resolution-workbench.component";
import {
  assertPaginationPolicy,
  pageCount,
  pageSlice,
  sortedCopy,
} from "./pagination";
import { compareScenarioDisplayOrder } from "./scenario-display-order";

type IndexSortKey =
  | "messageCode"
  | "description"
  | "profileSlots"
  | "inputFields"
  | "scenarioCount"
  | "mappingStatus";

type ScenarioSortKey =
  | "label"
  | "description"
  | "sequence"
  | "flowKind"
  | "ssiScope"
  | "validationOwner"
  | "status";

interface ScenarioSelection {
  readonly definition: ResolutionPageDefinitionIndexItem;
  readonly selectedScenarioId: string;
  readonly query: ResolutionPageDefinitionQuery;
}

@Component({
  selector: "ssi-page-definition-index-workspace",
  standalone: true,
  imports: [ResolutionFailureComponent, ResolutionWorkbenchComponent],
  providers: [provideResolutionPageParameterClient()],
  templateUrl: "./page-definition-index-table.component.html",
  styleUrl: "./resolution-workbench.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PageDefinitionIndexWorkspaceComponent {
  private readonly client = inject<ResolutionPageParameterClient>(
    RESOLUTION_PAGE_PARAMETER_CLIENT,
  );
  private readonly drawerPanel =
    viewChild<ElementRef<HTMLElement>>("drawerPanel");
  private loadSequence = 0;
  private drawerTrigger: HTMLElement | null = null;
  readonly businessDomain = input.required<PageParameterBusinessDomain>();
  readonly index = signal<ResolutionPageDefinitionIndexEnvelope | null>(null);
  readonly loading = signal(false);
  readonly failure = signal<WorkbenchFailure | null>(null);
  readonly search = signal("");
  readonly drawerSearch = signal("");
  readonly drawerAudience = signal<"OPERATIONAL" | "QA_TEST_ONLY">(
    "OPERATIONAL",
  );
  readonly domainLabel = computed(() => {
    const labels: Readonly<Record<PageParameterBusinessDomain, string>> = {
      TREASURY: "Treasury",
      TRADE_FINANCE: "Trade finance",
      PAYMENT: "Payment",
    };
    return labels[this.businessDomain()];
  });
  readonly drawerGroup = signal<MessageDefinitionGroup | null>(null);
  readonly selected = signal<ScenarioSelection | null>(null);
  readonly selectedGroupId = signal<string | null>(null);
  readonly page = signal(1);
  readonly drawerPage = signal(1);
  readonly sortKey = signal<IndexSortKey | null>(null);
  readonly sortDirection = signal<"asc" | "desc">("asc");
  readonly scenarioSortKey = signal<ScenarioSortKey | null>(null);
  readonly scenarioSortDirection = signal<"asc" | "desc">("asc");
  readonly messageGroups = computed(() =>
    groupPageDefinitions(this.index()?.items ?? []).filter(
      (group) => group.mappingStatus === "PROFILE_VERIFIED",
    ),
  );
  readonly visibleMessageGroups = computed(() => {
    const search = this.search().trim().toLocaleUpperCase();
    const filtered = search
      ? this.messageGroups().filter((group) =>
          [
            group.messageCode,
            group.description,
            ...group.profileSlots,
            ...group.inputFields,
            group.mappingStatus,
          ].some((value) => value.toLocaleUpperCase().includes(search)),
        )
      : this.messageGroups();
    const key = this.sortKey();
    if (!key) return filtered;
    return sortedCopy(
      filtered,
      (item) =>
        key === "inputFields" || key === "profileSlots"
          ? item[key].join(" ")
          : item[key],
      this.sortDirection(),
      [(item) => item.order, (item) => item.id],
    );
  });
  readonly drawerRows = computed(() => {
    const group = this.drawerGroup();
    return group ? scenarioRows(group) : [];
  });
  readonly visibleDrawerRows = computed(() => {
    const search = this.drawerSearch().trim().toLocaleUpperCase();
    const audienceRows = this.drawerRows().filter(
      (row) => row.audience === this.drawerAudience(),
    );
    const filtered = search
      ? audienceRows.filter((row) =>
          [
            row.label,
            row.description,
            row.sequence,
            row.ssiScope,
            row.validationOwner,
            row.status,
            row.flowKind,
          ].some((value) => value.toLocaleUpperCase().includes(search)),
        )
      : audienceRows;
    const key = this.scenarioSortKey();
    if (!key) return [...filtered].sort(compareScenarioDisplayOrder);
    return sortedCopy(
      filtered,
      (row) => row[key].normalize().toLocaleUpperCase(),
      this.scenarioSortDirection(),
      [(row) => row.order, (row) => row.scenarioId],
    );
  });
  readonly pageSize = computed(
    () => assertPaginationPolicy(this.index()?.pagination).defaultPageSize,
  );
  readonly totalPages = computed(() =>
    pageCount(this.visibleMessageGroups().length, this.pageSize()),
  );
  readonly pagedMessageGroups = computed(() =>
    pageSlice(this.visibleMessageGroups(), this.page(), this.pageSize()),
  );
  readonly drawerTotalPages = computed(() =>
    pageCount(this.visibleDrawerRows().length, this.pageSize()),
  );
  readonly pagedDrawerRows = computed(() =>
    pageSlice(this.visibleDrawerRows(), this.drawerPage(), this.pageSize()),
  );

  constructor() {
    effect(() => {
      this.businessDomain();
      void this.load();
    });
  }

  async load(): Promise<void> {
    const sequence = ++this.loadSequence;
    this.loading.set(true);
    this.failure.set(null);
    this.search.set("");
    this.selected.set(null);
    this.selectedGroupId.set(null);
    this.drawerGroup.set(null);
    this.page.set(1);
    this.drawerPage.set(1);
    this.sortKey.set(null);
    this.drawerSearch.set("");
    this.drawerAudience.set("OPERATIONAL");
    this.scenarioSortKey.set(null);
    this.scenarioSortDirection.set("asc");
    try {
      const businessDomain = this.businessDomain();
      const response = await firstValueFrom(
        this.client.loadIndex(businessDomain),
      );
      if (sequence !== this.loadSequence) return;
      const items = assertPageDefinitionDomain(response.items, businessDomain);
      assertPaginationPolicy(response.pagination);
      groupPageDefinitions(items).forEach((group) => scenarioRows(group));
      this.index.set({ ...response, items });
    } catch (error: unknown) {
      if (sequence !== this.loadSequence) return;
      const candidate = error as {
        readonly error?: { readonly code?: unknown };
        readonly code?: unknown;
      };
      const rawCode = candidate?.error?.code ?? candidate?.code;
      const code =
        typeof rawCode === "string" && rawCode.length > 0
          ? rawCode
          : "PAGE_DEFINITION_INDEX_UNAVAILABLE";
      this.index.set(null);
      this.failure.set({
        title: "Unable to load the SSI transaction index",
        message: "The governed transaction list is temporarily unavailable.",
        code,
        retryable: true,
      });
    } finally {
      if (sequence === this.loadSequence) this.loading.set(false);
    }
  }

  activateGroup(group: MessageDefinitionGroup, event: Event): void {
    this.selectedGroupId.set(group.id);
    const rows = scenarioRows(group);
    if (scenarioNavigation(group) === "DIRECT") {
      const row = rows[0];
      if (row?.executable) this.openScenario(row);
      return;
    }
    this.drawerTrigger = event.currentTarget as HTMLElement;
    this.drawerPage.set(1);
    this.drawerSearch.set("");
    this.drawerAudience.set("OPERATIONAL");
    this.scenarioSortKey.set(null);
    this.scenarioSortDirection.set("asc");
    this.drawerGroup.set(group);
    setTimeout(() => this.drawerPanel()?.nativeElement.focus());
  }

  openScenario(row: ScenarioIndexRow): void {
    if (!row.executable) return;
    const navigation = scenarioSelection(row, this.businessDomain());
    this.selected.set({
      definition: row.definition,
      selectedScenarioId: navigation.selectedScenarioId,
      query: navigation.query,
    });
    this.drawerGroup.set(null);
  }

  close(): void {
    this.selected.set(null);
    setTimeout(() => this.drawerTrigger?.focus());
  }

  backToScenarios(): void {
    const selection = this.selected();
    if (!selection) return;
    const group = this.messageGroups().find((candidate) =>
      candidate.definitions.some(
        (definition) =>
          definition.definitionId === selection.definition.definitionId,
      ),
    );
    this.selected.set(null);
    if (!group) {
      setTimeout(() => this.drawerTrigger?.focus());
      return;
    }
    this.selectedGroupId.set(group.id);
    this.drawerGroup.set(group);
    setTimeout(() => this.drawerPanel()?.nativeElement.focus());
  }

  closeDrawer(): void {
    this.drawerGroup.set(null);
    const trigger = this.drawerTrigger;
    this.drawerTrigger = null;
    setTimeout(() => trigger?.focus());
  }

  searchIndex(query: string): void {
    this.search.set(query);
    this.page.set(1);
  }

  sortBy(key: IndexSortKey): void {
    if (this.sortKey() === key)
      this.sortDirection.update((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
    else {
      this.sortKey.set(key);
      this.sortDirection.set("asc");
    }
    this.page.set(1);
  }

  ariaSort(key: IndexSortKey): "ascending" | "descending" | "none" {
    if (this.sortKey() !== key) return "none";
    return this.sortDirection() === "asc" ? "ascending" : "descending";
  }

  searchDrawer(query: string): void {
    this.drawerSearch.set(query);
    this.drawerPage.set(1);
  }

  showScenarioAudience(audience: "OPERATIONAL" | "QA_TEST_ONLY"): void {
    this.drawerAudience.set(audience);
    this.drawerPage.set(1);
  }

  sortScenarioBy(key: ScenarioSortKey): void {
    if (this.scenarioSortKey() === key)
      this.scenarioSortDirection.update((direction) =>
        direction === "asc" ? "desc" : "asc",
      );
    else {
      this.scenarioSortKey.set(key);
      this.scenarioSortDirection.set("asc");
    }
    this.drawerPage.set(1);
  }

  scenarioAriaSort(key: ScenarioSortKey): "ascending" | "descending" | "none" {
    if (this.scenarioSortKey() !== key) return "none";
    return this.scenarioSortDirection() === "asc" ? "ascending" : "descending";
  }

  movePage(delta: number): void {
    this.page.set(
      Math.min(this.totalPages(), Math.max(1, this.page() + delta)),
    );
  }

  moveDrawerPage(delta: number): void {
    this.drawerPage.set(
      Math.min(this.drawerTotalPages(), Math.max(1, this.drawerPage() + delta)),
    );
  }
}
