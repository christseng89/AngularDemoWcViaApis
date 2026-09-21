import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  PageParameterPolarity,
  ResolutionPageDefinition,
  ResolutionPageScenario,
} from "@ssi/contracts";
import { PaymentResolutionPageDefinitionSource } from "../../../app/page-parameters/payment-resolution-page-definition.source";

const MESSAGE_TYPES = ["MT202", "MT202COV", "MT205", "MT205COV"] as const;
const EXCLUDED_MESSAGE_TYPES = [
  "MT200",
  "MT201",
  "MT203",
  "MT204",
  "MT210",
] as const;
const POLARITY_ORDER: Readonly<Record<PageParameterPolarity, number>> = {
  POSITIVE: 0,
  NEGATIVE: 1,
  BOUNDARY: 2,
};
const SR2026_NETWORK_RULE_EVIDENCE = {
  MT202: {
    mrgRules: ["C81"],
    mrgPage: 40,
    contingencyPages: [14, 15],
  },
  MT202COV: {
    mrgRules: ["C81", "C68"],
    mrgPage: 61,
    contingencyPages: [16, 17, 18, 19],
  },
  MT205: {
    mrgRules: ["C81"],
    mrgPage: 135,
    contingencyPages: [19, 20],
  },
  MT205COV: {
    mrgRules: ["C81", "C68"],
    mrgPage: 155,
    contingencyPages: [20, 21, 22, 23],
  },
} as const;
const SR2026_MRG_ARTIFACT = "SWIFT/us2m_20260717.pdf";
const SR2026_MRG_SHA256 =
  "64483d7f7c094db28e03791ab6bbc7a0522daec90487a7dd834228e848fa8323";
const SR2026_CONTINGENCY_NVR_ARTIFACT =
  "SWIFT/SR2026_Contingency_Processing_Network_Validated_Rules_20260717_v1_0.pdf";
const SR2026_CONTINGENCY_NVR_SHA256 =
  "bde3874d324c218c88f11f9116e089684106093144e3e143890bad7368d5dbcb";

const definitions = (): readonly ResolutionPageDefinition[] =>
  new PaymentResolutionPageDefinitionSource().all("SR2026");

describe("controlled Payment definition options", () => {
  it("governs actual MT205 onward predecessor as optional hidden provenance only", () => {
    const definition = definitions().find(({ messageType }) => messageType === "MT205")!;
    const field = definition.fields.find(({ fieldId }) => fieldId === "context.previousMessageType");
    expect(field).toMatchObject({
      required: false,
      visibility: "HIDDEN_EVIDENCE",
      options: [
        { value: "MT202", label: "MT202" },
        { value: "MT203", label: "MT203" },
        { value: "MT205", label: "MT205" },
      ],
    });
    expect(field?.defaultValue).toBeUndefined();
    const onward = definition.scenarios.find(({ scenarioId }) => scenarioId === "MT205-OP-STANDARD-DOMESTIC-ONWARD")!;
    expect(onward.inputValues?.["context.previousMessageType"]).toBeUndefined();
    expect(onward.fieldPolicies?.find(({ fieldId }) => fieldId === field?.fieldId)).toMatchObject({
      inputOwnership: "TRANSACTION_CONTEXT",
      visibility: "HIDDEN_EVIDENCE",
      processingPolicy: "APPLY",
      required: false,
    });
  });
  it("uses coverage and Entity reference instead of runtime SSI candidate options", () => {
    const oldOptions = jest.fn(() => { throw new Error("RUNTIME_SSI_QUERY_FORBIDDEN"); });
    const source = new PaymentResolutionPageDefinitionSource(
      undefined,
      { options: oldOptions } as never,
      undefined,
      { payment: () => ({
        currencies: ["EUR", "USD"],
        bookingEntities: [{ value: "HK01", label: "HK01 — Hong Kong Branch" }],
        defaultCurrency: "USD", defaultBookingEntity: "HK01",
      }) } as never,
    );
    const definition = source.all("SR2026")[0]!;
    expect(definition.fields.find(({ fieldId }) => fieldId === "context.currency")?.options)
      .toEqual([{ value: "EUR", label: "EUR" }, { value: "USD", label: "USD" }]);
    expect(definition.fields.find(({ fieldId }) => fieldId === "context.currency")?.optionSource?.source)
      .toBe("RESOLUTION_CURRENCY_COVERAGE");
    expect(definition.fields.find(({ fieldId }) => fieldId === "context.bookingEntity")?.options)
      .toEqual([{ value: "HK01", label: "HK01 — Hong Kong Branch" }]);
    expect(definition.fields.find(({ fieldId }) => fieldId === "context.bookingEntity")?.optionSource?.source)
      .toBe("CONTROLLED_ENTITY_REFERENCE");
    expect(oldOptions).not.toHaveBeenCalled();
  });
});

