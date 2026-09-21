import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("MT202 own-account OpenAPI contract", () => {
  const readOas = (path: string) =>
    JSON.parse(readFileSync(join(process.cwd(), path), "utf8")) as {
      paths: Record<string, { get?: Record<string, unknown> }>;
      components: {
        schemas: Record<
          string,
          {
            required?: string[];
            properties?: Record<string, unknown>;
            enum?: string[];
          }
        >;
      };
    };

  it("requires stable governed account identities, versions and Receiver Bank Service", () => {
    const oas = readOas("openapi/swift-data-service.v1.json");
    const schema = oas.components.schemas["OwnAccountSettlementRequest"]!;
    const required = [
      "receiverBankServiceId",
      "ownDebitAccountId",
      "ownDebitAccountVersion",
      "ownCreditAccountId",
      "ownCreditAccountVersion",
    ];

    expect(schema.required).toEqual(expect.arrayContaining(required));
    for (const property of required)
      expect(schema.properties).toHaveProperty(property);
  });

  it("documents the governed Receiver and Nostro lookup transport", () => {
    const oas = readOas("openapi/swift-data-service.v1.json");

    expect(
      oas.paths[
        "/v1/resolution-page-definitions/lookups/own-account-receivers"
      ]?.get,
    ).toBeDefined();
    expect(
      oas.paths["/v1/resolution-page-definitions/lookups/nostro-accounts"]
        ?.get,
    ).toBeDefined();
    expect(oas.components.schemas["PageParameterLookupProvider"]?.enum).toContain(
      "NOSTRO_ACCOUNT",
    );
    expect(
      oas.components.schemas["PageParameterLookupMetadata"]?.properties,
    ).toHaveProperty("companionValueFields");
    expect(
      oas.components.schemas["PageParameterLookupDefaultSelection"]
        ?.properties,
    ).toHaveProperty("companionValues");
  });

  it("keeps the service and portal OpenAPI documents byte-identical", () => {
    expect(
      readFileSync(
        join(process.cwd(), "apps/ssi-portal/public/openapi/swift-data-service.v1.json"),
        "utf8",
      ),
    ).toBe(
      readFileSync(
        join(process.cwd(), "openapi/swift-data-service.v1.json"),
        "utf8",
      ),
    );
  });
});
