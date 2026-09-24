import { Mt1SsiProfileRegistry } from "../../../app/mt1-ssi-profile.registry";
import { Mt1SsiResolutionPageDefinitionSource } from "../../../app/page-parameters/mt1-ssi-resolution-page-definition.source";
import { Mt1SsiResolutionPageSubmissionAdapter } from "../../../app/page-parameters/mt1-ssi-resolution-page-submission.adapter";
import { Mt1SsiDemoRouteRepository } from "../../../app/mt1-ssi-demo-route.repository";

const source = new Mt1SsiResolutionPageDefinitionSource();
const definition = source
  .all("SR2026")
  .find(({ profile }) => profile.profileId === "PACS008-PLAIN-SR2026")!;
const scenario = definition.scenarios.find(({ scenarioId }) =>
  scenarioId.endsWith(":MT1-INDA-SSI"),
)!;
const values = Object.fromEntries(
  definition.fields.map((field) => [
    field.fieldId,
    scenario.inputValues?.[field.fieldId] ?? field.defaultValue ?? "",
  ]),
);

describe("Mt1SsiResolutionPageSubmissionAdapter", () => {
  const routes = new Mt1SsiDemoRouteRepository();
  const adapter = new Mt1SsiResolutionPageSubmissionAdapter(
    new Mt1SsiProfileRegistry(),
    routes,
  );

  it("returns SSI-only MX resolution evidence without generating a payment payload", () => {
    const lookup = routes.lookup({
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      fixtureBindingId: scenario.fixture.bindingId,
      scenarioId: scenario.scenarioId,
      messageType: definition.messageType,
      sequence: definition.sequences[0]!.sequenceId,
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-24",
    });
    const result = adapter.execute({
      definition,
      scenario,
      submission: {
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        scenarioId: scenario.scenarioId,
        fixtureBindingId: scenario.fixture.bindingId,
        contractSha256: "a".repeat(64),
        eligibilitySnapshot: lookup.eligibilitySnapshot,
        selectedRouteIdentity: lookup.items[0]!.selectedRouteIdentity,
        values: {
          ...values,
          "context.counterpartyBankServiceId": "BANK-SVC-CITIUS33",
        },
      },
    });

    expect(result).toMatchObject({
      outcome: "RESOLVED",
      ssiApplicability: "REQUIRED",
      resolutionOutcome: "ELIGIBLE_COMPLETE_ROUTE",
      payloadGenerated: false,
      routeBindingId: lookup.items[0]!.selectedRouteIdentity!.routeId,
      settlementRoute: {
        routeBindingId: lookup.items[0]!.selectedRouteIdentity!.routeId,
        counterparty: {
          bankServiceId: "BANK-SVC-CITIUS33",
          bic: "CITIUS33",
          name: "Citibank Demo",
        },
        ssi: { id: "MT1-SSI-CITI", version: 1 },
        applicability: { id: "MT1-APP-CITI", version: 1 },
        nostro: { id: "MT1-NOSTRO-CITI", version: 1 },
        rma: { id: "MT1-RMA-CITI", version: 1 },
        roles: [
          {
            role: "INDA_SETTLEMENT_ACCOUNT_RELATIONSHIP",
            owner: "COUNTERPARTY_SSI",
            recordId: "MT1-SSI-CITI",
            version: 1,
          },
        ],
        legs: [
          {
            order: 1,
            relationship: "INDA",
            accountOwner: { bic: "DEMOHKHH" },
            accountServicer: { bic: "CITIUS33" },
            accountReference: "DEMO-USD-CITI-INDA",
            currency: "USD",
          },
        ],
        projections: [
          {
            kind: "ISO_20022_ELEMENT",
            identifier: "SttlmMtd",
            role: "INDA_SETTLEMENT_ACCOUNT_RELATIONSHIP",
            accountReference: "DEMO-USD-CITI-INDA",
          },
        ],
      },
      outputs: [
        {
          outputId: "ssi-resolution-iso-20022",
          format: "ISO_20022",
          label: "pacs.008.001.08",
          messageIdentity: "pacs.008.001.08",
          mediaType: "application/json",
          document: {
            decision: "RESOLVED",
            code: "ELIGIBLE_COMPLETE_ROUTE",
            resolutionDomain: "OUTWARD_SSI_ONLY",
            payloadGenerated: false,
            messageDefinitionId: "pacs.008.001.08",
            businessService: "swift.cbprplus.04",
            scope: "SSI_RESOLUTION_EVIDENCE_ONLY",
            settlementContext: "INDA",
            settlementRoute: {
              counterparty: { bic: "CITIUS33" },
              legs: [
                expect.objectContaining({
                  accountReference: "DEMO-USD-CITI-INDA",
                }),
              ],
              projections: [
                expect.objectContaining({
                  identifier: "SttlmMtd",
                  value: "INDA",
                }),
              ],
            },
          },
        },
      ],
    });
  });

  it("projects only the governed MT103 COVE reimbursement roles", () => {
    const mt103 = source
      .all("SR2026")
      .find(({ profile }) => profile.profileId === "MT103-BASE-SR2026")!;
    const coveScenario = mt103.scenarios.find(({ scenarioId }) =>
      scenarioId.endsWith(":MT1-COVE-SSI"),
    )!;
    const lookup = routes.lookup({
      definitionId: mt103.definitionId,
      definitionVersion: mt103.definitionVersion,
      fixtureBindingId: coveScenario.fixture.bindingId,
      scenarioId: coveScenario.scenarioId,
      messageType: mt103.messageType,
      sequence: mt103.sequences[0]!.sequenceId,
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-24",
    });
    const result = adapter.execute({
      definition: mt103,
      scenario: coveScenario,
      submission: {
        definitionId: mt103.definitionId,
        definitionVersion: mt103.definitionVersion,
        scenarioId: coveScenario.scenarioId,
        fixtureBindingId: coveScenario.fixture.bindingId,
        contractSha256: "a".repeat(64),
        eligibilitySnapshot: lookup.eligibilitySnapshot,
        selectedRouteIdentity: lookup.items[0]!.selectedRouteIdentity,
        values: {
          ...Object.fromEntries(
            mt103.fields.map((field) => [
              field.fieldId,
              coveScenario.inputValues?.[field.fieldId] ??
                field.defaultValue ??
                "",
            ]),
          ),
          "context.counterpartyBankServiceId": "BANK-SVC-CITIUS33",
        },
      },
    });

    expect(result).toMatchObject({
      outcome: "RESOLVED",
      settlementRoute: {
        roles: [
          { role: "INSTRUCTING_REIMBURSEMENT_AGENT" },
          { role: "INSTRUCTED_REIMBURSEMENT_AGENT" },
        ],
        projections: [
          {
            kind: "SWIFT_MT_FIELD",
            identifier: "53",
            option: "A",
            label: "Sender's Correspondent",
          },
          {
            kind: "SWIFT_MT_FIELD",
            identifier: "54",
            option: "A",
            label: "Receiver's Correspondent",
          },
        ],
      },
    });
    expect(result.settlementRoute?.roles).toHaveLength(2);
  });

  it("returns REQUIRED plus NO_ELIGIBLE_SSI when no atomic route is selected", () => {
    const result = adapter.execute({
      definition,
      scenario,
      submission: {
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        scenarioId: scenario.scenarioId,
        fixtureBindingId: scenario.fixture.bindingId,
        contractSha256: "a".repeat(64),
        values: {
          ...values,
          "context.counterpartyBankServiceId": "BANK-SVC-CITIUS33",
        },
      },
    });

    expect(result).toMatchObject({
      outcome: "NO_ELIGIBLE_SSI",
      ssiApplicability: "REQUIRED",
      resolutionOutcome: "NO_ELIGIBLE_SSI",
      payloadGenerated: false,
      outputs: [],
    });
  });

  it("identifies the governed INGA settlement relationship without calling it a reimbursement agent", () => {
    const ingaScenario = definition.scenarios.find(({ scenarioId }) =>
      scenarioId.endsWith(":MT1-INGA-SSI"),
    )!;
    const lookup = routes.lookup({
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      fixtureBindingId: ingaScenario.fixture.bindingId,
      scenarioId: ingaScenario.scenarioId,
      messageType: definition.messageType,
      sequence: definition.sequences[0]!.sequenceId,
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-24",
    });
    const result = adapter.execute({
      definition,
      scenario: ingaScenario,
      submission: {
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        scenarioId: ingaScenario.scenarioId,
        fixtureBindingId: ingaScenario.fixture.bindingId,
        contractSha256: "a".repeat(64),
        eligibilitySnapshot: lookup.eligibilitySnapshot,
        selectedRouteIdentity: lookup.items[0]!.selectedRouteIdentity,
        values: {
          ...values,
          ...ingaScenario.inputValues,
          "context.counterpartyBankServiceId": "BANK-SVC-CITIUS33",
        },
      },
    });

    expect(result.settlementRoute?.roles).toEqual([
      expect.objectContaining({
        role: "INGA_SETTLEMENT_ACCOUNT_RELATIONSHIP",
        owner: "COUNTERPARTY_SSI",
      }),
    ]);
  });

  it("rejects a stale selected route identity as unavailable", () => {
    const lookup = routes.lookup({
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      fixtureBindingId: scenario.fixture.bindingId,
      scenarioId: scenario.scenarioId,
      messageType: definition.messageType,
      sequence: definition.sequences[0]!.sequenceId,
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-24",
    });
    const result = adapter.execute({
      definition,
      scenario,
      submission: {
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        scenarioId: scenario.scenarioId,
        fixtureBindingId: scenario.fixture.bindingId,
        contractSha256: "a".repeat(64),
        eligibilitySnapshot: {
          ...lookup.eligibilitySnapshot!,
          snapshotId: "stale-snapshot",
        },
        selectedRouteIdentity: lookup.items[0]!.selectedRouteIdentity,
        values: {
          ...values,
          "context.counterpartyBankServiceId": "BANK-SVC-CITIUS33",
        },
      },
    });

    expect(result).toMatchObject({
      outcome: "NO_ELIGIBLE_SSI",
      resolutionOutcome: "NO_ELIGIBLE_SSI",
      payloadGenerated: false,
    });
  });

  it("fails closed when the selected identity has no actionable account relationship", () => {
    const fixturePath = join(
      process.cwd(),
      "tmp",
      "mt1-incomplete-actionable-route.test.json",
    );
    mkdirSync(join(process.cwd(), "tmp"), { recursive: true });
    writeFileSync(
      fixturePath,
      JSON.stringify({
        schemaVersion: "1.0",
        fixtureVersion: "MT1-INCOMPLETE-TEST",
        standardsRelease: "SR2026",
        localBank: {
          bankServiceId: "BANK-SVC-DEMOHKHH",
          bic: "DEMOHKHH",
          bankName: "Demo Bank Hong Kong",
        },
        routes: [
          {
            bankServiceId: "BANK-SVC-CITIUS33",
            bic: "CITIUS33",
            bankName: "Citibank Demo",
            bookingEntity: "HK01",
            currencies: ["USD"],
            validFrom: "2026-01-01",
            validTo: "2027-12-31",
            ssi: { id: "MT1-SSI-CITI", version: 1 },
            applicability: { id: "MT1-APP-CITI", version: 1 },
            nostro: { id: "MT1-NOSTRO-CITI", version: 1 },
            rma: { id: "MT1-RMA-CITI", version: 1 },
            settlementRelationships: {},
            coveRelationships: [],
          },
        ],
      }),
    );
    try {
      const incompleteRoutes = new Mt1SsiDemoRouteRepository({ fixturePath });
      const incompleteAdapter = new Mt1SsiResolutionPageSubmissionAdapter(
        new Mt1SsiProfileRegistry(),
        incompleteRoutes,
      );
      const lookup = incompleteRoutes.lookup({
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        fixtureBindingId: scenario.fixture.bindingId,
        scenarioId: scenario.scenarioId,
        messageType: definition.messageType,
        sequence: definition.sequences[0]!.sequenceId,
        currency: "USD",
        bookingEntity: "HK01",
        valueDate: "2026-09-24",
      });
      const result = incompleteAdapter.execute({
        definition,
        scenario,
        submission: {
          definitionId: definition.definitionId,
          definitionVersion: definition.definitionVersion,
          scenarioId: scenario.scenarioId,
          fixtureBindingId: scenario.fixture.bindingId,
          contractSha256: "a".repeat(64),
          eligibilitySnapshot: lookup.eligibilitySnapshot,
          selectedRouteIdentity: lookup.items[0]!.selectedRouteIdentity,
          values: {
            ...values,
            "context.counterpartyBankServiceId": "BANK-SVC-CITIUS33",
          },
        },
      });

      expect(result).toMatchObject({
        outcome: "NO_ELIGIBLE_SSI",
        ssiApplicability: "REQUIRED",
        resolutionOutcome: "NO_ELIGIBLE_SSI",
      });
      expect(result).not.toHaveProperty("settlementRoute");
    } finally {
      rmSync(fixturePath, { force: true });
    }
  });
});
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
