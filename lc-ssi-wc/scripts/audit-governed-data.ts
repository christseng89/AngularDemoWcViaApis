import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  auditEntityRecords,
  auditNostroRecords,
  auditRmaRecords,
  auditSsiRecords,
  loadSupportedRmaMessageTypes,
  planSafeRmaRepairs,
  type DataQualityIssue,
} from "./governed-data-quality.ts";

type JsonRecord = Record<string, unknown>;
interface Page {
  readonly items: JsonRecord[];
  readonly page?: number;
  readonly totalPages?: number;
}

const argument = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  return process.argv
    .find((value) => value.startsWith(prefix))
    ?.slice(prefix.length);
};
const apiBase = (
  argument("api") ??
  process.env["SSI_BFF_URL"] ??
  "http://localhost:3100/api"
).replace(/\/$/, "");
const outputFile = resolve(
  argument("output") ?? "tmp/governed-data-audit.json",
);
const applySafeDrafts = process.argv.includes("--apply-safe-drafts");
const pageSize = 500;

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(`${apiBase}/${path}`);
  if (!response.ok)
    throw new Error(`GET ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function sendJson(
  path: string,
  method: "POST" | "PUT",
  body: JsonRecord,
): Promise<JsonRecord> {
  const response = await fetch(`${apiBase}/${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      `${method} ${path}: ${response.status} ${await response.text()}`,
    );
  return (await response.json()) as JsonRecord;
}

async function getAll(path: string): Promise<JsonRecord[]> {
  const first = (await getJson(
    `${path}?status=ALL&page=1&pageSize=${pageSize}`,
  )) as Page | JsonRecord[];
  if (Array.isArray(first)) return first;
  const records = [...first.items];
  const totalPages = first.totalPages ?? 1;
  for (let page = 2; page <= totalPages; page += 1) {
    const next = (await getJson(
      `${path}?status=ALL&page=${page}&pageSize=${pageSize}`,
    )) as Page;
    records.push(...next.items);
  }
  return records;
}

function asItems(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) return value as JsonRecord[];
  if (
    value &&
    typeof value === "object" &&
    Array.isArray((value as Page).items)
  )
    return (value as Page).items;
  return [];
}

function values(records: readonly JsonRecord[], key: string): Set<string> {
  return new Set(
    records
      .map((record) =>
        String(record[key] ?? "")
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean),
  );
}

function countsBy<T extends string>(
  valuesToCount: readonly T[],
): Record<string, number> {
  return valuesToCount.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

const [ssis, rmas, nostros, entities, currenciesRaw, countriesRaw, banksRaw] =
  await Promise.all([
    getAll("ssis"),
    getAll("rma-authorisations"),
    getAll("nostro-accounts"),
    getAll("booking-branch-entities"),
    getJson("reference/currencies"),
    getJson("reference/countries"),
    getJson("reference/banks?page=1&pageSize=500"),
  ]);

const currencies = asItems(currenciesRaw);
const countries = asItems(countriesRaw);
const banks = asItems(banksRaw);
const supportedRmaMessageTypes = loadSupportedRmaMessageTypes();
const rmaRepairPlan = planSafeRmaRepairs(rmas, supportedRmaMessageTypes);
const rmaById = new Map(rmas.map((record) => [String(record["id"]), record]));
const repairResults: JsonRecord[] = [];
if (applySafeDrafts) {
  for (const plan of rmaRepairPlan) {
    const original = rmaById.get(plan.recordId);
    if (!original) continue;
    try {
      const maker =
        plan.action === "CREATE_REVISION_DRAFT"
          ? "maker.data.repair"
          : String(original["maker"] ?? "");
      if (!maker) {
        repairResults.push({
          recordId: plan.recordId,
          result: "SKIPPED_MAKER_MISSING",
        });
        continue;
      }
      const draft =
        plan.action === "CREATE_REVISION_DRAFT"
          ? await sendJson(
              `rma-authorisations/${encodeURIComponent(plan.recordId)}/revise`,
              "POST",
              { maker },
            )
          : original;
      const updated = await sendJson(
        `rma-authorisations/${encodeURIComponent(String(draft["id"]))}`,
        "PUT",
        {
          ownBic: original["ownBic"],
          counterpartyBic: original["counterpartyBic"],
          service: plan.service,
          direction: original["direction"],
          messageTypes: plan.messageTypes,
          validFrom: original["validFrom"],
          validTo: original["validTo"],
          maker,
          source: original["source"],
        },
      );
      repairResults.push({
        recordId: plan.recordId,
        draftId: updated["id"],
        status: updated["status"],
        removedMessageTypes: plan.removedMessageTypes,
        result: "DRAFT_SAVED_NOT_SUBMITTED",
      });
    } catch (error) {
      repairResults.push({
        recordId: plan.recordId,
        result: "FAILED",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
const entityCodes = new Set([
  ...values(entities, "branchCode"),
  ...values(entities, "legalEntityCode"),
]);
const issues: DataQualityIssue[] = [
  ...auditSsiRecords(ssis),
  ...auditRmaRecords(rmas, supportedRmaMessageTypes),
  ...auditNostroRecords(nostros, entityCodes, values(currencies, "code")),
  ...auditEntityRecords(entities, values(countries, "code")),
];

const activeStatuses = new Set([
  "ACTIVE",
  "APPROVED",
  "DRAFT",
  "WIP",
  "PENDING_APPROVAL",
]);
const operationalCount = (records: readonly JsonRecord[]): number =>
  records.filter((record) =>
    activeStatuses.has(String(record["status"] ?? "").toUpperCase()),
  ).length;
const report = {
  generatedAt: new Date().toISOString(),
  mode: applySafeDrafts
    ? "APPLY_SAFE_DRAFTS_NO_SUBMIT_NO_APPROVE"
    : "DRY_RUN_GET_ONLY",
  apiBase,
  referenceCounts: {
    banks: banks.length,
    currencies: currencies.length,
    countries: countries.length,
    supportedRmaMessageTypes: supportedRmaMessageTypes.size,
  },
  records: {
    SSI: { total: ssis.length, operational: operationalCount(ssis) },
    RMA: { total: rmas.length, operational: operationalCount(rmas) },
    NOSTRO: { total: nostros.length, operational: operationalCount(nostros) },
    ENTITY: { total: entities.length, operational: operationalCount(entities) },
  },
  issueSummary: {
    total: issues.length,
    byDomain: countsBy(issues.map((value) => value.domain)),
    byCode: countsBy(issues.map((value) => value.code)),
    byDisposition: countsBy(issues.map((value) => value.disposition)),
  },
  repairPlan: {
    rmaDrafts: rmaRepairPlan.length,
    items: rmaRepairPlan,
  },
  repairResults,
  issues,
};

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    { ...report, issues: undefined, reportFile: outputFile },
    null,
    2,
  ),
);
