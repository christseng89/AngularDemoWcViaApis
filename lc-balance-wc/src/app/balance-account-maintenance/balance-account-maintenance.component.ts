import { ChangeDetectionStrategy, Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BalanceAccountCategoryDto,
  BalanceAccountFamilyDto,
  BalanceAccountMaintenanceApiService,
  BalanceAccountMappingDto,
  BalanceAccountMappingsResponse,
} from './balance-account-maintenance-api.service';

type AccountSide = 'accountA' | 'accountB';
type AccountField = 'accountNumber' | 'accountDescription';
type GlEditorValues = Readonly<Record<AccountSide, Readonly<Record<AccountField, string>>>>;

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
  protected readonly categories = signal<BalanceAccountCategoryDto[]>([]);
  protected readonly activeCategoryKey = signal<string | null>(null);
  protected readonly selectedFamilyKey = signal<string | null>(null);
  private readonly savedMappings = signal<Readonly<Record<string, BalanceAccountMappingDto>>>({});
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly reloadMessage = signal('');
  protected readonly updatedBy = signal('demo-user');
  protected readonly searchQuery = signal('');
  protected readonly validation = signal({ pattern: '', minLength: 1, maxLength: 64 });
  protected readonly editingFamilyKey = signal<string | null>(null);
  protected readonly savingFamilyKey = signal<string | null>(null);
  protected readonly familyMessages = signal<Readonly<Record<string, { kind: 'success' | 'error'; text: string }>>>({});
  private readonly glEditorValues = signal<GlEditorValues | null>(null);

  protected readonly fixedLength = computed(() => {
    const rule = this.validation();
    return rule.minLength === rule.maxLength ? rule.minLength : null;
  });

  protected readonly activeCategory = computed(() =>
    this.categories().find((category) => category.categoryKey === this.activeCategoryKey()) ?? null,
  );

  protected readonly filteredFamilies = computed(() => {
    const families = this.activeCategory()?.families ?? [];
    const query = this.searchQuery().trim().toLocaleLowerCase();
    if (!query) return families;
    return families.filter((family) =>
      [
        family.familyKey,
        family.label,
        family.instrumentType,
        ...family.mappings.flatMap((mapping) => [
          mapping.tenorKey,
          mapping.tenorLabel,
          mapping.updatedBy,
          mapping.accountA.accountNumber,
          mapping.accountA.accountDescription,
          mapping.accountB.accountNumber,
          mapping.accountB.accountDescription,
        ]),
      ].some((value) => value.toLocaleLowerCase().includes(query)),
    );
  });

  protected readonly selectedFamily = computed(() => {
    const familyKey = this.selectedFamilyKey();
    return familyKey ? (this.categories().flatMap((category) => category.families).find((family) => family.familyKey === familyKey) ?? null) : null;
  });

  constructor(private readonly api: BalanceAccountMaintenanceApiService) {}

  ngOnInit(): void {
    this.load();
  }

  protected reload(): void {
    this.load();
  }

  protected reloadConfiguration(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.reloadMessage.set('');
    this.api.reloadConfiguration().subscribe({
      next: (response) => {
        this.applyResponse(response);
        this.reloadMessage.set('Configuration defaults reloaded and saved to the database.');
      },
      error: () => {
        this.loadError.set('Unable to reload Account Number configuration. Database values were not changed.');
        this.loading.set(false);
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.loadError.set('');
    this.api.list().subscribe({
      next: (response) => this.applyResponse(response),
      error: () => {
        this.loadError.set('Unable to load Balance Account Numbers. Try again or check the Balance microservice.');
        this.loading.set(false);
      },
    });
  }

  private applyResponse(response: BalanceAccountMappingsResponse): void {
    this.categories.set(response.categories);
    this.activeCategoryKey.set(response.categories[0]?.categoryKey ?? null);
    this.savedMappings.set(Object.fromEntries(response.items.map((item) => [item.mappingKey, item])));
    this.selectedFamilyKey.set(null);
    this.editingFamilyKey.set(null);
    this.savingFamilyKey.set(null);
    this.familyMessages.set({});
    this.glEditorValues.set(null);
    this.validation.set(response.validation);
    this.loading.set(false);
  }

  protected selectCategory(categoryKey: string): void {
    if (!this.categories().some((category) => category.categoryKey === categoryKey) || this.savingFamilyKey()) return;
    this.activeCategoryKey.set(categoryKey);
    this.selectedFamilyKey.set(null);
    this.editingFamilyKey.set(null);
  }

  protected viewFamily(familyKey: string): void {
    const family = this.categories().flatMap((category) => category.families).find((item) => item.familyKey === familyKey);
    if (!family) return;
    this.selectedFamilyKey.set(familyKey);
    this.glEditorValues.set(this.deriveGlEditorValues(family));
    this.clearMessage(familyKey);
  }

  protected backToIndex(): void {
    const family = this.selectedFamily();
    if (!family || this.savingFamilyKey() === family.familyKey) return;
    if (this.editingFamilyKey() === family.familyKey) this.cancelEdit(family.familyKey);
    this.selectedFamilyKey.set(null);
  }

  protected beginEdit(familyKey: string): void {
    if (this.selectedFamilyKey() !== familyKey) return;
    const family = this.selectedFamily();
    if (!family) return;
    const glValues = this.glEditorValues()!;
    this.glEditorValues.set(glValues);
    this.categories.update((categories) => this.mapFamily(categories, familyKey, (current) => ({
      ...current,
      mappings: current.mappings.map((mapping) => ({
        ...mapping,
        accountA: this.composedIdentity(mapping, 'accountA', glValues),
        accountB: this.composedIdentity(mapping, 'accountB', glValues),
      })),
    })));
    this.editingFamilyKey.set(familyKey);
    this.clearMessage(familyKey);
  }

  protected isEditing(familyKey: string): boolean {
    return this.editingFamilyKey() === familyKey;
  }

  protected updateField(mappingKey: string, side: AccountSide, field: AccountField, value: string): void {
    const family = this.selectedFamily();
    if (!family || !this.isEditing(family.familyKey) || !family.mappings.some((mapping) => mapping.mappingKey === mappingKey)) return;
    this.categories.update((categories) => this.mapFamily(categories, family.familyKey, (current) => ({
      ...current,
      mappings: current.mappings.map((mapping) =>
        mapping.mappingKey === mappingKey ? { ...mapping, [side]: { ...mapping[side], [field]: value } } : mapping,
      ),
    })));
    this.clearMessage(family.familyKey);
  }

  protected glValue(side: AccountSide, field: AccountField): string {
    return this.glEditorValues()?.[side][field] ?? '';
  }

  protected slValue(mapping: BalanceAccountMappingDto, side: AccountSide, field: AccountField): string {
    return extractSlPart(mapping, side, field, this.glValue(side, field));
  }

  protected updateGlField(side: AccountSide, field: AccountField, value: string): void {
    const family = this.selectedFamily();
    const current = this.glEditorValues();
    if (!family || !current || !this.isEditing(family.familyKey)) return;
    const slValues = new Map(family.mappings.map((mapping) => [mapping.mappingKey, extractSlPart(mapping, side, field, current[side][field])]));
    const next: GlEditorValues = { ...current, [side]: { ...current[side], [field]: value } };
    this.glEditorValues.set(next);
    this.categories.update((categories) => this.mapFamily(categories, family.familyKey, (selected) => ({
      ...selected,
      mappings: selected.mappings.map((mapping) => ({
        ...mapping,
        [side]: { ...mapping[side], [field]: joinAccountParts(value, slValues.get(mapping.mappingKey)!) },
      })),
    })));
    this.clearMessage(family.familyKey);
  }

  protected updateSlField(mapping: BalanceAccountMappingDto, side: AccountSide, field: AccountField, value: string): void {
    this.updateField(mapping.mappingKey, side, field, joinAccountParts(this.glValue(side, field), value));
  }

  protected isFamilyDirty(family: BalanceAccountFamilyDto): boolean {
    return family.mappings.some((mapping) => {
      const saved = this.savedMappings()[mapping.mappingKey];
      return !saved || accountChanged(mapping.accountA, saved.accountA) || accountChanged(mapping.accountB, saved.accountB);
    });
  }

  protected cancelEdit(familyKey: string): void {
    this.categories.update((categories) => this.mapFamily(categories, familyKey, (family) => ({
      ...family,
      mappings: family.mappings.map((mapping) => this.savedMappings()[mapping.mappingKey] ?? mapping),
    })));
    this.editingFamilyKey.set(null);
    this.glEditorValues.set(this.deriveGlEditorValues(this.selectedFamily()!));
    this.clearMessage(familyKey);
  }

  protected save(family: BalanceAccountFamilyDto): void {
    if (!this.isEditing(family.familyKey) || !this.isFamilyDirty(family)) return;
    const actor = this.updatedBy().trim();
    if (!actor) {
      this.setMessage(family.familyKey, 'error', 'Updated By is required.');
      return;
    }
    this.savingFamilyKey.set(family.familyKey);
    this.api.updateFamily(family, actor).subscribe({
      next: (saved) => {
        this.categories.update((categories) => this.mapFamily(categories, saved.familyKey, () => saved));
        this.savedMappings.update((current) => ({ ...current, ...Object.fromEntries(saved.mappings.map((mapping) => [mapping.mappingKey, mapping])) }));
        this.editingFamilyKey.set(null);
        this.savingFamilyKey.set(null);
        this.setMessage(family.familyKey, 'success', 'GL family and Tenor sub-ledgers saved.');
      },
      error: (error: { status?: number; error?: { message?: string } }) => {
        this.savingFamilyKey.set(null);
        const fallback = error.status === 409
          ? 'This GL family was changed by another user. Reload before saving again.'
          : 'Unable to save this GL family.';
        this.setMessage(family.familyKey, 'error', error.error?.message ?? fallback);
      },
    });
  }

  private mapFamily(
    categories: BalanceAccountCategoryDto[],
    familyKey: string,
    mapper: (family: BalanceAccountFamilyDto) => BalanceAccountFamilyDto,
  ): BalanceAccountCategoryDto[] {
    return categories.map((category) => ({
      ...category,
      families: category.families.map((family) => family.familyKey === familyKey ? mapper(family) : family),
    }));
  }

  private clearMessage(familyKey: string): void {
    this.familyMessages.update((messages) => {
      const next = { ...messages };
      delete next[familyKey];
      return next;
    });
  }

  private setMessage(familyKey: string, kind: 'success' | 'error', text: string): void {
    this.familyMessages.update((messages) => ({ ...messages, [familyKey]: { kind, text } }));
  }

  private deriveGlEditorValues(family: BalanceAccountFamilyDto): GlEditorValues {
    return {
      accountA: {
        accountNumber: deriveGlPart(family.mappings, 'accountA', 'accountNumber'),
        accountDescription: deriveGlPart(family.mappings, 'accountA', 'accountDescription'),
      },
      accountB: {
        accountNumber: deriveGlPart(family.mappings, 'accountB', 'accountNumber'),
        accountDescription: deriveGlPart(family.mappings, 'accountB', 'accountDescription'),
      },
    };
  }

  private composedIdentity(mapping: BalanceAccountMappingDto, side: AccountSide, values: GlEditorValues): BalanceAccountMappingDto[AccountSide] {
    return {
      accountNumber: joinAccountParts(values[side].accountNumber, this.slValue(mapping, side, 'accountNumber')),
      accountDescription: joinAccountParts(values[side].accountDescription, this.slValue(mapping, side, 'accountDescription')),
    };
  }
}

const ACCOUNT_PART_SEPARATOR = ' — ';

function deriveGlPart(mappings: readonly BalanceAccountMappingDto[], side: AccountSide, field: AccountField): string {
  const basis = (mappings.find((mapping) => mapping.tenorKey === 'SIGHT') ?? mappings[0])!;
  return removeTenor(basis[side][field], basis.tenorKey, basis.tenorLabel);
}

function removeTenor(value: string, tenorKey: string, tenorLabel: string): string {
  return [tenorLabel, tenorKey]
    .reduce((current, token) => current.replace(new RegExp(`\\s*[—-]?\\s*${escapeRegExp(token)}\\s*[—-]?\\s*`, 'i'), ' — '), value)
    .replace(/^\s*—\s*|\s*—\s*$/g, '')
    .trim();
}

function joinAccountParts(gl: string, sl: string): string {
  return [gl.trim(), sl.trim()].filter(Boolean).join(ACCOUNT_PART_SEPARATOR);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function defaultSlPart(mapping: BalanceAccountMappingDto, field: AccountField): string {
  return field === 'accountNumber' ? mapping.tenorKey : mapping.tenorLabel;
}

function extractSlPart(mapping: BalanceAccountMappingDto, side: AccountSide, field: AccountField, gl: string): string {
  const value = mapping[side][field];
  const prefix = `${gl}${ACCOUNT_PART_SEPARATOR}`;
  return value.startsWith(prefix) ? value.slice(prefix.length) : defaultSlPart(mapping, field);
}

function accountChanged(left: BalanceAccountMappingDto[AccountSide], right: BalanceAccountMappingDto[AccountSide]): boolean {
  return left.accountNumber !== right.accountNumber || left.accountDescription !== right.accountDescription;
}
