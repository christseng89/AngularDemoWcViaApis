import { BadRequestException, HttpException } from "@nestjs/common";
import {
  RESOLUTION_PAGE_SCHEMA_VERSION,
  type ResolutionPageDefinition,
  type ResolutionPageDefinitionQuery,
} from "@ssi/contracts";
import { PageParameterEnvironmentPolicy } from "../../../app/page-parameters/page-parameter-environment.policy";
import { ResolutionPageAggregationService } from "../../../app/page-parameters/resolution-page-aggregation.service";
import type { ResolutionPageDefinitionSource } from "../../../app/page-parameters/resolution-page-definition.source";
import { ResolutionPageOasFieldPolicyService } from "../../../app/page-parameters/resolution-page-oas-field-policy.service";
import type { PaymentMessageIndexService } from "../../../app/payment-message-index.service";

const SOURCE_SHA = "a".repeat(64);
const FIXTURE_SHA = "b".repeat(64);
const EVIDENCE_SHA = "c".repeat(64);

const requiredConstraint = (fieldId: string) => ({
  constraintId: `${fieldId}.required`,
  kind: "REQUIRED" as const,
  message: "A governed value is required.",
});

const query: ResolutionPageDefinitionQuery = {
  standardsRelease: "SR2026",
  messageFamily: "MT347",
  messageType: "MSG-X",
  direction: "OUTGOING",
  businessScenarioId: "SCN-X-Q9-001",
};

const definition = (
  overrides: Partial<ResolutionPageDefinition> = {},
): ResolutionPageDefinition => ({
  schemaVersion: RESOLUTION_PAGE_SCHEMA_VERSION,
  definitionId: "PAGE-MSG-X-Q9",
  definitionVersion: "v1",
  source: {
    catalogueVersion: "CATALOGUE-SR2026-v1",
    sourceArtifactId: "parameters/page-definitions.json",
    sourceSha256: SOURCE_SHA,
    snapshotId: "SNAPSHOT-001",
    snapshotIdentityMethod: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
  },
  standardsRelease: "SR2026",
  messageFamily: "MT347",
  messageType: "MSG-X",
  direction: "OUTGOING",
  businessFunction: "UNKNOWN_FUTURE_FUNCTION",
  title: "Unknown governed message",
  display: {
    familyCode: "FUTURE",
    familyLabel: "Future family",
    categoryCode: "FUTURE_CATEGORY",
    categoryLabel: "Future category",
  },
  profile: {
    profileId: "FIN-SR2026-REFERENCE",
    profileKind: "FIN_REFERENCE_ONLY",
    paymentExecutable: false,
    selectionBasis: { businessScenarioId: "SCN-X-Q9-001" },
  },
  sequences: [
    {
      sequenceId: "Q9",
      label: "Unknown sequence",
      fieldIds: ["Q9.79Z"],
    },
  ],
  fields: [
    {
      fieldId: "Q9.79Z",
      path: "Q9.79Z",
      label: "Unknown governed field",
      control: "TEXT",
      dataType: "STRING",
      required: true,
      constraints: [
        {
          constraintId: "REQUIRED-Q9-79Z",
          kind: "REQUIRED",
          message: "A governed value is required.",
        },
      ],
      sequenceId: "Q9",
      swiftTag: "79",
      swiftOption: "Z",
    },
  ],
  scenarios: [
    {
      scenarioId: "SCN-X-Q9-001",
      label: "Unknown positive scenario",
      polarity: "POSITIVE",
      audience: "OPERATIONAL",
      flowKind: "CORE_SSI",
      sequenceIds: ["Q9"],
      fieldIds: ["Q9.79Z"],
      validationRuleIds: ["RULE-X-Q9-79Z"],
      validation: {
        owner: "SSI_FIELD_RESOLUTION_API",
        taxonomy: "NOT_APPLICABLE",
        nvrOutcome: "N_A",
      },
      fixture: {
        bindingId: "FIX-X-001",
        fixtureSet: "FUTURE-CANONICAL-POSITIVE",
        fixtureVersion: "v1",
        sourceSha256: FIXTURE_SHA,
        isolation: "CANONICAL",
      },
      execution: {
        action: "RESOLVE_SSI",
        owner: "SSI_FIELD_RESOLUTION_API",
        endpoint: "/api/v1/resolution-page-definitions/execute",
        method: "POST",
        expectedHttp: [200],
      },
    },
  ],
  validationRules: [
    {
      ruleId: "RULE-X-Q9-79Z",
      taxonomy: "NOT_APPLICABLE",
      owner: "SSI_FIELD_RESOLUTION_API",
      appliesToFieldIds: ["Q9.79Z"],
      reasonCode: "GOVERNED_FIELD_REQUIRED",
      evidenceIds: ["EVID-X-Q9-79Z"],
    },
  ],
  evidence: [
    {
      evidenceId: "EVID-X-Q9-79Z",
      classification: "BA_RULING",
      artifactId: "future-governance.md",
      artifactSha256: EVIDENCE_SHA,
    },
  ],
  ...overrides,
});

