import {
  assertPaginationPolicy,
  pageCount,
  pageSlice,
  sortedCopy,
} from "./pagination";

describe("shared API pagination", () => {
  const policy = {
    mode: "PAGE_BY_PAGE" as const,
    defaultPageSize: 3,
    maxPageSize: 100,
  };

  it("uses the API page size for any index collection", () => {
    expect(assertPaginationPolicy(policy).defaultPageSize).toBe(3);
    expect(pageCount(7, policy.defaultPageSize)).toBe(3);
    expect(pageSlice([1, 2, 3, 4, 5], 2, policy.defaultPageSize)).toEqual([
      4, 5,
    ]);
  });

  it("sorts a copy with direction and deterministic tie-breakers", () => {
    const source = [
      { id: "B", order: 1 },
      { id: "A", order: 1 },
      { id: "C", order: 2 },
    ];
    expect(
      sortedCopy(source, (item) => item.order, "asc", [(item) => item.id]),
    ).toEqual([source[1], source[0], source[2]]);
    expect(
      sortedCopy(source, (item) => item.order, "desc", [(item) => item.id]),
    ).toEqual([source[2], source[1], source[0]]);
    expect(source.map((item) => item.id)).toEqual(["B", "A", "C"]);
  });

  it.each([
    undefined,
    { ...policy, defaultPageSize: 0 },
    { ...policy, defaultPageSize: 1.5 },
    { ...policy, defaultPageSize: 101, maxPageSize: 100 },
  ])("fails closed for missing or invalid API pagination", (candidate) => {
    expect(() => assertPaginationPolicy(candidate)).toThrow(
      "PAGE_DEFINITION_PAGINATION_INVALID",
    );
  });
});
