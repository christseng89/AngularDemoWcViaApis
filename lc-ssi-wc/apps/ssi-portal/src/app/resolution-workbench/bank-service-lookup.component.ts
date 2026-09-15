import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import type {
  PageParameterLookupMetadata,
  PageParameterLookupResult,
} from "@ssi/contracts";
import {
  ParameterLookupFacade,
  type ParameterLookupContext,
} from "./parameter-lookup.facade";
import {
  BankServicePickerDialogComponent,
  type BankServicePickerItem,
} from "../bank-service-picker-dialog.component";
import { pageCount, pageSlice } from "./pagination";
import {
  lookupDependenciesSatisfied,
  lookupResolutionKey,
} from "./lookup-resolution-key";
import { bankServiceDescription } from "./bank-service-presentation";

const LOOKUP_COPY: Readonly<
  Record<
    PageParameterLookupMetadata["provider"],
    {
      readonly serviceLabel: string;
      readonly emptyMessage: string;
      readonly emptySelectionLabel: string;
      readonly loadingMessage: string;
    }
  >
> = {
  SSI_COUNTERPARTY: {
    serviceLabel: "SSI COUNTERPARTY",
    emptyMessage:
      "No valid SSI counterparty matches the selected scenario and transaction context.",
    emptySelectionLabel: "No SSI counterparty selected.",
    loadingMessage: "Loading eligible SSI counterparties…",
  },
  NOSTRO_ACCOUNT: {
    serviceLabel: "OWN ACCOUNT",
    emptyMessage: "No eligible own account.",
    emptySelectionLabel: "No own account selected.",
    loadingMessage: "Loading eligible own accounts…",
  },
  BANK_SERVICE: {
    serviceLabel: "BANK SERVICE",
    emptyMessage: "No matching Bank Service.",
    emptySelectionLabel: "No bank selected.",
    loadingMessage: "Loading Bank Services…",
  },
};

