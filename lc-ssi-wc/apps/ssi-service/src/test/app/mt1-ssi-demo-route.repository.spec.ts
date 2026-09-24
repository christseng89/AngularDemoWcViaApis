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
    expect(
      repository.accepts(identity, lookup.eligibilitySnapshot!.snapshotId),
    ).toBe(true);
    expect(repository.accepts(identity, "stale-snapshot")).toBe(false);
  });
});
