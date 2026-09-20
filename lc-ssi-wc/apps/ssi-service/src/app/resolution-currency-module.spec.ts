import { AppModule } from "./app.module";
import { ResolutionCurrencyCoverageCoordinator } from "./resolution-currency-coordinator";
import { ResolutionCurrencyCoverageDiscoveryService } from "./resolution-currency-discovery";
import { ResolutionDefinitionOptionsService } from "./page-parameters/resolution-definition-options.service";

describe("Resolution Currency runtime registration", () => {
  it("wires startup bootstrap, common discovery and controlled Definition read port", () => {
    const providers = Reflect.getMetadata("providers", AppModule) as unknown[];
    expect(providers).toEqual(expect.arrayContaining([
      ResolutionCurrencyCoverageCoordinator,
      ResolutionCurrencyCoverageDiscoveryService,
      ResolutionDefinitionOptionsService,
    ]));
  });
});
