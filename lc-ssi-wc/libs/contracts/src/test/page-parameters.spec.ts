import { RESOLUTION_PAGE_SCHEMA_VERSION } from "../index";

describe("page-parameter runtime contract", () => {
  it("exports the governed schema version through the public contract entrypoint", () => {
    expect(RESOLUTION_PAGE_SCHEMA_VERSION).toBe("1.0");
  });
});
