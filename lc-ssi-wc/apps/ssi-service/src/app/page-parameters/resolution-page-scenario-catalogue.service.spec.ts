import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PageParameterEnvironmentPolicy } from "./page-parameter-environment.policy";
import { ResolutionPageScenarioCatalogueService } from "./resolution-page-scenario-catalogue.service";

const config = {
  schemaVersion: "1.0",
  catalogueVersion: "TEST-v1",
  standardsRelease: "SR2026",
  messageFamily: "MT347",
  definitions: [
    {
      profileId: "P1",
      messageType: "MT300",
      businessFunction: "FX",
      sequence: "B1",
      settlementLeg: "Bought",
    },
  ],
  scenarios: [
    {
      scenarioId: "POS-1",
      testCaseId: "POS-1",
      profileId: "P1",
      label: "positive",
      polarity: "POSITIVE",
      fixtureBindingId: "FIX-P@v1",
      expectedHttp: [200],
    },
    {
      scenarioId: "NEG-1",
      testCaseId: "NEG-1",
      profileId: "P1",
      label: "negative",
      polarity: "NEGATIVE",
      fixtureBindingId: "FIX-N@v1",
      expectedHttp: [422],
    },
  ],
  inputs: [],
  crossTagConstraints: [
    {
      constraintId: "C1",
      scenarioId: "NEG-1",
      operator: "PRESENT",
      fieldId: "x",
      reasonCode: "X_REQUIRED",
    },
  ],
};

