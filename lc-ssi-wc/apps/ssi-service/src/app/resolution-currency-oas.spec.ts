import { readFileSync } from "node:fs";

describe("Resolution Currency Inquiry OAS screen parameters", () => {
  it("defines one Index-only governed screen in both served and canonical OAS", () => {
    const canonical = JSON.parse(readFileSync("openapi/swift-data-service.v1.json", "utf8")) as Record<string, unknown>;
    const served = JSON.parse(readFileSync("apps/ssi-portal/public/openapi/swift-data-service.v1.json", "utf8")) as Record<string, unknown>;
    expect(served).toEqual(canonical);
    expect(canonical["x-ui-inquiries"]).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "resolution-currency",
        endpoint: "settings/resolution-currencies",
        mode: "INDEX_ONLY",
        columns: [
          { path: "businessDomain", label: "Business Domain", presentation: "strong" },
          { path: "currency", label: "Currency", presentation: "strong" },
          { path: "status", label: "Status", presentation: "status" },
          { path: "source", label: "Source" },
          { path: "lastResyncAt", label: "Last Resync At" },
        ],
      }),
    ]));
  });
});
