import { Mt1SsiDemoRouteRepository } from "../../../app/mt1-ssi-demo-route.repository";
import { Mt1SsiResolutionPageDefinitionSource } from "../../../app/page-parameters/mt1-ssi-resolution-page-definition.source";
import { PageParameterLookupService } from "../../../app/page-parameters/page-parameter-lookup.service";

describe("MT1 SSI route picker", () => {
  it("uses the MT1 fixture strategy without entering the MT2/pacs.009 path", () => {
    const source = new Mt1SsiResolutionPageDefinitionSource();
    const definition = source.all("SR2026")[0]!;
    const scenario = definition.scenarios[0]!;
    const service = new PageParameterLookupService(
      {} as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      undefined,
      undefined,
      source,
      new Mt1SsiDemoRouteRepository(),
    );

    const result = service.ssiCounterparties({
      scenarioId: scenario.scenarioId,
      messageType: definition.messageType,
      sequence: definition.sequences[0]!.sequenceId,
      currency: "USD",
      bookingEntity: "HK01",
      valueDate: "2026-09-24",
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      provider: "SSI_COUNTERPARTY",
      bankServiceId: "BANK-SVC-CITIUS33",
      bic: "CITIUS33",
    });
    expect(result.items[0]!.selectedRouteIdentity).toBeDefined();
  });
});
