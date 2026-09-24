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

  const executeProfile = (
    profileId: string,
    scenarioSuffix = "MT1-INDA-SSI",
    routeRepository = routes,
    submissionAdapter = adapter,
  ) => {
    const selectedDefinition = source
      .all("SR2026")
      .find(({ profile }) => profile.profileId === profileId)!;
    const selectedScenario = selectedDefinition.scenarios.find(
      ({ scenarioId }) => scenarioId.endsWith(`:${scenarioSuffix}`),
    )!;
    const lookup = routeRepository.lookup({
      definitionId: selectedDefinition.definitionId,
      definitionVersion: selectedDefinition.definitionVersion,
      fixtureBindingId: selectedScenario.fixture.bindingId,
      scenarioId: selectedScenario.scenarioId,
      messageType: selectedDefinition.messageType,
      sequence: selectedDefinition.sequences[0]!.sequenceId,
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-24",
    });
    return submissionAdapter.execute({
      definition: selectedDefinition,
      scenario: selectedScenario,
      submission: {
        definitionId: selectedDefinition.definitionId,
        definitionVersion: selectedDefinition.definitionVersion,
        scenarioId: selectedScenario.scenarioId,
        fixtureBindingId: selectedScenario.fixture.bindingId,
        contractSha256: "a".repeat(64),
        eligibilitySnapshot: lookup.eligibilitySnapshot,
        selectedRouteIdentity: lookup.items[0]!.selectedRouteIdentity,
        values: {
          ...Object.fromEntries(
            selectedDefinition.fields.map((field) => [
              field.fieldId,
              selectedScenario.inputValues?.[field.fieldId] ??
                field.defaultValue ??
                "",
            ]),
          ),
          "context.counterpartyBankServiceId": "BANK-SVC-CITIUS33",
        },
      },
    });
  };

  it.each([
    ["MT103-BASE-SR2026", "swift.cbprplus.04"],
    ["MT103-STP-SR2026", "swift.cbprplus.stp.04"],
  ])(
    "returns evidence-only MT and MX views for paired profile %s",
    (profileId, mxBusinessService) => {
      const result = executeProfile(profileId);

      expect(result.payloadGenerated).toBe(false);
      expect(result.nvrOutcome).toBe("PASS");
      expect(result.outputs.map(({ format }) => format)).toEqual([
        "SWIFT_MT",
        "ISO_20022",
      ]);
      expect(result.outputs).toEqual([
        expect.objectContaining({
          format: "SWIFT_MT",
          messageIdentity: "MT103",
          document: {
            redirectDomain: null,
            renderer:
              "MT103 SSI evidence compatibility view from the same resolved route snapshot",
            tags: { "53A": "/DEMO-USD-CITI-INDA\nCITIUS33" },
            omitted: [],
            renderingDecisions: expect.objectContaining({
              "53A": expect.objectContaining({
                outcome: "INCLUDE",
                ruleId: "POL-MT1-PROFILE-OPTION-001",
                tagAndOption: "53A",
                role: "INDA_SETTLEMENT_ACCOUNT_RELATIONSHIP",
              }),
              "54a": expect.objectContaining({
                outcome: "NOT_APPLICABLE",
                ruleId: "POL-MT1-PROFILE-OPTION-001",
              }),
              "55a": expect.objectContaining({ outcome: "NOT_APPLICABLE" }),
              "56a": expect.objectContaining({ outcome: "NOT_APPLICABLE" }),
              "57a": expect.objectContaining({ outcome: "NOT_APPLICABLE" }),
            }),
          },
        }),
        expect.objectContaining({
          format: "ISO_20022",
          messageIdentity: "pacs.008.001.08",
          document: expect.objectContaining({
            scope: "SSI_RESOLUTION_EVIDENCE_ONLY",
            payloadGenerated: false,
            businessService: mxBusinessService,
            routeBindingId: result.routeBindingId,
          }),
        }),
      ]);
    },
  );

  it("keeps MT103 REMIT evidence MT-only", () => {
    const result = executeProfile("MT103-REMIT-SR2026");

    expect(result.payloadGenerated).toBe(false);
    expect(result.outputs.map(({ format }) => format)).toEqual(["SWIFT_MT"]);
    expect(result.outputs[0]).toMatchObject({
      messageIdentity: "MT103",
      document: {
        redirectDomain: null,
        renderer:
          "MT103 SSI evidence compatibility view from the same resolved route snapshot",
        tags: { "53A": "/DEMO-USD-CITI-INDA\nCITIUS33" },
        omitted: [],
        renderingDecisions: expect.any(Object),
      },
    });
  });

  it("renders only governed option A MT fields in the prototype", () => {
    const result = executeProfile("MT103-BASE-SR2026");
    const mt = result.outputs.find(({ format }) => format === "SWIFT_MT");

    expect(mt?.document).toMatchObject({
      tags: { "53A": "/DEMO-USD-CITI-INDA\nCITIUS33" },
      renderingDecisions: {
        "53A": expect.objectContaining({
          ruleId: "POL-MT1-PROFILE-OPTION-001",
        }),
      },
    });
  });

  it("fails closed with a structured result when an MT option is not renderable", () => {
    const fixture = JSON.parse(
      readFileSync(
        join(process.cwd(), "parameters", "mt1-ssi-demo-routes.sr2026.json"),
        "utf8",
      ),
    );
    fixture.routes[0].settlementRelationships.INDA.mtProjectionByProfile[
      "MT103-BASE-SR2026"
    ].option = "B";
    const fixturePath = join(
      process.cwd(),
      "tmp",
      "mt1-non-renderable-option-route.json",
    );
    writeFileSync(fixturePath, JSON.stringify(fixture));
    const nonRenderableRoutes = new Mt1SsiDemoRouteRepository({ fixturePath });
    const nonRenderableAdapter = new Mt1SsiResolutionPageSubmissionAdapter(
      new Mt1SsiProfileRegistry(),
      nonRenderableRoutes,
    );

    const result = executeProfile(
      "MT103-BASE-SR2026",
      "MT1-INDA-SSI",
      nonRenderableRoutes,
      nonRenderableAdapter,
    );

    expect(result).toMatchObject({
      outcome: "VALIDATION_REJECTED",
      ssiApplicability: "REQUIRED",
      resolutionOutcome: "PROFILE_INCOMPLETE",
      reasonCode: "PROFILE_INCOMPLETE",
      payloadGenerated: false,
      outputs: [],
    });
    expect(result).not.toHaveProperty("settlementRoute");
  });

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
        roles: [
          {
            role: "INDA_SETTLEMENT_ACCOUNT_RELATIONSHIP",
            owner: "OWN_SSI_OR_ACCOUNT_MASTER",
            recordId: "MT1-NOSTRO-CITI-INDA",
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
        projections: expect.arrayContaining([
          expect.objectContaining({
            kind: "ISO_20022_ELEMENT",
            identifier: "SttlmMtd",
            role: "INDA_SETTLEMENT_ACCOUNT_RELATIONSHIP",
          }),
          expect.objectContaining({
            kind: "ISO_20022_ELEMENT",
            identifier: "SttlmAcct",
            accountReference: "DEMO-USD-CITI-INDA",
          }),
        ]),
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
              projections: expect.arrayContaining([
                expect.objectContaining({
                  identifier: "SttlmMtd",
                  value: "INDA",
                }),
                expect.objectContaining({
                  identifier: "SttlmAcct",
                  value: "DEMO-USD-CITI-INDA",
                }),
              ]),
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
        projections: expect.arrayContaining([
          expect.objectContaining({
            kind: "SWIFT_MT_FIELD",
            identifier: "53",
            option: "A",
            label: "Sender's Correspondent",
          }),
          expect.objectContaining({
            kind: "SWIFT_MT_FIELD",
            identifier: "54",
            option: "A",
            label: "Receiver's Correspondent",
          }),
        ]),
      },
    });
    expect(result.settlementRoute?.roles).toHaveLength(2);
    expect(result.outputs[0]?.document).toMatchObject({
      redirectDomain: null,
      tags: {
        "53A": "/DEMO-USD-CITI-COVE-INSTRUCTING\nCITIUS33",
        "54A": "/DEMO-USD-CITI-COVE-INSTRUCTED\nDEMOHKHH",
      },
      omitted: [],
      renderingDecisions: {
        "53A": expect.objectContaining({ outcome: "INCLUDE" }),
        "54A": expect.objectContaining({ outcome: "INCLUDE" }),
        "55a": expect.objectContaining({ outcome: "NOT_APPLICABLE" }),
        "56a": expect.objectContaining({ outcome: "NOT_APPLICABLE" }),
        "57a": expect.objectContaining({ outcome: "NOT_APPLICABLE" }),
      },
    });
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
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