const scenarioSortKey = (
  scenario: ResolutionPageScenario,
): readonly [number, string] => [
  POLARITY_ORDER[scenario.polarity],
  scenario.label,
];

const compareScenario = (
  left: ResolutionPageScenario,
  right: ResolutionPageScenario,
): number => {
  const [leftPolarity, leftDescription] = scenarioSortKey(left);
  const [rightPolarity, rightDescription] = scenarioSortKey(right);
  return (
    leftPolarity - rightPolarity ||
    leftDescription.localeCompare(rightDescription)
  );
};

const semanticSignature = (scenario: ResolutionPageScenario): string =>
  JSON.stringify({
    label: scenario.label,
    polarity: scenario.polarity,
    audience: scenario.audience,
    flowKind: scenario.flowKind,
    sequenceIds: [...scenario.sequenceIds].sort(),
    fieldPolicies: [...(scenario.fieldPolicies ?? [])]
      .map(
        ({
          fieldId,
          applicability,
          inputOwnership,
          visibility,
          processingPolicy,
          required,
          readOnly,
        }) => ({
          fieldId,
          applicability,
          inputOwnership,
          visibility,
          processingPolicy,
          required,
          readOnly,
        }),
      )
      .sort((left, right) => left.fieldId.localeCompare(right.fieldId)),
    validationRuleIds: [...scenario.validationRuleIds].sort(),
    inputValues: scenario.inputValues ?? {},
    execution: scenario.execution,
  });

const paymentDefinition = (
  messageType: (typeof MESSAGE_TYPES)[number],
): ResolutionPageDefinition => {
  const definition = definitions().find(
    (candidate) => candidate.messageType === messageType,
  );
  if (!definition) throw new Error(`Missing ${messageType} definition`);
  return definition;
};

const artifactSha256 = (relativePath: string): string =>
  createHash("sha256")
    .update(readFileSync(join(process.cwd(), relativePath)))
    .digest("hex");

