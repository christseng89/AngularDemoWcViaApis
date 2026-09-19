import { computed, signal } from "@angular/core";
import { FormGroup } from "@angular/forms";
import type { FormlyFieldConfig } from "@ngx-formly/core";
import { firstValueFrom } from "rxjs";
import type { BicTarget } from "../app-view.models";
import { BIC_PATTERN } from "../fin-5x-catalog";
import { scalarText } from "../scalar-text";
import type { BankServicePickerItem } from "../bank-service-picker-dialog.component";
import type { SsiMaintenanceApiService } from "../ssi-maintenance-api.service";
import type { SsiRow } from "../ssi-maintenance.types";
import { buildSsiMakerFields } from "./ssi-maker-fields";
import type {
  SsiBankPage,
  SsiBankReference,
  SsiCustomerPage,
  SsiCustomerReference,
} from "./ssi-reference.types";

/** Maker form, revision state and API sequencing for SSI Maintenance only. */
export class SsiMakerFacade {
  readonly form: FormGroup = new FormGroup({});
  readonly fields = signal<FormlyFieldConfig[]>(
    buildSsiMakerFields(
      [],
      (target, title) => void this.openBicPicker(target, title),
    ),
  );
  model: Record<string, unknown> = {
    maker: "maker.demo",
    scope: "STANDING",
    ownershipType: "OWN",
    ownerParty: "HK01",
    publisherParty: "HK01",
    counterpartyId: "ANY",
    route: {
      currency: "USD",
      counterpartyType: "ANY_BANK",
      counterpartyBic: "ANY",
    },
  };
  readonly editingId = signal<string | null>(null);
  readonly revisionSource = signal<SsiRow | null>(null);
  readonly revisionSourceIdentity = computed(() => {
    const source = this.revisionSource();
    return source ? `${source.counterpartyId} · v${source.version}` : null;
  });
  readonly makerEditing = computed(
    () => this.editingId() !== null || this.revisionSource() !== null,
  );
  readonly bicPickerTarget = signal<BicTarget | null>(null);
  readonly bicPickerTitle = signal("");
  readonly bankPage = signal<SsiBankPage>({
    items: [],
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
  readonly banksLoading = signal(false);
  readonly bankPickerError = signal<string | null>(null);
  readonly bankQuery = signal("");
  readonly hasPreviousBankPage = computed(() => this.bankPage().page > 1);
  readonly hasNextBankPage = computed(
    () => this.bankPage().page < this.bankPage().totalPages,
  );
  readonly bankPickerItems = computed<readonly BankServicePickerItem[]>(() =>
    this.bankPage().items.map((bank) => ({
      bankServiceId: bank.bankServiceId,
      bic: bank.bic,
      displayValue: bank.name,
      location: [bank.city, bank.country].filter(Boolean).join(" · "),
      standard: bank.standard,
    })),
  );
  readonly identityPickerSource = signal<"BANK" | "CUSTOMER">("BANK");
  readonly customerPage = signal<SsiCustomerPage>({
    items: [],
    page: 1,
    pageSize: 5,
    total: 0,
    totalPages: 0,
  });
  readonly customersLoading = signal(false);
  readonly customerQuery = signal("");
  readonly hasPreviousCustomerPage = computed(
    () => this.customerPage().page > 1,
  );
  readonly hasNextCustomerPage = computed(
    () => this.customerPage().page < this.customerPage().totalPages,
  );

  constructor(
    private readonly api: SsiMaintenanceApiService,
    private readonly raiseNotice: (notice: {
      kind: "error";
      text: string;
    }) => void = () => undefined,
    private readonly bankPageSize = 10,
  ) {}

  setCurrencyOptions(
    currencies: readonly { code: string; decimals: number }[],
  ): void {
    this.fields.set(
      buildSsiMakerFields(
        currencies,
        (target, title) => void this.openBicPicker(target, title),
      ),
    );
  }

  async openBicPicker(target: BicTarget, title: string): Promise<void> {
    this.bicPickerTarget.set(target);
    this.bicPickerTitle.set(title);
    const source =
      target === "counterpartyId" &&
      this.form.get("route.counterpartyType")?.value === "CUSTOMER"
        ? "CUSTOMER"
        : "BANK";
    this.identityPickerSource.set(source);
    if (source === "CUSTOMER") {
      this.customerQuery.set("");
      await this.loadCustomers(1);
      return;
    }
    this.bankQuery.set("");
    this.bankPickerError.set(null);
    await this.loadBanks(1);
  }

  closeBicPicker(): void {
    this.bicPickerTarget.set(null);
  }
  async searchBanks(query: string): Promise<void> {
    this.bankQuery.set(query.trim());
    await this.loadBanks(1);
  }
  async moveBankPage(delta: number): Promise<void> {
    await this.loadBanks(this.bankPage().page + delta);
  }
  async moveBankToPage(page: number): Promise<void> {
    await this.loadBanks(page);
  }
  async searchCustomers(query: string): Promise<void> {
    this.customerQuery.set(query.trim());
    await this.loadCustomers(1);
  }
  async moveCustomerPage(delta: number): Promise<void> {
    await this.loadCustomers(this.customerPage().page + delta);
  }

  selectBank(bank: SsiBankReference): void {
    const target = this.bicPickerTarget();
    if (!target) return;
    if (target === "counterpartyId") {
      const counterpartyId = `CP-${bank.bic}`;
      this.form.get("counterpartyId")?.setValue(counterpartyId);
      this.model = {
        ...this.model,
        counterpartyId,
        route: {
          ...(this.model["route"] as Record<string, string> | undefined),
          counterpartyBic: bank.bic,
        },
      };
      this.closeBicPicker();
      return;
    }
    this.form.get(`route.${target}`)?.setValue(bank.bic);
    this.closeBicPicker();
  }

  selectBankPickerItem(item: BankServicePickerItem): void {
    const bank = this.bankPage().items.find(
      (candidate) => candidate.bankServiceId === item.bankServiceId,
    );
    if (bank) this.selectBank(bank);
  }
  selectCustomer(customer: SsiCustomerReference): void {
    this.form.get("counterpartyId")?.setValue(customer.customerId);
    this.closeBicPicker();
  }
  selectedBic(target: BicTarget): string {
    return String(
      this.form.get(target === "counterpartyId" ? target : `route.${target}`)
        ?.value ?? "尚未選擇",
    );
  }

  private async loadBanks(page: number): Promise<void> {
    this.banksLoading.set(true);
    this.bankPickerError.set(null);
    try {
      this.bankPage.set(
        await firstValueFrom(
          this.api.lookupBanks(page, this.bankPageSize, this.bankQuery()),
        ),
      );
    } catch {
      this.bankPickerError.set("Bank Service lookup is unavailable.");
      this.raiseNotice({ kind: "error", text: "BIC 參考服務暫時不可用。" });
    } finally {
      this.banksLoading.set(false);
    }
  }
  private async loadCustomers(page: number): Promise<void> {
    this.customersLoading.set(true);
    try {
      this.customerPage.set(
        await firstValueFrom(
          this.api.lookupCustomers(page, this.customerQuery()),
        ),
      );
    } catch {
      this.raiseNotice({
        kind: "error",
        text: "Customer 參考服務暫時不可用。",
      });
      this.closeBicPicker();
    } finally {
      this.customersLoading.set(false);
    }
  }

  reset(ownershipType: "OWN" | "COUNTERPARTY"): void {
    const ownerParty = ownershipType === "OWN" ? "HK01" : "COUNTERPARTY";
    this.model = {
      maker: "maker.demo",
      scope: "STANDING",
      ownershipType,
      ownerParty,
      publisherParty: ownerParty,
      counterpartyId: "ANY",
      route: {
        currency: "USD",
        counterpartyType: "ANY_BANK",
        counterpartyBic: "ANY",
        beneficiarySource: "SSI",
      },
    };
    this.form.reset(this.model);
  }

  beginRevision(
    source: SsiRow,
    revision: SsiRow,
    model: Record<string, unknown>,
  ): void {
    this.editingId.set(revision.id);
    this.revisionSource.set(source);
    this.model = model;
  }

  clearRevision(): void {
    this.editingId.set(null);
    this.revisionSource.set(null);
  }

  reserveRevision(id: string, maker: string): Promise<SsiRow> {
    return firstValueFrom(this.api.reserveRevision(id, maker));
  }

  async cancelRevision(id = this.editingId(), actor?: string): Promise<void> {
    if (!id) return;
    await firstValueFrom(
      this.api.cancelRevision(
        id,
        actor ?? String(this.model["maker"] ?? "maker.revision"),
      ),
    );
    if (id === this.editingId()) this.clearRevision();
  }

  async saveDraft(): Promise<void> {
    const id = this.editingId();
    if (id) await firstValueFrom(this.api.updateDraft(id, this.model));
    else await firstValueFrom(this.api.createDraft(this.model));
  }

  applyCounterpartyIdentityPolicy(): void {
    const route = {
      ...(this.model["route"] as Record<string, string> | undefined),
    };
    const counterpartyId = scalarText(this.model["counterpartyId"]).trim();
    route["counterpartyType"] = route["counterpartyType"] ?? "BANK";
    if (route["counterpartyType"] === "BANK") {
      const currentBic = scalarText(route["counterpartyBic"])
        .trim()
        .toUpperCase();
      const derivedBic = counterpartyId.replace(/^CP-/i, "").toUpperCase();
      if (new RegExp(BIC_PATTERN).test(currentBic))
        route["counterpartyBic"] = currentBic;
      else if (new RegExp(BIC_PATTERN).test(derivedBic))
        route["counterpartyBic"] = derivedBic;
      else delete route["counterpartyBic"];
    } else if (route["counterpartyType"] === "ANY_BANK") {
      route["counterpartyBic"] = "ANY";
      this.model = { ...this.model, counterpartyId: "ANY", route };
      return;
    } else delete route["counterpartyBic"];
    this.model = { ...this.model, counterpartyId, route };
  }
}
