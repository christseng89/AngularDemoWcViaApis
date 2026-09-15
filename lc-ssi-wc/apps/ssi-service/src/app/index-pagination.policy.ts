import { Inject, Injectable, InternalServerErrorException, Optional } from "@nestjs/common";

export const INDEX_PAGE_SIZE_ENV = Symbol("INDEX_PAGE_SIZE_ENV");
export const DEFAULT_INDEX_PAGE_SIZE = 10;
export const MAX_INDEX_PAGE_SIZE = 100;

export interface IndexPaginationContract {
  readonly mode: "PAGE_BY_PAGE";
  readonly defaultPageSize: number;
  readonly maxPageSize: number;
}

@Injectable()
export class IndexPaginationPolicy {
  readonly contract: IndexPaginationContract;

  constructor(@Optional() @Inject(INDEX_PAGE_SIZE_ENV) raw?: string) {
    const configured = raw ?? process.env["SSI_INDEX_PAGE_SIZE"];
    const pageSize = configured === undefined || configured.trim() === ""
      ? DEFAULT_INDEX_PAGE_SIZE
      : Number(configured);
    if (!Number.isInteger(pageSize) || pageSize < 1)
      throw new InternalServerErrorException({
        code: "INDEX_PAGE_SIZE_INVALID",
        variable: "SSI_INDEX_PAGE_SIZE",
        remediation: "Set a positive whole number; values above 100 are capped.",
      });
    this.contract = Object.freeze({
      mode: "PAGE_BY_PAGE",
      defaultPageSize: Math.min(pageSize, MAX_INDEX_PAGE_SIZE),
      maxPageSize: MAX_INDEX_PAGE_SIZE,
    });
  }
}
