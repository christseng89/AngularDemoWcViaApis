import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { scalarText } from "./scalar-text";

export type BankServiceStatus = "ACTIVE" | "INACTIVE";
export type BankServiceUsageGroup =
  "SSI_REFERENCED" | "DIRECTORY_ONLY_NO_SSI" | "OWN_BANK_IDENTITY";

export interface BankServiceRecord {
  readonly bankServiceId: string;
  readonly bic: string;
  readonly name: string;
  readonly country: string;
  readonly city: string;
  readonly addressRef: string;
  readonly standard: "ISO 9362";
  readonly source: "SYNTHETIC_DEMO";
  readonly dataClass:
    "PUBLIC_BIC_EXAMPLE" | "SYNTHETIC_DEMO" | "SYNTHETIC_DEMO_NO_SSI";
  readonly usageGroup: BankServiceUsageGroup;
  readonly status: BankServiceStatus;
  readonly validFrom: string;
  readonly validTo: string;
  readonly demoNostro: boolean;
}

export interface BankServiceCatalogueDocument {
  readonly schemaVersion: number;
  readonly asOf?: string;
  readonly defaults: Partial<BankServiceRecord>;
  readonly items: readonly Partial<BankServiceRecord>[];
}

const BIC = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const BANK_SERVICE_ID = /^BANK-SVC-[A-Z0-9][A-Z0-9_-]{2,63}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATA_CLASSES = new Set([
  "PUBLIC_BIC_EXAMPLE",
  "SYNTHETIC_DEMO",
  "SYNTHETIC_DEMO_NO_SSI",
]);
const USAGE_GROUPS = new Set([
  "SSI_REFERENCED",
  "DIRECTORY_ONLY_NO_SSI",
  "OWN_BANK_IDENTITY",
]);

export function validateBankServiceCatalogue(
  document: BankServiceCatalogueDocument,
): readonly BankServiceRecord[] {
  if (document.schemaVersion !== 1 || !Array.isArray(document.items))
    throw new Error("INVALID_BANK_SERVICE_CATALOGUE");
  const records = document.items.map((item) => {
    const merged = { ...document.defaults, ...item } as Record<string, unknown>;
    const bic = scalarText(merged["bic"]);
    const record = {
      ...merged,
      bic,
      bankServiceId: scalarText(merged["bankServiceId"]),
      demoNostro: merged["demoNostro"] === true,
    } as unknown as BankServiceRecord;
    if (
      !BIC.test(record.bic) ||
      !BANK_SERVICE_ID.test(record.bankServiceId) ||
      !/^[A-Z]{2}$/.test(record.country) ||
      !record.name?.trim() ||
      !record.city?.trim() ||
      !record.addressRef?.trim() ||
      record.standard !== "ISO 9362" ||
      record.source !== "SYNTHETIC_DEMO" ||
      !DATA_CLASSES.has(record.dataClass) ||
      !USAGE_GROUPS.has(record.usageGroup) ||
      !["ACTIVE", "INACTIVE"].includes(record.status) ||
      !DATE.test(record.validFrom) ||
      !DATE.test(record.validTo) ||
      Date.parse(record.validFrom) > Date.parse(record.validTo)
    )
      throw new Error(`INVALID_BANK_SERVICE_RECORD:${record.bankServiceId}`);
    return Object.freeze(record);
  });
  const hasDuplicateId = records.some(
    (record, index) =>
      records.findIndex(
        (candidate) => candidate.bankServiceId === record.bankServiceId,
      ) !== index,
  );
  const hasDuplicateBic = records.some(
    (record, index) =>
      records.findIndex((candidate) => candidate.bic === record.bic) !== index,
  );
  if (hasDuplicateId || hasDuplicateBic)
    throw new Error("AMBIGUOUS_BANK_SERVICE_IDENTITY");
  return Object.freeze(records);
}

export function activeBankServices(
  records: readonly BankServiceRecord[],
  at = new Date(),
): readonly BankServiceRecord[] {
  const instant = at.getTime();
  return records.filter(
    (record) =>
      record.status === "ACTIVE" &&
      Date.parse(record.validFrom) <= instant &&
      instant <= Date.parse(record.validTo),
  );
}

export function loadBankServiceCatalogue(
  file = resolve(process.cwd(), "parameters", "bank-services.json"),
): readonly BankServiceRecord[] {
  return validateBankServiceCatalogue(
    JSON.parse(readFileSync(file, "utf8")) as BankServiceCatalogueDocument,
  );
}
