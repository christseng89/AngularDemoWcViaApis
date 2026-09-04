import type { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { BalanceAccountFamilyDto, BalanceAccountMaintenanceApiService, BalanceAccountMappingDto, BalanceAccountMappingsResponse } from './balance-account-maintenance-api.service';

const mapping: BalanceAccountMappingDto = {
  mappingKey: 'IPLC_LC:SIGHT', instrumentType: 'IPLC_LC', riskClass: 'SIGHT',
  categoryKey: 'IMPORT', categoryLabel: 'Import LC', familyKey: 'IMPORT_LC_BALANCE', familyLabel: 'Import LC Balance', tenorKey: 'SIGHT', tenorLabel: 'Sight',
  accountA: { accountNumber: '110001', accountDescription: 'Customer liability' },
  accountB: { accountNumber: '210001', accountDescription: 'Outstanding LC' },
  version: 3, updatedBy: 'demo-user', updatedAt: '2026-09-02T00:00:00.000Z',
};

const family: BalanceAccountFamilyDto = {
  familyKey: 'IMPORT_LC_BALANCE', categoryKey: 'IMPORT', label: 'Import LC Balance', instrumentType: 'IPLC_LC',
  defaultTenorKey: 'SIGHT', tenorKeys: ['SIGHT'], mappings: [mapping],
};

describe('BalanceAccountMaintenanceApiService', () => {
  it('lists configured categories through the microservice proxy', () => {
    const response: BalanceAccountMappingsResponse = {
      items: [mapping], categories: [{ categoryKey: 'IMPORT', label: 'Import LC', tenorTypes: [], families: [family] }],
      validation: { pattern: '^\\d+$', minLength: 6, maxLength: 6 },
    };
    const get = jest.fn(() => of(response));
    const service = new BalanceAccountMaintenanceApiService({ get } as unknown as HttpClient);
    service.list().subscribe((result) => expect(result).toEqual(response));
    expect(get).toHaveBeenCalledWith('/balance-component/balance-account-mappings');
  });

  it('updates every configured SL through the atomic family endpoint', () => {
    const put = jest.fn(() => of(family));
    const service = new BalanceAccountMaintenanceApiService({ put } as unknown as HttpClient);
    service.updateFamily(family, 'operator-1').subscribe((result) => expect(result).toEqual(family));
    expect(put).toHaveBeenCalledWith('/balance-component/balance-account-mappings/families/IMPORT_LC_BALANCE', {
      updatedBy: 'operator-1',
      mappings: [{ mappingKey: mapping.mappingKey, expectedVersion: 3, accountA: mapping.accountA, accountB: mapping.accountB }],
    });
  });

  it('reloads every mapping from server configuration', () => {
    const response: BalanceAccountMappingsResponse = {
      items: [mapping], categories: [{ categoryKey: 'IMPORT', label: 'Import LC', tenorTypes: [], families: [family] }],
      validation: { pattern: '^\\d+$', minLength: 6, maxLength: 6 },
    };
    const post = jest.fn(() => of(response));
    const service = new BalanceAccountMaintenanceApiService({ post } as unknown as HttpClient);
    service.reloadConfiguration().subscribe((result) => expect(result).toEqual(response));
    expect(post).toHaveBeenCalledWith('/balance-component/balance-account-mappings/reload-configuration', {});
  });
});
