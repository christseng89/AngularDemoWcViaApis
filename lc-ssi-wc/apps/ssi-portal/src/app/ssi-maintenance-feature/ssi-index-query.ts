import type { SortDirection, SsiOwnershipSort } from "../ssi-maintenance-index";

export interface SsiIndexQueryOptions {
  status: "ACTIVE" | "DRAFT" | "SUPPRESSED" | "ALL";
  page: number;
  pageSize: number;
  sortBy: SsiOwnershipSort;
  sortDirection: SortDirection;
  ownershipType: "OWN" | "COUNTERPARTY";
  search: string;
  counterpartyId: string;
}

export function buildSsiIndexQuery(
  options: SsiIndexQueryOptions,
): URLSearchParams {
  const query = new URLSearchParams({
    status: options.status,
    page: String(options.page),
    pageSize: String(options.pageSize),
    sortBy: options.sortBy,
    sortDirection: options.sortDirection,
  });
  query.set("ownershipType", options.ownershipType);
  const search = options.search.trim();
  if (search) query.set("search", search);
  if (options.counterpartyId)
    query.set("counterpartyId", options.counterpartyId);
  return query;
}