describe("ResolutionPageScenarioCatalogueService", () => {
  it("names the 11 Trade Finance MESSAGE scenarios without the redundant prefix", () => {
    const scenarios = new ResolutionPageScenarioCatalogueService(
      new PageParameterEnvironmentPolicy("QA"),
    ).get().scenarios;
    const messageTypes = ["MT400", "MT730", "MT734", "MT742", "MT750", "MT752", "MT754", "MT756", "MT765", "MT768", "MT769"];
    for (const messageType of messageTypes) {
      const scenario = scenarios.find(({ scenarioId }) => scenarioId === `${messageType}-001`);
      expect(scenario?.label).toBe("direct canonical route");
    }
  });
  it("omits the redundant MESSAGE prefix from every Trade Finance scenario, including QA cases", () => {
    const scenarios = new ResolutionPageScenarioCatalogueService(
      new PageParameterEnvironmentPolicy("QA"),
    ).get().scenarios;
    const messageTypes = new Set(["MT400", "MT730", "MT734", "MT742", "MT750", "MT752", "MT754", "MT756", "MT765", "MT768", "MT769"]);
    const tradeFinance = scenarios.filter(({ scenarioId }) => messageTypes.has(scenarioId.split("-")[0]!));
    expect(tradeFinance).toHaveLength(88);
    expect(tradeFinance.filter(({ label }) => label.startsWith("MESSAGE - Message / "))).toEqual([]);
  });
  const path = join(tmpdir(), `resolution-page-scenarios-${process.pid}.json`);
  beforeAll(() => writeFileSync(path, JSON.stringify(config)));

  it("exposes controlled negative scenarios only in governed test environments", () => {
    const qa = new ResolutionPageScenarioCatalogueService(
      new PageParameterEnvironmentPolicy("QA"),
      { path, sourceArtifactId: "test.json" },
    );
    const production = new ResolutionPageScenarioCatalogueService(
      new PageParameterEnvironmentPolicy("PRODUCTION"),
      { path, sourceArtifactId: "test.json" },
    );
    expect(qa.get().scenarios).toHaveLength(2);
    expect(
      production.get().scenarios.map(({ scenarioId }) => scenarioId),
    ).toEqual(["POS-1"]);
    expect(production.constraintsFor("NEG-1")).toEqual([]);
  });

  it("publishes human-readable labels for every visible governed bank lookup", () => {
    const catalogue = new ResolutionPageScenarioCatalogueService(
      new PageParameterEnvironmentPolicy("QA"),
    ).get();
    const visibleBankFields = catalogue.inputs
      .map(({ field }) => field)
      .filter(
        (field) =>
          field.visibility === "USER_INPUT" && field.dataType === "SWIFT_BIC",
      );

    expect(visibleBankFields.length).toBeGreaterThan(0);
    for (const field of visibleBankFields) {
      expect(field.label).not.toMatch(/bankServiceId/i);
      expect(field.label).not.toMatch(/[_]/);
      expect(field.lookup).toBeDefined();
    }
  });

  it("separates operational routes from governed QA and boundary evidence", () => {
    const scenarios = new ResolutionPageScenarioCatalogueService(
      new PageParameterEnvironmentPolicy("QA"),
    ).get().scenarios;
    const presentation = (scenarioId: string) => {
      const scenario = scenarios.find(
        (candidate) => candidate.scenarioId === scenarioId,
      );
      return scenario
        ? { audience: scenario.audience, flowKind: scenario.flowKind }
        : undefined;
    };

    expect(presentation("MT400-001")).toEqual({
      audience: "OPERATIONAL",
      flowKind: "CORE_SSI",
    });
    expect(presentation("MT400-002")).toEqual({
      audience: "QA_TEST_ONLY",
      flowKind: "NO_ROUTE",
    });
    expect(presentation("MT742-006")).toEqual({
      audience: "OPERATIONAL",
      flowKind: "HYBRID",
    });
    expect(presentation("MT754-005")).toEqual({
      audience: "OPERATIONAL",
      flowKind: "TRANSACTION_CONTEXT",
    });
    expect(presentation("MT754-007")).toEqual({
      audience: "QA_TEST_ONLY",
      flowKind: "NEGATIVE_BOUNDARY",
    });
  });

  it("keeps all 41 upstream NVR rules out of SSI-owned validation", () => {
    const service = new ResolutionPageScenarioCatalogueService(
      new PageParameterEnvironmentPolicy("DEMO"),
    );
    const governed = service.get();
    const upstream = governed.crossTagConstraints.filter(
      ({ validationOwner }) => validationOwner === "UPSTREAM_FIN_VALIDATOR",
    );
    expect(upstream).toHaveLength(41);
    expect(
      upstream.filter(
        ({ sourceTaxonomy }) => sourceTaxonomy === "NETWORK_VALIDATED_RULE",
      ),
    ).toHaveLength(40);
    expect(
      upstream.filter(
        ({ sourceTaxonomy }) => sourceTaxonomy === "FIELD_USAGE_RULE",
      ),
    ).toHaveLength(1);
    expect(
      upstream.every(
        ({ scenarioId }) => service.constraintsFor(scenarioId).length === 0,
      ),
    ).toBe(true);
  });

  it("publishes server-owned FIN options for controlled invalid-option scenarios", () => {
    const service = new ResolutionPageScenarioCatalogueService(
      new PageParameterEnvironmentPolicy("QA"),
    );

    expect(service.fieldOptionsFor("MT730-003")).toEqual({ "57": "Z" });
  });

  it("keeps controlled cross-field facts as server-owned scenario inputs", () => {
    const service = new ResolutionPageScenarioCatalogueService(
      new PageParameterEnvironmentPolicy("QA"),
    );
    const scenario = service
      .get()
      .scenarios.find(({ scenarioId }) => scenarioId === "MT742-007");

    expect(scenario?.inputValues).toMatchObject({
      "context.receiverDirectlyServicesBeneficiaryBranchAccount": true,
      "context.MESSAGE.tag.57A.present": true,
      "context.MESSAGE.tag.58A.present": true,
    });
  });

  it.each([
    ["MT742-014", "OPEN-347-007"],
    ["MT754-014", "OPEN-347-008"],
  ])(
    "publishes the authoritative exact API code for %s",
    (scenarioId, reasonCode) => {
      const service = new ResolutionPageScenarioCatalogueService(
        new PageParameterEnvironmentPolicy("QA"),
      );

      expect(
        service
          .get()
          .scenarios.find((scenario) => scenario.scenarioId === scenarioId)
          ?.reasonCode,
      ).toBe(reasonCode);
    },
  );
});