describe("PaymentResolutionPageDefinitionSource", () => {
  it("exposes governed coverage profiles without constructing SSI-derived definitions", () => {
    const options = {
      options: jest.fn(() => {
        throw new Error("SSI_QUERY_CALLED");
      }),
    };
    const source = new PaymentResolutionPageDefinitionSource(
      undefined,
      options as never,
    );
    expect(source.coverageProfiles()).toEqual([
      { messageType: "MT202", businessService: "swift.cbprplus.04" },
      { messageType: "MT202COV", businessService: "swift.cbprplus.cov.04" },
      { messageType: "MT205", businessService: "swift.cbprplus.04" },
      { messageType: "MT205COV", businessService: "swift.cbprplus.cov.04" },
    ]);
    expect(options.options).not.toHaveBeenCalled();
  });
  it("publishes exactly the four executable MT2/pacs.009 messages", () => {
    const published = definitions();

    expect(published.map(({ messageType }) => messageType).sort()).toEqual(
      [...MESSAGE_TYPES].sort(),
    );
    expect(published).toHaveLength(MESSAGE_TYPES.length);
    expect(
      published.every(
        ({ businessDomain, messageFamily, direction }) =>
          businessDomain === "PAYMENT" &&
          messageFamily === "MT2_PACS009" &&
          direction === "OUTGOING",
      ),
    ).toBe(true);
  });

  it.each([
    ["MT202", "swift.cbprplus.04"],
    ["MT202COV", "swift.cbprplus.cov.04"],
    ["MT205", "swift.cbprplus.04"],
    ["MT205COV", "swift.cbprplus.cov.04"],
  ] as const)(
    "binds %s to pacs.009.001.08 and the exact governed BizSvc",
    (messageType, businessService) => {
      const definition = definitions().find(
        (candidate) => candidate.messageType === messageType,
      );

      expect(definition?.profile).toMatchObject({
        profileKind: "MT_TO_MX",
        paymentExecutable: true,
        messageDefinitionId: "pacs.009.001.08",
        businessService,
        selectionBasis: { businessService },
      });
      expect(
        new PaymentResolutionPageDefinitionSource().find({
          standardsRelease: "SR2026",
          messageFamily: "MT2_PACS009",
          messageType,
          direction: "OUTGOING",
          businessDomain: "PAYMENT",
          businessScenarioId:
            definition?.profile.selectionBasis.businessScenarioId,
          businessService,
        }),
      ).toEqual([definition]);
    },
  );

  it.each(MESSAGE_TYPES)(
    "publishes separate Operational and QA-only scenarios for %s",
    (messageType) => {
      const scenarios = definitions().find(
        (definition) => definition.messageType === messageType,
      )?.scenarios;

      expect(
        scenarios?.some(({ audience }) => audience === "OPERATIONAL"),
      ).toBe(true);
      expect(
        scenarios?.some(({ audience }) => audience === "QA_TEST_ONLY"),
      ).toBe(true);
      expect(
        scenarios
          ?.filter(({ audience }) => audience === "OPERATIONAL")
          .every(({ polarity }) => polarity === "POSITIVE"),
      ).toBe(true);
      expect(
        scenarios
          ?.filter(({ polarity }) => polarity !== "POSITIVE")
          .every(({ audience }) => audience === "QA_TEST_ONLY"),
      ).toBe(true);
    },
  );

  it("orders scenarios by Positive=0, Negative=1, Boundary=2, then description", () => {
    for (const definition of definitions()) {
      expect(definition.scenarios).toEqual(
        [...definition.scenarios].sort(compareScenario),
      );
    }
  });

  it("places transaction inputs before SSI-derived outputs", () => {
    for (const definition of definitions()) {
      const displayOrder = new Map(
        definition.fields.map((field) => [field.fieldId, field.displayOrder]),
      );
      for (const scenario of definition.scenarios) {
        const userInputOrders = (scenario.fieldPolicies ?? [])
          .filter(
            ({ applicability, inputOwnership, visibility }) =>
              applicability === "APPLICABLE" &&
              inputOwnership === "TRANSACTION_USER" &&
              visibility === "USER_INPUT",
          )
          .map(({ fieldId }) => displayOrder.get(fieldId));
        const derivedOrders = (scenario.fieldPolicies ?? [])
          .filter(
            ({ applicability, inputOwnership }) =>
              applicability === "APPLICABLE" &&
              inputOwnership === "SSI_DERIVED",
          )
          .map(({ fieldId }) => displayOrder.get(fieldId));

        expect(userInputOrders.length).toBeGreaterThan(0);
        expect(userInputOrders.every(Number.isFinite)).toBe(true);
        expect(derivedOrders.every(Number.isFinite)).toBe(true);
        if (derivedOrders.length > 0)
          expect(Math.max(...(userInputOrders as number[]))).toBeLessThan(
            Math.min(...(derivedOrders as number[])),
          );
      }
    }
  });

  it("classifies institutional settlement fields as SSI-derived and cover Sequence B as fixed context", () => {
    for (const definition of definitions()) {
      const byId = new Map(
        definition.fields.map((field) => [field.fieldId, field]),
      );
      for (const scenario of definition.scenarios) {
        for (const policy of scenario.fieldPolicies ?? []) {
          const field = byId.get(policy.fieldId);
          if (field?.section !== "SETTLEMENT_INSTRUCTIONS") continue;
          expect(policy.inputOwnership).toBe(
            field.sequenceId === "B" ? "SCENARIO_FIXED" : "SSI_DERIVED",
          );
          expect(policy.visibility).toBe("HIDDEN_EVIDENCE");
          expect(policy.readOnly).toBe(true);
        }
      }
    }
  });

  it("publishes SWIFT sequence, tag and option metadata for settlement fields", () => {
    for (const definition of definitions()) {
      const sequences = new Map(
        definition.sequences.map((sequence) => [sequence.sequenceId, sequence]),
      );
      const settlementFields = definition.fields.filter(
        ({ section }) => section === "SETTLEMENT_INSTRUCTIONS",
      );

      expect(settlementFields.length).toBeGreaterThan(0);
      for (const field of settlementFields) {
        expect(field.sequenceId).toEqual(expect.any(String));
        expect(field.swiftTag).toMatch(/^5\d$/);
        expect(field.swiftOption).toMatch(/^(?:A|B|C|D|F|K|NONE)$/);
        expect(field.officialRole).toEqual(expect.any(String));
        expect(sequences.get(field.sequenceId!)?.fieldIds).toContain(
          field.fieldId,
        );
      }
    }
  });

  it.each(["MT202COV", "MT205COV"] as const)(
    "publishes complete immutable Sequence B cover context for %s",
    (messageType) => {
      const definition = paymentDefinition(messageType);
      const sequenceB = definition.sequences.find(
        ({ sequenceId }) => sequenceId === "B",
      );
      const fields = definition.fields.filter(
        ({ sequenceId }) => sequenceId === "B",
      );
      const tags = new Set(fields.map(({ swiftTag }) => swiftTag));
      const optionsFor = (tag: string) =>
        fields
          .filter((field) => field.swiftTag === tag)
          .map(({ swiftOption }) => swiftOption)
          .sort();

      expect(sequenceB).toBeDefined();
      for (const tag of ["50", "59"]) expect(tags).toContain(tag);
      expect(optionsFor("50")).toEqual(["A", "F", "K"]);
      expect(optionsFor("52")).toEqual(["A", "D"]);
      expect(optionsFor("56")).toEqual(["A", "D"]);
      expect(optionsFor("57")).toEqual(["A", "D"]);
      expect(optionsFor("59")).toEqual(["A", "F", "NONE"]);
      expect(fields.every(({ readOnly }) => readOnly === true)).toBe(true);
      for (const scenario of definition.scenarios) {
        const policies = new Map(
          (scenario.fieldPolicies ?? []).map((policy) => [
            policy.fieldId,
            policy,
          ]),
        );
        for (const field of fields)
          expect(policies.get(field.fieldId)).toMatchObject({
            readOnly: true,
            inputOwnership: "SCENARIO_FIXED",
          });
      }
    },
  );

  it.each(["MT202COV", "MT205COV"] as const)(
    "keeps governed COV identity while deriving 32A from typed SSI transaction context for %s",
    (messageType) => {
      const definition = paymentDefinition(messageType);
      const field = (tag: string, option?: string) =>
        definition.fields.find(
          (candidate) =>
            candidate.swiftTag === tag &&
            (option === undefined || candidate.swiftOption === option),
        );

      expect(field("21")).toMatchObject({ required: true });
      expect(field("32", "A")).toBeUndefined();
      expect(field("119")).toMatchObject({
        required: true,
        readOnly: true,
        defaultValue: "COV",
      });
      expect(field("121")).toMatchObject({
        required: true,
        readOnly: true,
      });
      expect(field("121")?.label).toMatch(/UETR/i);
    },
  );

  it.each(["MT202COV", "MT205COV"] as const)(
    "publishes complete scenario-fixed COV input context for %s",
    (messageType) => {
      const definition = paymentDefinition(messageType);
      const requiredFixedFieldIds = [
        "context.swift21NONE",
        "context.swift119NONE",
        "context.swift121NONE",
        "context.sequenceB50A",
        "context.sequenceB59",
        ...(messageType === "MT205COV"
          ? [
              "context.previousMessageType",
              "context.previousMessage20",
              "context.previousMessage21",
              "context.previousMessage121",
              "context.previousMessageA52",
              "context.previousMessageA58",
              "context.previousMessageSequenceB50A",
              "context.previousMessageSequenceB59",
              "context.previousMessageArtifactSha256",
              "context.previousMessageArtifactVersion",
            ]
          : []),
      ];

      for (const scenario of definition.scenarios) {
        const policies = new Map(
          (scenario.fieldPolicies ?? []).map((policy) => [
            policy.fieldId,
            policy,
          ]),
        );
        for (const fieldId of requiredFixedFieldIds) {
          expect(scenario.inputValues?.[fieldId]).toEqual(expect.any(String));
          expect(String(scenario.inputValues?.[fieldId]).trim()).not.toBe("");
          expect(policies.get(fieldId)).toMatchObject({
            inputOwnership: "SCENARIO_FIXED",
            visibility: "HIDDEN_EVIDENCE",
            readOnly: true,
          });
        }
      }
    },
  );

  it.each(["MT205", "MT205COV"] as const)(
    "does not publish tag 54 for %s",
    (messageType) => {
      expect(
        paymentDefinition(messageType).fields.some(
          ({ swiftTag }) => swiftTag === "54",
        ),
      ).toBe(false);
    },
  );

  it("models MT205 standard domestic onward separately from one combined MT200/201 equivalence scenario", () => {
    const operational = paymentDefinition("MT205").scenarios.filter(
      ({ audience }) => audience === "OPERATIONAL",
    );
    const equivalence = operational.filter(({ scenarioId, label }) => {
      const identity = `${scenarioId} ${label}`;
      return /MT200.*MT201.*equivalence/i.test(identity);
    });

    expect(equivalence).toHaveLength(1);
    expect(
      operational.filter(({ scenarioId, label }) =>
        /standard.*domestic.*onward/i.test(`${scenarioId} ${label}`),
      ),
    ).toHaveLength(1);
    expect(operational).toHaveLength(2);
  });

  it.each(MESSAGE_TYPES)(
    "keeps evidenced SSI-tag NVRs owned by the SSI resolver for %s",
    (messageType) => {
      const definition = paymentDefinition(messageType);
      const { mrgRules, mrgPage, contingencyPages } =
        SR2026_NETWORK_RULE_EVIDENCE[messageType];
      const evidenceFor = (artifactId: string) =>
        definition.evidence.find(
          (evidence) => evidence.artifactId === artifactId,
        );
      const mrgEvidence = evidenceFor(SR2026_MRG_ARTIFACT);
      const contingencyEvidence = evidenceFor(SR2026_CONTINGENCY_NVR_ARTIFACT);

      expect(mrgEvidence).toMatchObject({
        classification: "NORMATIVE_RULE",
      });
      expect(mrgEvidence?.artifactSha256.toLowerCase()).toBe(SR2026_MRG_SHA256);
      expect(mrgEvidence?.pages).toContain(mrgPage);
      expect(contingencyEvidence).toMatchObject({
        classification: "NORMATIVE_RULE",
      });
      expect(contingencyEvidence?.artifactSha256.toLowerCase()).toBe(
        SR2026_CONTINGENCY_NVR_SHA256,
      );
      expect(contingencyEvidence?.pages).toEqual(
        expect.arrayContaining(contingencyPages),
      );

      for (const code of mrgRules) {
        const rule = definition.validationRules.find(
          ({ ruleId, reasonCode }) =>
            ruleId.includes(code) || reasonCode.includes(code),
        );
        expect(rule).toMatchObject({
          taxonomy: "NETWORK_VALIDATED_RULE",
          owner: "SSI_FIELD_RESOLUTION_API",
          validationScope: "IN_SCOPE_SSI_TAG_NVR",
        });
        expect(rule?.evidenceIds).toContain(mrgEvidence?.evidenceId);
      }

      if (messageType.endsWith("COV")) {
        const sequenceBOptionC = definition.fields
          .filter(
            ({ sequenceId, swiftTag, swiftOption }) =>
              sequenceId === "B" &&
              ["56", "57"].includes(swiftTag ?? "") &&
              swiftOption === "C",
          )
          .map(({ fieldId }) => fieldId)
          .sort();
        const t13Fields = definition.validationRules
          .filter(
            ({ reasonCode, evidenceIds }) =>
              reasonCode.includes("T13") &&
              evidenceIds.includes(contingencyEvidence?.evidenceId ?? ""),
          )
          .flatMap(({ appliesToFieldIds }) => appliesToFieldIds)
          .sort();

        expect(sequenceBOptionC).toHaveLength(0);
        expect(t13Fields).toHaveLength(0);
      }

      expect(
        definition.scenarios.every(
          ({ validation }) =>
            validation.owner === "SSI_FIELD_RESOLUTION_API" &&
            validation.taxonomy === "NETWORK_VALIDATED_RULE" &&
            validation.nvrOutcome !== "NOT_EVALUATED",
        ),
      ).toBe(true);
    },
  );

  it("executes retained SSI boundary regressions through the SSI resolver", () => {
    const boundaries = definitions().flatMap(({ scenarios }) =>
      scenarios.filter(({ polarity }) => polarity === "BOUNDARY"),
    );

    expect(boundaries).toHaveLength(MESSAGE_TYPES.length);
    for (const scenario of boundaries) {
      expect(scenario.validation).toMatchObject({
        owner: "SSI_FIELD_RESOLUTION_API",
        taxonomy: "NETWORK_VALIDATED_RULE",
        nvrOutcome: "PASS",
      });
      expect(scenario.execution).toMatchObject({
        action: "RESOLVE_SSI",
        owner: "SSI_FIELD_RESOLUTION_API",
        method: "POST",
      });
      expect(scenario.execution.expectedHttp.length).toBeGreaterThan(0);
    }
  });

  it("uses stable Bank Service identity for counterparties instead of declaring the ID as a BIC", () => {
    for (const definition of definitions()) {
      const counterparty = definition.fields.find(
        ({ fieldId }) => fieldId === "context.counterpartyBankServiceId",
      );

      expect(counterparty).toMatchObject({
        dataType: "STRING",
        lookup: {
          provider: "SSI_COUNTERPARTY",
          valueField: "bankServiceId",
          displayField: "bic",
          validationField: "bic",
        },
      });
      expect(counterparty?.dataType).not.toBe("SWIFT_BIC");
    }
  });

  it("declares every governed input that invalidates the counterparty selection", () => {
    for (const definition of definitions()) {
      const counterparty = definition.fields.find(
        ({ fieldId }) => fieldId === "context.counterpartyBankServiceId",
      );

      expect(counterparty?.lookup?.dependency).toEqual({
        dependsOnFieldIds: [
          "context.currency",
          "context.bookingEntity",
          "context.valueDate",
        ],
        invalidatesFieldIds: [],
        selectionPolicy: "SELECTABLE",
      });
    }
  });

  it("materializes Currency and Booking Entity select options from governed Payment applicability", () => {
    const governedOptions = {
      options: jest.fn(() => ({
        currencies: ["EUR", "GBP"],
        bookingEntities: ["HK01"],
      })),
    };
    const definition = new PaymentResolutionPageDefinitionSource(
      undefined,
      governedOptions as never,
    ).find({
      standardsRelease: "SR2026",
      messageFamily: "MT2_PACS009",
      messageType: "MT202",
      direction: "OUTGOING",
      businessDomain: "PAYMENT",
    })[0]!;

    expect(governedOptions.options).toHaveBeenCalledWith(
      "MT202",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
    expect(
      definition.fields.find(({ fieldId }) => fieldId === "context.currency")
        ?.options,
    ).toEqual([
      { value: "EUR", label: "EUR" },
      { value: "GBP", label: "GBP" },
    ]);
    expect(
      definition.fields.find(
        ({ fieldId }) => fieldId === "context.bookingEntity",
      )?.options,
    ).toEqual([{ value: "HK01", label: "HK01" }]);
  });

  it("reads a scenario policy without materializing data-driven screen options", () => {
    const governedOptions = { options: jest.fn() };
    const source = new PaymentResolutionPageDefinitionSource(
      undefined,
      governedOptions as never,
    );

    expect(source.scenarioPolicy("MT202", "MT202-OP-BOOK")).toEqual({
      messageType: "MT202",
      scenarioId: "MT202-OP-BOOK",
      sequenceIds: ["A"],
      polarity: "POSITIVE",
      expectedHttp: [200],
    });
    expect(
      source.scenarioPolicy("MT202COV", "MT202COV-OP-STANDARD"),
    ).toMatchObject({ sequenceIds: ["A", "B"] });
    expect(source.scenarioPolicy("MT202", "UNKNOWN")).toBeUndefined();
    expect(source.scenarioPolicy("UNKNOWN", "UNKNOWN")).toBeUndefined();
    expect(governedOptions.options).not.toHaveBeenCalled();
  });

  it("publishes MT347-compatible governed defaults and field placement", () => {
    const governedOptions = {
      options: () => ({
        currencies: ["EUR", "USD"],
        bookingEntities: ["HK01"],
        defaultCurrency: "EUR",
        defaultBookingEntity: "HK01",
      }),
    };
    const businessDates = {
      firstAvailableDate: jest.fn(() => "2026-09-15"),
      metadata: jest.fn(() => ({
        timeZone: "Asia/Hong_Kong",
        calendarMode: "WEEKDAY_FALLBACK",
        calendarCode: "WEEKDAY_ONLY",
        holidayIntegrationStatus: "NOT_EVALUATED",
        sourceContract: {
          method: "POST",
          path: "/business-days/add",
          endpointEnvironmentVariable: "BUSINESS_DAYS_SERVICE_ENDPOINT",
        },
      })),
    };
    const definition = new PaymentResolutionPageDefinitionSource(
      undefined,
      governedOptions as never,
      businessDates as never,
    ).all("SR2026")[0]!;
    const field = (fieldId: string) =>
      definition.fields.find((candidate) => candidate.fieldId === fieldId);

    expect(field("context.transactionReference")).toMatchObject({
      defaultValue: "MT2-DEMO-REFERENCE",
      columnSpan: 2,
    });
    expect(field("context.currency")?.defaultValue).toBe("EUR");
    expect(field("context.bookingEntity")?.defaultValue).toBe("HK01");
    expect(field("context.valueDate")).toMatchObject({
      defaultValue: "2026-09-15",
      businessDate: expect.objectContaining({ timeZone: "Asia/Hong_Kong" }),
    });
    expect(field("context.amount")).toMatchObject({
      defaultValue: "1000.00",
      displayOrder: 50,
      columnSpan: 2,
    });
    expect(field("context.counterpartyBankServiceId")).toMatchObject({
      displayOrder: 45,
      columnSpan: 1,
    });
  });

  it.each(["MT202-OP-BOOK", "MT202-OP-CREDIT-57A"])(
    "exposes one Receiver route input and derives own accounts for %s",
    (scenarioId) => {
      const definition = paymentDefinition("MT202");
      const scenario = definition.scenarios.find(
        (candidate) => candidate.scenarioId === scenarioId,
      )!;
      const policies = new Map(
        (scenario.fieldPolicies ?? []).map((policy) => [
          policy.fieldId,
          policy,
        ]),
      );
      const expected = [
        "context.receiverBankServiceId",
        "context.ownDebitAccountId",
        "context.ownDebitAccountVersion",
        "context.ownCreditAccountId",
        "context.ownCreditAccountVersion",
      ];

      for (const fieldId of expected) {
        expect(scenario.fieldIds).toContain(fieldId);
      }
      expect(policies.get("context.receiverBankServiceId")).toMatchObject({
        applicability: "APPLICABLE",
        inputOwnership: "TRANSACTION_USER",
        visibility: "USER_INPUT",
        processingPolicy: "APPLY",
        required: true,
      });
      for (const fieldId of [
        "context.ownDebitAccountId",
        "context.ownDebitAccountVersion",
        "context.ownCreditAccountId",
        "context.ownCreditAccountVersion",
      ]) {
        expect(policies.get(fieldId)).toMatchObject({
          applicability: "APPLICABLE",
          inputOwnership: "SSI_DERIVED",
          visibility: "HIDDEN_EVIDENCE",
          processingPolicy: "APPLY",
          required: false,
          readOnly: true,
        });
      }
      expect(
        definition.fields.find(
          ({ fieldId }) => fieldId === "context.receiverBankServiceId",
        ),
      ).toMatchObject({
        label: "Counterparty Bank (Receiver Bank)",
        control: "SELECT",
        lookup: {
          provider: "BANK_SERVICE",
          valueField: "bankServiceId",
          buttonLabel: "Select Counterparty Bank",
          dependency: {
            dependsOnFieldIds: [
              "context.currency",
              "context.bookingEntity",
              "context.valueDate",
            ],
          },
        },
      });
    },
  );

  it("keeps own-account controls inapplicable for ordinary MT202 SSI resolution", () => {
    const definition = paymentDefinition("MT202");
    const scenario = definition.scenarios.find(
      ({ scenarioId }) => scenarioId === "MT202-OP-DIRECT",
    )!;
    const ownAccountPolicies = (scenario.fieldPolicies ?? []).filter(
      ({ fieldId }) =>
        fieldId.includes("ownDebitAccount") ||
        fieldId.includes("ownCreditAccount") ||
        fieldId === "context.receiverBankServiceId",
    );

    expect(ownAccountPolicies).toHaveLength(5);
    expect(
      ownAccountPolicies.every(
        ({ applicability, visibility, processingPolicy }) =>
          applicability === "NOT_APPLICABLE" &&
          visibility === "HIDDEN_EVIDENCE" &&
          processingPolicy === "IGNORE_AUDIT",
      ),
    ).toBe(true);
  });

  it("publishes the governed SSI-bank to Nostro-servicer relationship without UI inference", () => {
    const definition = paymentDefinition("MT202");
    expect(
      Object.fromEntries(
        definition.scenarios
          .filter(({ audience }) => audience === "OPERATIONAL")
          .map(({ scenarioId, servicerRelationship }) => [
            scenarioId,
            servicerRelationship,
          ]),
      ),
    ).toEqual({
      "MT202-OP-DIRECT": "SAME",
      "MT202-OP-BOOK": "SAME",
      "MT202-OP-CREDIT-57A": "DIFFERENT",
    });
  });

  it("governs the MT202COV standard route as same-servicer without changing the 57A distinction", () => {
    const scenarios = paymentDefinition("MT202COV").scenarios;
    expect(scenarios.find(({ scenarioId }) => scenarioId === "MT202COV-OP-STANDARD")?.servicerRelationship).toBe("SAME");
    expect(scenarios.find(({ scenarioId }) => scenarioId === "MT202COV-OP-CREDIT-57A")?.servicerRelationship).toBe("DIFFERENT");
  });

  it("keeps MT205 domestic onward Receiver rules outside SSI servicer eligibility", () => {
    const scenarios = paymentDefinition("MT205").scenarios;
    expect(scenarios.find(({ scenarioId }) => scenarioId === "MT205-OP-STANDARD-DOMESTIC-ONWARD")?.servicerRelationship).toBe("NOT_APPLICABLE");
    expect(scenarios.find(({ scenarioId }) => scenarioId === "MT205-OP-INITIAL-MT200-201-EQUIVALENCE")?.servicerRelationship).toBe("NOT_APPLICABLE");
  });

  it("keeps MT205COV onward Receiver rules outside SSI servicer eligibility", () => {
    const scenarios = paymentDefinition("MT205COV").scenarios;
    expect(scenarios.find(({ scenarioId }) => scenarioId === "MT205COV-OP-CONTINUATION")?.servicerRelationship).toBe("NOT_APPLICABLE");
  });

  it("does not hard-code USD or HK01 in the Payment definition source", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "apps/ssi-service/src/app/page-parameters/payment-resolution-page-definition.source.ts",
      ),
      "utf8",
    );

    expect(source).not.toMatch(/["']USD["']/);
    expect(source).not.toMatch(/["']HK01["']/);
  });

  it("binds each fixture SHA-256 to an existing physical source", () => {
    for (const definition of definitions()) {
      for (const scenario of definition.scenarios) {
        expect(
          existsSync(join(process.cwd(), scenario.fixture.fixtureSet)),
        ).toBe(true);
        expect(scenario.fixture.sourceSha256.toLowerCase()).toBe(
          artifactSha256(scenario.fixture.fixtureSet),
        );
      }
    }
  });

  it.each(MESSAGE_TYPES)(
    "publishes both SWIFT MRG and pacs.009 Usage Guideline evidence for %s",
    (messageType) => {
      const evidence = paymentDefinition(messageType).evidence.filter(
        ({ classification }) => classification === "NORMATIVE_RULE",
      );

      expect(
        evidence.some(({ artifactId }) =>
          /SWIFT.*MRG|MRG.*SWIFT|SWIFT\/us2m_/i.test(artifactId),
        ),
      ).toBe(true);
      expect(
        evidence.some(({ artifactId }) =>
          /pacs[._ -]?009.*(?:UG|usage|FinancialInstitutionCreditTransfer)|(?:UG|usage).*pacs[._ -]?009/i.test(
            artifactId,
          ),
        ),
      ).toBe(true);
      expect(
        evidence.every(({ artifactSha256 }) =>
          /^[a-f\d]{64}$/i.test(artifactSha256),
        ),
      ).toBe(true);
    },
  );

  it.each(EXCLUDED_MESSAGE_TYPES)(
    "fails closed without an executable definition for %s",
    (messageType) => {
      expect(
        new PaymentResolutionPageDefinitionSource().find({
          standardsRelease: "SR2026",
          messageFamily: "MT2_PACS009",
          messageType,
          direction: "OUTGOING",
          businessDomain: "PAYMENT",
        }),
      ).toEqual([]);
    },
  );

  it("fails closed when the governed source is missing or malformed", () => {
    const temporaryDirectory = join(
      process.cwd(),
      "tmp",
      "payment-page-definition-red-spec",
    );
    mkdirSync(temporaryDirectory, { recursive: true });
    const malformed = join(temporaryDirectory, "malformed.json");
    writeFileSync(malformed, '{"schemaVersion":');

    for (const cataloguePath of [
      join(temporaryDirectory, "missing.json"),
      malformed,
    ]) {
      expect(() =>
        new PaymentResolutionPageDefinitionSource({
          cataloguePath,
        } as never).all("SR2026"),
      ).toThrow(/PAYMENT_PAGE_DEFINITION_(SOURCE|CATALOGUE)_INVALID/);
    }
  });

  it("does not publish duplicated scenario identities or semantics", () => {
    const published = definitions();
    const scenarioIds = published.flatMap(({ scenarios }) =>
      scenarios.map(({ scenarioId }) => scenarioId),
    );
    const semantics = published.flatMap(({ messageType, scenarios }) =>
      scenarios.map(
        (scenario) => `${messageType}|${semanticSignature(scenario)}`,
      ),
    );

    expect(new Set(scenarioIds).size).toBe(scenarioIds.length);
    expect(new Set(semantics).size).toBe(semantics.length);
  });
});
