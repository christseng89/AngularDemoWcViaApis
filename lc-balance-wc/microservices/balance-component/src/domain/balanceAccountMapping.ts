import type { InstrumentType, TenorType } from '../types';
import { BALANCE_ACCOUNT_TAXONOMY } from '../config/balanceAccountTaxonomy';

export interface BalanceAccountIdentity {
  accountNumber: string;
  accountDescription: string;
}

export interface BalanceAccountMapping {
  mappingKey: string;
  instrumentType: string;
  riskClass: string;
  accountA: BalanceAccountIdentity;
  accountB: BalanceAccountIdentity;
  version: number;
  updatedBy: string;
  updatedAt: string;
}

export interface BalanceAccountNumberValidation {
  pattern: string;
  minLength: number;
  maxLength: number;
}

export function riskClassFor(instrumentType: InstrumentType, tenorType: TenorType | null | undefined): string | null {
  const mappingKey = BALANCE_ACCOUNT_TAXONOMY.resolve(instrumentType, tenorType)?.mappingKey;
  return mappingKey?.slice(mappingKey.indexOf(':') + 1) ?? null;
}

export function mappingKeyFor(instrumentType: InstrumentType, tenorType: TenorType | null | undefined): string | null {
  return BALANCE_ACCOUNT_TAXONOMY.resolve(instrumentType, tenorType)?.mappingKey ?? null;
}
