import {
  BadRequestException,
  HttpException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { MappingResolutionPageDefinitionSource } from "./mapping-resolution-page-definition.source";
import { PageParameterEnvironmentPolicy } from "./page-parameter-environment.policy";
import { ResolutionPageAggregationService } from "./resolution-page-aggregation.service";
import {
  hasExecutableNegativeTrigger,
  ResolutionPageSubmissionAdapter,
  servicerRelationshipMatches,
} from "./resolution-page-submission.adapter";
import { PaymentResolutionPageDefinitionSource } from "./payment-resolution-page-definition.source";
import { hashCanonical } from "../canonical-json";
import { MappingCatalogueService } from "../mapping-catalogue.service";
import { ResolutionPageScenarioCatalogueService } from "./resolution-page-scenario-catalogue.service";
import { ResolutionPageFixtureManifestService } from "./resolution-page-fixture-manifest.service";

const SHA = "a".repeat(64);
const mapping = {
  standardsRelease: "SR2026",
  messageType: "MT399",
  direction: "OUTGOING",
  businessFunction: "SYNTHETIC_FUNCTION",
  path: "Q9.57A",
  sequence: "Q9",
  settlementLeg: "Synthetic leg",
  tag: "57",
  option: "A",
  canonicalRole: "ACCOUNT_WITH_INSTITUTION",
  officialRole: "Account With Institution",
  officialFieldName: "Account With Institution",
  presence: "OPTIONAL",
  scopeStatus: "SSI_SUPPORTED",
  nvrRefs: [],
  reusableCandidate: true,
  evidenceStatus: "FIELD_PROFILE_PROVEN",
} as const;

const source = new MappingResolutionPageDefinitionSource({
  get: () => ({
    standardsRelease: "SR2026",
    catalogueVersion: "CAT-v1",
    sourceArtifactId: "parameters/test.json",
    sourceArtifactHash: SHA,
    mappings: [mapping],
  }),
} as never);
const pages = new ResolutionPageAggregationService(
  source,
  new PageParameterEnvironmentPolicy("DEMO"),
);
const definition = source.all()[0]!;
const envelope = pages.getByIdentity(
  definition.definitionId,
  definition.definitionVersion,
);
const scenario = definition.scenarios[0]!;
const values = {
  "context.transactionReference": "TX-001",
  "context.currency": "USD",
  "context.counterpartyBankServiceId": "BANK-SVC-CITIUS33",
  "context.bookingEntity": "HK01",
  "context.valueDate": "2026-09-12",
  "Q9.57.bankServiceId": "BANK-SVC-CITIUS33",
};
const submission = {
  definitionId: definition.definitionId,
  definitionVersion: definition.definitionVersion,
  contractSha256: envelope.contractSha256,
  scenarioId: scenario.scenarioId,
  fixtureBindingId: scenario.fixture.bindingId,
  values,
};

describe("ResolutionPageSubmissionAdapter", () => {
  it("recognises the prose-only MT742/754/756 failures from the real catalogue", () => {
    const policy = new PageParameterEnvironmentPolicy("QA");
    const governedSource = new MappingResolutionPageDefinitionSource(
      new MappingCatalogueService(),
      undefined,
      new ResolutionPageScenarioCatalogueService(policy),
      new ResolutionPageFixtureManifestService(),
    );
    const scenariosById = new Map(
      governedSource
        .all("SR2026")
        .flatMap((contract) => contract.scenarios)
        .map((configuredScenario) => [
          configuredScenario.scenarioId,
          configuredScenario,
        ]),
    );

    for (const scenarioId of [
      "MT742-008",
      "MT742-011",
      "MT742-014",
      "MT754-009",
      "MT754-014",
      "MT756-007",
      "MT756-009",
      "MT756-010",
    ]) {
      const configuredScenario = scenariosById.get(scenarioId);
      expect(configuredScenario).toBeDefined();
      expect(configuredScenario?.polarity).toBe("NEGATIVE");
      expect(
        configuredScenario?.execution.expectedHttp.some(
          (status) => status === 409 || status === 422,
        ),
      ).toBe(true);
      expect(Object.keys(configuredScenario?.inputValues ?? {})).toEqual([
        "context.counterpartyBankServiceId",
      ]);
      expect(hasExecutableNegativeTrigger(configuredScenario!)).toBe(false);
    }
  });

  it("executes the real MT400-004 profile-valid 53B request as profile incomplete", () => {
    const policy = new PageParameterEnvironmentPolicy("QA");
    const mappingCatalogues = new MappingCatalogueService();
    const scenarioCatalogue = new ResolutionPageScenarioCatalogueService(
      policy,
    );
    const fixtureManifest = new ResolutionPageFixtureManifestService();
    const governedSource = new MappingResolutionPageDefinitionSource(
      mappingCatalogues,
      undefined,
      scenarioCatalogue,
      fixtureManifest,
    );
    const governedPages = new ResolutionPageAggregationService(
      governedSource,
      policy,
    );
    const realDefinition = governedSource
      .all("SR2026")
      .find(({ messageType }) => messageType === "MT400")!;
    const realScenario = realDefinition.scenarios.find(
      ({ scenarioId }) => scenarioId === "MT400-004",
    )!;
    const realEnvelope = governedPages.getByIdentity(
      realDefinition.definitionId,
      realDefinition.definitionVersion,
    );
    const values = Object.fromEntries(
      realDefinition.fields
        .filter(({ fieldId }) => realScenario.fieldIds.includes(fieldId))
        .filter((field) => {
          const fieldPolicy = realScenario.fieldPolicies?.find(
            ({ fieldId }) => fieldId === field.fieldId,
          );
          return (
            fieldPolicy?.required &&
            fieldPolicy.inputOwnership === "TRANSACTION_USER"
          );
        })
        .map((field) => {
          const value = field.fieldId.includes("transactionReference")
            ? "TX-MT400-004"
            : field.fieldId.includes("currency")
              ? "USD"
              : field.fieldId.includes("bookingEntity")
                ? "HK01"
                : field.fieldId.includes("valueDate")
                  ? "2026-09-16"
                  : field.fieldId.includes("bankServiceId")
                    ? "BANK-SVC-CITIUS33"
                    : (field.defaultValue ??
                      field.options?.[0]?.value ??
                      "TEST");
          return [field.fieldId, value];
        }),
    );
    const governed = new ResolutionPageSubmissionAdapter(
      governedPages,
      fixtures as never,
      controlled as never,
      banks as never,
      scenarioCatalogue,
      undefined,
      fixtureManifest,
      undefined,
      undefined,
      undefined,
      mappingCatalogues,
    );

    try {
      governed.execute({
        definitionId: realDefinition.definitionId,
        definitionVersion: realDefinition.definitionVersion,
        contractSha256: realEnvelope.contractSha256,
        scenarioId: realScenario.scenarioId,
        fixtureBindingId: realScenario.fixture.bindingId,
        values,
      });
      throw new Error("expected rejection");
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: "PROFILE_INCOMPLETE",
        payloadGenerated: false,
        confirmedResolutionCreated: false,
        repairQueueCreated: false,
      });
    }
  });

  it.each([
    ["SAME", "CITIUS33", "CITIUS33", true],
    ["SAME", "CITIUS33", "DEUTDEFF", false],
    ["DIFFERENT", "CITIUS33", "DEUTDEFF", true],
    ["DIFFERENT", "CITIUS33", "CITIUS33", false],
    ["NOT_APPLICABLE", "CITIUS33", "CITIUS33", true],
  ] as const)(
    "governs servicer relationship %s without UI inference",
    (policy, ssiBank, nostroServicer, expected) => {
      expect(servicerRelationshipMatches(policy, ssiBank, nostroServicer)).toBe(
        expected,
      );
    },
  );
  const candidate = {
    bindingId: "FIX-MT399-001@v1",
    businessFunction: "SYNTHETIC_FUNCTION",
    roleValues: { ACCOUNT_WITH_INSTITUTION: "CITIUS33" },
    counterpartyBic: "CITIUS33",
    identity: {
      ssi: { id: "SSI-1", version: 1 },
      applicability: { id: "APP-1", version: 1 },
    },
  };
  const fixtures = {
    list: jest.fn(() => ({ candidates: [candidate] })),
    catalogue: jest.fn(() => [
      {
        ...candidate,
        fixtureGroupId: "CONTROLLED-MT399-SYNTHETIC-FUNCTION-Q9-SYNTHETIC-LEG",
        messageType: "MT399",
        sequence: "Q9",
        currency: "USD",
        bookingEntity: "HK01",
        effectiveFrom: "2026-01-01",
        effectiveTo: "2027-12-31",
        identity: {
          ssi: { id: "SSI-1", version: 1 },
          applicability: { id: "APP-1", version: 1 },
        },
      },
    ]),
  };
  const controlled = {
    resolve: jest.fn(() => ({
      payloadGenerated: true,
      resolvedFields: [
        {
          sequence: "Q9",
          settlementLeg: "Synthetic leg",
          tag: "57",
          option: "A",
          officialFieldName: "Account With Institution",
          officialRole: "Account With Institution",
          resolutionStatus: "RESOLVED",
          resolvedValue: "CITIUS33",
          reasonCode: "EXACT_ELIGIBLE_SSI",
          provenance: {
            source: "SYNTHETIC_DEMO",
            sourceRecordId: "SSI-1",
            ownerSide: "RECEIVER_SIDE",
            version: "1",
          },
        },
      ],
    })),
  };
  const banks = {
    resolve: jest.fn((id: string) => ({
      bankServiceId: id,
      bic: id === "BANK-SVC-CHASUS33" ? "CHASUS33" : "CITIUS33",
    })),
    search: jest.fn((bic: string) => [
      {
        bankServiceId: `BANK-SVC-${bic}`,
        bic,
        name: bic === "CITIUS33" ? "Citibank New York" : bic,
      },
    ]),
  };
  const adapter = new ResolutionPageSubmissionAdapter(
    pages,
    fixtures as never,
    controlled as never,
    banks as never,
  );

  it("returns HTTP 422 for a governed out-of-scope boundary decision", () => {
    const boundaryContract = {
      ...definition,
      scenarios: [{ ...scenario, polarity: "BOUNDARY" as const }],
    };
    const boundary = new ResolutionPageSubmissionAdapter(
      {
        getByIdentity: () => ({
          contract: boundaryContract,
          contractSha256: SHA,
        }),
      } as never,
      fixtures as never,
      controlled as never,
      banks as never,
    );
    const action = () =>
      boundary.execute({ ...submission, contractSha256: SHA });

    expect(action).toThrow(UnprocessableEntityException);
    try {
      action();
    } catch (error) {
      expect((error as UnprocessableEntityException).getStatus()).toBe(422);
    }
  });

  it.each([
    [422, "MESSAGE_CONTEXT_MISSING"],
    [409, "PROFILE_INCOMPLETE"],
  ] as const)(
    "fails closed with the governed %s negative-scenario oracle",
    (status, code) => {
      controlled.resolve.mockClear();
      const negativeScenario = {
        ...scenario,
        polarity: "NEGATIVE" as const,
        inputValues: {
          messageType: "MT399",
          "context.sequence": "Q9",
          "MESSAGE.settlementLeg": "Synthetic leg",
        },
        fixture: {
          ...scenario.fixture,
          isolation: "TRANSACTIONAL_NEGATIVE" as const,
        },
        execution: {
          ...scenario.execution,
          expectedHttp: status === 409 ? [409, 500] : [422],
        },
      };
      const negative = new ResolutionPageSubmissionAdapter(
        {
          getByIdentity: () => ({
            contract: { ...definition, scenarios: [negativeScenario] },
            contractSha256: SHA,
          }),
        } as never,
        fixtures as never,
        controlled as never,
        banks as never,
        {
          constraintsFor: () => [],
          fieldOptionsFor: () => ({}),
          get: () => ({
            scenarios: [{ scenarioId: scenario.scenarioId, reasonCode: code }],
          }),
        } as never,
      );

      try {
        negative.execute({ ...submission, contractSha256: SHA });
        throw new Error("expected rejection");
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(status);
        expect((error as HttpException).getResponse()).toMatchObject({
          code,
          payloadGenerated: false,
          confirmedResolutionCreated: false,
          repairQueueCreated: false,
        });
      }
      expect(controlled.resolve).not.toHaveBeenCalled();
    },
  );

  it("does not synthesize an SSI failure for a reference-only negative scenario", () => {
    controlled.resolve.mockClear();
    const referenceOnlyScenario = {
      ...scenario,
      polarity: "NEGATIVE" as const,
      fixture: {
        ...scenario.fixture,
        isolation: "TRANSACTIONAL_NEGATIVE" as const,
      },
      execution: { ...scenario.execution, expectedHttp: [200] },
    };
    const referenceOnly = new ResolutionPageSubmissionAdapter(
      {
        getByIdentity: () => ({
          contract: { ...definition, scenarios: [referenceOnlyScenario] },
          contractSha256: SHA,
        }),
      } as never,
      fixtures as never,
      controlled as never,
      banks as never,
    );

    expect(
      referenceOnly.execute({ ...submission, contractSha256: SHA }),
    ).toMatchObject({ outcome: "REFERENCE_ONLY", payloadGenerated: true });
    expect(controlled.resolve).toHaveBeenCalledTimes(1);
  });

  it("binds definition, scenario, fixture and Bank Service identity before execution", () => {
    expect(adapter.execute(submission)).toMatchObject({
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      scenarioId: scenario.scenarioId,
      fixtureBindingId: scenario.fixture.bindingId,
      outcome: "REFERENCE_ONLY",
      payloadGenerated: true,
      fields: [
        {
          fieldId: "Q9.57",
          sequenceId: "Q9",
          swiftTag: "57",
          swiftOption: "A",
          role: "ACCOUNT_WITH_INSTITUTION",
          outcome: "RESOLVED",
          resolutionStatus: "RESOLVED",
          value: "CITIUS33",
          institution: {
            bankServiceId: "BANK-SVC-CITIUS33",
            bic: "CITIUS33",
            name: "Citibank New York",
          },
          provenance: {
            source: "SYNTHETIC_DEMO",
            sourceRecordId: "SSI-1",
            ownerSide: "RECEIVER_SIDE",
            version: "1",
          },
        },
      ],
      evidence: {
        owner: "SSI_FIELD_RESOLUTION_API",
        action: "RESOLVE_SSI",
        executorIdentity: "FIN_CONTROLLED_RESOLUTION_ADAPTER_V1",
      },
    });
    expect(controlled.resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingId: "FIX-MT399-001@v1",
        transactionReference: "TX-001",
        roleBankServiceIds: { ACCOUNT_WITH_INSTITUTION: "BANK-SVC-CITIUS33" },
        fieldOptions: {},
      }),
    );
    expect(fixtures.list).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingId: scenario.fixture.bindingId,
      }),
    );
  });

  it("exposes typed resolved SSI FIN instructions for a positive MT300 result", () => {
    const mt300Contract = {
      ...definition,
      messageType: "MT300",
      sequences: [
        {
          ...definition.sequences[0]!,
          sequenceId: "B1",
          label: "Amount Bought",
        },
      ],
    };
    const mt300 = new ResolutionPageSubmissionAdapter(
      {
        getByIdentity: () => ({ contract: mt300Contract, contractSha256: SHA }),
      } as never,
      fixtures as never,
      {
        resolve: jest.fn(() => ({
          payloadGenerated: true,
          resolvedFields: [
            {
              sequence: "B1",
              settlementLeg: "Amount Bought",
              tag: "53",
              option: "A",
              officialFieldName: "Delivery Agent",
              officialRole: "Delivery Agent",
              resolutionStatus: "RESOLVED",
              resolvedValue: "CITIUS33",
              reasonCode: "RESOLVED_FROM_OWN_SSI",
              provenance: {
                source: "SYNTHETIC_DEMO",
                sourceRecordId: "SSI-MT300-001",
                ownerSide: "SENDER_SIDE",
                version: "1",
                canonicalRouteNodeId: "MT300-001:DELIVERY_AGENT",
              },
            },
          ],
        })),
      } as never,
      banks as never,
    );

    expect(
      mt300.execute({ ...submission, contractSha256: SHA }).fields,
    ).toEqual([
      expect.objectContaining({
        sequenceId: "B1",
        settlementLeg: "Amount Bought",
        swiftTag: "53",
        swiftOption: "A",
        fieldName: "Delivery Agent",
        role: "Delivery Agent",
        resolutionStatus: "RESOLVED",
        institution: {
          bankServiceId: "BANK-SVC-CITIUS33",
          bic: "CITIUS33",
          name: "Citibank New York",
        },
        provenance: expect.objectContaining({
          sourceRecordId: "SSI-MT300-001",
          ownerSide: "SENDER_SIDE",
          canonicalRouteNodeId: "MT300-001:DELIVERY_AGENT",
        }),
      }),
    ]);
  });

  it("keeps a not-required FIN role visible without fabricating SSI details", () => {
    const notRequired = new ResolutionPageSubmissionAdapter(
      pages,
      fixtures as never,
      {
        resolve: jest.fn(() => ({
          payloadGenerated: true,
          resolvedFields: [
            {
              sequence: "Q9",
              settlementLeg: "Synthetic leg",
              tag: "56",
              option: "A",
              officialFieldName: "Intermediary",
              officialRole: "Intermediary Institution",
              resolutionStatus: "NOT_REQUIRED",
              resolvedValue: null,
              reasonCode: "ROUTE_COMPLETE",
              provenance: {
                source: "ROUTE_RESOLVER",
                ownerSide: "CANONICAL_ROUTE",
              },
            },
          ],
        })),
      } as never,
      banks as never,
    );

    const [field] = notRequired.execute(submission).fields;
    expect(field).toMatchObject({
      swiftTag: "56",
      swiftOption: "A",
      role: "Intermediary Institution",
      resolutionStatus: "NOT_REQUIRED",
      outcome: "NOT_REQUIRED",
      reasonCode: "ROUTE_COMPLETE",
      provenance: {
        source: "ROUTE_RESOLVER",
        ownerSide: "CANONICAL_ROUTE",
      },
    });
    expect(field).not.toHaveProperty("value");
    expect(field).not.toHaveProperty("institution");
    expect(field).not.toHaveProperty("partyIdentifier");
    expect(field).not.toHaveProperty("accountReference");
  });

  it.each([
    [{ contractSha256: "b".repeat(64) }, "PAGE_CONTRACT_IDENTITY_MISMATCH"],
    [{ fixtureBindingId: "TAMPERED" }, "PAGE_FIXTURE_BINDING_MISMATCH"],
    [
      { values: { ...values, injected: "value" } },
      "PAGE_SUBMISSION_FIELD_UNKNOWN",
    ],
  ])("rejects tampered page submissions", (override, code) => {
    try {
      adapter.execute({ ...submission, ...override });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code,
      });
    }
  });

  it("rejects an unknown Bank Service before controlled resolution", () => {
    const rejecting = new ResolutionPageSubmissionAdapter(
      pages,
      fixtures as never,
      controlled as never,
      {
        resolve: jest.fn(() => {
          throw new BadRequestException("BANK_SERVICE_NOT_FOUND");
        }),
      } as never,
    );

    expect(() => rejecting.execute(submission)).toThrow(BadRequestException);
  });

  it("fails closed when a client overrides an SSI-derived bank role", () => {
    const governedScenario = {
      ...scenario,
      fieldPolicies: scenario.fieldIds.map((fieldId) => ({
        fieldId,
        applicability: "APPLICABLE" as const,
        inputOwnership:
          fieldId === "Q9.57.bankServiceId"
            ? ("SSI_DERIVED" as const)
            : ("TRANSACTION_USER" as const),
        visibility:
          fieldId === "Q9.57.bankServiceId"
            ? ("HIDDEN_EVIDENCE" as const)
            : ("USER_INPUT" as const),
        processingPolicy: "APPLY" as const,
        required: fieldId !== "Q9.57.bankServiceId",
        readOnly: fieldId === "Q9.57.bankServiceId",
      })),
    };
    const governed = new ResolutionPageSubmissionAdapter(
      {
        getByIdentity: () => ({
          contract: { ...definition, scenarios: [governedScenario] },
          contractSha256: SHA,
        }),
      } as never,
      fixtures as never,
      controlled as never,
      banks as never,
    );

    try {
      governed.execute({ ...submission, contractSha256: SHA });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "PAGE_SUBMISSION_SSI_DERIVED_OVERRIDE",
        fieldId: "Q9.57.bankServiceId",
      });
    }
  });

  it("ignores and audits a submitted not-applicable field with zero resolver effect", () => {
    const governedScenario = {
      ...scenario,
      fieldPolicies: scenario.fieldIds.map((fieldId) => ({
        fieldId,
        applicability:
          fieldId === "Q9.57.bankServiceId"
            ? ("NOT_APPLICABLE" as const)
            : ("APPLICABLE" as const),
        inputOwnership:
          fieldId === "Q9.57.bankServiceId"
            ? ("SSI_DERIVED" as const)
            : ("TRANSACTION_USER" as const),
        visibility:
          fieldId === "Q9.57.bankServiceId"
            ? ("HIDDEN_EVIDENCE" as const)
            : ("USER_INPUT" as const),
        processingPolicy:
          fieldId === "Q9.57.bankServiceId"
            ? ("IGNORE_AUDIT" as const)
            : ("APPLY" as const),
        required: fieldId !== "Q9.57.bankServiceId",
        readOnly: fieldId === "Q9.57.bankServiceId",
      })),
    };
    const governed = new ResolutionPageSubmissionAdapter(
      {
        getByIdentity: () => ({
          contract: { ...definition, scenarios: [governedScenario] },
          contractSha256: SHA,
        }),
      } as never,
      fixtures as never,
      controlled as never,
      banks as never,
    );

    const result = governed.execute({
      ...submission,
      contractSha256: SHA,
      values: {
        ...submission.values,
        "Q9.57.bankServiceId": "BANK-SVC-UNKNOWN",
      },
    });

    expect(controlled.resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({ roleBankServiceIds: {} }),
    );
    expect(banks.resolve).not.toHaveBeenCalledWith("BANK-SVC-UNKNOWN");
    expect(result.evidence.ignoredFieldIds).toEqual(["Q9.57.bankServiceId"]);
  });

  it("fails closed when a client changes a scenario-fixed value", () => {
    const governedScenario = {
      ...scenario,
      inputValues: { "context.currency": "USD" },
      fieldPolicies: scenario.fieldIds.map((fieldId) => ({
        fieldId,
        applicability: "APPLICABLE" as const,
        inputOwnership:
          fieldId === "context.currency"
            ? ("SCENARIO_FIXED" as const)
            : ("TRANSACTION_USER" as const),
        visibility:
          fieldId === "context.currency"
            ? ("HIDDEN_EVIDENCE" as const)
            : ("USER_INPUT" as const),
        processingPolicy: "APPLY" as const,
        required: fieldId !== "context.currency",
        readOnly: fieldId === "context.currency",
      })),
    };
    const governed = new ResolutionPageSubmissionAdapter(
      {
        getByIdentity: () => ({
          contract: { ...definition, scenarios: [governedScenario] },
          contractSha256: SHA,
        }),
      } as never,
      fixtures as never,
      controlled as never,
      banks as never,
    );

    expect(() =>
      governed.execute({
        ...submission,
        contractSha256: SHA,
        values: { ...submission.values, "context.currency": "EUR" },
      }),
    ).toThrow(BadRequestException);
    try {
      governed.execute({
        ...submission,
        contractSha256: SHA,
        values: { ...submission.values, "context.currency": "EUR" },
      });
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "PAGE_SUBMISSION_SCENARIO_FIXED_OVERRIDE",
        fieldId: "context.currency",
      });
    }
  });

  it("rejects a counterparty Bank Service that does not match the fixture", () => {
    try {
      adapter.execute({
        ...submission,
        values: {
          ...values,
          "context.counterpartyBankServiceId": "BANK-SVC-CHASUS33",
        },
      });
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "PAGE_COUNTERPARTY_FIXTURE_MISMATCH",
      });
    }
  });

  it("accepts an OAS-governed transaction Bank Service without locking it to the fixture", () => {
    const transactionScenario = {
      ...scenario,
      fieldPolicies: scenario.fieldIds.map((fieldId) => ({
        fieldId,
        applicability: "APPLICABLE" as const,
        inputOwnership: "TRANSACTION_USER" as const,
        visibility: "USER_INPUT" as const,
        processingPolicy: "APPLY" as const,
        required: true,
        readOnly: false,
      })),
    };
    const transactionAdapter = new ResolutionPageSubmissionAdapter(
      {
        getByIdentity: () => ({
          contract: { ...definition, scenarios: [transactionScenario] },
          contractSha256: SHA,
        }),
      } as never,
      fixtures as never,
      controlled as never,
      banks as never,
    );

    controlled.resolve.mockReturnValueOnce({
      payloadGenerated: true,
      resolvedFields: [
        {
          sequence: "Q9",
          settlementLeg: "Synthetic leg",
          tag: "57",
          option: "A",
          officialFieldName: "Account With Institution",
          officialRole: "Account With Institution",
          resolutionStatus: "N_A",
          resolvedValue: null,
          reasonCode: "TRANSACTION_CONTEXT_PROVIDED",
          provenance: { source: "TRANSACTION_CONTEXT" },
        },
      ],
    });

    const result = transactionAdapter.execute({
      ...submission,
      contractSha256: SHA,
      values: {
        ...values,
        "Q9.57.bankServiceId": "BANK-SVC-CHASUS33",
      },
    });

    expect(controlled.resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({
        roleBankServiceIds: {
          ACCOUNT_WITH_INSTITUTION: "BANK-SVC-CHASUS33",
        },
      }),
    );
    expect(result.fields).toEqual([
      expect.objectContaining({
        swiftTag: "57",
        role: "ACCOUNT_WITH_INSTITUTION",
        value: "CHASUS33",
        institution: expect.objectContaining({
          bankServiceId: "BANK-SVC-CHASUS33",
          bic: "CHASUS33",
        }),
        resolutionStatus: "N_A",
        reasonCode: "TRANSACTION_CONTEXT_PROVIDED",
      }),
    ]);
  });

  it("selects one canonical fixture-set member by governed SSI Counterparty identity", () => {
    const alternative = {
      ...candidate,
      id: "SSI-CHAS",
      bindingId: `${scenario.fixture.bindingId}::CHASUS33`,
      fixtureGroupId: scenario.fixture.bindingId,
      messageType: "MT399",
      sequence: "Q9",
      currency: "USD",
      bookingEntity: "HK01",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2027-12-31",
      counterpartyBic: "CHASUS33",
      roleValues: { ACCOUNT_WITH_INSTITUTION: "CHASUS33" },
      identity: {
        ssi: { id: "SSI-CHAS", version: 1 },
        applicability: { id: "APP-CHAS", version: 1 },
      },
    };
    const fixtureSet = new ResolutionPageSubmissionAdapter(
      pages,
      {
        list: jest.fn(() => ({ candidates: [candidate] })),
        catalogue: jest.fn(() => [alternative]),
      } as never,
      controlled as never,
      banks as never,
    );

    const result = fixtureSet.execute({
      ...submission,
      values: {
        ...values,
        "context.counterpartyBankServiceId": "BANK-SVC-CHASUS33",
        "Q9.57.bankServiceId": "BANK-SVC-CHASUS33",
      },
    });

    expect(controlled.resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bindingId: alternative.bindingId,
      }),
    );
    expect(result.evidence).toMatchObject({
      selectedSsi: alternative.identity.ssi,
      selectedApplicability: alternative.identity.applicability,
    });
  });

  it("fails closed when a canonical fixture set is ambiguous for one counterparty", () => {
    const alternative = {
      ...candidate,
      id: "SSI-CHAS-1",
      fixtureGroupId: scenario.fixture.bindingId,
      messageType: "MT399",
      sequence: "Q9",
      currency: "USD",
      bookingEntity: "HK01",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2027-12-31",
      counterpartyBic: "CHASUS33",
    };
    const ambiguous = new ResolutionPageSubmissionAdapter(
      pages,
      {
        list: jest.fn(() => ({ candidates: [candidate] })),
        catalogue: jest.fn(() => [
          alternative,
          { ...alternative, id: "SSI-CHAS-2" },
        ]),
      } as never,
      controlled as never,
      banks as never,
    );
    try {
      ambiguous.execute({
        ...submission,
        values: {
          ...values,
          "context.counterpartyBankServiceId": "BANK-SVC-CHASUS33",
        },
      });
      throw new Error("expected rejection");
    } catch (error) {
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "PAGE_FIXTURE_IDENTITY_AMBIGUOUS",
      });
    }
  });

  it("retains exact legacy binding semantics for isolated negative fixtures", () => {
    const negativeScenario = {
      ...scenario,
      fixture: {
        ...scenario.fixture,
        isolation: "TRANSACTIONAL_NEGATIVE" as const,
      },
    };
    const negative = new ResolutionPageSubmissionAdapter(
      {
        getByIdentity: () => ({
          contract: { ...definition, scenarios: [negativeScenario] },
          contractSha256: SHA,
        }),
      } as never,
      {
        list: jest.fn(() => ({ candidates: [candidate] })),
        catalogue: jest.fn(() => {
          throw new Error("must not enumerate canonical set");
        }),
      } as never,
      controlled as never,
      banks as never,
    );

    negative.execute({ ...submission, contractSha256: SHA });

    expect(controlled.resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({
        bindingId: candidate.bindingId,
      }),
    );
  });

  it("delegates an exact missing fixture to the controlled data-quality policy", () => {
    const dataQuality = new HttpException(
      { code: "INCORRECT_SSI_CONFIGURATION", payloadGenerated: false },
      409,
    );
    const resolve = jest.fn(() => {
      throw dataQuality;
    });
    const missing = new ResolutionPageSubmissionAdapter(
      pages,
      { list: jest.fn(() => ({ candidates: [] })) } as never,
      { resolve } as never,
      banks as never,
    );

    expect(() => missing.execute(submission)).toThrow(dataQuality);
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        bindingId: scenario.fixture.bindingId,
      }),
    );
  });

  it("omits an empty optional Bank Service selection", () => {
    adapter.execute({
      ...submission,
      values: { ...values, "Q9.57.bankServiceId": "" },
    });

    expect(controlled.resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({ roleBankServiceIds: {} }),
    );
  });

  it("does not require a duplicate technical option selector for a BIC role", () => {
    adapter.execute({
      ...submission,
      values: {
        ...values,
        "Q9.57.bankServiceId": "",
      },
    });

    expect(controlled.resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({ fieldOptions: {} }),
    );
  });

  it("keeps governed party identifiers out of FIN field option selectors", () => {
    const partyIdentifierField = {
      ...definition.fields[0]!,
      fieldId: "context.senders_correspondentPartyIdentifier",
      path: "rolePartyIdentifiers.SENDERS_CORRESPONDENT",
      swiftTag: "53",
      lookup: undefined,
      required: false,
    };
    const governedScenario = {
      ...scenario,
      fieldIds: [...scenario.fieldIds, partyIdentifierField.fieldId],
      inputValues: {
        ...scenario.inputValues,
        [partyIdentifierField.fieldId]: "//FW021000021",
      },
      fieldPolicies: [
        ...(scenario.fieldPolicies ?? []),
        {
          fieldId: partyIdentifierField.fieldId,
          inputOwnership: "SCENARIO_FIXED" as const,
          applicability: "APPLICABLE" as const,
          processingPolicy: "APPLY" as const,
          visibility: "HIDDEN_EVIDENCE" as const,
          required: false,
        },
      ],
    };
    const governedDefinition = {
      ...definition,
      fields: [...definition.fields, partyIdentifierField],
      scenarios: [governedScenario],
    };
    const governed = new ResolutionPageSubmissionAdapter(
      {
        getByIdentity: () => ({
          contract: governedDefinition,
          contractSha256: SHA,
        }),
      } as never,
      fixtures as never,
      controlled as never,
      banks as never,
    );

    governed.execute({
      ...submission,
      contractSha256: SHA,
      scenarioId: governedScenario.scenarioId,
      fixtureBindingId: governedScenario.fixture.bindingId,
    });

    expect(controlled.resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fieldOptions: {},
        rolePartyIdentifiers: {
          SENDERS_CORRESPONDENT: "//FW021000021",
        },
      }),
    );
  });

  it("adds supported server-owned scenario FIN options without requiring UI input", () => {
    const governed = new ResolutionPageSubmissionAdapter(
      pages,
      fixtures as never,
      controlled as never,
      banks as never,
      {
        constraintsFor: () => [],
        fieldOptionsFor: () => ({ "57": "A" }),
      } as never,
    );

    governed.execute(submission);

    expect(controlled.resolve).toHaveBeenLastCalledWith(
      expect.objectContaining({ fieldOptions: { "57": "A" } }),
    );
  });

  it("rejects an unsupported scenario tag before downstream option validation", () => {
    controlled.resolve.mockClear();
    const governed = new ResolutionPageSubmissionAdapter(
      pages,
      fixtures as never,
      controlled as never,
      banks as never,
      {
        constraintsFor: () => [],
        fieldOptionsFor: () => ({ "58": "Z" }),
      } as never,
    );

    try {
      governed.execute(submission);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as HttpException).getResponse()).toEqual({
        code: "FIELD_NOT_SUPPORTED",
        tag: "58",
        payloadGenerated: false,
        confirmedResolutionCreated: false,
        repairQueueCreated: false,
      });
    }
    expect(controlled.resolve).not.toHaveBeenCalled();
  });

  it("rejects a disallowed option only after confirming the tag is supported", () => {
    controlled.resolve.mockClear();
    const governed = new ResolutionPageSubmissionAdapter(
      pages,
      fixtures as never,
      controlled as never,
      banks as never,
      {
        constraintsFor: () => [],
        fieldOptionsFor: () => ({ "57": "Z" }),
      } as never,
    );

    try {
      governed.execute(submission);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect((error as HttpException).getResponse()).toEqual({
        code: "OPTION_CONSTRAINT_VIOLATION",
        tag: "57",
        option: "Z",
        payloadGenerated: false,
        confirmedResolutionCreated: false,
        repairQueueCreated: false,
      });
    }
    expect(controlled.resolve).not.toHaveBeenCalled();
  });

  it("treats a message-valid option with no governed structured source as profile incomplete", () => {
    controlled.resolve.mockClear();
    const optionBField = {
      ...definition.fields.find(({ swiftTag }) => swiftTag === "57")!,
      fieldId: "Q9.57B",
      swiftOption: "B",
    };
    const negativeScenario = {
      ...scenario,
      polarity: "NEGATIVE" as const,
      inputValues: {
        "context.counterpartyBankServiceId": "BANK-SVC-CITIUS33",
      },
      execution: { ...scenario.execution, expectedHttp: [409, 500] },
    };
    const governed = new ResolutionPageSubmissionAdapter(
      {
        getByIdentity: () => ({
          contract: {
            ...definition,
            fields: [...definition.fields, optionBField],
            scenarios: [negativeScenario],
          },
          contractSha256: SHA,
        }),
      } as never,
      fixtures as never,
      controlled as never,
      banks as never,
      {
        constraintsFor: () => [],
        fieldOptionsFor: () => ({ "57": "B" }),
        get: () => ({
          scenarios: [
            {
              scenarioId: scenario.scenarioId,
              reasonCode: "PROFILE_INCOMPLETE",
            },
          ],
        }),
      } as never,
    );

    try {
      governed.execute({ ...submission, contractSha256: SHA });
      throw new Error("expected rejection");
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: "PROFILE_INCOMPLETE",
        payloadGenerated: false,
      });
    }
    expect(controlled.resolve).not.toHaveBeenCalled();
  });

  it.each([
    [
      { ...submission, contractSha256: undefined },
      "PAGE_SUBMISSION_IDENTITY_REQUIRED",
    ],
    [
      { ...submission, values: { ...values, "context.currency": "usd" } },
      "PAGE_SUBMISSION_CURRENCY_INVALID",
    ],
    [
      {
        ...submission,
        values: { ...values, "context.valueDate": "12/09/2026" },
      },
      "PAGE_SUBMISSION_DATE_INVALID",
    ],
  ])("fails closed for malformed runtime input", (input, code) => {
    try {
      adapter.execute(input);
      throw new Error("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code,
      });
    }
  });

  it("rejects a mixed discovery snapshot and selected route with 409", () => {
    try {
      adapter.execute({
        ...submission,
        eligibilitySnapshot: {
          snapshotId: "SNAPSHOT-1",
          contextSha256: "b".repeat(64),
        },
        selectedRouteIdentity: {
          routeId: "ROUTE-1",
          definitionId: definition.definitionId,
          definitionVersion: definition.definitionVersion,
          fixtureBindingId: scenario.fixture.bindingId,
          contextSha256: "a".repeat(64),
          ssi: { id: "SSI-1", version: 1 },
          applicability: { id: "APP-1", version: 1 },
          nostro: { id: "NOSTRO-1", version: 1 },
          rma: { id: "RMA-1", version: 1 },
        },
      });
      throw new Error("expected rejection");
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: "PAGE_ROUTE_ELIGIBILITY_CONFLICT",
        payloadGenerated: false,
        confirmedResolutionCreated: false,
        repairQueueCreated: false,
      });
    }
  });

  it("delegates PAYMENT definitions to the MT2/pacs.009 submission adapter", () => {
    controlled.resolve.mockClear();
    const paymentSource = new PaymentResolutionPageDefinitionSource();
    const paymentPages = new ResolutionPageAggregationService(
      paymentSource,
      new PageParameterEnvironmentPolicy("DEMO"),
    );
    const paymentDefinition = paymentSource
      .all("SR2026")
      .find(({ messageType }) => messageType === "MT202")!;
    const paymentEnvelope = paymentPages.getByIdentity(
      paymentDefinition.definitionId,
      paymentDefinition.definitionVersion,
    );
    const paymentScenario = paymentDefinition.scenarios.find(
      ({ scenarioId }) => scenarioId === "MT202-OP-DIRECT",
    )!;
    const paymentResult = {
      definitionId: paymentDefinition.definitionId,
      definitionVersion: paymentDefinition.definitionVersion,
      scenarioId: paymentScenario.scenarioId,
      fixtureBindingId: paymentScenario.fixture.bindingId,
      outcome: "RESOLVED",
      payloadGenerated: true,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
      nvrOutcome: "NOT_EVALUATED",
      fields: [],
      evidence: {
        correlationId: "PAYMENT",
        owner: "SSI_FIELD_RESOLUTION_API",
        action: "RESOLVE_SSI",
        executorIdentity: "TEST",
        requestSha256: SHA,
        responseSha256: SHA,
        ruleIds: paymentScenario.validationRuleIds,
      },
    } as const;
    const payment = { execute: jest.fn(() => paymentResult) };
    const routeIdentity = {
      ssi: { id: "SSI-PAYMENT-1", version: 1 },
      applicability: { id: "APP-PAYMENT-1", version: 2 },
      nostro: { id: "NOSTRO-PAYMENT-1", version: 3 },
      rma: { id: "RMA-PAYMENT-1", version: 4 },
    };
    const paymentRoutes = {
      atomicCandidates: jest.fn(() => [
        {
          ssi: {
            id: routeIdentity.ssi.id,
            version: routeIdentity.ssi.version,
            route: { counterpartyBic: "DEUTDEFF" },
          },
          applicability: routeIdentity.applicability,
          nostro: {
            ...routeIdentity.nostro,
            accountServicerBic: "DEUTDEFF",
          },
          rma: routeIdentity.rma,
          snapshot: { sha256: "DB-SNAPSHOT", method: "logical" },
        },
      ]),
    };
    const paymentBanks = {
      ...banks,
      resolve: jest.fn((id: string) => ({
        bankServiceId: id,
        bic: "DEUTDEFF",
      })),
    };
    const routed = new ResolutionPageSubmissionAdapter(
      paymentPages,
      { list: jest.fn() } as never,
      controlled as never,
      paymentBanks as never,
      undefined,
      undefined,
      undefined,
      payment as never,
      undefined,
      paymentRoutes as never,
    );
    const paymentValues = {
      "context.currency": "USD",
      "context.bookingEntity": "HK01",
      "context.valueDate": "2026-09-14",
      "context.amount": "1000.00",
      "context.counterpartyBankServiceId": "BANK-SVC-DEUTDEFF",
    };
    const contextSha256 = hashCanonical({
      scenarioId: paymentScenario.scenarioId,
      messageType: paymentDefinition.messageType,
      sequence: paymentDefinition.sequences[0]?.sequenceId ?? "",
      currency: paymentValues["context.currency"],
      bookingEntity: paymentValues["context.bookingEntity"],
      valueDate: paymentValues["context.valueDate"],
      fixtureBindingId: paymentScenario.fixture.bindingId,
    });
    const paymentSubmission = {
      definitionId: paymentDefinition.definitionId,
      definitionVersion: paymentDefinition.definitionVersion,
      contractSha256: paymentEnvelope.contractSha256,
      scenarioId: paymentScenario.scenarioId,
      fixtureBindingId: paymentScenario.fixture.bindingId,
      values: paymentValues,
      eligibilitySnapshot: {
        snapshotId: "DB-SNAPSHOT",
        contextSha256,
      },
      selectedRouteIdentity: {
        routeId: hashCanonical(routeIdentity),
        definitionId: paymentDefinition.definitionId,
        definitionVersion: paymentDefinition.definitionVersion,
        fixtureBindingId: paymentScenario.fixture.bindingId,
        contextSha256,
        ...routeIdentity,
      },
    };

    expect(routed.execute(paymentSubmission)).toBe(paymentResult);
    expect(payment.execute).toHaveBeenCalledWith({
      definition: paymentDefinition,
      scenario: paymentScenario,
      submission: expect.objectContaining({
        values: expect.objectContaining(paymentSubmission.values),
      }),
    });
    expect(paymentRoutes.atomicCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        fixtureBindingId: paymentScenario.fixture.bindingId,
      }),
    );
    expect(controlled.resolve).not.toHaveBeenCalled();
  });

  it("delegates a COV definition using governed hidden context without requiring it from the UI", () => {
    const paymentSource = new PaymentResolutionPageDefinitionSource();
    const paymentPages = new ResolutionPageAggregationService(
      paymentSource,
      new PageParameterEnvironmentPolicy("DEMO"),
    );
    const paymentDefinition = paymentSource
      .all("SR2026")
      .find(({ messageType }) => messageType === "MT202COV")!;
    const paymentEnvelope = paymentPages.getByIdentity(
      paymentDefinition.definitionId,
      paymentDefinition.definitionVersion,
    );
    const paymentScenario = paymentDefinition.scenarios.find(
      ({ scenarioId }) => scenarioId === "MT202COV-OP-STANDARD",
    )!;
    const payment = { execute: jest.fn(() => ({ payment: true })) };
    const routed = new ResolutionPageSubmissionAdapter(
      paymentPages,
      { list: jest.fn() } as never,
      controlled as never,
      banks as never,
      undefined,
      undefined,
      undefined,
      payment as never,
    );

    routed.execute({
      definitionId: paymentDefinition.definitionId,
      definitionVersion: paymentDefinition.definitionVersion,
      contractSha256: paymentEnvelope.contractSha256,
      scenarioId: paymentScenario.scenarioId,
      fixtureBindingId: paymentScenario.fixture.bindingId,
      values: {
        "context.currency": "USD",
        "context.bookingEntity": "HK01",
        "context.valueDate": "2026-09-14",
        "context.amount": "1000.00",
        "context.counterpartyBankServiceId": "BANK-SVC-DEUTDEFF",
      },
    });

    expect(payment.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        submission: expect.objectContaining({
          values: expect.objectContaining({
            "context.swift21NONE": expect.any(String),
            "context.swift119NONE": "COV",
            "context.swift121NONE": expect.any(String),
            "context.sequenceB50A": expect.any(String),
            "context.sequenceB59": expect.any(String),
          }),
        }),
      }),
    );
  });

  it("preserves the governed negative COV oracle through generic submission", () => {
    const paymentSource = new PaymentResolutionPageDefinitionSource();
    const paymentPages = new ResolutionPageAggregationService(
      paymentSource,
      new PageParameterEnvironmentPolicy("DEMO"),
    );
    const definition = paymentSource
      .all("SR2026")
      .find(({ messageType }) => messageType === "MT202COV")!;
    const envelope = paymentPages.getByIdentity(
      definition.definitionId,
      definition.definitionVersion,
    );
    const scenario = definition.scenarios.find(
      ({ scenarioId }) => scenarioId === "MT202COV-QA-INCOMPLETE",
    )!;
    const payment = { execute: jest.fn(() => ({ payment: true })) };
    const routed = new ResolutionPageSubmissionAdapter(
      paymentPages,
      { list: jest.fn() } as never,
      controlled as never,
      banks as never,
      undefined,
      undefined,
      undefined,
      payment as never,
    );

    routed.execute({
      definitionId: definition.definitionId,
      definitionVersion: definition.definitionVersion,
      contractSha256: envelope.contractSha256,
      scenarioId: scenario.scenarioId,
      fixtureBindingId: scenario.fixture.bindingId,
      values: {
        "context.currency": "USD",
        "context.bookingEntity": "HK01",
        "context.valueDate": "2026-09-14",
        "context.amount": "1000.00",
        "context.counterpartyBankServiceId": "BANK-SVC-DEUTDEFF",
      },
    });

    expect(payment.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        submission: expect.objectContaining({
          values: expect.objectContaining({
            "fixture.coverSequenceBMissing": true,
          }),
        }),
      }),
    );
  });
});
