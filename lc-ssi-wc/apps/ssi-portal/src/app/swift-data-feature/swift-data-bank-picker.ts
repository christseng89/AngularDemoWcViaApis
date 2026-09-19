import { computed, inject, Injectable, signal } from "@angular/core";
import { FormGroup } from "@angular/forms";
import { firstValueFrom } from "rxjs";
import type { BankServicePickerItem } from "../bank-service-picker-dialog.component";
import { SwiftDataApiService } from "./swift-data-api.service";
import type { BankPage, UiField } from "./swift-data.models";

/** Bank lookup presentation state; no maintenance lifecycle ownership. */
@Injectable()
export class SwiftDataBankPicker {
  private readonly api = inject(SwiftDataApiService);
  readonly target = signal<string | null>(null);
  readonly title = signal("Select Bank Service");
  readonly query = signal("");
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly page = signal<BankPage>({
    items: [],
    page: 1,
    pageSize: 8,
    total: 0,
    totalPages: 0,
  });
  readonly items = computed<readonly BankServicePickerItem[]>(() =>
    this.page().items.map((bank) => ({
      bankServiceId: bank.bankServiceId,
      bic: bank.bic,
      displayValue: bank.name,
      location: [bank.city, bank.country].filter(Boolean).join(" · "),
      standard: bank.standard,
    })),
  );

  async open(field: UiField): Promise<void> {
    this.target.set(field.key);
    this.title.set(`Select ${field.label}`);
    this.query.set("");
    this.error.set(null);
    await this.loadPage(1);
  }

  close(): void {
    this.target.set(null);
  }

  async search(query: string): Promise<void> {
    this.query.set(query.trim());
    await this.loadPage(1);
  }

  async moveToPage(page: number): Promise<void> {
    await this.loadPage(page);
  }

  select(item: BankServicePickerItem, form: FormGroup): void {
    const target = this.target();
    if (!target) return;
    form.get(target)?.setValue(item.bic);
    this.close();
  }

  private async loadPage(page: number): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.page.set(await firstValueFrom(this.api.bankPage(page, 8, this.query())));
    } catch {
      this.error.set("Bank Service lookup is unavailable.");
    } finally {
      this.loading.set(false);
    }
  }
}
