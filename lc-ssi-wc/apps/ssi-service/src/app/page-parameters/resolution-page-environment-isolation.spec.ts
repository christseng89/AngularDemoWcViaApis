import { BadRequestException } from "@nestjs/common";
import { PageParameterEnvironmentPolicy } from "./page-parameter-environment.policy";
import { PaymentResolutionPageDefinitionSource } from "./payment-resolution-page-definition.source";
import { ResolutionPageAggregationService } from "./resolution-page-aggregation.service";
import { ResolutionPageSubmissionAdapter } from "./resolution-page-submission.adapter";

describe("resolution page environment isolation", () => {
  const source = new PaymentResolutionPageDefinitionSource();

  const pages = (environment: string) =>
    new ResolutionPageAggregationService(
      source,
      new PageParameterEnvironmentPolicy(environment),
    );

  const mt202 = () =>
    source
      .all("SR2026")
      .find(({ messageType }) => messageType === "MT202")!;

  it("does not expose QA_TEST_ONLY scenarios in a Production page contract", () => {
    const definition = mt202();
    const result = pages("PRODUCTION").getByIdentity(
      definition.definitionId,
      definition.definitionVersion,
    );

    expect(result.contract.scenarios).not.toHaveLength(0);
    expect(
      result.contract.scenarios.every(
        ({ audience }) => audience === "OPERATIONAL",
      ),
    ).toBe(true);
    expect(result.contract.scenarios.map(({ scenarioId }) => scenarioId)).toEqual(
      [
        "MT202-OP-BOOK",
        "MT202-OP-CREDIT-57A",
        "MT202-OP-DIRECT",
      ],
    );
  });

  it("does not expose QA_TEST_ONLY scenarios or count them in the Production index", () => {
    const item = pages("PRODUCTION")
      .index("SR2026", "PAYMENT")
      .items.find(({ messageCode }) => messageCode === "MT202")!;

    expect(item.scenarioCount).toBe(3);
    expect(item.scenarioDetails).toHaveLength(3);
    expect(
      item.scenarioDetails.every(({ audience }) => audience === "OPERATIONAL"),
    ).toBe(true);
  });

  it("retains controlled QA scenarios in the QA environment", () => {
    const definition = mt202();
    const result = pages("QA").getByIdentity(
      definition.definitionId,
      definition.definitionVersion,
    );

    expect(
      result.contract.scenarios.some(
        ({ audience }) => audience === "QA_TEST_ONLY",
      ),
    ).toBe(true);
  });

  it("rejects execution of a QA_TEST_ONLY scenario in Production before delegation", () => {
    const definition = mt202();
    const qaScenario = definition.scenarios.find(
      ({ audience }) => audience === "QA_TEST_ONLY",
    )!;
    const productionPages = pages("PRODUCTION");
    const productionEnvelope = productionPages.getByIdentity(
      definition.definitionId,
      definition.definitionVersion,
    );
    const payment = { execute: jest.fn() };
    const adapter = new ResolutionPageSubmissionAdapter(
      productionPages,
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      payment as never,
    );

    expect(() =>
      adapter.execute({
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        contractSha256: productionEnvelope.contractSha256,
        scenarioId: qaScenario.scenarioId,
        fixtureBindingId: qaScenario.fixture.bindingId,
        values: {},
      }),
    ).toThrow(BadRequestException);
    try {
      adapter.execute({
        definitionId: definition.definitionId,
        definitionVersion: definition.definitionVersion,
        contractSha256: productionEnvelope.contractSha256,
        scenarioId: qaScenario.scenarioId,
        fixtureBindingId: qaScenario.fixture.bindingId,
        values: {},
      });
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "PAGE_SCENARIO_NOT_FOUND",
      });
    }
    expect(payment.execute).not.toHaveBeenCalled();
  });
});
