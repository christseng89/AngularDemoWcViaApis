import { readFileSync } from "node:fs";
import { join } from "node:path";

export type DataDomain = "SSI" | "RMA" | "NOSTRO" | "ENTITY";
export type IssueDisposition =
  "REPORT_ONLY" | "IGNORE_ON_LOAD" | "DRAFT_CAN_UPDATE" | "REVISION_REQUIRED";

export interface DataQualityIssue {
  readonly domain: DataDomain;
  readonly recordId: string;
  readonly severity: "ERROR" | "WARNING";
  readonly code: string;
  readonly disposition: IssueDisposition;
  readonly current?: unknown;
  readonly proposed?: unknown;
  readonly relatedRecordIds?: readonly string[];
}

export interface RmaRepairPlan {
  readonly recordId: string;
  readonly action: "UPDATE_DRAFT" | "CREATE_REVISION_DRAFT";
  readonly removedMessageTypes: readonly string[];
  readonly messageTypes: readonly string[];
  readonly service: string;
}

type JsonRecord = Record<string, unknown>;

const BIC = /^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}(?:[A-Z0-9]{3})?$/;
const OPERATIONAL = new Set([
  "ACTIVE",
  "APPROVED",
  "DRAFT",
  "WIP",
  "PENDING_APPROVAL",
]);

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";
const upper = (value: unknown): string => text(value).toUpperCase();
const normalizeMessageType = (value: unknown): string => {
  const normalized = text(value);
  return /^mt/i.test(normalized)
    ? normalized.toUpperCase()
    : normalized.toLowerCase();
};
const recordId = (record: JsonRecord): string =>
  text(record["id"]) || "UNKNOWN";
const isBic = (value: unknown): boolean => BIC.test(upper(value));
const isOperational = (record: JsonRecord): boolean =>
  OPERATIONAL.has(upper(record["status"]));
const canUpdateDraft = (record: JsonRecord): IssueDisposition =>
  ["DRAFT", "WIP"].includes(upper(record["status"]))
    ? "DRAFT_CAN_UPDATE"
    : "REVISION_REQUIRED";

const issue = (
  domain: DataDomain,
  record: JsonRecord,
  code: string,
  current?: unknown,
  proposed?: unknown,
  severity: "ERROR" | "WARNING" = "ERROR",
  disposition: IssueDisposition = "REPORT_ONLY",
): DataQualityIssue => ({
  domain,
  recordId: recordId(record),
  severity,
  code,
  disposition,
  current,
  proposed,
});

function invalidDateRangeIssues(
  domain: DataDomain,
  record: JsonRecord,
): DataQualityIssue[] {
  const from = text(record["validFrom"]);
  const to = text(record["validTo"]);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return [issue(domain, record, "INVALID_EFFECTIVE_DATE", { from, to })];
  }
  return from <= to
    ? []
    : [issue(domain, record, "INVALID_EFFECTIVE_PERIOD", { from, to })];
}

export function auditSsiRecords(
  records: readonly JsonRecord[],
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  for (const record of records) {
    const route = (record["route"] ?? {}) as JsonRecord;
    const applicability = Array.isArray(record["applicability"])
      ? ((record["applicability"] as JsonRecord[]).find(
          (row) => upper(row["status"]) === "ACTIVE",
        ) ?? (record["applicability"] as JsonRecord[])[0])
      : undefined;
    const effectiveRecord = {
      ...record,
      validFrom: route["validFrom"] ?? applicability?.["validFrom"],
      validTo: route["validTo"] ?? applicability?.["validTo"],
    };
    issues.push(...invalidDateRangeIssues("SSI", effectiveRecord));
    if (!text(record["counterpartyId"])) {
      issues.push(issue("SSI", record, "COUNTERPARTY_ID_MISSING"));
    }
    const counterpartyType =
      upper(route["counterpartyType"]) ||
      (upper(route["counterpartyBic"]) === "ANY" ? "ANY_BANK" : "BANK");
    if (counterpartyType === "BANK" && !isBic(route["counterpartyBic"])) {
      const opaqueId = upper(record["counterpartyId"]);
      const derived = opaqueId.startsWith("CP-") ? opaqueId.slice(3) : "";
      issues.push(
        issue(
          "SSI",
          record,
          text(route["counterpartyBic"])
            ? "COUNTERPARTY_BIC_INVALID"
            : "COUNTERPARTY_BIC_MISSING",
          route["counterpartyBic"],
          isBic(derived) ? derived : undefined,
          "ERROR",
          isBic(derived) ? canUpdateDraft(record) : "REPORT_ONLY",
        ),
      );
    }
    if (
      counterpartyType === "ANY_BANK" &&
      upper(route["counterpartyBic"]) !== "ANY"
    ) {
      issues.push(
        issue(
          "SSI",
          record,
          "ANY_BANK_BIC_MUST_BE_ANY",
          route["counterpartyBic"],
          "ANY",
          "ERROR",
          canUpdateDraft(record),
        ),
      );
    }
  }
  return issues;
}

