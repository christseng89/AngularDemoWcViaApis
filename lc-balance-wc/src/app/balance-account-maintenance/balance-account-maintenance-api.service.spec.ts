import type { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { BalanceAccountMaintenanceApiService, BalanceAccountMappingDto, BalanceAccountMappingsResponse } from './balance-account-maintenance-api.service';

const mapping: BalanceAccountMappingDto = {
  mappingKey: 'IPLC_LC:SIGHT',
  instrumentType: 'IPLC_LC',
  riskClass: 'SIGHT',
  accountA: { accountNumber: '110001', accountDescription: 'Customer liability' },
  accountB: { accountNumber: '210001', accountDescription: 'Outstanding LC' },
  version: 3,
  updatedBy: 'demo-user',
  updatedAt: '2026-09-02T00:00:00.000Z',
};

describe('BalanceAccountMaintenanceApiService', () => {
  it('lists the fixed mapping table through the microservice proxy', () => {
    const response: BalanceAccountMappingsResponse = { items: [mapping], validation: { pattern: '^\\d+$', minLength: 6, maxLength: 6 } };
    const get = jest.fn(() => of(response));
    const service = new BalanceAccountMaintenanceApiService({ get } as unknown as HttpClient);

    service.list().subscribe((result) => expect(result).toEqual(response));

    expect(get).toHaveBeenCalledWith('/balance-component/balance-account-mappings');
  });

  it('updates a complete account pair and URI-encodes its fixed mapping key', () => {
    const put = jest.fn(() => of(mapping));
    const service = new BalanceAccountMaintenanceApiService({ put } as unknown as HttpClient);

    service.update(mapping, 'operator-1').subscribe((result) => expect(result).toEqual(mapping));

    expect(put).toHaveBeenCalledWith('/balance-component/balance-account-mappings/IPLC_LC%3ASIGHT', {
      expectedVersion: 3,
      updatedBy: 'operator-1',
      accountA: mapping.accountA,
      accountB: mapping.accountB,
    });
  });
});
