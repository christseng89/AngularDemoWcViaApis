import { TestBed } from '@angular/core/testing';
import type { Signal, WritableSignal } from '@angular/core';
import { of, Subject, throwError } from 'rxjs';
import { BalanceAccountCategoryDto, BalanceAccountFamilyDto, BalanceAccountMaintenanceApiService, BalanceAccountMappingDto, BalanceAccountMappingsResponse } from './balance-account-maintenance-api.service';
import { BalanceAccountMaintenanceComponent } from './balance-account-maintenance.component';

function mapping(mappingKey: string, tenorKey: string, tenorLabel: string): BalanceAccountMappingDto {
  return {
    mappingKey, instrumentType: 'IPLC_LC', riskClass: tenorKey,
    categoryKey: 'IMPORT', categoryLabel: 'Import LC', familyKey: 'IMPORT_LC_BALANCE', familyLabel: 'Import LC Balance', tenorKey, tenorLabel,
    accountA: { accountNumber: `A-${tenorKey}`, accountDescription: `A ${tenorLabel}` },
    accountB: { accountNumber: `B-${tenorKey}`, accountDescription: `B ${tenorLabel}` },
    version: 1, updatedBy: 'seed', updatedAt: '2026-09-04T00:00:00.000Z',
  };
}

const importMappings = [mapping('IPLC_LC:SIGHT', 'SIGHT', 'Sight'), mapping('IPLC_LC:BUYERS_USANCE', 'BUYERS_USANCE', "Buyer's Usance")];
const importFamily: BalanceAccountFamilyDto = {
  familyKey: 'IMPORT_LC_BALANCE', categoryKey: 'IMPORT', label: 'Import LC Balance', instrumentType: 'IPLC_LC',
  defaultTenorKey: 'SIGHT', tenorKeys: importMappings.map((item) => item.tenorKey), mappings: importMappings,
};
const exportFamily: BalanceAccountFamilyDto = {
  familyKey: 'CONFIRMED_LC_BALANCE', categoryKey: 'EXPORT', label: 'Confirmed LC Balance', instrumentType: 'EPLC_CONFIRMATION',
  tenorKeys: ['SIGHT'], mappings: [{ ...mapping('EPLC_CONFIRMATION:SIGHT', 'SIGHT', 'Sight'), instrumentType: 'EPLC_CONFIRMATION', categoryKey: 'EXPORT', categoryLabel: 'Export Confirmed', familyKey: 'CONFIRMED_LC_BALANCE', familyLabel: 'Confirmed LC Balance' }],
};
const categories: BalanceAccountCategoryDto[] = [
  { categoryKey: 'IMPORT', label: 'Import LC', tenorTypes: [], families: [importFamily] },
  { categoryKey: 'EXPORT', label: 'Export Confirmed', tenorTypes: [], families: [exportFamily] },
];
const response: BalanceAccountMappingsResponse = {
  items: categories.flatMap((category) => category.families.flatMap((family) => family.mappings)), categories,
  validation: { pattern: '^.+$', minLength: 1, maxLength: 128 },
};

function api(overrides: { list?: jest.Mock; reloadConfiguration?: jest.Mock; updateFamily?: jest.Mock } = {}) {
  return {
    list: overrides.list ?? jest.fn(() => of(response)),
    reloadConfiguration: overrides.reloadConfiguration ?? jest.fn(() => of(response)),
    updateFamily: overrides.updateFamily ?? jest.fn(() => of({ ...importFamily, mappings: importMappings.map((item) => ({ ...item, version: 2 })) })),
  } as unknown as BalanceAccountMaintenanceApiService;
}

function exposed(component: BalanceAccountMaintenanceComponent) {
  return component as unknown as {
    categories: WritableSignal<BalanceAccountCategoryDto[]>;
    activeCategoryKey: WritableSignal<string | null>;
    selectedFamilyKey: WritableSignal<string | null>;
    editingFamilyKey: WritableSignal<string | null>;
    savingFamilyKey: WritableSignal<string | null>;
    updatedBy: WritableSignal<string>;
    searchQuery: WritableSignal<string>;
    loadError: WritableSignal<string>;
    reloadMessage: WritableSignal<string>;
    validation: WritableSignal<{ pattern: string; minLength: number; maxLength: number }>;
    familyMessages: WritableSignal<Readonly<Record<string, { kind: 'success' | 'error'; text: string }>>>;
    glEditorValues: WritableSignal<unknown>;
    fixedLength: Signal<number | null>;
    selectedFamily: Signal<BalanceAccountFamilyDto | null>;
    filteredFamilies: Signal<BalanceAccountFamilyDto[]>;
    selectCategory(key: string): void;
    viewFamily(key: string): void;
    beginEdit(key: string): void;
    updateField(key: string, side: 'accountA' | 'accountB', field: 'accountNumber' | 'accountDescription', value: string): void;
    glValue(side: 'accountA' | 'accountB', field: 'accountNumber' | 'accountDescription'): string;
    slValue(mapping: BalanceAccountMappingDto, side: 'accountA' | 'accountB', field: 'accountNumber' | 'accountDescription'): string;
    updateGlField(side: 'accountA' | 'accountB', field: 'accountNumber' | 'accountDescription', value: string): void;
    updateSlField(mapping: BalanceAccountMappingDto, side: 'accountA' | 'accountB', field: 'accountNumber' | 'accountDescription', value: string): void;
    isFamilyDirty(family: BalanceAccountFamilyDto): boolean;
    cancelEdit(key: string): void;
    backToIndex(): void;
    save(family: BalanceAccountFamilyDto): void;
    reload(): void;
    reloadConfiguration(): void;
  };
}

