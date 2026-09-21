import { BadRequestException } from "@nestjs/common";
import { pagedListQuery } from "../../../app/shared/paged-list-query";

describe("pagedListQuery", () => {
  it("keeps the legacy unpaged query when no page controls are supplied", () => {
    expect(
      pagedListQuery({
        status: "ACTIVE",
        page: undefined,
        pageSize: undefined,
        search: undefined,
      }),
    ).toBeNull();
  });

  it("applies safe defaults, caps page size, and preserves explicit filters", () => {
    expect(
      pagedListQuery({
        status: undefined,
        page: "",
        pageSize: "",
        search: undefined,
      }),
    ).toEqual({ page: 1, pageSize: 20 });
    expect(
      pagedListQuery({
        status: "ACTIVE",
        page: "2",
        pageSize: "500",
        search: "Citi",
      }),
    ).toEqual({ status: "ACTIVE", page: 2, pageSize: 100, search: "Citi" });
  });

  it.each([
    ["bad", "20"],
    ["1.5", "20"],
    ["0", "20"],
    ["1", "bad"],
    ["1", "1.5"],
    ["1", "0"],
  ])("rejects invalid page coordinates %s/%s", (page, pageSize) => {
    expect(() =>
      pagedListQuery({ status: undefined, page, pageSize, search: undefined }),
    ).toThrow(BadRequestException);
  });
});
