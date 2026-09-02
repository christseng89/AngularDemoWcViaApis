import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface BalanceAccountIdentityDto {
  accountNumber: string;
  accountDescription: string;
}

export interface BalanceAccountMappingDto {
  mappingKey: string;
  instrumentType: string;
  riskClass: string;
  accountA: BalanceAccountIdentityDto;
  accountB: BalanceAccountIdentityDto;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface BalanceAccountMappingsResponse {
  items: BalanceAccountMappingDto[];
  validation: { pattern: string; minLength: number; maxLength: number };
}

@Injectable({ providedIn: 'root' })
export class BalanceAccountMaintenanceApiService {
  private readonly base = '/balance-component/balance-account-mappings';

  constructor(private readonly http: HttpClient) {}

  list(): Observable<BalanceAccountMappingsResponse> {
    return this.http.get<BalanceAccountMappingsResponse>(this.base);
  }

  update(mapping: BalanceAccountMappingDto, updatedBy: string): Observable<BalanceAccountMappingDto> {
    return this.http.put<BalanceAccountMappingDto>(`${this.base}/${encodeURIComponent(mapping.mappingKey)}`, {
      expectedVersion: mapping.version,
      updatedBy,
      accountA: mapping.accountA,
      accountB: mapping.accountB,
    });
  }
}
