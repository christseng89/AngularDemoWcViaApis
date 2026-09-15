export interface PaginationPolicy {
  readonly mode: "PAGE_BY_PAGE";
  readonly defaultPageSize: number;
  readonly maxPageSize: number;
}

export const assertPaginationPolicy = (
  policy: PaginationPolicy | undefined,
): PaginationPolicy => {
  if (!policy) throw new Error("PAGE_DEFINITION_PAGINATION_INVALID");
  if (
    policy.mode !== "PAGE_BY_PAGE" ||
    !Number.isInteger(policy.defaultPageSize) ||
    policy.defaultPageSize < 1 ||
    !Number.isInteger(policy.maxPageSize) ||
    policy.maxPageSize < policy.defaultPageSize
  )
    throw new Error("PAGE_DEFINITION_PAGINATION_INVALID");
  return policy;
};

export const pageCount = (itemCount: number, pageSize: number): number =>
  Math.max(1, Math.ceil(itemCount / pageSize));

export const pageSlice = <T>(
  items: readonly T[],
  page: number,
  pageSize: number,
): readonly T[] => {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
};

export type SortDirection = "asc" | "desc";

const compare = (left: string | number, right: string | number): number =>
  typeof left === "number" && typeof right === "number"
    ? left - right
    : String(left).localeCompare(String(right), undefined, { numeric: true });

export const sortedCopy = <T>(
  items: readonly T[],
  value: (item: T) => string | number,
  direction: SortDirection,
  tieBreakers: readonly ((item: T) => string | number)[],
): readonly T[] => {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...items].sort((left, right) => {
    const primary = compare(value(left), value(right)) * multiplier;
    if (primary) return primary;
    for (const tieBreaker of tieBreakers) {
      const tied = compare(tieBreaker(left), tieBreaker(right));
      if (tied) return tied;
    }
    return 0;
  });
};
