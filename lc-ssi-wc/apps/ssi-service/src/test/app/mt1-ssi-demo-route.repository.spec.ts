import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Mt1SsiDemoRouteRepository } from "../../app/mt1-ssi-demo-route.repository";

describe("Mt1SsiDemoRouteRepository", () => {
  it("binds picker and execution to one immutable demo fixture snapshot", () => {
    const repository = new Mt1SsiDemoRouteRepository();
    const lookup = repository.lookup({
      definitionId: "PAYMENT-PACS008-PLAIN-SR2026",
      definitionVersion: "V1",
      fixtureBindingId: "FIXTURE-1",
      scenarioId: "PACS008-PLAIN-SR2026:MT1-INDA-SSI",
      messageType: "pacs.008.001.08",
      sequence: "SSI_ROUTE",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-24",
    });
    const identity = lookup.items[0]!.selectedRouteIdentity!;

    expect(lookup.items).toHaveLength(1);
    expect(lookup.eligibilitySnapshot).toMatchObject({
      snapshotIdentityMethod: "SHA256_CANONICAL_DEMO_FIXTURE_V1",
    });
    expect(lookup.defaultSelection).toEqual({
      valueField: "bankServiceId",
      value: "BANK-SVC-CITIUS33",
      reasonCode: "GOVERNED_PRIORITY_DEFAULT",
      dependency: { fieldId: "context.currency", value: "USD" },
    });
    expect(
      repository.accepts(identity, lookup.eligibilitySnapshot!.snapshotId),
    ).toBe(true);
    expect(repository.accepts(identity, "stale-snapshot")).toBe(false);
  });

  it("supports governed text filtering", () => {
    const repository = new Mt1SsiDemoRouteRepository();
    const base = {
      definitionId: "PAYMENT-PACS008-PLAIN-SR2026",
      definitionVersion: "V1",
      fixtureBindingId: "FIXTURE-1",
      scenarioId: "PACS008-PLAIN-SR2026:MT1-INDA-SSI",
      messageType: "pacs.008.001.08",
      sequence: "SSI_ROUTE",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-24",
    };

    expect(repository.lookup({ ...base, query: "citi" }).items).toHaveLength(1);
    expect(repository.lookup({ ...base, query: "missing" }).items).toHaveLength(
      0,
    );
  });

  it("rejects an invalid controlled demo fixture", () => {
    const fixturePath = join(process.cwd(), "tmp", "mt1-invalid-route.json");
    writeFileSync(
      fixturePath,
      JSON.stringify({
        schemaVersion: "1.0",
        fixtureVersion: "TEST",
        standardsRelease: "SR2026",
        routes: [],
      }),
    );

    expect(
      () => new Mt1SsiDemoRouteRepository({ fixturePath }),
    ).toThrow("MT1_SSI_DEMO_ROUTE_FIXTURE_INVALID");
  });
});
