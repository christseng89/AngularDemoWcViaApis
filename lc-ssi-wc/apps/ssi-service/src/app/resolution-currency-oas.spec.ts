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
    const paths = canonical["paths"] as Record<string, { get?: Record<string, unknown>; post?: Record<string, unknown> }>;
    const inquiry = paths["/settings/resolution-currencies"]?.get;
    expect(inquiry?.["operationId"]).toBe("inquireResolutionCurrencies");
    expect((inquiry?.["parameters"] as { name: string }[]).map((parameter) => parameter.name)).toEqual([
      "page", "pageSize", "businessDomain", "status", "search", "sortBy", "sortDirection",
    ]);
    expect((inquiry?.["responses"] as Record<string, unknown>)["200"]).toEqual(expect.objectContaining({
      content: { "application/json": { schema: { "$ref": "#/components/schemas/ResolutionCurrencyInquiryPage" } } },
    }));
    const resync = paths["/settings/resolution-currencies/resync"]?.post;
    expect(resync?.["operationId"]).toBe("resyncResolutionCurrencies");
    expect((resync?.["responses"] as Record<string, unknown>)["200"]).toEqual(expect.objectContaining({
      content: { "application/json": { schema: { "$ref": "#/components/schemas/ResolutionCurrencyResyncResult" } } },
    }));
    const schemas = (canonical["components"] as { schemas: Record<string, unknown> }).schemas;
    expect(schemas["ResolutionCurrencyInquiryPage"]).toBeDefined();
    expect(schemas["ResolutionCurrencyResyncResult"]).toBeDefined();
  });
});
