import { z } from 'zod';
import rawTaxonomy from '../../config/balance-account-mappings.json';
import type { InstrumentType, TenorType } from '../types';

const tenorSchema = z.object({
  tenorKey: z.string().min(1),
  apiValue: z.string().min(1),
  label: z.string().min(1),
  behavior: z.enum(['SIGHT', 'USANCE']),
}).strict();

const categorySchema = z.object({
  categoryKey: z.string().min(1),
  label: z.string().min(1),
  tenorTypes: z.array(tenorSchema).min(1),
}).strict();

const familySchema = z.object({
  familyKey: z.string().min(1),
  categoryKey: z.string().min(1),
  label: z.string().min(1),
  instrumentType: z.string().min(1),
  defaultTenorKey: z.string().min(1).optional(),
  tenorKeys: z.array(z.string().min(1)).min(1),
}).strict();

const identitySchema = z.object({ accountNumber: z.string(), accountDescription: z.string() }).strict();
const mappingSchema = z.object({
  mappingKey: z.string().min(1),
  familyKey: z.string().min(1),
  tenorKey: z.string().min(1),
  instrumentType: z.string().min(1),
  riskClass: z.string().min(1),
  accountA: identitySchema,
  accountB: identitySchema,
}).strict();

const taxonomySchema = z.object({
  schemaVersion: z.string().min(1),
  categories: z.array(categorySchema).min(1),
  families: z.array(familySchema).min(1),
  mappings: z.array(mappingSchema).min(1),
}).strict();

export type BalanceAccountCategory = z.infer<typeof categorySchema>;
export type BalanceAccountFamily = z.infer<typeof familySchema>;
export type BalanceAccountSeedMapping = z.infer<typeof mappingSchema>;
export type BalanceAccountTaxonomyConfig = z.infer<typeof taxonomySchema>;
export type TenorBehavior = 'SIGHT' | 'USANCE';

export interface ResolvedBalanceAccountRoute {
  mappingKey: string;
  categoryKey: string;
  familyKey: string;
  tenorKey: string;
  tenorLabel: string;
  behavior: TenorBehavior;
}

export interface BalanceAccountTaxonomyReader {
  categories(): readonly BalanceAccountCategory[];
  families(): readonly BalanceAccountFamily[];
  mappings(): readonly BalanceAccountSeedMapping[];
  mapping(mappingKey: string): BalanceAccountSeedMapping | undefined;
  family(familyKey: string): BalanceAccountFamily | undefined;
  resolve(instrumentType: InstrumentType, tenorType: TenorType | null | undefined): ResolvedBalanceAccountRoute | null;
}

