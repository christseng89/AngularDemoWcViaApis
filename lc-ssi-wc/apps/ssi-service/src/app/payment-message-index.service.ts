import {
  Injectable,
  InternalServerErrorException,
  Optional,
} from "@nestjs/common";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  IndexPaginationPolicy,
  type IndexPaginationContract,
} from "./index-pagination.policy";
import { scalarText } from "./scalar-text";

export type PaymentProcessingMode = "SINGLE" | "SPLIT" | "NOTIFICATION";
export type PaymentMtCompatibilityStatus =
  "SUPPORTED_SINGLE" | "SUPPORTED_SPLIT" | "NOT_SUPPORTED";

export interface PaymentMtCompatibility {
  readonly status: PaymentMtCompatibilityStatus;
  readonly ssiFields: readonly string[];
  readonly mandatorySsiFields: readonly string[];
  readonly requiredUpstreamFields: readonly string[];
  readonly mrgPages: readonly number[];
}

export interface PaymentMessageIndexItem {
  readonly order: number;
  readonly messageType: string;
  readonly description: string;
  readonly processingMode: PaymentProcessingMode;
  readonly profileStatus: string;
  readonly targetMessage: string;
  readonly businessService: string;
  readonly selectable: boolean;
  readonly mtCompatibility: PaymentMtCompatibility;
}

export interface PaymentMessageIndex {
  readonly standardsRelease: "SR2026";
  readonly maxBatchItems: number;
  readonly items: readonly PaymentMessageIndexItem[];
  readonly pagination?: IndexPaginationContract;
}

const MODES = new Set<PaymentProcessingMode>([
  "SINGLE",
  "SPLIT",
  "NOTIFICATION",
]);
const COMPATIBILITY_STATUSES = new Set<PaymentMtCompatibilityStatus>([
  "SUPPORTED_SINGLE",
  "SUPPORTED_SPLIT",
  "NOT_SUPPORTED",
]);

function stringArray(value: unknown, code: string): readonly string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string" || !entry.trim())
  )
    throw new Error(code);
  return value;
}

function positiveIntegerArray(value: unknown): readonly number[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((entry) => !Number.isInteger(entry) || Number(entry) < 1)
  )
    throw new Error("PAYMENT_INDEX_MRG_PAGES_REQUIRED");
  return value.map(Number);
}

function paymentIndexRow(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object")
    throw new Error("INVALID_PAYMENT_INDEX_ITEM");
  return raw as Record<string, unknown>;
}

function uniqueMessageType(
  row: Record<string, unknown>,
  seen: Set<string>,
): string {
  const messageType = scalarText(row["messageType"]);
  if (!/^MT2\d{2}(?:COV)?$/.test(messageType))
    throw new Error("PAYMENT_INDEX_MT2XX_ONLY");
  if (seen.has(messageType)) throw new Error("DUPLICATE_PAYMENT_MESSAGE_TYPE");
  seen.add(messageType);
  return messageType;
}

function requiredItemText(row: Record<string, unknown>, field: string): string {
  const value = scalarText(row[field]);
  if (!value.trim())
    throw new Error(`PAYMENT_INDEX_${field.toUpperCase()}_REQUIRED`);
  return value;
}

function paymentMtCompatibility(
  row: Record<string, unknown>,
): PaymentMtCompatibility {
  const rawCompatibility = row["mtCompatibility"];
  if (!rawCompatibility || typeof rawCompatibility !== "object")
    throw new Error("PAYMENT_INDEX_MT_COMPATIBILITY_REQUIRED");
  const compatibility = rawCompatibility as Record<string, unknown>;
  const status = compatibility["status"] as PaymentMtCompatibilityStatus;
  if (!COMPATIBILITY_STATUSES.has(status))
    throw new Error("INVALID_PAYMENT_MT_COMPATIBILITY_STATUS");
  return {
    status,
    ssiFields: stringArray(
      compatibility["ssiFields"],
      "INVALID_PAYMENT_SSI_FIELDS",
    ),
    mandatorySsiFields: stringArray(
      compatibility["mandatorySsiFields"],
      "INVALID_PAYMENT_MANDATORY_SSI_FIELDS",
    ),
    requiredUpstreamFields: stringArray(
      compatibility["requiredUpstreamFields"],
      "INVALID_PAYMENT_REQUIRED_UPSTREAM_FIELDS",
    ),
    mrgPages: positiveIntegerArray(compatibility["mrgPages"]),
  };
}

function paymentIndexItem(
  raw: unknown,
  seen: Set<string>,
): PaymentMessageIndexItem {
  const row = paymentIndexRow(raw);
  const messageType = uniqueMessageType(row, seen);
  const processingMode = row["processingMode"] as PaymentProcessingMode;
  if (!MODES.has(processingMode))
    throw new Error("INVALID_PAYMENT_PROCESSING_MODE");
  const order = Number(row["order"]);
  if (!Number.isInteger(order) || order < 1)
    throw new Error("INVALID_PAYMENT_INDEX_ORDER");
  return {
    order,
    messageType,
    description: requiredItemText(row, "description"),
    processingMode,
    profileStatus: requiredItemText(row, "profileStatus"),
    targetMessage: requiredItemText(row, "targetMessage"),
    businessService: requiredItemText(row, "businessService"),
    selectable: row["selectable"] === true,
    mtCompatibility: paymentMtCompatibility(row),
  };
}

export function validatePaymentMessageIndex(
  value: unknown,
): PaymentMessageIndex {
  if (!value || typeof value !== "object")
    throw new Error("INVALID_PAYMENT_MESSAGE_INDEX");
  const candidate = value as Record<string, unknown>;
  if (candidate["standardsRelease"] !== "SR2026")
    throw new Error("UNSUPPORTED_PAYMENT_INDEX_RELEASE");
  const maxBatchItems = candidate["maxBatchItems"];
  if (!Number.isInteger(maxBatchItems) || Number(maxBatchItems) < 1)
    throw new Error("INVALID_MAX_BATCH_ITEMS");
  if (!Array.isArray(candidate["items"]))
    throw new Error("PAYMENT_INDEX_ITEMS_REQUIRED");
  const seen = new Set<string>();
  const items = candidate["items"]
    .map((raw) => paymentIndexItem(raw, seen))
    .sort((left, right) => left.order - right.order);
  return {
    standardsRelease: "SR2026",
    maxBatchItems: Number(maxBatchItems),
    items,
  };
}

@Injectable()
export class PaymentMessageIndexService {
  private readonly index: PaymentMessageIndex;

  constructor(
    @Optional() private readonly pagination = new IndexPaginationPolicy(),
  ) {
    try {
      const path = resolve(
        process.cwd(),
        "parameters",
        "payment-message-index.json",
      );
      this.index = validatePaymentMessageIndex(
        JSON.parse(readFileSync(path, "utf8")),
      );
    } catch (error) {
      throw new InternalServerErrorException({
        code: "PAYMENT_MESSAGE_INDEX_INVALID",
        cause: error instanceof Error ? error.message : "UNKNOWN",
      });
    }
  }

  getIndex(): PaymentMessageIndex {
    return { ...this.index, pagination: this.pagination.contract };
  }

  findSelectable(messageType: string): PaymentMessageIndexItem | undefined {
    return this.index.items.find(
      (item) => item.messageType === messageType && item.selectable,
    );
  }
}