@Component({
  selector: "ssi-bank-service-lookup",
  standalone: true,
  imports: [BankServicePickerDialogComponent],
  providers: [ParameterLookupFacade],
  templateUrl: "./bank-service-lookup.component.html",
  styleUrl: "./resolution-workbench.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BankServiceLookupComponent {
  private readonly facade = inject(ParameterLookupFacade);
  private lastResolutionKey = "";
  readonly metadata = input.required<PageParameterLookupMetadata>();
  readonly inputId = input.required<string>();
  readonly title = input("Select Bank Service");
  readonly value = input("");
  readonly context = input<ParameterLookupContext>({});
  readonly dependencyLabels = input<Readonly<Record<string, string>>>({});
  readonly disabled = input(false);
  readonly pageSize = input.required<number>();
  readonly valueSelected = output<string>();
  readonly availabilityChanged = output<boolean>();
  readonly phase = this.facade.phase;
  readonly items = this.facade.items;
  readonly selected = this.facade.selected;
  readonly displayedSelection = signal<PageParameterLookupResult | null>(null);
  readonly defaultSelection = this.facade.defaultSelection;
  readonly availableItems = computed(() => this.items());
  readonly error = this.facade.error;
  readonly dependenciesSatisfied = computed(() =>
    lookupDependenciesSatisfied(this.metadata(), this.context()),
  );
  readonly lookupAvailable = computed(
    () =>
      this.dependenciesSatisfied() &&
      this.phase() === "ready" &&
      !(this.defaultSelection() && !this.selected()) &&
      (this.items().length > 0 || this.selected() !== null),
  );
  readonly missingDependencyLabels = computed(() =>
    (this.metadata().dependency?.dependsOnFieldIds ?? [])
      .filter((fieldId) => {
        const value = this.context().dependencyValues?.[fieldId];
        return value === undefined || value === "";
      })
      .map((fieldId) => this.dependencyLabels()[fieldId] ?? fieldId),
  );
  readonly prerequisiteMessage = computed(() => {
    const labels = this.missingDependencyLabels();
    if (labels.length === 0) return "";
    const fields =
      labels.length === 1
        ? labels[0]
        : `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
    const selection =
      this.metadata().provider === "SSI_COUNTERPARTY"
        ? "an SSI counterparty"
        : "a Bank Service";
    return `Complete ${fields} before selecting ${selection}.`;
  });
  readonly pickerOpen = signal(false);
  readonly pickerQuery = signal("");
  readonly pickerPage = signal(1);
  readonly pickerTotalPages = computed(() =>
    pageCount(this.availableItems().length, this.pageSize()),
  );
  readonly pickerItems = computed(() =>
    pageSlice(this.availableItems(), this.pickerPage(), this.pageSize()).map(
      (item) => ({
        ...item,
        bankServiceId: item.bankServiceId ?? item.nostroId ?? "",
        bic: item.bic ?? item.maskedAccountRef ?? item.displayValue,
        displayValue: item.bankName ?? item.displayValue,
      }),
    ),
  );
  readonly serviceLabel = computed(
    () => LOOKUP_COPY[this.metadata().provider].serviceLabel,
  );
  readonly emptyMessage = computed(
    () => LOOKUP_COPY[this.metadata().provider].emptyMessage,
  );
  readonly emptySelectionLabel = computed(
    () => LOOKUP_COPY[this.metadata().provider].emptySelectionLabel,
  );
  readonly loadingMessage = computed(
    () => LOOKUP_COPY[this.metadata().provider].loadingMessage,
  );
  selectedDescription(item: PageParameterLookupResult): string {
    return bankServiceDescription(item);
  }
  private opener: HTMLElement | null = null;
  private lastAppliedDefaultKey = "";

  constructor() {
    effect(() => {
      const selected = this.selected();
      if (selected) {
        this.displayedSelection.set(selected);
        return;
      }

      const phase = this.phase();
      if (phase === "loading") {
        this.displayedSelection.set(null);
        return;
      }
      if (phase === "ready" && this.defaultSelection()) return;
      this.displayedSelection.set(null);
    });
    effect(() => {
      const value = this.value();
      const metadata = this.metadata();
      const context = this.context();
      const resolutionKey = lookupResolutionKey(metadata, value, context);
      if (resolutionKey === this.lastResolutionKey) return;
      this.lastResolutionKey = resolutionKey;
      if (!lookupDependenciesSatisfied(metadata, context)) {
        this.facade.clear();
        return;
      }
      void this.facade.resolve(metadata, value, context);
    });
    effect(() => this.availabilityChanged.emit(this.lookupAvailable()));
    effect(() => {
      const context = this.context();
      if (!this.pickerOpen()) return;
      this.pickerPage.set(1);
      void this.facade.search(this.metadata(), this.pickerQuery(), context);
    });
    effect(() => {
      const defaultId = this.defaultSelection();
      const metadata = this.metadata();
      const context = this.context();
      if (
        !defaultId ||
        this.value() ||
        !lookupDependenciesSatisfied(metadata, context)
      )
        return;
      const key = lookupResolutionKey(metadata, defaultId, context);
      if (key === this.lastAppliedDefaultKey) return;
      this.lastAppliedDefaultKey = key;
      this.lastResolutionKey = key;
      this.valueSelected.emit(defaultId);
    });
  }

  open(event: Event): void {
    if (this.disabled() || !this.lookupAvailable()) return;
    this.opener = event.currentTarget as HTMLElement;
    this.pickerQuery.set("");
    this.pickerPage.set(1);
    this.pickerOpen.set(true);
  }

  search(query: string): void {
    this.pickerQuery.set(query);
    this.pickerPage.set(1);
    void this.facade.search(this.metadata(), query, this.context());
  }

  moveToPage(page: number): void {
    this.pickerPage.set(Math.min(Math.max(1, page), this.pickerTotalPages()));
  }

  select(item: BankServicePickerItem): void {
    if (this.disabled()) return;
    const stableId = this.facade.select(
      this.metadata(),
      item as PageParameterLookupResult,
    );
    this.lastResolutionKey = lookupResolutionKey(
      this.metadata(),
      stableId,
      this.context(),
    );
    this.valueSelected.emit(stableId);
    this.close();
  }

  close(): void {
    this.pickerOpen.set(false);
    const opener = this.opener;
    this.opener = null;
    setTimeout(() => opener?.focus());
  }
}
