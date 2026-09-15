import { InternalServerErrorException } from "@nestjs/common";
import { IndexPaginationPolicy } from "./index-pagination.policy";

describe("IndexPaginationPolicy", () => {
  it("defaults to ten page-by-page rows when unset", () => {
    const previous = process.env["SSI_INDEX_PAGE_SIZE"];
    delete process.env["SSI_INDEX_PAGE_SIZE"];
    try {
      expect(new IndexPaginationPolicy().contract).toEqual({
        mode: "PAGE_BY_PAGE", defaultPageSize: 10, maxPageSize: 100,
      });
    } finally {
      if (previous === undefined) delete process.env["SSI_INDEX_PAGE_SIZE"];
      else process.env["SSI_INDEX_PAGE_SIZE"] = previous;
    }
  });

  it("accepts a governed positive integer", () => {
    expect(new IndexPaginationPolicy("25").contract.defaultPageSize).toBe(25);
  });

  it.each(["0", "-1", "1.5", "abc"])("rejects invalid value %s", (value) => {
    expect(() => new IndexPaginationPolicy(value)).toThrow(InternalServerErrorException);
  });

  it("caps an excessive configured value", () => {
    expect(new IndexPaginationPolicy("999").contract.defaultPageSize).toBe(100);
  });
});
