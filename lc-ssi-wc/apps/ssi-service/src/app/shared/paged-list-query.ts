import { BadRequestException } from "@nestjs/common";
import type { PageRequest } from "./sqlite-governed.repository";

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw new BadRequestException("INVALID_PAGINATION");
  return parsed;
}

export function pagedListQuery(query: {
  status: string | undefined;
  page: string | undefined;
  pageSize: string | undefined;
  search: string | undefined;
}): PageRequest | null {
  if (query.page === undefined && query.pageSize === undefined && query.search === undefined)
    return null;
  return {
    ...(query.status === undefined ? {} : { status: query.status }),
    page: positiveInteger(query.page, 1),
    pageSize: Math.min(100, positiveInteger(query.pageSize, 20)),
    ...(query.search === undefined ? {} : { search: query.search }),
  };
}