const create = (
  source: ResolutionPageDefinitionSource,
  environment = "DEMO",
): ResolutionPageAggregationService =>
  new ResolutionPageAggregationService(
    source,
    new PageParameterEnvironmentPolicy(environment),
  );

const response = (error: unknown): Record<string, unknown> => {
  expect(error).toBeInstanceOf(HttpException);
  return (error as HttpException).getResponse() as Record<string, unknown>;
};

const configurationFailure = (
  service: ResolutionPageAggregationService,
  request: ResolutionPageDefinitionQuery = query,
): Record<string, unknown> => {
  try {
    service.get(request);
    throw new Error("EXPECTED_CONFIGURATION_FAILURE");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "EXPECTED_CONFIGURATION_FAILURE"
    )
      throw error;
    return response(error);
  }
};

describe("ResolutionPageAggregationService", () => {
  it("invalidates both cached Index and full Definition after a committed source change", () => {
    const first = definition({ title: "Before" });
    const second = definition({ title: "After" });
    const all = jest.fn(() => [first]);
    const service = create({ find: () => [], all });
    const before = service.index("SR2026");
    const beforeFull = service.get(query).contractSha256;
    all.mockImplementation(() => [second]);
    service.invalidate();
    expect(service.index("SR2026")).not.toBe(before);
    expect(service.get(query).contractSha256).not.toBe(beforeFull);
  });
  it("builds one immutable runtime definition snapshot per standards release for all index domains", () => {
    const payment = definition({
      definitionId: "PAYMENT-MT202-SR2026",
      messageFamily: "MT2_PACS009",
      messageType: "MT202",
      businessDomain: "PAYMENT",
    });
    const treasury = definition({
      definitionId: "TREASURY-MT300-SR2026",
      messageType: "MT300",
      businessDomain: "TREASURY",
    });
    const all = jest.fn(() => [payment, treasury]);
    const service = create({ find: () => [], all });

    const first = service.index("SR2026", "PAYMENT");
    const repeated = service.index("SR2026", "PAYMENT");
    const otherDomain = service.index("SR2026", "TREASURY");

    expect(all).toHaveBeenCalledTimes(1);
    expect(repeated).toBe(first);
    expect(otherDomain.items).toHaveLength(1);
  });

  it.each([
    ["MT103", "Single Customer Credit Transfer"],
    ["pacs.008.001.08", "FI To FI Customer Credit Transfer"],
    ["MT202", "General Financial Institution Transfer"],
    ["MT202COV", "General Financial Institution Transfer"],
    ["MT205", "Financial Institution Transfer Execution"],
    ["MT205COV", "Financial Institution Transfer Execution"],
  ])(
    "uses the exact SR2026 MRG Message Description for %s",
    (messageType, expectedDescription) => {
      const governed = definition({
        definitionId: `PAYMENT-${messageType}-SR2026`,
        messageFamily: "MT2_PACS009",
        messageType,
        businessDomain: "PAYMENT",
        title: `${messageType} Message`,
      });
      const service = create({
        find: () => [governed],
        all: () => [governed],
      });

      const [item] = service.index("SR2026", "PAYMENT").items;

      expect(item?.swiftDescription).toBe(expectedDescription);
      expect(item?.transactionDescription).toBe(expectedDescription);
    },
  );

  it("keeps the complete Payment profile for audit but publishes only governed SSI-generated tags", () => {
    const governed = definition({
      definitionId: "PAYMENT-MT202-SR2026",
      messageFamily: "MT2_PACS009",
      messageType: "MT202",
      businessDomain: "PAYMENT",
    });
    const service = new ResolutionPageAggregationService(
      { find: () => [governed], all: () => [governed] },
      new PageParameterEnvironmentPolicy("DEMO"),
      undefined,
      undefined,
      {
        findSelectable: () => ({
          mtCompatibility: {
            ssiFields: ["53a", "54a", "56a", "57a"],
          },
        }),
      } as unknown as PaymentMessageIndexService,
    );

    const [item] = service.index("SR2026", "PAYMENT").items;

    expect(item?.profileSlots).toEqual([]);
    expect(item?.targetProfileSlots).toEqual(["53a", "54a", "56a", "57a"]);
  });

  it("reuses the release snapshot when opening a workbench after loading its index", () => {
    const governed = definition();
    const all = jest.fn(() => [governed]);
    const find = jest.fn(() => [governed]);
    const service = create({ find, all });

    service.index("SR2026");
    service.get(query);

    expect(all).toHaveBeenCalledTimes(1);
    expect(find).not.toHaveBeenCalled();
  });

  it("reuses the immutable release snapshot for repeated identity lookups", () => {
    const governed = definition();
    const all = jest.fn(() => [governed]);
    const service = create({ find: () => [governed], all });

    service.getByIdentity(governed.definitionId, governed.definitionVersion);
    service.getByIdentity(governed.definitionId, governed.definitionVersion);

    expect(all).toHaveBeenCalledTimes(1);
  });

  it.each(["MT202", "MT202COV", "MT205", "MT205COV"])(
    "derives %s index inputs and SSI output tags from the same governed field policies as its workbench",
    (messageType) => {
      const baseScenario = definition().scenarios[0]!;
      const governed = definition({
        definitionId: `PAYMENT-${messageType}-SR2026`,
        messageFamily: "MT2_PACS009",
        messageType,
        businessDomain: "PAYMENT",
        sequences: [
          {
            sequenceId: "A",
            label: "Message",
            fieldIds: [
              "context.currency",
              "sequence.A.tag20",
              "sequence.A.tag53A",
            ],
          },
        ],
        fields: [
          {
            fieldId: "context.currency",
            path: "currency",
            label: "Currency",
            control: "SELECT",
            dataType: "ISO_CURRENCY",
            required: true,
            section: "TRANSACTION",
            visibility: "USER_INPUT",
            swiftTag: "32",
            swiftOption: "A",
            constraints: [requiredConstraint("currency")],
          },
          {
            fieldId: "sequence.A.tag20",
            path: "sequences.A.tag20",
            label: "SWIFT 20",
            control: "TEXT",
            dataType: "STRING",
            required: true,
            section: "TRANSACTION",
            visibility: "USER_INPUT",
            sequenceId: "A",
            swiftTag: "20",
            constraints: [requiredConstraint("tag20")],
          },
          {
            fieldId: "sequence.A.tag53A",
            path: "sequences.A.tag53A",
            label: "SWIFT 53A",
            control: "HIDDEN",
            dataType: "SWIFT_BIC",
            required: false,
            displayOrder: 100,
            section: "SETTLEMENT_INSTRUCTIONS",
            visibility: "HIDDEN_EVIDENCE",
            sequenceId: "A",
            swiftTag: "53",
            swiftOption: "A",
            constraints: [],
          },
          {
            fieldId: "context.field32A",
            path: "field32A",
            label: "SWIFT 32A context",
            control: "HIDDEN",
            dataType: "STRING",
            required: true,
            displayOrder: 200,
            section: "VALIDATION_CONTEXT",
            visibility: "HIDDEN_EVIDENCE",
            swiftTag: "32",
            swiftOption: "A",
            constraints: [requiredConstraint("field32A")],
          },
        ],
        scenarios: [
          {
            ...baseScenario,
            sequenceIds: ["A"],
            fieldIds: [
              "context.currency",
              "sequence.A.tag20",
              "sequence.A.tag53A",
              "context.field32A",
            ],
            fieldPolicies: [
              {
                fieldId: "context.currency",
                applicability: "APPLICABLE",
                inputOwnership: "TRANSACTION_USER",
                visibility: "USER_INPUT",
                processingPolicy: "APPLY",
                required: true,
                readOnly: false,
              },
              {
                fieldId: "sequence.A.tag20",
                applicability: "APPLICABLE",
                inputOwnership: "TRANSACTION_USER",
                visibility: "USER_INPUT",
                processingPolicy: "APPLY",
                required: true,
                readOnly: false,
              },
              {
                fieldId: "sequence.A.tag53A",
                applicability: "APPLICABLE",
                inputOwnership: "SSI_DERIVED",
                visibility: "HIDDEN_EVIDENCE",
                processingPolicy: "APPLY",
                required: false,
                readOnly: true,
              },
              {
                fieldId: "context.field32A",
                applicability: "APPLICABLE",
                inputOwnership: "SCENARIO_FIXED",
                visibility: "HIDDEN_EVIDENCE",
                processingPolicy: "APPLY",
                required: true,
                readOnly: true,
              },
            ],
          },
        ],
      });
      const service = create({
        find: () => [governed],
        all: () => [governed],
      });

      const [item] = service.index("SR2026", "PAYMENT").items;

      expect(item?.inputFields).toEqual(["32A", "20"]);
      expect(item?.profileSlots).toEqual(["53A"]);
      expect(item?.targetProfileSlots).toEqual(["53A"]);
    },
  );

  it("keeps an authoritative empty Trade OAS input list instead of exposing generic transaction fields", () => {
    const baseScenario = definition().scenarios[0]!;
    const governed = definition({
      messageType: "MT730",
      businessDomain: "TRADE_FINANCE",
      fields: [
        {
          ...definition().fields[0]!,
          visibility: "USER_INPUT",
        },
      ],
      scenarios: [
        {
          ...baseScenario,
          fieldPolicies: [
            {
              fieldId: "Q9.79Z",
              applicability: "APPLICABLE",
              inputOwnership: "TRANSACTION_USER",
              visibility: "USER_INPUT",
              processingPolicy: "APPLY",
              required: true,
              readOnly: false,
            },
          ],
        },
      ],
    });
    const service = new ResolutionPageAggregationService(
      { find: () => [governed], all: () => [governed] },
      new PageParameterEnvironmentPolicy("DEMO"),
      undefined,
      {
        inputFields: () => [],
      } as unknown as ResolutionPageOasFieldPolicyService,
    );

    const [item] = service.index("SR2026", "TRADE_FINANCE").items;

    expect(item?.inputFields).toEqual([]);
  });

  it("fails closed for a Payment definition that omits scenario field ownership policies", () => {
    const governed = definition({
      messageFamily: "MT2_PACS009",
      messageType: "MT202",
      businessDomain: "PAYMENT",
      fields: [
        {
          ...definition().fields[0]!,
          section: "SETTLEMENT_INSTRUCTIONS",
          visibility: "USER_INPUT",
        },
      ],
    });
    const service = create({
      find: () => [governed],
      all: () => [governed],
    });

    const [item] = service.index("SR2026", "PAYMENT").items;

    expect(item?.inputFields).toEqual([]);
    expect(item?.profileSlots).toEqual([]);
  });

  it("passes an arbitrary governed message, sequence and field through unchanged", () => {
    const governed = definition();
    const service = create({ find: () => [governed] });

    const result = service.get(query);

    expect(result.contract).toBe(governed);
    expect(result.contract).toMatchObject({
      messageType: "MSG-X",
      sequences: [{ sequenceId: "Q9" }],
      fields: [{ fieldId: "Q9.79Z" }],
    });
    expect(result.contractSha256).toMatch(/^[a-f\d]{64}$/);
  });

  it.each([
    ["MT300", "MT3", "Treasury"],
    ["MT400", "MT4", "Trade Finance"],
    ["MT769", "MT7", "Trade Finance"],
  ])(
    "keeps internal MT347 lookup while exposing %s as %s / %s",
    (messageType, familyCode, categoryLabel) => {
      const governed = definition({
        messageType,
        display: {
          familyCode,
          familyLabel: familyCode,
          categoryCode: categoryLabel.toUpperCase().replace(" ", "_"),
          categoryLabel,
        },
      });
      const service = create({ find: () => [governed] });

      const result = service.get({ ...query, messageType });

      expect(result.contract.messageFamily).toBe("MT347");
      expect(result.contract.display).toEqual({
        familyCode,
        familyLabel: familyCode,
        categoryCode: categoryLabel.toUpperCase().replace(" ", "_"),
        categoryLabel,
      });
    },
  );

  it("exposes a reloaded source value without changing or rebuilding the service", () => {
    let current = definition();
    const service = create({ find: () => [current] });
    const before = service.get(query);

    current = definition({
      definitionVersion: "v2",
      title: "Title supplied by reloaded configuration",
    });
    const after = service.get(query);

    expect(after.contract.title).toBe(
      "Title supplied by reloaded configuration",
    );
    expect(after.contract.definitionVersion).toBe("v2");
    expect(after.contractSha256).not.toBe(before.contractSha256);
  });

  it.each([
    ["DEVELOPMENT", 409],
    ["DEMO", 409],
    ["QA", 500],
    ["UAT", 500],
    ["PRODUCTION", 500],
  ])(
    "fails closed in %s with HTTP %i when the definition is missing",
    (environment, status) => {
      const service = create({ find: () => [] }, environment);

      try {
        service.get(query);
        fail("Expected configuration failure");
      } catch (error) {
        expect((error as HttpException).getStatus()).toBe(status);
        expect(response(error)).toMatchObject({
          code: "INCORRECT_PAGE_PARAMETER_CONFIGURATION",
          cause: "PAGE_DEFINITION_NOT_FOUND",
          payloadGenerated: false,
          confirmedResolutionCreated: false,
          repairQueueCreated: false,
        });
      }
    },
  );

  it("fails closed when more than one governed definition matches", () => {
    const service = create({ find: () => [definition(), definition()] });

    expect(() => service.get(query)).toThrow(HttpException);
    try {
      service.get(query);
    } catch (error) {
      expect(response(error)["cause"]).toBe("PAGE_DEFINITION_AMBIGUOUS");
    }
  });

  it("returns 400 for an incomplete request instead of treating it as data quality", () => {
    const service = create({ find: () => [definition()] });

    expect(() => service.get({ ...query, messageType: " " })).toThrow(
      BadRequestException,
    );
  });

  it("selects MT-to-MX profiles by scenario and BizSvc, not MsgDefIdr", () => {
    const paymentQuery = {
      ...query,
      messageFamily: "MT2_PACS009",
      messageType: "MT202",
      businessScenarioId: "GENERIC_PLAIN",
      businessService: "swift.cbprplus.04",
    };
    const base = definition();
    const paymentDefinition = definition({
      messageFamily: "MT2_PACS009",
      messageType: "MT202",
      profile: {
        profileId: "PACS009-PLAIN",
        profileKind: "MT_TO_MX",
        businessService: "swift.cbprplus.04",
        messageDefinitionId: "pacs.009.001.08",
        paymentExecutable: true,
        selectionBasis: {
          businessScenarioId: "GENERIC_PLAIN",
          businessService: "swift.cbprplus.04",
        },
      },
      scenarios: [
        {
          ...base.scenarios[0]!,
          scenarioId: "GENERIC_PLAIN",
        },
      ],
    });
    const service = create({ find: () => [paymentDefinition] });

    expect(service.get(paymentQuery).contract.profile).toMatchObject({
      profileId: "PACS009-PLAIN",
      businessService: "swift.cbprplus.04",
      messageDefinitionId: "pacs.009.001.08",
    });
    expect(() =>
      service.get({
        ...paymentQuery,
        businessService: "swift.cbprplus.cov.04",
      }),
    ).toThrow(HttpException);
  });

  it("rejects MX metadata on a FIN-reference-only MT347 profile", () => {
    const invalid = definition({
      profile: {
        ...definition().profile,
        businessService: "swift.cbprplus.04",
      },
    });
    const service = create({ find: () => [invalid] });

    try {
      service.get(query);
    } catch (error) {
      expect(response(error)["cause"]).toBe(
        "FIN_REFERENCE_PROFILE_MUST_NOT_DECLARE_MX_METADATA",
      );
    }
  });

  it("rejects an SSI-simulated response for an upstream FIN-owned rule", () => {
    const base = definition();
    const invalid = definition({
      scenarios: [
        {
          ...base.scenarios[0]!,
          execution: {
            ...base.scenarios[0]!.execution,
            action: "RESOLVE_SSI",
            owner: "UPSTREAM_FIN_VALIDATOR",
          },
        },
      ],
    });
    const service = create({ find: () => [invalid] });

    try {
      service.get(query);
    } catch (error) {
      expect(response(error)["cause"]).toBe("PAGE_EXECUTION_REGISTRY_MISMATCH");
    }
  });

  it.each<
    [
      string,
      string,
      (base: ResolutionPageDefinition) => ResolutionPageDefinition,
    ]
  >([
    [
      "unsupported schema",
      "UNSUPPORTED_PAGE_SCHEMA_VERSION",
      (base) => ({ ...base, schemaVersion: "2.0" as "1.0" }),
    ],
    [
      "blank definition identity",
      "PAGE_DEFINITION_ID_REQUIRED",
      (base) => ({ ...base, definitionId: " " }),
    ],
    [
      "invalid source hash",
      "PAGE_SOURCE_SHA256_INVALID",
      (base) => ({ ...base, source: { ...base.source, sourceSha256: "bad" } }),
    ],
    [
      "incomplete snapshot identity",
      "PAGE_SNAPSHOT_IDENTITY_INCOMPLETE",
      (base) => {
        const source = { ...base.source };
        delete source.snapshotIdentityMethod;
        return { ...base, source };
      },
    ],
    [
      "query mismatch",
      "PAGE_DEFINITION_QUERY_MISMATCH",
      (base) => ({ ...base, messageType: "DIFFERENT" }),
    ],
    [
      "profile scenario mismatch",
      "PAGE_PROFILE_SCENARIO_MISMATCH",
      (base) => ({
        ...base,
        profile: {
          ...base.profile,
          selectionBasis: { businessScenarioId: "SCN-DIFFERENT" },
        },
      }),
    ],
    [
      "missing fields",
      "PAGE_FIELDS_REQUIRED",
      (base) => ({ ...base, fields: [] }),
    ],
    [
      "missing sequences",
      "PAGE_SEQUENCES_REQUIRED",
      (base) => ({ ...base, sequences: [] }),
    ],
    [
      "missing scenarios",
      "PAGE_SCENARIOS_REQUIRED",
      (base) => ({ ...base, scenarios: [] }),
    ],
    [
      "missing rules",
      "PAGE_VALIDATION_RULES_REQUIRED",
      (base) => ({ ...base, validationRules: [] }),
    ],
    [
      "missing evidence",
      "PAGE_EVIDENCE_REQUIRED",
      (base) => ({ ...base, evidence: [] }),
    ],
    [
      "blank field path",
      "PAGE_FIELD_PATH_REQUIRED",
      (base) => ({
        ...base,
        fields: [{ ...base.fields[0]!, path: " " }],
      }),
    ],
    [
      "select without options",
      "PAGE_FIELD_OPTIONS_REQUIRED",
      (base) => ({
        ...base,
        fields: [{ ...base.fields[0]!, control: "SELECT", options: [] }],
      }),
    ],
    [
      "duplicate options",
      "DUPLICATE_PAGE_FIELD_OPTION",
      (base) => ({
        ...base,
        fields: [
          {
            ...base.fields[0]!,
            control: "RADIO",
            options: [
              { value: "A", label: "First" },
              { value: "A", label: "Second" },
            ],
          },
        ],
      }),
    ],
    [
      "duplicate constraints",
      "DUPLICATE_PAGE_FIELD_CONSTRAINT",
      (base) => ({
        ...base,
        fields: [
          {
            ...base.fields[0]!,
            constraints: [
              base.fields[0]!.constraints[0]!,
              base.fields[0]!.constraints[0]!,
            ],
          },
        ],
      }),
    ],
    [
      "duplicate fields",
      "DUPLICATE_PAGE_FIELD",
      (base) => ({ ...base, fields: [base.fields[0]!, base.fields[0]!] }),
    ],
    [
      "lookup dependency displayed after the dependent field",
      "PAGE_LOOKUP_DEPENDENCY_ORDER_INVALID",
      (base) => ({
        ...base,
        fields: [
          {
            ...base.fields[0]!,
            displayOrder: 10,
            lookup: {
              provider: "BANK_SERVICE",
              action: "BANK_SERVICE",
              endpoint:
                "/api/v1/resolution-page-definitions/lookups/bank-services",
              valueField: "bankServiceId",
              displayField: "bic",
              validationField: "bic",
              dependency: {
                dependsOnFieldIds: [base.fields[0]!.fieldId],
                invalidatesFieldIds: [],
                selectionPolicy: "SELECTABLE",
              },
            },
          },
        ],
      }),
    ],
    [
      "lookup references a missing dependency field",
      "PAGE_LOOKUP_DEPENDENCY_FIELD_NOT_FOUND",
      (base) => ({
        ...base,
        fields: [
          {
            ...base.fields[0]!,
            displayOrder: 20,
            lookup: {
              provider: "BANK_SERVICE",
              action: "BANK_SERVICE",
              endpoint:
                "/api/v1/resolution-page-definitions/lookups/bank-services",
              valueField: "bankServiceId",
              displayField: "bic",
              validationField: "bic",
              dependency: {
                dependsOnFieldIds: ["MISSING"],
                invalidatesFieldIds: [],
                selectionPolicy: "SELECTABLE",
              },
            },
          },
        ],
      }),
    ],
    [
      "sequence references missing field",
      "PAGE_SEQUENCE_FIELD_NOT_FOUND",
      (base) => ({
        ...base,
        sequences: [{ ...base.sequences[0]!, fieldIds: ["MISSING"] }],
      }),
    ],
    [
      "duplicate sequences",
      "DUPLICATE_PAGE_SEQUENCE",
      (base) => ({
        ...base,
        sequences: [base.sequences[0]!, base.sequences[0]!],
      }),
    ],
    [
      "field references missing sequence",
      "PAGE_FIELD_SEQUENCE_NOT_FOUND",
      (base) => ({
        ...base,
        fields: [{ ...base.fields[0]!, sequenceId: "MISSING" }],
      }),
    ],
    [
      "invalid evidence hash",
      "PAGE_EVIDENCE_SHA256_INVALID",
      (base) => ({
        ...base,
        evidence: [{ ...base.evidence[0]!, artifactSha256: "bad" }],
      }),
    ],
    [
      "duplicate evidence",
      "DUPLICATE_PAGE_EVIDENCE",
      (base) => ({ ...base, evidence: [base.evidence[0]!, base.evidence[0]!] }),
    ],
    [
      "rule references missing field",
      "PAGE_RULE_FIELD_NOT_FOUND",
      (base) => ({
        ...base,
        validationRules: [
          { ...base.validationRules[0]!, appliesToFieldIds: ["MISSING"] },
        ],
      }),
    ],
    [
      "rule references missing evidence",
      "PAGE_RULE_EVIDENCE_NOT_FOUND",
      (base) => ({
        ...base,
        validationRules: [
          { ...base.validationRules[0]!, evidenceIds: ["MISSING"] },
        ],
      }),
    ],
    [
      "duplicate rules",
      "DUPLICATE_PAGE_RULE",
      (base) => ({
        ...base,
        validationRules: [base.validationRules[0]!, base.validationRules[0]!],
      }),
    ],
    [
      "duplicate scenarios",
      "DUPLICATE_PAGE_SCENARIO",
      (base) => ({
        ...base,
        scenarios: [base.scenarios[0]!, base.scenarios[0]!],
      }),
    ],
    [
      "profile references missing scenario",
      "PAGE_PROFILE_SCENARIO_NOT_FOUND",
      (base) => ({
        ...base,
        scenarios: [{ ...base.scenarios[0]!, scenarioId: "MISSING" }],
      }),
    ],
    [
      "invalid fixture hash",
      "PAGE_FIXTURE_SHA256_INVALID",
      (base) => ({
        ...base,
        scenarios: [
          {
            ...base.scenarios[0]!,
            fixture: { ...base.scenarios[0]!.fixture, sourceSha256: "bad" },
          },
        ],
      }),
    ],
    [
      "invalid endpoint",
      "PAGE_EXECUTION_REGISTRY_MISMATCH",
      (base) => ({
        ...base,
        scenarios: [
          {
            ...base.scenarios[0]!,
            execution: {
              ...base.scenarios[0]!.execution,
              endpoint: "relative",
            },
          },
        ],
      }),
    ],
    [
      "empty expected HTTP statuses",
      "PAGE_EXECUTION_HTTP_REQUIRED",
      (base) => ({
        ...base,
        scenarios: [
          {
            ...base.scenarios[0]!,
            execution: { ...base.scenarios[0]!.execution, expectedHttp: [] },
          },
        ],
      }),
    ],
    [
      "invalid expected HTTP status",
      "PAGE_EXECUTION_HTTP_INVALID",
      (base) => ({
        ...base,
        scenarios: [
          {
            ...base.scenarios[0]!,
            execution: { ...base.scenarios[0]!.execution, expectedHttp: [700] },
          },
        ],
      }),
    ],
    [
      "scenario references missing sequence",
      "PAGE_SCENARIO_SEQUENCE_NOT_FOUND",
      (base) => ({
        ...base,
        scenarios: [{ ...base.scenarios[0]!, sequenceIds: ["MISSING"] }],
      }),
    ],
    [
      "scenario references missing field",
      "PAGE_SCENARIO_FIELD_NOT_FOUND",
      (base) => ({
        ...base,
        scenarios: [{ ...base.scenarios[0]!, fieldIds: ["MISSING"] }],
      }),
    ],
    [
      "scenario policy references missing field",
      "PAGE_SCENARIO_FIELD_POLICY_NOT_FOUND",
      (base) => ({
        ...base,
        scenarios: [
          {
            ...base.scenarios[0]!,
            fieldPolicies: [
              {
                fieldId: "MISSING",
                applicability: "APPLICABLE",
                inputOwnership: "TRANSACTION_USER",
                visibility: "USER_INPUT",
                processingPolicy: "APPLY",
                required: true,
                readOnly: false,
              },
            ],
          },
        ],
      }),
    ],
    [
      "not-applicable policy with processing effect",
      "PAGE_NOT_APPLICABLE_POLICY_INVALID",
      (base) => ({
        ...base,
        scenarios: [
          {
            ...base.scenarios[0]!,
            fieldPolicies: [
              {
                fieldId: base.fields[0]!.fieldId,
                applicability: "NOT_APPLICABLE",
                inputOwnership: "SSI_DERIVED",
                visibility: "HIDDEN_EVIDENCE",
                processingPolicy: "APPLY",
                required: false,
                readOnly: true,
              },
            ],
          },
        ],
      }),
    ],
    [
      "editable SSI-derived policy",
      "PAGE_SSI_DERIVED_POLICY_INVALID",
      (base) => ({
        ...base,
        scenarios: [
          {
            ...base.scenarios[0]!,
            fieldPolicies: [
              {
                fieldId: base.fields[0]!.fieldId,
                applicability: "APPLICABLE",
                inputOwnership: "SSI_DERIVED",
                visibility: "USER_INPUT",
                processingPolicy: "APPLY",
                required: false,
                readOnly: false,
              },
            ],
          },
        ],
      }),
    ],
    [
      "scenario references missing rule",
      "PAGE_SCENARIO_RULE_NOT_FOUND",
      (base) => ({
        ...base,
        scenarios: [{ ...base.scenarios[0]!, validationRuleIds: ["MISSING"] }],
      }),
    ],
    [
      "fixture isolation mismatches polarity",
      "PAGE_SCENARIO_FIXTURE_ISOLATION_MISMATCH",
      (base) => ({
        ...base,
        scenarios: [
          {
            ...base.scenarios[0]!,
            fixture: {
              ...base.scenarios[0]!.fixture,
              isolation: "TRANSACTIONAL_NEGATIVE",
            },
          },
        ],
      }),
    ],
    [
      "execution action mismatches owner",
      "PAGE_EXECUTION_REGISTRY_MISMATCH",
      (base) => ({
        ...base,
        validationRules: [
          { ...base.validationRules[0]!, owner: "UPSTREAM_FIN_VALIDATOR" },
        ],
        scenarios: [
          {
            ...base.scenarios[0]!,
            execution: {
              ...base.scenarios[0]!.execution,
              action: "PREVIEW_REFERENCE",
              owner: "UPSTREAM_FIN_VALIDATOR",
            },
          },
        ],
      }),
    ],
  ])("fails closed for %s", (_name, cause, mutate) => {
    const service = create({ find: () => [mutate(definition())] });

    expect(configurationFailure(service)["cause"]).toBe(cause);
  });

  it.each([
    [
      "missing BizSvc",
      { businessService: undefined },
      query,
      "PAGE_PROFILE_BIZSVC_REQUIRED",
    ],
    [
      "missing MsgDefIdr",
      { messageDefinitionId: undefined },
      { ...query, businessService: "swift.cbprplus.04" },
      "PAGE_PROFILE_MESSAGE_DEFINITION_REQUIRED",
    ],
    [
      "missing selection context",
      {},
      { ...query, businessScenarioId: undefined, businessService: undefined },
      "PAGE_PROFILE_BIZSVC_MISMATCH",
    ],
  ])(
    "fails closed for MT-to-MX profile with %s",
    (_name, profileOverrides, request, cause) => {
      const base = definition();
      const payment = definition({
        profile: {
          profileId: "PACS009-PLAIN",
          profileKind: "MT_TO_MX",
          businessService: "swift.cbprplus.04",
          messageDefinitionId: "pacs.009.001.08",
          paymentExecutable: true,
          selectionBasis: {
            businessScenarioId: "SCN-X-Q9-001",
            businessService: "swift.cbprplus.04",
          },
          ...profileOverrides,
        } as unknown as ResolutionPageDefinition["profile"],
        scenarios: [base.scenarios[0]!],
      });
      const service = create({ find: () => [payment] });

      expect(
        configurationFailure(
          service,
          request as unknown as ResolutionPageDefinitionQuery,
        )["cause"],
      ).toBe(cause);
    },
  );

  it("uses NODE_ENV and the production fallback when no environment is injected", () => {
    const original = process.env["NODE_ENV"];
    process.env["NODE_ENV"] = "demo";
    expect(
      new PageParameterEnvironmentPolicy().configurationErrorStatus(),
    ).toBe(409);
    delete process.env["NODE_ENV"];
    expect(
      new PageParameterEnvironmentPolicy().configurationErrorStatus(),
    ).toBe(500);
    if (original === undefined) delete process.env["NODE_ENV"];
    else process.env["NODE_ENV"] = original;
  });

  it("normalizes an invalid non-Error source failure", () => {
    const malformed = {
      get schemaVersion(): never {
        throw "raw-source-failure";
      },
    } as unknown as ResolutionPageDefinition;
    const service = create({ find: () => [malformed] });

    expect(configurationFailure(service)["cause"]).toBe(
      "PAGE_DEFINITION_INVALID",
    );
  });

  it("rejects an invalid direction at the request boundary", () => {
    const service = create({ find: () => [definition()] });
    const invalid = {
      ...query,
      direction: "SIDEWAYS",
    } as unknown as ResolutionPageDefinitionQuery;

    expect(() => service.get(invalid)).toThrow(BadRequestException);
  });
});