function expectedRmaService(messageTypes: readonly string[]): string {
  const fin = messageTypes.some((value) => value.startsWith("MT"));
  const finplus = messageTypes.some((value) => !value.startsWith("MT"));
  if (fin && finplus) return "FIN / FINPLUS";
  return fin ? "FIN" : "FINPLUS";
}

export function auditRmaRecords(
  records: readonly JsonRecord[],
  supportedMessageTypes: ReadonlySet<string>,
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  const indexes = new Map<string, JsonRecord[]>();
  for (const record of records) {
    issues.push(...invalidDateRangeIssues("RMA", record));
    for (const field of ["ownBic", "counterpartyBic"] as const) {
      if (!isBic(record[field])) {
        issues.push(
          issue(
            "RMA",
            record,
            `INVALID_${field === "ownBic" ? "OWN" : "COUNTERPARTY"}_BIC`,
            record[field],
          ),
        );
      }
    }
    const direction = upper(record["direction"]);
    if (!new Set(["INBOUND", "OUTBOUND"]).has(direction)) {
      issues.push(
        issue("RMA", record, "INVALID_DIRECTION", record["direction"]),
      );
    }
    const messageTypes = Array.isArray(record["messageTypes"])
      ? (record["messageTypes"] as unknown[])
          .map(normalizeMessageType)
          .filter(Boolean)
      : [];
    for (const messageType of messageTypes) {
      if (!supportedMessageTypes.has(messageType)) {
        issues.push(
          issue(
            "RMA",
            record,
            "IGNORED_OUT_OF_SSI_SCOPE",
            messageType,
            undefined,
            "WARNING",
            "IGNORE_ON_LOAD",
          ),
        );
      }
    }
    const inScope = messageTypes.filter((value) =>
      supportedMessageTypes.has(value),
    );
    if (inScope.length > 0) {
      const expectedService = expectedRmaService(inScope);
      if (text(record["service"]) !== expectedService) {
        issues.push(
          issue(
            "RMA",
            record,
            "SERVICE_DOES_NOT_MATCH_MESSAGE_TYPES",
            record["service"],
            expectedService,
            "ERROR",
            canUpdateDraft(record),
          ),
        );
      }
    }
    if (isOperational(record)) {
      const key = `${upper(record["ownBic"])}|${upper(record["counterpartyBic"])}|${direction}`;
      const bucket = indexes.get(key) ?? [];
      bucket.push(record);
      indexes.set(key, bucket);
    }
  }
  for (const bucket of indexes.values()) {
    if (bucket.length < 2) continue;
    const ids = bucket.map(recordId);
    for (const record of bucket) {
      issues.push({
        ...issue(
          "RMA",
          record,
          "DUPLICATE_OPERATIONAL_INDEX",
          undefined,
          undefined,
          "ERROR",
          "REPORT_ONLY",
        ),
        relatedRecordIds: ids.filter((id) => id !== recordId(record)),
      });
    }
  }
  return issues;
}

