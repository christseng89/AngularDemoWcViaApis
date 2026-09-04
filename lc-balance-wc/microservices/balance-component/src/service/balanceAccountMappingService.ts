import type { BalanceAccountIdentity, BalanceAccountMapping, BalanceAccountNumberValidation } from '../domain/balanceAccountMapping';
import type { Db } from '../db';
import { BALANCE_ACCOUNT_NUMBER_CONFIG, type BalanceAccountNumberConfig } from '../config';
import { NotFoundError, RequestValidationError } from '../errors';
import { BalanceAccountMappingStore } from '../store/balanceAccountMappingStore';
import { BALANCE_ACCOUNT_TAXONOMY, type BalanceAccountCategory, type BalanceAccountFamily, type BalanceAccountSeedMapping, type BalanceAccountTaxonomyReader } from '../config/balanceAccountTaxonomy';
import type { InstrumentType, TenorType } from '../types';

export class BalanceAccountMappingVersionConflictError extends Error {}

export interface BalanceAccountMappingView extends BalanceAccountMapping {
  categoryKey: string;
  categoryLabel: string;
  familyKey: string;
  familyLabel: string;
  tenorKey: string;
  tenorLabel: string;
}

export interface BalanceAccountFamilyView extends BalanceAccountFamily {
  mappings: BalanceAccountMappingView[];
}

export interface BalanceAccountCategoryView extends Omit<BalanceAccountCategory, 'tenorTypes'> {
  tenorTypes: BalanceAccountCategory['tenorTypes'];
  families: BalanceAccountFamilyView[];
}

export interface BalanceAccountMappingRepository {
  list(): BalanceAccountMapping[];
  findByKey(mappingKey: string): BalanceAccountMapping | undefined;
  update(mappingKey: string, expectedVersion: number, accountA: BalanceAccountIdentity, accountB: BalanceAccountIdentity, updatedBy: string): BalanceAccountMapping | null;
  updateFamily(
    updates: readonly { mappingKey: string; expectedVersion: number; accountA: BalanceAccountIdentity; accountB: BalanceAccountIdentity }[],
    updatedBy: string,
  ): BalanceAccountMapping[] | null;
  replaceConfiguration(mappings: readonly BalanceAccountSeedMapping[], updatedBy: string): BalanceAccountMapping[];
}

export class BalanceAccountMappingService {
  private readonly store: BalanceAccountMappingRepository;

  constructor(
    db: Db,
    private readonly config: BalanceAccountNumberConfig = BALANCE_ACCOUNT_NUMBER_CONFIG,
    now?: () => string,
    private readonly taxonomy: BalanceAccountTaxonomyReader = BALANCE_ACCOUNT_TAXONOMY,
    repository?: BalanceAccountMappingRepository,
  ) {
    this.store = repository ?? new BalanceAccountMappingStore(db, now, taxonomy);
  }

  list(): { items: BalanceAccountMappingView[]; categories: BalanceAccountCategoryView[]; validation: BalanceAccountNumberValidation } {
    const items = this.store.list().map((mapping) => this.toView(mapping));
    return {
      items,
      categories: this.taxonomy.categories().map((category) => ({
        ...category,
        families: this.taxonomy.families()
          .filter((family) => family.categoryKey === category.categoryKey)
          .map((family) => ({ ...family, mappings: items.filter((item) => item.familyKey === family.familyKey) })),
      })),
      validation: { pattern: this.config.pattern, minLength: this.config.minLength, maxLength: this.config.maxLength },
    };
  }

  findByKey(mappingKey: string): BalanceAccountMapping | undefined {
    return this.store.findByKey(mappingKey);
  }

  findFor(instrumentType: InstrumentType, tenorType: TenorType | null | undefined): BalanceAccountMapping | undefined {
    const mappingKey = this.taxonomy.resolve(instrumentType, tenorType)?.mappingKey;
    return mappingKey ? this.store.findByKey(mappingKey) : undefined;
  }

  reloadConfiguration(): ReturnType<BalanceAccountMappingService['list']> {
    const mappings = this.taxonomy.mappings().map((mapping) => ({
      ...mapping,
      accountA: this.validateIdentity(`${mapping.mappingKey}.accountA`, mapping.accountA),
      accountB: this.validateIdentity(`${mapping.mappingKey}.accountB`, mapping.accountB),
    }));
    this.store.replaceConfiguration(mappings, 'SYSTEM_CONFIG_RELOAD');
    return this.list();
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

  updateFamily(params: {
    familyKey: string;
    updatedBy: string;
    mappings: readonly { mappingKey: string; expectedVersion: number; accountA: BalanceAccountIdentity; accountB: BalanceAccountIdentity }[];
  }): BalanceAccountFamilyView {
    const family = this.taxonomy.family(params.familyKey);
    if (!family) throw new NotFoundError(`No balance account family ${params.familyKey}.`);
    const configuredKeys = this.taxonomy.mappings().filter((item) => item.familyKey === family.familyKey).map((item) => item.mappingKey);
    const submittedKeys = params.mappings.map((item) => item.mappingKey);
    if (new Set(submittedKeys).size !== submittedKeys.length || configuredKeys.length !== submittedKeys.length || configuredKeys.some((key) => !submittedKeys.includes(key))) {
      throw new RequestValidationError(`mappings must contain every configured SL row for ${family.familyKey} exactly once.`);
    }
    const updatedBy = params.updatedBy.trim();
    if (!updatedBy) throw new RequestValidationError('updatedBy is required.');
    const updates = params.mappings.map((item) => ({
      mappingKey: item.mappingKey,
      expectedVersion: item.expectedVersion,
      accountA: this.validateIdentity(`${item.mappingKey}.accountA`, item.accountA),
      accountB: this.validateIdentity(`${item.mappingKey}.accountB`, item.accountB),
    }));
    const saved = this.store.updateFamily(updates, updatedBy);
    if (!saved) throw new BalanceAccountMappingVersionConflictError('This account family was changed by another user. Reload and try again.');
    return { ...family, mappings: saved.map((item) => this.toView(item)) };
  }

  private toView(mapping: BalanceAccountMapping): BalanceAccountMappingView {
    const configured = this.taxonomy.mapping(mapping.mappingKey);
    if (!configured) throw new Error(`Mapping ${mapping.mappingKey} is not active in the Balance Account taxonomy.`);
    const family = this.taxonomy.family(configured.familyKey)!;
    const category = this.taxonomy.categories().find((item) => item.categoryKey === family.categoryKey)!;
    const tenor = category.tenorTypes.find((item) => item.tenorKey === configured.tenorKey)!;
    return {
      ...mapping,
      categoryKey: category.categoryKey,
      categoryLabel: category.label,
      familyKey: family.familyKey,
      familyLabel: family.label,
      tenorKey: tenor.tenorKey,
      tenorLabel: tenor.label,
    };
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
