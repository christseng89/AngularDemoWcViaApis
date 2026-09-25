import { Mt1SsiDemoRouteRepository } from "../../app/mt1-ssi-demo-route.repository";

describe("Mt1SsiDemoRouteRepository", () => {
  it("selects the governed EUR counterparty from the database instead of the legacy JSON default", () => {
    const repository = new Mt1SsiDemoRouteRepository();
    const lookup = repository.lookup({
      definitionId: "PAYMENT-MT103-BASE-SR2026",
      definitionVersion: "V1",
      fixtureBindingId: "FIXTURE-MT1-INDA-SSI",
      scenarioId: "MT103-BASE-SR2026:MT1-INDA-SSI",
      messageType: "MT103",
      resolutionMessageType: "pacs.008.001.08",
      profileId: "MT103-BASE-SR2026",
      businessService: "FIN-MT103-BASE",
      settlementContext: "INDA",
      sequence: "SSI_ROUTE",
      currency: "EUR",
      bookingEntity: "HK01",
      valueDate: "2026-09-25",
    });

    expect(lookup.eligibilitySnapshot).toMatchObject({
      snapshotIdentityMethod: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
    });
    expect(lookup.items.map(({ bic }) => bic)).toContain("DEUTDEFF");
    expect(lookup.defaultSelection).toMatchObject({
      value: expect.stringContaining("DEUTDEFF"),
    });
  });

  it("binds picker and execution to one immutable database snapshot", () => {
    const repository = new Mt1SsiDemoRouteRepository();
    const lookup = repository.lookup({
      definitionId: "PAYMENT-PACS008-PLAIN-SR2026",
      definitionVersion: "V1",
      fixtureBindingId: "FIXTURE-MT1-INDA-SSI",
      scenarioId: "PACS008-PLAIN-SR2026:MT1-INDA-SSI",
      messageType: "pacs.008.001.08",
      resolutionMessageType: "pacs.008.001.08",
      profileId: "PACS008-PLAIN-SR2026",
      businessService: "swift.cbprplus.04",
      settlementContext: "INDA",
      sequence: "SSI_ROUTE",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-24",
    });
    const identity = lookup.items[0]!.selectedRouteIdentity!;

    expect(lookup.items).toHaveLength(1);
    expect(lookup.eligibilitySnapshot).toMatchObject({
      snapshotIdentityMethod: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
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
      fixtureBindingId: "FIXTURE-MT1-INDA-SSI",
      scenarioId: "PACS008-PLAIN-SR2026:MT1-INDA-SSI",
      messageType: "pacs.008.001.08",
      resolutionMessageType: "pacs.008.001.08",
      profileId: "PACS008-PLAIN-SR2026",
      businessService: "swift.cbprplus.04",
      settlementContext: "INDA" as const,
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

  it("does not treat an unbound SSI as a wildcard for an unknown fixture", () => {
    const repository = new Mt1SsiDemoRouteRepository();
    const lookup = repository.lookup({
      definitionId: "PAYMENT-MT103-BASE-SR2026",
      definitionVersion: "V1",
      fixtureBindingId: "NONEXISTENT-FIXTURE",
      scenarioId: "MT103-BASE-SR2026:MT1-INDA-SSI",
      messageType: "MT103",
      resolutionMessageType: "pacs.008.001.08",
      profileId: "MT103-BASE-SR2026",
      businessService: "FIN-MT103-BASE",
      settlementContext: "INDA",
      sequence: "SSI_ROUTE",
      currency: "EUR",
      bookingEntity: "HK01",
      valueDate: "2026-09-25",
    });

    expect(lookup.items).toEqual([]);
    expect(lookup.defaultSelection).toBeUndefined();
  });

  it("projects an MT settlement field to the governed servicer BIC", () => {
    const repository = new Mt1SsiDemoRouteRepository();
    const lookup = repository.lookup({
      definitionId: "PAYMENT-MT103-BASE-SR2026",
      definitionVersion: "V1",
      fixtureBindingId: "FIXTURE-MT1-INGA-SSI",
      scenarioId: "MT103-BASE-SR2026:MT1-INGA-SSI",
      messageType: "MT103",
      resolutionMessageType: "pacs.008.001.08",
      profileId: "MT103-BASE-SR2026",
      businessService: "FIN-MT103-BASE",
      settlementContext: "INGA",
      sequence: "SSI_ROUTE",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-24",
    });

    const route = repository.settlementRoute(
      lookup.items[0]!.selectedRouteIdentity!,
      lookup.eligibilitySnapshot!.snapshotId,
      {
        settlementContext: "INGA",
        currency: "USD",
        messageType: "MT103",
        profileId: "MT103-BASE-SR2026",
        evidenceFormats: ["SWIFT_MT", "ISO_20022"],
      },
    );

    expect(route?.legs[0]).toMatchObject({
      accountOwner: { bic: "CITIUS33", name: "Citibank N.A." },
      accountServicer: { bic: "DEMOHKHH", name: "Local Bank" },
    });
    expect(route?.roles).toEqual([
      expect.objectContaining({
        role: "INGA_SETTLEMENT_ACCOUNT_RELATIONSHIP",
        owner: "COUNTERPARTY_SSI",
      }),
    ]);
    expect(route?.projections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "SWIFT_MT_FIELD",
          identifier: "54",
          option: "A",
          value: "DEMOHKHH",
        }),
        expect.objectContaining({
          kind: "ISO_20022_ELEMENT",
          identifier: "SttlmMtd",
          value: "INGA",
        }),
        expect.objectContaining({
          kind: "ISO_20022_ELEMENT",
          identifier: "SttlmAcct",
          value: expect.any(String),
          accountReference: expect.any(String),
        }),
      ]),
    );
    expect(
      route?.projections.find(({ identifier }) => identifier === "SttlmMtd"),
    ).not.toHaveProperty("accountReference");
  });

  it("uses own SSI ownership for INDA and returns one non-RMA route", () => {
    const repository = new Mt1SsiDemoRouteRepository();
    const lookup = repository.lookup({
      definitionId: "PAYMENT-MT103-BASE-SR2026",
      definitionVersion: "V1",
      fixtureBindingId: "FIXTURE-MT1-INDA-SSI",
      scenarioId: "MT103-BASE-SR2026:MT1-INDA-SSI",
      messageType: "MT103",
      resolutionMessageType: "pacs.008.001.08",
      profileId: "MT103-BASE-SR2026",
      businessService: "FIN-MT103-BASE",
      settlementContext: "INDA",
      sequence: "SSI_ROUTE",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-24",
    });

    const route = repository.settlementRoute(
      lookup.items[0]!.selectedRouteIdentity!,
      lookup.eligibilitySnapshot!.snapshotId,
      {
        settlementContext: "INDA",
        currency: "USD",
        messageType: "MT103",
        profileId: "MT103-BASE-SR2026",
        evidenceFormats: ["SWIFT_MT", "ISO_20022"],
      },
    );

    expect(route).not.toHaveProperty("rma");
    expect(route?.roles).toEqual([
      expect.objectContaining({
        role: "INDA_SETTLEMENT_ACCOUNT_RELATIONSHIP",
        owner: "OWN_SSI_OR_ACCOUNT_MASTER",
        recordId: lookup.items[0]!.selectedRouteIdentity!.nostro.id,
      }),
    ]);
    expect(route?.legs[0]).toMatchObject({
      accountOwner: { bic: "DEMOHKHH" },
      accountServicer: { bic: "CITIUS33" },
    });
  });

  it("projects a complete COVE boundary and separate ISO agent/account elements", () => {
    const repository = new Mt1SsiDemoRouteRepository();
    const lookup = repository.lookup({
      definitionId: "PAYMENT-MT103-STP-SR2026",
      definitionVersion: "V1",
      fixtureBindingId: "FIXTURE-MT1-COVE-SSI",
      scenarioId: "MT103-STP-SR2026:MT1-COVE-SSI",
      messageType: "MT103",
      resolutionMessageType: "pacs.008.001.08",
      profileId: "MT103-STP-SR2026",
      businessService: "FIN-MT103-STP",
      settlementContext: "COVE",
      sequence: "SSI_ROUTE",
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-24",
    });

    const route = repository.settlementRoute(
      lookup.items[0]!.selectedRouteIdentity!,
      lookup.eligibilitySnapshot!.snapshotId,
      {
        settlementContext: "COVE",
        currency: "USD",
        messageType: "MT103",
        profileId: "MT103-STP-SR2026",
        evidenceFormats: ["SWIFT_MT", "ISO_20022"],
      },
    );

    expect(route?.legs).toEqual([
      expect.objectContaining({
        role: "INSTRUCTING_REIMBURSEMENT_AGENT",
        accountOwner: expect.objectContaining({ bic: "DEMOHKHH" }),
        accountServicer: expect.objectContaining({ bic: "CITIUS33" }),
      }),
      expect.objectContaining({
        role: "INSTRUCTED_REIMBURSEMENT_AGENT",
        accountOwner: expect.objectContaining({ bic: "CITIUS33" }),
        accountServicer: expect.objectContaining({ bic: "DEMOHKHH" }),
      }),
    ]);
    expect(route?.projections).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ identifier: "SttlmMtd", value: "COVE" }),
        expect.objectContaining({
          identifier: "InstgRmbrsmntAgt",
          value: "CITIUS33",
        }),
        expect.objectContaining({
          identifier: "InstgRmbrsmntAgtAcct",
          value: expect.any(String),
        }),
        expect.objectContaining({
          identifier: "InstdRmbrsmntAgt",
          value: "DEMOHKHH",
        }),
        expect.objectContaining({
          identifier: "InstdRmbrsmntAgtAcct",
          value: expect.any(String),
        }),
      ]),
    );
  });

  it("does not depend on a runtime route JSON fixture", () => {
    expect(Mt1SsiDemoRouteRepository.toString()).not.toContain("readFileSync");
    expect(Mt1SsiDemoRouteRepository.toString()).not.toContain(
      "mt1-ssi-demo-routes",
    );
  });
});
