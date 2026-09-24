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

  it("returns typed SSI dimensions and never generates MT/MX outputs", () => {
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
      outputs: [],
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
});
