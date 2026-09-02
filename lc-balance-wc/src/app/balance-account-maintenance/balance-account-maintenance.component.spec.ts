import { of, Subject, throwError } from 'rxjs';
import type { Signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BalanceAccountMaintenanceApiService, type BalanceAccountMappingDto, type BalanceAccountMappingsResponse } from './balance-account-maintenance-api.service';
import { BalanceAccountMaintenanceComponent } from './balance-account-maintenance.component';

const mapping: BalanceAccountMappingDto = {
  mappingKey: 'IPLC_LC:SIGHT',
  instrumentType: 'IPLC_LC',
  riskClass: 'SIGHT',
  accountA: { accountNumber: '110001', accountDescription: 'Customer liability' },
  accountB: { accountNumber: '210001', accountDescription: 'Outstanding LC' },
  version: 1,
  updatedBy: 'seed',
  updatedAt: '2026-09-02T00:00:00.000Z',
};

const neighboringMapping: BalanceAccountMappingDto = {
  ...mapping,
  mappingKey: 'IPLC_LC:BUYERS_USANCE',
  riskClass: 'BUYERS_USANCE',
  accountA: { accountNumber: '110002', accountDescription: 'Buyer usance customer liability' },
  accountB: { accountNumber: '210002', accountDescription: 'Buyer usance outstanding LC' },
};

const response: BalanceAccountMappingsResponse = {
  items: [mapping],
  validation: { pattern: '^\\d+$', minLength: 6, maxLength: 6 },
};

function makeApi(overrides: { list?: jest.Mock; update?: jest.Mock } = {}) {
  return {
    list: overrides.list ?? jest.fn(() => of(response)),
    update: overrides.update ?? jest.fn(() => of({ ...mapping, version: 2, updatedBy: 'demo-user' })),
  } as unknown as BalanceAccountMaintenanceApiService;
}

function exposed(component: BalanceAccountMaintenanceComponent) {
  return component as unknown as {
    mappings: WritableSignal<BalanceAccountMappingDto[]>;
    loading: WritableSignal<boolean>;
    loadError: WritableSignal<string>;
    updatedBy: WritableSignal<string>;
    validation: WritableSignal<{ pattern: string; minLength: number; maxLength: number }>;
    searchQuery: WritableSignal<string>;
    selectedMappingKey: WritableSignal<string | null>;
    filteredMappings: Signal<BalanceAccountMappingDto[]>;
    selectedMapping: Signal<BalanceAccountMappingDto | null>;
    editingKeys: WritableSignal<ReadonlySet<string>>;
    savingKeys: WritableSignal<ReadonlySet<string>>;
    rowMessages: WritableSignal<Readonly<Record<string, { kind: 'success' | 'error'; text: string }>>>;
    fixedLength: Signal<number | null>;
    reload(): void;
    isEditing(mappingKey: string): boolean;
    viewMapping(mappingKey: string): void;
    backToIndex(): void;
    beginEdit(mappingKey: string): void;
    cancelEdit(mappingKey: string): void;
    updateField(mappingKey: string, side: 'accountA' | 'accountB', field: 'accountNumber' | 'accountDescription', value: string): void;
    isDirty(value: BalanceAccountMappingDto): boolean;
    save(value: BalanceAccountMappingDto): void;
  };
}

