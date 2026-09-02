import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BalanceAccountMaintenanceApiService, BalanceAccountMappingDto } from './balance-account-maintenance-api.service';

type AccountSide = 'accountA' | 'accountB';
type AccountField = 'accountNumber' | 'accountDescription';

const ACCOUNT_SIDE_LABELS: Readonly<Record<AccountSide, string>> = {
  accountA: 'Contingent Liability',
  accountB: 'Liability',
};

@Component({
  selector: 'app-balance-account-maintenance',
  imports: [FormsModule],
  templateUrl: './balance-account-maintenance.component.html',
  styleUrl: './balance-account-maintenance.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BalanceAccountMaintenanceComponent implements OnInit {
  protected readonly accountSides: readonly AccountSide[] = ['accountA', 'accountB'];
  protected readonly accountSideLabels = ACCOUNT_SIDE_LABELS;
  protected readonly mappings = signal<BalanceAccountMappingDto[]>([]);
  protected readonly searchQuery = signal('');
  protected readonly selectedMappingKey = signal<string | null>(null);
  private readonly savedMappings = signal<Readonly<Record<string, BalanceAccountMappingDto>>>({});
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly updatedBy = signal('demo-user');
  protected readonly validation = signal({ pattern: '', minLength: 1, maxLength: 64 });
  protected readonly editingKeys = signal<ReadonlySet<string>>(new Set());
  protected readonly savingKeys = signal<ReadonlySet<string>>(new Set());
  protected readonly rowMessages = signal<Readonly<Record<string, { kind: 'success' | 'error'; text: string }>>>({});
  protected readonly fixedLength = computed(() => {
    const rule = this.validation();
    return rule.minLength === rule.maxLength ? rule.minLength : null;
  });
  protected readonly filteredMappings = computed(() => {
    const query = this.searchQuery().trim().toLocaleLowerCase();
    if (!query) return this.mappings();
    return this.mappings().filter((mapping) =>
      [
        mapping.mappingKey,
        mapping.instrumentType,
        mapping.riskClass,
        mapping.updatedBy,
        mapping.accountA.accountNumber,
        mapping.accountA.accountDescription,
        mapping.accountB.accountNumber,
        mapping.accountB.accountDescription,
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  });
  protected readonly selectedMapping = computed(() => {
    const selectedKey = this.selectedMappingKey();
    return selectedKey ? (this.mappings().find((mapping) => mapping.mappingKey === selectedKey) ?? null) : null;
  });

  constructor(private readonly api: BalanceAccountMaintenanceApiService) {}

  ngOnInit(): void {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.list().subscribe({
      next: (response) => {
        this.mappings.set(response.items);
        this.savedMappings.set(Object.fromEntries(response.items.map((item) => [item.mappingKey, item])));
        this.selectedMappingKey.set(null);
        this.editingKeys.set(new Set());
        this.rowMessages.set({});
        this.validation.set(response.validation);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set('Unable to load Balance Account Numbers. Try again or check the Balance microservice.');
        this.loading.set(false);
      },
    });
  }

  protected updateField(mappingKey: string, side: AccountSide, field: AccountField, value: string): void {
    if (!this.isEditing(mappingKey)) return;
    this.mappings.update((items) =>
      items.map((item) => (item.mappingKey === mappingKey ? { ...item, [side]: { ...item[side], [field]: value } } : item)),
    );
    this.clearMessage(mappingKey);
  }

  protected isEditing(mappingKey: string): boolean {
    return this.editingKeys().has(mappingKey);
  }

  protected beginEdit(mappingKey: string): void {
    if (this.selectedMappingKey() !== mappingKey) return;
    this.editingKeys.set(new Set([mappingKey]));
    this.clearMessage(mappingKey);
  }

  protected viewMapping(mappingKey: string): void {
    if (!this.mappings().some((mapping) => mapping.mappingKey === mappingKey)) return;
    this.selectedMappingKey.set(mappingKey);
    this.clearMessage(mappingKey);
  }

  protected backToIndex(): void {
    const mappingKey = this.selectedMappingKey();
    if (mappingKey && this.savingKeys().has(mappingKey)) return;
    if (mappingKey && this.isEditing(mappingKey)) this.cancelEdit(mappingKey);
    this.selectedMappingKey.set(null);
  }

  protected cancelEdit(mappingKey: string): void {
    const saved = this.savedMappings()[mappingKey];
    if (saved) this.mappings.update((items) => items.map((item) => (item.mappingKey === mappingKey ? saved : item)));
    this.editingKeys.update((keys) => new Set([...keys].filter((key) => key !== mappingKey)));
    this.clearMessage(mappingKey);
  }

  protected isDirty(mapping: BalanceAccountMappingDto): boolean {
    const saved = this.savedMappings()[mapping.mappingKey];
    return (
      !saved ||
      mapping.accountA.accountNumber !== saved.accountA.accountNumber ||
      mapping.accountA.accountDescription !== saved.accountA.accountDescription ||
      mapping.accountB.accountNumber !== saved.accountB.accountNumber ||
      mapping.accountB.accountDescription !== saved.accountB.accountDescription
    );
  }

  protected save(mapping: BalanceAccountMappingDto): void {
    if (!this.isEditing(mapping.mappingKey) || !this.isDirty(mapping)) return;
    const actor = this.updatedBy().trim();
    if (!actor) {
      this.setMessage(mapping.mappingKey, 'error', 'Updated By is required.');
      return;
    }
    this.savingKeys.update((keys) => new Set([...keys, mapping.mappingKey]));
    this.api.update(mapping, actor).subscribe({
      next: (saved) => {
        this.mappings.update((items) => items.map((item) => (item.mappingKey === saved.mappingKey ? saved : item)));
        this.savedMappings.update((items) => ({ ...items, [saved.mappingKey]: saved }));
        this.editingKeys.update((keys) => new Set([...keys].filter((key) => key !== saved.mappingKey)));
        this.savingKeys.update((keys) => new Set([...keys].filter((key) => key !== mapping.mappingKey)));
        this.setMessage(mapping.mappingKey, 'success', 'Account set saved.');
      },
      error: (error: { status?: number; error?: { message?: string } }) => {
        this.savingKeys.update((keys) => new Set([...keys].filter((key) => key !== mapping.mappingKey)));
        const fallback = error.status === 409 ? 'This account set was changed by another user. Reload before saving again.' : 'Unable to save this account set.';
        this.setMessage(mapping.mappingKey, 'error', error.error?.message ?? fallback);
      },
    });
  }

  private clearMessage(mappingKey: string): void {
    this.rowMessages.update((messages) => {
      const next = { ...messages };
      delete next[mappingKey];
      return next;
    });
  }

  private setMessage(mappingKey: string, kind: 'success' | 'error', text: string): void {
    this.rowMessages.update((messages) => ({ ...messages, [mappingKey]: { kind, text } }));
  }
}
