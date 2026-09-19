export interface UiColumn {
  path?: string;
  paths?: string[];
  separator?: string;
  label: string;
}

export interface UiField {
  key: string;
  label: string;
  description?: string;
  required?: boolean;
  type: string;
  inputType?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  options?: string[];
  optionsSource?: string;
  referenceSource?: "reference/banks";
  defaultValue?: unknown;
  "x-required-when"?: { path: string; equals: unknown };
  "x-disabled-when"?: { path: string; equals: unknown };
}

export interface UiResource {
  id: string;
  label: string;
  endpoint: string;
  importType?: "SSI" | "RMA" | "NOSTRO";
  description: string;
  columns: UiColumn[];
  exportColumns?: Array<{ path: string; label: string }>;
  fields: UiField[];
  "x-lifecycle": string[];
}

export interface OpenApiUiContract {
  info: { title: string; version: string };
  "x-standards-baseline": Record<string, string>;
  "x-ui-resources": UiResource[];
}

export interface CurrencyReference {
  code: string;
  decimals: number;
}

export type Row = Record<string, unknown> & {
  id: string;
  status: string;
  version: number;
  maker: string;
};

export type StatusFilter =
  | "ACTIVE"
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "SUPPRESSED"
  | "ALL";

export interface ExportColumn {
  path: string;
  label: string;
}

export interface PagedRows {
  items: Row[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface BankReference {
  bankServiceId: string;
  bic: string;
  name: string;
  country: string;
  city?: string;
  standard: string;
}

export interface BankPage {
  items: readonly BankReference[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface MessageTypeChanges {
  readonly unchanged: readonly string[];
  readonly added: readonly string[];
  readonly suppressed: readonly string[];
}

export interface RmaMessageCategory {
  readonly categoryId: "SECURITY" | "TRADE_FINANCE" | "PAYMENT";
  readonly displayName: string;
  readonly displayOrder: number;
  readonly emptyStateText: string;
}

export interface RmaMessagePolicyItem {
  readonly messageType: string;
  readonly description: string;
  readonly categoryId: RmaMessageCategory["categoryId"];
  readonly directionApplicability: {
    readonly inbound: { readonly applicable: boolean };
    readonly outbound: { readonly applicable: boolean };
  };
}

export interface RmaMessageTypePolicy {
  readonly supportedMessageTypes: readonly string[];
  readonly categories: readonly RmaMessageCategory[];
  readonly items: readonly RmaMessagePolicyItem[];
}

export interface RmaPairState {
  readonly ownBic: string;
  readonly counterpartyBic: string;
  readonly directions: Readonly<Record<"INBOUND" | "OUTBOUND", Row | null>>;
}
