export type AuditRow = Readonly<Record<string, unknown>>;
export type AuditSortKey = "title" | "actor" | "occurredAt";
export type AuditSortDirection = "asc" | "desc";

export interface AuditPresentation {
  readonly eventId: string;
  readonly ssiId: string;
  readonly title: string;
  readonly summary: string;
  readonly action: string;
  readonly actor: string;
  readonly occurredAt: string;
  readonly before: unknown;
  readonly after: unknown;
  readonly changedFields: unknown;
  readonly provenance: unknown;
  readonly rawPayload: unknown;
}

const ACTION_TITLES: Readonly<Record<string, string>> = {
  ACTIVATE: "啟用 SSI 版本",
  APPROVE: "核准 SSI 版本",
  APPLICABILITY_REPLACED: "更新適用性條件",
  CREATED: "建立 SSI",
  REVISED: "建立修訂版本",
  REVISION_CREATED: "建立修訂版本",
  REVOKE: "撤銷 SSI",
  REVOKED: "撤銷 SSI",
  SUBMIT: "提交審批",
  SUPERSEDED: "取代舊版本",
  UPDATED: "更新 SSI 資料",
};

function text(value: unknown, fallback: string): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : fallback;
}

function payloadOf(row: AuditRow): unknown {
  const payload = row["payload"];
  if (typeof payload !== "string") return payload ?? null;
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return payload;
  }
}

function objectOf(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function recordLabel(payload: unknown): string {
  const record = objectOf(payload);
  if (!record) return "";
  const route = objectOf(record["route"]);
  return text(
    record["ssiCode"] ?? route?.["ssiCode"] ?? record["counterpartyId"],
    "",
  );
}

export function presentAuditEvent(row: AuditRow): AuditPresentation {
  const action = text(row["action"], "UNKNOWN_ACTION");
  const payload = payloadOf(row);
  const evidence = objectOf(payload);
  const label = recordLabel(payload);
  const title = ACTION_TITLES[action] ?? `執行 ${action}`;
  const ssiId = text(row["ssi_id"] ?? row["record_id"], "未提供");
  const summary = label ? `${label} · ${ssiId}` : `${action} · ${ssiId}`;

  return {
    eventId: text(row["id"], "未提供"),
    ssiId,
    title,
    summary,
    action,
    actor: text(row["actor"], "未提供"),
    occurredAt: text(row["occurred_at"], "未提供"),
    before: evidence?.["before"] ?? null,
    after: evidence?.["after"] ?? null,
    changedFields:
      evidence?.["changedFields"] ?? evidence?.["changed_fields"] ?? null,
    provenance: evidence?.["provenance"] ?? null,
    rawPayload: payload,
  };
}

export function sortAuditRows(
  rows: readonly AuditRow[],
  key: AuditSortKey,
  direction: AuditSortDirection,
): readonly AuditRow[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const a = presentAuditEvent(left);
    const b = presentAuditEvent(right);
    let leftValue = a.occurredAt;
    let rightValue = b.occurredAt;
    if (key === "title") {
      leftValue = a.title;
      rightValue = b.title;
    } else if (key === "actor") {
      leftValue = a.actor;
      rightValue = b.actor;
    }
    return (
      leftValue.localeCompare(rightValue, undefined, {
        numeric: true,
        sensitivity: "base",
      }) * multiplier
    );
  });
}

export function auditPage<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
): readonly T[] {
  const start = Math.max(0, page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}
