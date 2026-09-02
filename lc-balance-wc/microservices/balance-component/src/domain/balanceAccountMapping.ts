import type { InstrumentType, TenorType } from '../types';

export type BalanceAccountRiskClass = 'SIGHT' | 'BUYERS_USANCE' | 'SELLERS_USANCE' | 'USANCE';

export interface BalanceAccountIdentity {
  accountNumber: string;
  accountDescription: string;
}

export interface BalanceAccountMapping {
  mappingKey: string;
  instrumentType: InstrumentType;
  riskClass: BalanceAccountRiskClass;
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

export function riskClassFor(instrumentType: InstrumentType, tenorType: TenorType | null | undefined): BalanceAccountRiskClass | null {
  if (instrumentType === 'EPLC_CONFIRMATION' || instrumentType === 'EPLC_ACCEPTANCE') {
    return instrumentType === 'EPLC_CONFIRMATION' && tenorType === 'SIGHT' ? 'SIGHT' : 'USANCE';
  }
  if (instrumentType === 'IPLC_LC' || instrumentType === 'IPLC_ACCEPTANCE' || instrumentType === 'SHGT') {
    if (tenorType === 'BUYERS_USANCE' || tenorType === 'SELLERS_USANCE') return tenorType;
    if (instrumentType === 'IPLC_ACCEPTANCE') return null;
    return 'SIGHT';
  }
  return null;
}

export function mappingKeyFor(instrumentType: InstrumentType, tenorType: TenorType | null | undefined): string | null {
  const riskClass = riskClassFor(instrumentType, tenorType);
  return riskClass ? `${instrumentType}:${riskClass}` : null;
}
