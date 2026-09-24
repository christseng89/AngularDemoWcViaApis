import { Mt1SsiResolutionPageDefinitionSource } from "../../../app/page-parameters/mt1-ssi-resolution-page-definition.source";
import { ResolutionPageFixtureManifestService } from "../../../app/page-parameters/resolution-page-fixture-manifest.service";
import { ResolutionPageAggregationService } from "../../../app/page-parameters/resolution-page-aggregation.service";
import { PageParameterEnvironmentPolicy } from "../../../app/page-parameters/page-parameter-environment.policy";

describe("MT1/pacs.008 OAS-driven Payment SSI page definitions", () => {
  const definitions = () =>
    new Mt1SsiResolutionPageDefinitionSource().all("SR2026");

  it("publishes the five approved outward profiles from the OAS contract", () => {
    expect(
      definitions().map((definition) => ({
        profileId: definition.profile.profileId,
        messageType: definition.messageType,
        businessService: definition.profile.businessService,
        direction: definition.direction,
      })),
    ).toEqual([
      {
        profileId: "MT103-BASE-SR2026",
        messageType: "MT103",
        businessService: "FIN-MT103-BASE",
        direction: "OUTGOING",
      },
      {
        profileId: "MT103-STP-SR2026",
        messageType: "MT103",
        businessService: "FIN-MT103-STP",
        direction: "OUTGOING",
      },
      {
        profileId: "MT103-REMIT-SR2026",
        messageType: "MT103",
        businessService: "FIN-MT103-REMIT",
        direction: "OUTGOING",
      },
      {
        profileId: "PACS008-PLAIN-SR2026",
        messageType: "pacs.008.001.08",
        businessService: "swift.cbprplus.04",
        direction: "OUTGOING",
      },
      {
        profileId: "PACS008-STP-SR2026",
        messageType: "pacs.008.001.08",
        businessService: "swift.cbprplus.stp.04",
        direction: "OUTGOING",
      },
    ]);
  });

  it("projects three visible MT103 Index rows and keeps pacs.008 as paired evidence profiles", () => {
    expect(
      definitions().map(({ profile }) => ({
        profileId: profile.profileId,
        index: profile.index,
        resolutionEvidence: profile.resolutionEvidence,
      })),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          profileId: "MT103-BASE-SR2026",
          index: expect.objectContaining({
            visible: true,
            groupId: "PAYMENT:MT103:BASE",
            label: "MT103 — Base",
            order: 1,
          }),
          resolutionEvidence: expect.objectContaining({
            formats: ["SWIFT_MT", "ISO_20022"],
            counterpartProfileId: "PACS008-PLAIN-SR2026",
          }),
        }),
        expect.objectContaining({
          profileId: "MT103-STP-SR2026",
          index: expect.objectContaining({ visible: true, order: 2 }),
          resolutionEvidence: expect.objectContaining({
            formats: ["SWIFT_MT", "ISO_20022"],
            counterpartProfileId: "PACS008-STP-SR2026",
          }),
        }),
        expect.objectContaining({
          profileId: "MT103-REMIT-SR2026",
          index: expect.objectContaining({ visible: true, order: 3 }),
          resolutionEvidence: {
            formats: ["SWIFT_MT"],
            swiftMtRenderableOptions: ["A"],
          },
        }),
        expect.objectContaining({
          profileId: "PACS008-PLAIN-SR2026",
          index: expect.objectContaining({ visible: false }),
        }),
        expect.objectContaining({
          profileId: "PACS008-STP-SR2026",
          index: expect.objectContaining({ visible: false }),
        }),
      ]),
    );
  });

  it("publishes three separately selectable MT103 Index rows in controlled profile order", () => {
    const source = new Mt1SsiResolutionPageDefinitionSource();
    const aggregation = new ResolutionPageAggregationService(
      source,
      new PageParameterEnvironmentPolicy("DEMO"),
    );

    expect(
      aggregation.index("SR2026", "PAYMENT").items.map((item) => ({
        groupId: item.transactionGroupId,
        label: item.transactionGroupLabel,
        order: item.transactionGroupOrder,
        generatedFields: item.targetProfileSlots,
        scenarios: item.scenarioCount,
      })),
    ).toEqual([
      {
        groupId: "PAYMENT:MT103:BASE",
        label: "MT103 — Base",
        order: 1,
        generatedFields: ["53a", "54a", "55a", "56a", "57a"],
        scenarios: 3,
      },
      {
        groupId: "PAYMENT:MT103:STP",
        label: "MT103 — STP",
        order: 2,
        generatedFields: ["53a", "54A", "55A", "56A", "57A"],
        scenarios: 3,
      },
      {
        groupId: "PAYMENT:MT103:REMIT",
        label: "MT103 — REMIT",
        order: 3,
        generatedFields: ["53a", "54a", "55a", "56a", "57a"],
        scenarios: 3,
      },
    ]);
  });

  it("exposes only routing-changing inputs and keeps governed context hidden", () => {
    for (const definition of definitions()) {
      expect(definition.profile.paymentExecutable).toBe(false);
      const visible = definition.fields
        .filter(({ visibility }) => visibility === "USER_INPUT")
        .map(({ fieldId }) => fieldId);
      expect(visible).toEqual([
        "context.currency",
        "context.bookingEntity",
        "context.valueDate",
        "context.counterpartyBankServiceId",
      ]);
      expect(definition.fields.map(({ fieldId }) => fieldId)).not.toEqual(
        expect.arrayContaining([
          "context.amount",
          "context.debtor",
          "context.creditor",
          "context.beneficiaryAccount",
          "context.remittance",
        ]),
      );
      expect(definition.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fieldId: "context.paymentDirection",
            defaultValue: "OUTWARD",
            visibility: "HIDDEN_EVIDENCE",
          }),
          expect.objectContaining({
            fieldId: "context.localBankRole",
            defaultValue: "INSTRUCTING_AGENT",
            visibility: "HIDDEN_EVIDENCE",
          }),
        ]),
      );
    }
  });

  it("uses exact BizSvc to distinguish pacs.008 plain and STP", () => {
    const pacs = definitions().filter(
      ({ messageType }) => messageType === "pacs.008.001.08",
    );
    expect(
      new Set(pacs.map(({ profile }) => profile.messageDefinitionId)),
    ).toEqual(new Set(["pacs.008.001.08"]));
    expect(pacs.map(({ profile }) => profile.businessService)).toEqual([
      "swift.cbprplus.04",
      "swift.cbprplus.stp.04",
    ]);
  });

  it("finds an exact governed profile and scenario", () => {
    const source = new Mt1SsiResolutionPageDefinitionSource();
    const selected = source.find({
      standardsRelease: "SR2026",
      messageFamily: "MT1_PACS008",
      messageType: "pacs.008.001.08",
      direction: "OUTGOING",
      businessDomain: "PAYMENT",
      businessService: "swift.cbprplus.stp.04",
      businessScenarioId: "PACS008-STP-SR2026:MT1-COVE-SSI",
    });

    expect(selected).toHaveLength(1);
    expect(selected[0]!.profile.profileId).toBe("PACS008-STP-SR2026");
    expect(source.all("SR2025")).toEqual([]);
  });

  it("uses the OAS fixture bindings and registers each one in the controlled manifest", () => {
    const manifest = new ResolutionPageFixtureManifestService();
    const bindings = new Set(
      definitions().flatMap(({ scenarios }) =>
        scenarios.map(({ fixture }) => fixture.bindingId),
      ),
    );

    expect(bindings).toEqual(
      new Set([
        "FIXTURE-MT1-INDA-SSI",
        "FIXTURE-MT1-INGA-SSI",
        "FIXTURE-MT1-COVE-SSI",
      ]),
    );
    for (const bindingId of bindings)
      expect(manifest.require(bindingId)).toMatchObject({
        bindingId,
        fixtureSet: "MT1-PACS008-SR2026",
        isolation: "CANONICAL",
      });
  });
});
