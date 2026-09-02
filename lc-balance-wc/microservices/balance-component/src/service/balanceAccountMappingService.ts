import type { BalanceAccountIdentity, BalanceAccountMapping, BalanceAccountNumberValidation } from '../domain/balanceAccountMapping';
import type { Db } from '../db';
import { BALANCE_ACCOUNT_NUMBER_CONFIG, type BalanceAccountNumberConfig } from '../config';
import { NotFoundError, RequestValidationError } from '../errors';
import { BalanceAccountMappingStore } from '../store/balanceAccountMappingStore';

export class BalanceAccountMappingVersionConflictError extends Error {}

export class BalanceAccountMappingService {
  private readonly store: BalanceAccountMappingStore;

  constructor(db: Db, private readonly config: BalanceAccountNumberConfig = BALANCE_ACCOUNT_NUMBER_CONFIG, now?: () => string) {
    this.store = new BalanceAccountMappingStore(db, now);
  }

  list(): { items: BalanceAccountMapping[]; validation: BalanceAccountNumberValidation } {
    return {
      items: this.store.list(),
      validation: { pattern: this.config.pattern, minLength: this.config.minLength, maxLength: this.config.maxLength },
    };
  }

  findByKey(mappingKey: string): BalanceAccountMapping | undefined {
    return this.store.findByKey(mappingKey);
  }

  update(params: { mappingKey: string; expectedVersion: number; accountA: BalanceAccountIdentity; accountB: BalanceAccountIdentity; updatedBy: string }): BalanceAccountMapping {
    if (!this.store.findByKey(params.mappingKey)) throw new NotFoundError(`No balance account mapping ${params.mappingKey}.`);
    const accountA = this.validateIdentity('accountA', params.accountA);
    const accountB = this.validateIdentity('accountB', params.accountB);
    const updatedBy = params.updatedBy.trim();
    if (!updatedBy) throw new RequestValidationError('updatedBy is required.');
    const result = this.store.update(params.mappingKey, params.expectedVersion, accountA, accountB, updatedBy);
    if (!result) throw new BalanceAccountMappingVersionConflictError('This account mapping was changed by another user. Reload and try again.');
    return result;
  }

  private validateIdentity(path: string, identity: BalanceAccountIdentity): BalanceAccountIdentity {
    const accountNumber = identity.accountNumber.trim();
    const accountDescription = identity.accountDescription.trim();
    if (accountNumber.length < this.config.minLength || accountNumber.length > this.config.maxLength) {
      const expected = this.config.minLength === this.config.maxLength ? `exactly ${this.config.minLength}` : `${this.config.minLength}-${this.config.maxLength}`;
      throw new RequestValidationError(`${path}.accountNumber must contain ${expected} characters.`);
    }
    if (!this.config.regex.test(accountNumber)) throw new RequestValidationError(`${path}.accountNumber does not match BALANCE_ACCOUNT_NUMBER_REGEX.`);
    if (!accountDescription || accountDescription.length > 200) throw new RequestValidationError(`${path}.accountDescription must contain 1-200 characters.`);
    return { accountNumber, accountDescription };
  }
}
