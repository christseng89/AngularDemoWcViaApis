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
  categoryKey: string;
  categoryLabel: string;
  familyKey: string;
  familyLabel: string;
  tenorKey: string;
  tenorLabel: string;
}

export interface BalanceAccountTenorDto {
  tenorKey: string;
  apiValue: string;
  label: string;
  behavior: 'SIGHT' | 'USANCE';
}

export interface BalanceAccountFamilyDto {
  familyKey: string;
  categoryKey: string;
  label: string;
  instrumentType: string;
  defaultTenorKey?: string;
  tenorKeys: string[];
  mappings: BalanceAccountMappingDto[];
}

export interface BalanceAccountCategoryDto {
  categoryKey: string;
  label: string;
  tenorTypes: BalanceAccountTenorDto[];
  families: BalanceAccountFamilyDto[];
}

export interface BalanceAccountMappingsResponse {
  items: BalanceAccountMappingDto[];
  categories: BalanceAccountCategoryDto[];
  validation: { pattern: string; minLength: number; maxLength: number };
}

@Injectable({ providedIn: 'root' })
export class BalanceAccountMaintenanceApiService {
  private readonly base = '/balance-component/balance-account-mappings';

  constructor(private readonly http: HttpClient) {}

  list(): Observable<BalanceAccountMappingsResponse> {
    return this.http.get<BalanceAccountMappingsResponse>(this.base);
  }

  reloadConfiguration(): Observable<BalanceAccountMappingsResponse> {
    return this.http.post<BalanceAccountMappingsResponse>(`${this.base}/reload-configuration`, {});
  }

  updateFamily(family: BalanceAccountFamilyDto, updatedBy: string): Observable<BalanceAccountFamilyDto> {
    return this.http.put<BalanceAccountFamilyDto>(`${this.base}/families/${encodeURIComponent(family.familyKey)}`, {
      updatedBy,
      mappings: family.mappings.map((mapping) => ({
        mappingKey: mapping.mappingKey,
        expectedVersion: mapping.version,
        accountA: mapping.accountA,
        accountB: mapping.accountB,
      })),
    });
  }
}
