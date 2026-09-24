import { PageParameterEnvironmentPolicy } from "../../../app/page-parameters/page-parameter-environment.policy";
import { Mt1SsiResolutionPageDefinitionSource } from "../../../app/page-parameters/mt1-ssi-resolution-page-definition.source";
import { ResolutionPageAggregationService } from "../../../app/page-parameters/resolution-page-aggregation.service";
import { ResolutionPageSubmissionAdapter } from "../../../app/page-parameters/resolution-page-submission.adapter";

describe("MT1 SSI page execution dispatch", () => {
  it("selects the MT1 strategy instead of the MT2 payment executor", () => {
    const source = new Mt1SsiResolutionPageDefinitionSource();
    const pages = new ResolutionPageAggregationService(
      source,
      new PageParameterEnvironmentPolicy("DEMO"),
    );
    const definition = source.all("SR2026")[0]!;
    const scenario = definition.scenarios[0]!;
    const envelope = pages.getByIdentity(
      definition.definitionId,
      definition.definitionVersion,
    );
    const mt1Result = {
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      scenarioId: scenario.scenarioId,
      fixtureBindingId: scenario.fixture.bindingId,
      outcome: "NO_ELIGIBLE_SSI",
      payloadGenerated: false,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
      nvrOutcome: "NOT_EVALUATED",
      ssiApplicability: "REQUIRED",
      resolutionOutcome: "NO_ELIGIBLE_SSI",
      fields: [],
      outputs: [],
      evidence: {
        correlationId: "MT1",
        owner: "SSI_FIELD_RESOLUTION_API",
        action: "RESOLVE_SSI",
        executorIdentity: "TEST",
        requestSha256: "a".repeat(64),
        responseSha256: "b".repeat(64),
        ruleIds: scenario.validationRuleIds,
      },
    } as const;
    const mt1 = { execute: jest.fn(() => mt1Result) };
    const mt2 = { execute: jest.fn() };
    const adapter = new ResolutionPageSubmissionAdapter(
      pages,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      mt2 as never,
      undefined,
      undefined,
      undefined,
      mt1 as never,
    );
    const values = Object.fromEntries(
      definition.fields.flatMap((field) => {
        const value =
          scenario.inputValues?.[field.fieldId] ??
          field.defaultValue ??
          (field.fieldId === "context.counterpartyBankServiceId"
            ? "BANK-SVC-CITIUS33"
            : undefined);
        return value === undefined ? [] : [[field.fieldId, value]];
      }),
    );

    expect(
      adapter.execute({
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        scenarioId: scenario.scenarioId,
        fixtureBindingId: scenario.fixture.bindingId,
        contractSha256: envelope.contractSha256,
        values,
      }),
    ).toBe(mt1Result);
    expect(mt1.execute).toHaveBeenCalledTimes(1);
    expect(mt2.execute).not.toHaveBeenCalled();
  });
});