function unique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Duplicate ${label} in Balance Account taxonomy.`);
}

export class BalanceAccountTaxonomy implements BalanceAccountTaxonomyReader {
  readonly config: BalanceAccountTaxonomyConfig;
  private readonly categoriesByKey = new Map<string, BalanceAccountCategory>();
  private readonly familiesByKey = new Map<string, BalanceAccountFamily>();
  private readonly mappingsByKey = new Map<string, BalanceAccountSeedMapping>();
  private readonly familiesByInstrument = new Map<string, BalanceAccountFamily>();

  constructor(input: unknown) {
    this.config = taxonomySchema.parse(input);
    unique(this.config.categories.map((item) => item.categoryKey), 'categoryKey');
    unique(this.config.families.map((item) => item.familyKey), 'familyKey');
    unique(this.config.families.map((item) => item.instrumentType), 'family instrumentType');
    unique(this.config.mappings.map((item) => item.mappingKey), 'mappingKey');

    for (const category of this.config.categories) {
      unique(category.tenorTypes.map((item) => item.tenorKey), `${category.categoryKey} tenorKey`);
      unique(category.tenorTypes.map((item) => item.apiValue), `${category.categoryKey} tenor apiValue`);
      this.categoriesByKey.set(category.categoryKey, category);
    }
    for (const family of this.config.families) {
      const category = this.categoriesByKey.get(family.categoryKey);
      if (!category) throw new Error(`Unknown categoryKey ${family.categoryKey} for family ${family.familyKey}.`);
      const configuredTenors = new Set(category.tenorTypes.map((item) => item.tenorKey));
      unique(family.tenorKeys, `${family.familyKey} tenorKey`);
      for (const tenorKey of family.tenorKeys) {
        if (!configuredTenors.has(tenorKey)) throw new Error(`Unknown tenorKey ${family.categoryKey}:${tenorKey} for family ${family.familyKey}.`);
      }
      if (family.defaultTenorKey && !family.tenorKeys.includes(family.defaultTenorKey)) {
        throw new Error(`defaultTenorKey ${family.defaultTenorKey} is not enabled for family ${family.familyKey}.`);
      }
      this.familiesByKey.set(family.familyKey, family);
      this.familiesByInstrument.set(family.instrumentType, family);
    }
    for (const mapping of this.config.mappings) {
      const family = this.familiesByKey.get(mapping.familyKey);
      if (!family || family.instrumentType !== mapping.instrumentType || !family.tenorKeys.includes(mapping.tenorKey)) {
        throw new Error(`Invalid family/Tenor route for mapping ${mapping.mappingKey}.`);
      }
      if (mapping.mappingKey !== `${mapping.instrumentType}:${mapping.riskClass}`) {
        throw new Error(`mappingKey ${mapping.mappingKey} must match instrumentType:riskClass.`);
      }
      this.mappingsByKey.set(mapping.mappingKey, mapping);
    }
    for (const family of this.config.families) {
      for (const tenorKey of family.tenorKeys) {
        const count = this.config.mappings.filter((item) => item.familyKey === family.familyKey && item.tenorKey === tenorKey).length;
        if (count !== 1) throw new Error(`Family ${family.familyKey} must define exactly one mapping for ${tenorKey}.`);
      }
    }
  }

  categories(): readonly BalanceAccountCategory[] {
    return this.config.categories;
  }

  families(): readonly BalanceAccountFamily[] {
    return this.config.families;
  }

  mappings(): readonly BalanceAccountSeedMapping[] {
    return this.config.mappings;
  }

  tenorApiValues(): readonly string[] {
    return [...new Set(this.config.categories.flatMap((category) => category.tenorTypes.map((tenor) => tenor.apiValue)))];
  }

  isTenorApiValue(value: string): boolean {
    return this.tenorApiValues().includes(value);
  }

  mapping(mappingKey: string): BalanceAccountSeedMapping | undefined {
    return this.mappingsByKey.get(mappingKey);
  }

  family(familyKey: string): BalanceAccountFamily | undefined {
    return this.familiesByKey.get(familyKey);
  }

  resolve(instrumentType: InstrumentType, tenorType: TenorType | null | undefined): ResolvedBalanceAccountRoute | null {
    const family = this.familiesByInstrument.get(instrumentType);
    if (!family) return null;
    const category = this.categoriesByKey.get(family.categoryKey)!;
    const tenor = tenorType
      ? category.tenorTypes.find((item) => item.apiValue === tenorType && family.tenorKeys.includes(item.tenorKey))
      : category.tenorTypes.find((item) => item.tenorKey === family.defaultTenorKey);
    if (!tenor) return null;
    const mapping = this.config.mappings.find((item) => item.familyKey === family.familyKey && item.tenorKey === tenor.tenorKey);
    if (!mapping) return null;
    return {
      mappingKey: mapping.mappingKey,
      categoryKey: category.categoryKey,
      familyKey: family.familyKey,
      tenorKey: tenor.tenorKey,
      tenorLabel: tenor.label,
      behavior: tenor.behavior,
    };
  }
}

export const BALANCE_ACCOUNT_TAXONOMY = new BalanceAccountTaxonomy(rawTaxonomy);