describe('BalanceAccountMaintenanceComponent', () => {
  it('renders the same Import LC / Export Confirmed tabs and groups rows by GL family', async () => {
    await TestBed.configureTestingModule({ imports: [BalanceAccountMaintenanceComponent], providers: [{ provide: BalanceAccountMaintenanceApiService, useValue: api() }] }).compileComponents();
    const fixture = TestBed.createComponent(BalanceAccountMaintenanceComponent);
    fixture.detectChanges();
    const tabs = [...fixture.nativeElement.querySelectorAll('[role=tab]')].map((item: HTMLElement) => item.textContent?.trim());
    expect(tabs).toEqual(['Import LC', 'Export Confirmed']);
    expect(fixture.nativeElement.textContent).toContain('Import LC Balance');
    expect(fixture.nativeElement.querySelectorAll('.mapping-index__row')).toHaveLength(1);

    (fixture.nativeElement.querySelector('.mapping-index__row') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect([...fixture.nativeElement.querySelectorAll('.gl-card__title')].map((item: HTMLElement) => item.textContent?.trim())).toEqual([
      'GL — Contingent Liability',
      'GL — Liability',
    ]);
    expect(fixture.nativeElement.querySelectorAll('.gl-card')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.gl-card__subledgers .subledger-card')).toHaveLength(4);
    expect(fixture.nativeElement.querySelectorAll('.gl-card__fields input')).toHaveLength(4);
    expect(fixture.nativeElement.textContent).toContain('GL Account Number');
    expect(fixture.nativeElement.textContent).toContain('SL Account Number');
    expect(fixture.nativeElement.textContent).toContain('SL — Sight');
    expect(fixture.nativeElement.textContent).toContain("SL — Buyer's Usance");

    (fixture.nativeElement.querySelector('.back-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    (fixture.nativeElement.querySelectorAll('[role=tab]')[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Confirmed LC Balance');
  });

  it('edits separate Tenor SL values and saves the complete family atomically', () => {
    const updateFamily = jest.fn(() => of({ ...importFamily, mappings: importMappings.map((item) => ({ ...item, version: 2 })) }));
    const component = new BalanceAccountMaintenanceComponent(api({ updateFamily }));
    const state = exposed(component);
    component.ngOnInit();
    state.viewFamily(importFamily.familyKey);
    state.beginEdit(importFamily.familyKey);
    expect(state.glValue('accountA', 'accountNumber')).toBe('A');
    expect(state.slValue(state.selectedFamily()!.mappings[0], 'accountA', 'accountNumber')).toBe('SIGHT');
    state.updateGlField('accountA', 'accountNumber', 'GL-A');
    state.updateSlField(state.selectedFamily()!.mappings[1], 'accountA', 'accountNumber', 'BUYER-SL');
    state.updateGlField('accountB', 'accountDescription', 'GL-B Description');
    state.updateSlField(state.selectedFamily()!.mappings[0], 'accountB', 'accountDescription', 'Sight SL Description');
    const edited = state.selectedFamily()!;
    expect(edited.mappings[0].accountA.accountNumber).toBe('GL-A — SIGHT');
    expect(edited.mappings[1].accountA.accountNumber).toBe('GL-A — BUYER-SL');
    expect(edited.mappings[0].accountB.accountDescription).toBe('GL-B Description — Sight SL Description');
    expect(state.isFamilyDirty(edited)).toBe(true);

    state.save(edited);
    expect(updateFamily).toHaveBeenCalledWith(expect.objectContaining({ familyKey: 'IMPORT_LC_BALANCE', mappings: expect.any(Array) }), 'demo-user');
    expect(state.editingFamilyKey()).toBeNull();
  });

  it('filters within the active configured category and restores cancelled edits', () => {
    const component = new BalanceAccountMaintenanceComponent(api());
    const state = exposed(component);
    component.ngOnInit();
    state.searchQuery.set('buyer');
    expect(state.filteredFamilies()).toEqual([importFamily]);
    state.viewFamily(importFamily.familyKey);
    state.beginEdit(importFamily.familyKey);
    state.updateField(importMappings[0].mappingKey, 'accountA', 'accountNumber', 'CHANGED');
    state.cancelEdit(importFamily.familyKey);
    expect(state.selectedFamily()!.mappings[0].accountA.accountNumber).toBe('A-SIGHT');
    state.backToIndex();
    expect(state.selectedFamily()).toBeNull();
  });

  it('guards invalid navigation, missing actor, in-flight navigation, and load errors', () => {
    const pending = new Subject<BalanceAccountFamilyDto>();
    const component = new BalanceAccountMaintenanceComponent(api({ updateFamily: jest.fn(() => pending) }));
    const state = exposed(component);
    component.ngOnInit();
    state.selectCategory('UNKNOWN');
    expect(state.activeCategoryKey()).toBe('IMPORT');
    state.viewFamily('UNKNOWN');
    expect(state.selectedFamily()).toBeNull();
    state.viewFamily(importFamily.familyKey);
    state.beginEdit(importFamily.familyKey);
    state.updateField(importMappings[0].mappingKey, 'accountA', 'accountNumber', 'CHANGED');
    state.updatedBy.set(' ');
    state.save(state.selectedFamily()!);
    expect(state.savingFamilyKey()).toBeNull();
    state.updatedBy.set('maker1');
    state.save(state.selectedFamily()!);
    state.backToIndex();
    expect(state.selectedFamily()).not.toBeNull();
    pending.error({ status: 409 });
    expect(state.savingFamilyKey()).toBeNull();

    const offline = new BalanceAccountMaintenanceComponent(api({ list: jest.fn(() => throwError(() => new Error('offline'))) }));
    const offlineState = exposed(offline);
    offlineState.reload();
    expect(offlineState.loadError()).toContain('Unable to load');
  });

  it('uses Reload to overwrite DB mappings from configuration and refresh the screen', () => {
    const configured = {
      ...response,
      items: response.items.map((item) => ({ ...item, version: 1, updatedBy: 'SYSTEM_CONFIG_RELOAD' })),
      categories: response.categories.map((category) => ({
        ...category,
        families: category.families.map((family) => ({
          ...family,
          mappings: family.mappings.map((item) => ({ ...item, version: 1, updatedBy: 'SYSTEM_CONFIG_RELOAD' })),
        })),
      })),
    };
    const reloadConfiguration = jest.fn(() => of(configured));
    const component = new BalanceAccountMaintenanceComponent(api({ reloadConfiguration }));
    const state = exposed(component);
    component.ngOnInit();
    state.reloadConfiguration();
    expect(reloadConfiguration).toHaveBeenCalledTimes(1);
    expect(state.categories()[0]!.families[0]!.mappings[0]!.updatedBy).toBe('SYSTEM_CONFIG_RELOAD');
    expect(state.reloadMessage()).toContain('Configuration defaults reloaded');

    const failed = new BalanceAccountMaintenanceComponent(api({ reloadConfiguration: jest.fn(() => throwError(() => new Error('reset failed'))) }));
    const failedState = exposed(failed);
    failed.ngOnInit();
    failedState.reloadConfiguration();
    expect(failedState.loadError()).toContain('Database values were not changed');
  });

  it('covers configured filtering, empty responses, and guarded edit actions', () => {
    const component = new BalanceAccountMaintenanceComponent(api());
    const state = exposed(component);
    component.ngOnInit();
    expect(state.fixedLength()).toBeNull();
    state.validation.set({ pattern: '^.+$', minLength: 12, maxLength: 12 });
    expect(state.fixedLength()).toBe(12);
    expect(state.filteredFamilies()).toEqual([importFamily]);
    state.searchQuery.set('no-match');
    expect(state.filteredFamilies()).toEqual([]);
    state.searchQuery.set('a-sight');
    expect(state.filteredFamilies()).toEqual([importFamily]);

    state.selectedFamilyKey.set('UNKNOWN');
    expect(state.selectedFamily()).toBeNull();
    state.backToIndex();
    state.beginEdit(importFamily.familyKey);
    state.updateField(importMappings[0].mappingKey, 'accountA', 'accountNumber', 'IGNORED');
    state.viewFamily(importFamily.familyKey);
    state.updateField('UNKNOWN', 'accountA', 'accountNumber', 'IGNORED');
    expect(state.selectedFamily()!.mappings[0].accountA.accountNumber).toBe('A-SIGHT');
    state.beginEdit(importFamily.familyKey);
    state.updateField(importMappings[0].mappingKey, 'accountA', 'accountNumber', 'TEMPORARY');
    state.backToIndex();
    expect(state.selectedFamily()).toBeNull();

    const empty = new BalanceAccountMaintenanceComponent(api({ list: jest.fn(() => of({ ...response, items: [], categories: [] })) }));
    const emptyState = exposed(empty);
    empty.ngOnInit();
    expect(emptyState.activeCategoryKey()).toBeNull();
  });

  it('uses server messages and the generic fallback for failed atomic saves', () => {
    const updateFamily = jest
      .fn()
      .mockReturnValueOnce(throwError(() => ({ status: 500, error: { message: 'Configured account rejected.' } })))
      .mockReturnValueOnce(throwError(() => ({ status: 500 })));
    const component = new BalanceAccountMaintenanceComponent(api({ updateFamily }));
    const state = exposed(component);
    component.ngOnInit();
    state.viewFamily(importFamily.familyKey);
    state.beginEdit(importFamily.familyKey);
    state.updateField(importMappings[0].mappingKey, 'accountA', 'accountDescription', 'Changed once');
    state.save(state.selectedFamily()!);
    expect(state.familyMessages()[importFamily.familyKey]?.text).toBe('Configured account rejected.');
    state.updateField(importMappings[0].mappingKey, 'accountA', 'accountDescription', 'Changed twice');
    state.save(state.selectedFamily()!);
    expect(state.familyMessages()[importFamily.familyKey]?.text).toBe('Unable to save this GL family.');
  });

  it('derives GL from the first configured Tenor when Sight is absent and supports empty editor parts', () => {
    const noSightMapping = {
      ...mapping('IPLC_ACCEPTANCE:BUYERS_USANCE', 'BUYERS_USANCE', "Buyer's Usance"),
      familyKey: 'IMPORT_ACCEPTANCE_BALANCE',
      familyLabel: 'Import Acceptance Balance',
      accountA: { accountNumber: "Acceptance Buyer's Usance — Customer", accountDescription: "Acceptance Buyer's Usance — Customer" },
    };
    const noSightFamily: BalanceAccountFamilyDto = {
      familyKey: 'IMPORT_ACCEPTANCE_BALANCE', categoryKey: 'IMPORT', label: 'Import Acceptance Balance', instrumentType: 'IPLC_ACCEPTANCE',
      tenorKeys: ['BUYERS_USANCE'], mappings: [noSightMapping],
    };
    const component = new BalanceAccountMaintenanceComponent(api());
    const state = exposed(component);
    component.ngOnInit();
    state.categories.set([{ categoryKey: 'IMPORT', label: 'Import LC', tenorTypes: [], families: [noSightFamily] }]);
    state.viewFamily(noSightFamily.familyKey);
    expect(state.glValue('accountA', 'accountDescription')).toBe('Acceptance — Customer');
    state.beginEdit(noSightFamily.familyKey);
    state.updateGlField('accountA', 'accountNumber', ' ');
    expect(state.selectedFamily()!.mappings[0].accountA.accountNumber).toBe('BUYERS_USANCE');
    state.updateSlField(state.selectedFamily()!.mappings[0], 'accountA', 'accountNumber', ' ');
    expect(state.selectedFamily()!.mappings[0].accountA.accountNumber).toBe('');

    const extra = { ...noSightMapping, mappingKey: 'UNSAVED', tenorKey: 'UNSAVED' };
    expect(state.isFamilyDirty({ ...noSightFamily, mappings: [extra] })).toBe(true);
    state.categories.set([{ categoryKey: 'IMPORT', label: 'Import LC', tenorTypes: [], families: [{ ...noSightFamily, mappings: [extra] }] }]);
    state.selectedFamilyKey.set(noSightFamily.familyKey);
    state.cancelEdit(noSightFamily.familyKey);
    expect(state.selectedFamily()!.mappings[0].mappingKey).toBe('UNSAVED');
  });

  it('keeps GL editor commands safe outside an active edit and skips unchanged saves', () => {
    const updateFamily = jest.fn(() => of(importFamily));
    const component = new BalanceAccountMaintenanceComponent(api({ updateFamily }));
    const state = exposed(component);
    expect(state.glValue('accountA', 'accountNumber')).toBe('');
    state.updateGlField('accountA', 'accountNumber', 'IGNORED');
    component.ngOnInit();
    state.viewFamily(importFamily.familyKey);
    state.updateGlField('accountA', 'accountNumber', 'IGNORED');
    state.editingFamilyKey.set(importFamily.familyKey);
    state.glEditorValues.set(null);
    state.updateGlField('accountA', 'accountNumber', 'IGNORED');
    state.save(state.selectedFamily()!);
    expect(updateFamily).not.toHaveBeenCalled();

    state.editingFamilyKey.set(null);
    state.selectedFamilyKey.set(importFamily.familyKey);
    state.categories.set([]);
    state.beginEdit(importFamily.familyKey);
    expect(state.editingFamilyKey()).toBeNull();
  });
});