export function planSafeRmaRepairs(
  records: readonly JsonRecord[],
  supportedMessageTypes: ReadonlySet<string>,
): RmaRepairPlan[] {
  const plans: RmaRepairPlan[] = [];
  for (const record of records) {
    const status = upper(record["status"]);
    if (!["ACTIVE", "DRAFT", "WIP"].includes(status)) continue;
    const original = Array.isArray(record["messageTypes"])
      ? (record["messageTypes"] as unknown[])
          .map(normalizeMessageType)
          .filter(Boolean)
      : [];
    const messageTypes = original.filter((value) =>
      supportedMessageTypes.has(value),
    );
    if (messageTypes.length === 0) continue;
    const removedMessageTypes = original.filter(
      (value) => !supportedMessageTypes.has(value),
    );
    const service = expectedRmaService(messageTypes);
    if (
      removedMessageTypes.length === 0 &&
      text(record["service"]) === service
    ) {
      continue;
    }
    plans.push({
      recordId: recordId(record),
      action: status === "ACTIVE" ? "CREATE_REVISION_DRAFT" : "UPDATE_DRAFT",
      removedMessageTypes,
      messageTypes,
      service,
    });
  }
  return plans;
}

export function auditNostroRecords(
  records: readonly JsonRecord[],
  entityCodes: ReadonlySet<string>,
  currencies: ReadonlySet<string>,
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  for (const record of records) {
    issues.push(...invalidDateRangeIssues("NOSTRO", record));
    if (!isBic(record["accountServicerBic"])) {
      issues.push(
        issue(
          "NOSTRO",
          record,
          "INVALID_ACCOUNT_SERVICER_BIC",
          record["accountServicerBic"],
        ),
      );
    }
    if (!entityCodes.has(upper(record["ownLegalEntityId"]))) {
      issues.push(
        issue(
          "NOSTRO",
          record,
          "UNKNOWN_OWN_LEGAL_ENTITY",
          record["ownLegalEntityId"],
        ),
      );
    }
    if (!currencies.has(upper(record["currency"]))) {
      issues.push(
        issue("NOSTRO", record, "UNKNOWN_CURRENCY", record["currency"]),
      );
    }
  }
  return issues;
}

export function auditEntityRecords(
  records: readonly JsonRecord[],
  countries: ReadonlySet<string>,
): DataQualityIssue[] {
  const issues: DataQualityIssue[] = [];
  for (const record of records) {
    issues.push(...invalidDateRangeIssues("ENTITY", record));
    if (!countries.has(upper(record["countryCode"]))) {
      issues.push(
        issue("ENTITY", record, "UNKNOWN_COUNTRY", record["countryCode"]),
      );
    }
  }
  return issues;
}

export function loadSupportedRmaMessageTypes(
  workspace = process.cwd(),
): Set<string> {
  const paymentIndex = JSON.parse(
    readFileSync(
      join(workspace, "parameters", "payment-message-index.json"),
      "utf8",
    ),
  ) as {
    items?: {
      messageType?: string;
      targetMessage?: string;
      selectable?: boolean;
    }[];
  };
  const mappingManifest = JSON.parse(
    readFileSync(
      join(workspace, "parameters", "ssi-mappings.sr2026.manifest.json"),
      "utf8",
    ),
  ) as { messageEvidence?: { messageType?: string; status?: string }[] };
  const supported = new Set<string>(["MT103", "pacs.008.001.12"]);
  for (const item of paymentIndex.items ?? []) {
    if (!item.selectable) continue;
    if (item.messageType) supported.add(normalizeMessageType(item.messageType));
    if (item.targetMessage)
      supported.add(normalizeMessageType(item.targetMessage));
  }
  for (const item of mappingManifest.messageEvidence ?? []) {
    const messageType = normalizeMessageType(item.messageType);
    if (/^MT[2347]\d{2}(?:COV)?$/.test(messageType) && text(item.status)) {
      supported.add(messageType);
    }
  }
  return supported;
}
