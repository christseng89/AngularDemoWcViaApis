import { scalarText } from "./scalar-text";

interface RequestTypeRecord {
  readonly changeType?: string;
  readonly amendmentOfId?: string | null;
}

export function requestTypeLabel(
  record: RequestTypeRecord,
): "ADD" | "EDIT" | "SUPPRESSED" {
  if (record.changeType === "SUPPRESSION") return "SUPPRESSED";
  if (record.changeType === "REVISION" || record.amendmentOfId) return "EDIT";
  return "ADD";
}

export function governanceRecordValue(record: object, path: string): string {
  if (path === "__requestType")
    return requestTypeLabel(record as RequestTypeRecord);
  if (path.includes("|"))
    return (
      path
        .split("|")
        .map((part) => governanceRecordValue(record, part))
        .filter((part) => part !== "—")
        .join(" / ") || "—"
    );
  let value: unknown = record;
  for (const key of path.split(".")) {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return "—";
    value = (value as Readonly<Record<string, unknown>>)[key];
  }
  if (path === "status" && value === "PENDING_APPROVAL") return "SUBMITTED";
  return Array.isArray(value) ? value.join(", ") : scalarText(value) || "—";
}
