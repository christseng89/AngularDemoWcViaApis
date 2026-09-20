import { Inject, Injectable, Optional } from "@nestjs/common";
import { DEFAULT_INDEX_PAGE_SIZE, MAX_INDEX_PAGE_SIZE } from "./index-pagination.policy";

export const RESOLUTION_CURRENCY_SORT_COLUMNS = [
  "businessDomain", "currency", "status", "source", "lastResyncAt",
] as const;
export type ResolutionCurrencySortColumn = typeof RESOLUTION_CURRENCY_SORT_COLUMNS[number];
export type ResolutionCurrencySortDirection = "asc" | "desc";

export interface ResolutionCurrencyInquiryConfiguration {
  readonly title: string;
  readonly sortBy: ResolutionCurrencySortColumn;
  readonly sortDirection: ResolutionCurrencySortDirection;
  readonly pageSize: number;
}

@Injectable()
export class ResolutionCurrencyInquiryPolicy {
  readonly contract: ResolutionCurrencyInquiryConfiguration;

  constructor(@Optional() @Inject("SSI_RUNTIME_ENVIRONMENT") environment: Readonly<Record<string, string | undefined>> = process.env) {
    const title = environment["SSI_RESOLUTION_CURRENCY_INQUIRY_TITLE"]?.trim() || "Inquire Business Currency Index";
    const sort = environment["SSI_RESOLUTION_CURRENCY_INQUIRY_SORT"]?.trim() || "businessDomain:asc";
    const [sortBy, sortDirection, extra] = sort.split(":");
    const rawPageSize = environment["SSI_INDEX_PAGE_SIZE"]?.trim() || String(DEFAULT_INDEX_PAGE_SIZE);
    const pageSize = Number(rawPageSize);
    if (title.length > 100 || !RESOLUTION_CURRENCY_SORT_COLUMNS.includes(sortBy as ResolutionCurrencySortColumn) ||
      !["asc", "desc"].includes(sortDirection ?? "") || extra !== undefined ||
      !Number.isInteger(pageSize) || pageSize < 1)
      throw new Error("RESOLUTION_CURRENCY_INQUIRY_CONFIGURATION_INVALID");
    this.contract = Object.freeze({
      title,
      sortBy: sortBy as ResolutionCurrencySortColumn,
      sortDirection: sortDirection as ResolutionCurrencySortDirection,
      pageSize: Math.min(pageSize, MAX_INDEX_PAGE_SIZE),
    });
  }
}