describe('BalanceAccountMaintenanceComponent', () => {
  it('opens one Index row in the same-page Detail, then reveals Save only after a field changes', async () => {
    await TestBed.configureTestingModule({
      imports: [BalanceAccountMaintenanceComponent],
      providers: [{ provide: BalanceAccountMaintenanceApiService, useValue: makeApi() }],
    }).compileComponents();
    const fixture = TestBed.createComponent(BalanceAccountMaintenanceComponent);
    fixture.detectChanges();
    const labels = () => [...fixture.nativeElement.querySelectorAll('button')].map((button: HTMLButtonElement) => button.textContent?.trim());

    expect(fixture.nativeElement.textContent).toContain('Account Set Index');
    expect(fixture.nativeElement.textContent).not.toContain('Contingent Liability');
    expect(fixture.nativeElement.querySelector('.mapping-index__columns').textContent).toContain('Version');
    expect(fixture.nativeElement.querySelector('.mapping-index__row > :nth-child(3)').textContent.trim()).toBe('1');
    (fixture.nativeElement.querySelector('.mapping-index__row') as HTMLButtonElement).click();
    fixture.detectChanges();
    const accountNumber = fixture.nativeElement.querySelector('.mapping-card input') as HTMLInputElement;
    expect(fixture.nativeElement.textContent).toContain('Contingent Liability');
    expect(fixture.nativeElement.textContent).toContain('Liability');
    expect(fixture.nativeElement.textContent).not.toContain('Account A');
    expect(fixture.nativeElement.textContent).not.toContain('Account B');
    expect(fixture.nativeElement.querySelector('.mapping-card header small').textContent).toContain('Version 1');
    expect(labels()).toContain('Edit');
    expect(labels()).toContain('← Back to Account Set Index');
    expect(labels()).not.toContain('Save Account Set');
    expect(accountNumber.readOnly).toBe(true);

    (fixture.nativeElement.querySelector('.mapping-card .secondary-button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(labels()).toContain('Cancel');
    expect(labels()).not.toContain('Save Account Set');
    expect(accountNumber.readOnly).toBe(false);

    accountNumber.value = '110002';
    accountNumber.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(labels()).toContain('Save Account Set');

    ([...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[]).find((button) => button.textContent?.trim() === 'Cancel')?.click();
    fixture.detectChanges();
    expect(labels()).toContain('Edit');
    expect(labels()).not.toContain('Cancel');
    expect((fixture.nativeElement.querySelector('.mapping-card input') as HTMLInputElement).value).toBe('110001');
  });

  it('filters the Index and Back restores an unsaved pair before returning to it', () => {
    const component = new BalanceAccountMaintenanceComponent(makeApi());
    const state = exposed(component);
    component.ngOnInit();

    state.searchQuery.set('no match');
    expect(state.filteredMappings()).toEqual([]);
    state.searchQuery.set('sight');
    expect(state.filteredMappings()).toEqual([mapping]);

    state.viewMapping(mapping.mappingKey);
    expect(state.selectedMapping()).toEqual(mapping);
    state.beginEdit(mapping.mappingKey);
    state.updateField(mapping.mappingKey, 'accountA', 'accountNumber', 'changed');
    state.backToIndex();

    expect(state.selectedMapping()).toBeNull();
    expect(state.isEditing(mapping.mappingKey)).toBe(false);
    expect(state.mappings()[0].accountA.accountNumber).toBe(mapping.accountA.accountNumber);
  });

  it('ignores unknown selections, edit attempts outside Detail, and unchanged saves', () => {
    const update = jest.fn();
    const component = new BalanceAccountMaintenanceComponent(makeApi({ update }));
    const state = exposed(component);
    component.ngOnInit();

    state.viewMapping('UNKNOWN');
    expect(state.selectedMapping()).toBeNull();
    state.beginEdit(mapping.mappingKey);
    expect(state.isEditing(mapping.mappingKey)).toBe(false);
    state.save(mapping);
    expect(update).not.toHaveBeenCalled();

    state.selectedMappingKey.set('REMOVED_AFTER_SELECTION');
    expect(state.selectedMapping()).toBeNull();
  });

  it('blocks Back while saving and preserves the neighboring Index mapping', () => {
    const subject = new Subject<BalanceAccountMappingDto>();
    const list = jest.fn(() => of({ ...response, items: [mapping, neighboringMapping] }));
    const component = new BalanceAccountMaintenanceComponent(makeApi({ list, update: jest.fn(() => subject) }));
    const state = exposed(component);
    component.ngOnInit();
    state.viewMapping(mapping.mappingKey);
    state.beginEdit(mapping.mappingKey);
    state.updateField(mapping.mappingKey, 'accountA', 'accountNumber', '110009');
    state.save(state.mappings()[0]);

    state.backToIndex();
    expect(state.selectedMappingKey()).toBe(mapping.mappingKey);

    const saved = { ...state.mappings()[0], version: 2 };
    subject.next(saved);
    subject.complete();
    expect(state.mappings()).toEqual([saved, neighboringMapping]);
    state.backToIndex();
    expect(state.selectedMapping()).toBeNull();
  });

  it('loads mappings and exposes an equal minimum/maximum as a fixed length', () => {
    const api = makeApi();
    const component = new BalanceAccountMaintenanceComponent(api);
    const state = exposed(component);

    component.ngOnInit();

    expect(state.mappings()).toEqual([mapping]);
    expect(state.validation()).toEqual(response.validation);
    expect(state.fixedLength()).toBe(6);
    expect(state.loading()).toBe(false);
    expect(state.isDirty(state.mappings()[0])).toBe(false);
  });

  it('allows edits only in edit mode and Cancel restores the persisted account pair', () => {
    const component = new BalanceAccountMaintenanceComponent(makeApi());
    const state = exposed(component);
    component.ngOnInit();

    state.updateField(mapping.mappingKey, 'accountA', 'accountNumber', 'blocked');
    expect(state.mappings()[0].accountA.accountNumber).toBe(mapping.accountA.accountNumber);

    state.viewMapping(mapping.mappingKey);
    state.beginEdit(mapping.mappingKey);
    expect(state.isEditing(mapping.mappingKey)).toBe(true);
    state.updateField(mapping.mappingKey, 'accountA', 'accountNumber', 'changed');
    expect(state.isDirty(state.mappings()[0])).toBe(true);

    state.cancelEdit(mapping.mappingKey);
    expect(state.isEditing(mapping.mappingKey)).toBe(false);
    expect(state.mappings()[0].accountA.accountNumber).toBe(mapping.accountA.accountNumber);
    expect(state.isDirty(state.mappings()[0])).toBe(false);
  });

  it('shows a load error while preserving a valid empty state', () => {
    const component = new BalanceAccountMaintenanceComponent(makeApi({ list: jest.fn(() => throwError(() => new Error('offline'))) }));
    const state = exposed(component);

    state.reload();

    expect(state.loading()).toBe(false);
    expect(state.loadError()).toContain('Unable to load');
    state.validation.set({ pattern: '.*', minLength: 2, maxLength: 8 });
    expect(state.fixedLength()).toBeNull();
  });

  it('edits one nested account field and clears the row message', () => {
    const component = new BalanceAccountMaintenanceComponent(makeApi());
    const state = exposed(component);
    component.ngOnInit();
    state.viewMapping(mapping.mappingKey);
    state.beginEdit(mapping.mappingKey);
    state.rowMessages.set({ [mapping.mappingKey]: { kind: 'success', text: 'old' } });

    state.updateField(mapping.mappingKey, 'accountB', 'accountDescription', 'New description');

    expect(state.mappings()[0].accountB.accountDescription).toBe('New description');
    expect(state.isDirty(state.mappings()[0])).toBe(true);
    expect(state.rowMessages()[mapping.mappingKey]).toBeUndefined();

    state.updateField(mapping.mappingKey, 'accountB', 'accountDescription', mapping.accountB.accountDescription);
    expect(state.isDirty(state.mappings()[0])).toBe(false);
  });

  it('requires an actor before saving', () => {
    const update = jest.fn();
    const component = new BalanceAccountMaintenanceComponent(makeApi({ update }));
    const state = exposed(component);
    state.updatedBy.set('  ');
    state.mappings.set([mapping]);
    state.viewMapping(mapping.mappingKey);
    state.beginEdit(mapping.mappingKey);
    state.mappings.set([{ ...mapping, accountA: { ...mapping.accountA, accountNumber: 'changed' } }]);

    state.save(state.mappings()[0]);

    expect(update).not.toHaveBeenCalled();
    expect(state.rowMessages()[mapping.mappingKey]).toEqual({ kind: 'error', text: 'Updated By is required.' });
  });

  it('saves the complete pair, replaces its version and clears the busy state', () => {
    const saved = { ...mapping, version: 2, updatedBy: 'demo-user' };
    const update = jest.fn(() => of(saved));
    const component = new BalanceAccountMaintenanceComponent(makeApi({ update }));
    const state = exposed(component);
    component.ngOnInit();
    state.viewMapping(mapping.mappingKey);
    state.beginEdit(mapping.mappingKey);
    state.updateField(mapping.mappingKey, 'accountA', 'accountNumber', '110002');

    state.save(state.mappings()[0]);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ accountA: expect.objectContaining({ accountNumber: '110002' }) }), 'demo-user');
    expect(state.mappings()[0]).toEqual(saved);
    expect(state.isEditing(mapping.mappingKey)).toBe(false);
    expect(state.isDirty(state.mappings()[0])).toBe(false);
    expect(state.savingKeys().has(mapping.mappingKey)).toBe(false);
    expect(state.rowMessages()[mapping.mappingKey]).toEqual({ kind: 'success', text: 'Account set saved.' });
  });

  it.each([
    [409, undefined, 'This account set was changed by another user. Reload before saving again.'],
    [500, undefined, 'Unable to save this account set.'],
    [400, 'Account Number is invalid.', 'Account Number is invalid.'],
  ])('maps save error %p to an actionable row message', (status, message, expected) => {
    const subject = new Subject<BalanceAccountMappingDto>();
    const component = new BalanceAccountMaintenanceComponent(makeApi({ update: jest.fn(() => subject) }));
    const state = exposed(component);
    component.ngOnInit();
    state.viewMapping(mapping.mappingKey);
    state.beginEdit(mapping.mappingKey);
    state.updateField(mapping.mappingKey, 'accountA', 'accountNumber', 'changed');
    state.save(state.mappings()[0]);
    expect(state.savingKeys().has(mapping.mappingKey)).toBe(true);

    subject.error({ status, error: message ? { message } : undefined });

    expect(state.savingKeys().has(mapping.mappingKey)).toBe(false);
    expect(state.rowMessages()[mapping.mappingKey]).toEqual({ kind: 'error', text: expected });
  });
});
