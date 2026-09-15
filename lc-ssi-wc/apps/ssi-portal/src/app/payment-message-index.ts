export type PaymentProcessingMode = "SINGLE" | "SPLIT" | "NOTIFICATION";

export interface PaymentMessageIndexItem {
  readonly order: number;
  readonly messageType: string;
  readonly description: string;
  readonly processingMode: PaymentProcessingMode;
  readonly profileStatus: string;
  readonly targetMessage: string;
  readonly businessService: string;
  readonly selectable: boolean;
}

export interface PaymentMessageIndexResponse {
  readonly standardsRelease: "SR2026";
  readonly maxBatchItems: number;
  readonly items: readonly PaymentMessageIndexItem[];
}

export type PaymentMessageIndexSortKey =
  "messageType" | "description" | "targetMessage" | "processingMode";
export type PaymentMessageIndexSortDirection = "asc" | "desc";

export function executableCounterpartySsiProfiles(
  rows: readonly PaymentMessageIndexItem[],
): readonly PaymentMessageIndexItem[] {
  return rows.filter((row) => row.selectable);
}

export function filterPaymentMessageIndex(
  rows: readonly PaymentMessageIndexItem[],
  query: string,
): readonly PaymentMessageIndexItem[] {
  const normalized = query.trim().toUpperCase();
  if (!normalized) return rows;
  return rows.filter((row) =>
    [row.messageType, row.description, row.targetMessage].some((value) =>
      value.toUpperCase().includes(normalized),
    ),
  );
}

export function paymentMessageStatusLabel(
  row: PaymentMessageIndexItem,
): string {
  if (!row.selectable) return row.profileStatus.replaceAll("_", " ");
  if (row.processingMode === "SPLIT")
    return "NO DIRECT 1:1 PROFILE · SPLIT PROCESSING SUPPORTED";
  if (row.processingMode === "NOTIFICATION")
    return "SEPARATE NOTIFICATION PROFILE";
  return "PROFILE VERIFIED · SINGLE RESOLUTION";
}

export function sortPaymentMessageIndex(
  rows: readonly PaymentMessageIndexItem[],
  key: PaymentMessageIndexSortKey,
  direction: PaymentMessageIndexSortDirection,
): readonly PaymentMessageIndexItem[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort(
    (left, right) =>
      String(left[key]).localeCompare(String(right[key]), undefined, {
        numeric: true,
        sensitivity: "base",
      }) * multiplier,
  );
}
