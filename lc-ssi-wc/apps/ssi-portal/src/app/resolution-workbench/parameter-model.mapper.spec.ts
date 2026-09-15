import type { ResolutionPageDefinition } from "@ssi/contracts";
import { mapPageDefinition } from "./parameter-model.mapper";

export const arbitraryDefinition: ResolutionPageDefinition = {
  schemaVersion: "1.0",
  definitionId: "future-definition",
  definitionVersion: "r17",
  source: {
    catalogueVersion: "future-v1",
    sourceArtifactId: "FUTURE",
    sourceSha256: "a".repeat(64),
  },
  standardsRelease: "FUTURE",
  messageFamily: "UNSEEN",
  messageType: "MSG-X",
  businessDomain: "TREASURY",
  direction: "OUTGOING",
  businessFunction: "FUTURE_FUNCTION",
  title: "Future message",
  display: {
    familyCode: "FUTURE",
    familyLabel: "Future family",
    categoryCode: "FUTURE_CATEGORY",
    categoryLabel: "Future category",
  },
  profile: {
    profileId: "PROFILE-X",
    profileKind: "FIN_REFERENCE_ONLY",
    paymentExecutable: false,
    selectionBasis: { businessScenarioId: "SCENARIO-X" },
  },
  sequences: [{ sequenceId: "Q9", label: "Q9", fieldIds: ["79Z/free text"] }],
  fields: [
    {
      fieldId: "79Z/free text",
      path: "future.value",
      label: "79Z",
      control: "TEXT",
      required: true,
      defaultValue: "API VALUE",
      displayOrder: 30,
      section: "TRANSACTION",
      visibility: "USER_INPUT",
      constraints: [],
    },
    {
      fieldId: "future-choice",
      path: "future.choice",
      label: "Future choice",
      control: "SELECT",
      required: false,
      options: [{ value: "SERVER-A", label: "Server A" }],
      displayOrder: 10,
      section: "TRANSACTION",
      visibility: "USER_INPUT",
      constraints: [],
    },
    {
      fieldId: "future-bank",
      path: "future.bankServiceId",
      label: "Future bank",
      control: "SELECT",
      dataType: "SWIFT_BIC",
      swiftTag: "57",
      swiftOption: "A",
      required: false,
      displayOrder: 20,
      section: "SETTLEMENT_INSTRUCTIONS",
      visibility: "USER_INPUT",
      lookup: {
        provider: "BANK_SERVICE",
        action: "BANK_SERVICE",
        endpoint: "/api/v1/resolution-page-definitions/lookups/bank-services",
        valueField: "bankServiceId",
        displayField: "bic",
        validationField: "bic",
      },
      constraints: [],
    },
    {
      fieldId: "tag.57.present",
      path: "validationContext.tag.57.present",
      label: "Test presence flag",
      control: "CHECKBOX",
      dataType: "BOOLEAN",
      required: false,
      defaultValue: true,
      displayOrder: 900,
      section: "VALIDATION_CONTEXT",
      visibility: "TEST_ONLY",
      constraints: [],
    },
  ],
  scenarios: [
    {
      scenarioId: "SCENARIO-X",
      label: "Future scenario",
      polarity: "POSITIVE",
      sequenceIds: ["Q9"],
      fieldIds: [
        "79Z/free text",
        "future-choice",
        "future-bank",
        "tag.57.present",
      ],
      validationRuleIds: [],
      fixture: {
        bindingId: "FIXTURE-X",
        fixtureSet: "FUTURE",
        fixtureVersion: "1",
        sourceSha256: "b".repeat(64),
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
  validationRules: [],
  evidence: [],
};

describe("mapPageDefinition", () => {
  it("mechanically maps unknown message, sequence, and field identities", () => {
    const model = mapPageDefinition({
      definition: arbitraryDefinition,
      contractSha256: "c".repeat(64),
    });

    expect(model.context).toEqual(
      expect.arrayContaining([
        { id: "message", label: "Message", value: "MSG-X" },
      ]),
    );
    expect(model.sourceAudit).toEqual(
      expect.arrayContaining([
        {
          id: "contract",
          label: "Contract SHA-256",
          value: "c".repeat(64),
        },
      ]),
    );
    expect(model.actionLabel).toBe("Resolve SSI");
    expect(model.fields.map(({ fieldId }) => fieldId)).toEqual([
      "future-choice",
      "future-bank",
      "79Z/free text",
      "tag.57.present",
    ]);
    expect(model.fields[2]).toMatchObject({
      inputId: "parameter-79Z-free-text",
      inputType: "text",
    });
    expect(model.fields[1]).toMatchObject({
      fieldId: "future-bank",
      displayLabel: "SWIFT 57A • Future bank",
      dataType: "SWIFT_BIC",
      lookup: {
        provider: "BANK_SERVICE",
        valueField: "bankServiceId",
        displayField: "bic",
      },
    });
    expect(model.fieldLabels["future-bank"]).toBe("SWIFT 57A • Future bank");
    expect(model.initialValues).toEqual({
      "79Z/free text": "API VALUE",
      "future-choice": "",
      "future-bank": "",
      "tag.57.present": true,
    });
    expect(
      model.fieldSections.flatMap(({ fields }) =>
        fields.map(({ fieldId }) => fieldId),
      ),
    ).toEqual(["future-choice", "79Z/free text", "future-bank"]);
    expect(model.execution).toMatchObject({
      endpoint: "/api/v1/resolution-page-definitions/execute",
      action: "RESOLVE_SSI",
      owner: "SSI_FIELD_RESOLUTION_API",
    });
  });

  it.each([
    ["MT300_INTERNAL", "MT3", "Treasury Markets"],
    ["MT400_INTERNAL", "MT4", "Collections"],
    ["MT700_INTERNAL", "MT7", "Documentary Credits"],
  ])(
    "uses governed %s display metadata for the user-facing family",
    (messageFamily, familyLabel, categoryLabel) => {
      const model = mapPageDefinition({
        definition: {
          ...arbitraryDefinition,
          messageFamily,
          display: {
            familyCode: familyLabel,
            familyLabel,
            categoryCode: `${familyLabel}_CATEGORY`,
            categoryLabel,
          },
        },
        contractSha256: "c".repeat(64),
      });

      expect(model.sourceSummary).toBe(`FUTURE · ${familyLabel}`);
      expect(model.context).toContainEqual({
        id: "family",
        label: "Family",
        value: familyLabel,
      });
      expect(model.sourceSummary).not.toContain(messageFamily);
      expect(model.context).not.toContainEqual(
        expect.objectContaining({ value: messageFamily }),
      );
    },
  );

  it("uses API scenario defaults ahead of definition defaults", () => {
    const definition = {
      ...arbitraryDefinition,
      scenarios: [
        {
          ...arbitraryDefinition.scenarios[0]!,
          inputValues: {
            "79Z/free text": "SCENARIO VALUE",
            "future-choice": "SERVER-A",
          },
        },
      ],
    };

    const model = mapPageDefinition({
      definition,
      contractSha256: "c".repeat(64),
    });

    expect(model.initialValues).toEqual({
      "79Z/free text": "SCENARIO VALUE",
      "future-choice": "SERVER-A",
      "future-bank": "",
      "tag.57.present": true,
    });
  });

  it("waits for the governed SSI lookup before selecting a counterparty", () => {
    const counterpartyField = {
      fieldId: "context.counterpartyBankServiceId",
      path: "context.counterpartyBankServiceId",
      label: "Counterparty Bank",
      control: "SELECT" as const,
      dataType: "SWIFT_BIC" as const,
      required: true,
      displayOrder: 25,
      section: "TRANSACTION" as const,
      visibility: "USER_INPUT" as const,
      lookup: {
        provider: "SSI_COUNTERPARTY" as const,
        action: "SSI_COUNTERPARTY" as const,
        endpoint:
          "/api/v1/resolution-page-definitions/lookups/ssi-counterparties",
        valueField: "bankServiceId",
        displayField: "bic",
        validationField: "bic",
      },
      constraints: [],
    };
    const definition: ResolutionPageDefinition = {
      ...arbitraryDefinition,
      fields: [...arbitraryDefinition.fields, counterpartyField],
      scenarios: [
        {
          ...arbitraryDefinition.scenarios[0]!,
          fieldIds: [
            ...arbitraryDefinition.scenarios[0]!.fieldIds,
            counterpartyField.fieldId,
          ],
          inputValues: {
            [counterpartyField.fieldId]: "BANK-SVC-STALE",
          },
        },
      ],
    };

    const model = mapPageDefinition({
      definition,
      contractSha256: "c".repeat(64),
    });

    expect(model.initialValues[counterpartyField.fieldId]).toBe("");
  });

  it("keeps API-declared transaction anchors ahead of settlement roles", () => {
    const counterpartyField = {
      fieldId: "context.counterpartyBankServiceId",
      path: "context.counterpartyBankServiceId",
      label: "Counterparty Bank",
      control: "SELECT" as const,
      dataType: "SWIFT_BIC" as const,
      required: true,
      displayOrder: 25,
      section: "TRANSACTION" as const,
      visibility: "USER_INPUT" as const,
      lookup: {
        provider: "BANK_SERVICE" as const,
        action: "BANK_SERVICE" as const,
        endpoint: "/api/v1/resolution-page-definitions/lookups/bank-services",
        valueField: "bankServiceId",
        displayField: "bic",
        validationField: "bic",
      },
      constraints: [],
    };
    const definition: ResolutionPageDefinition = {
      ...arbitraryDefinition,
      fields: [...arbitraryDefinition.fields, counterpartyField],
      scenarios: [
        {
          ...arbitraryDefinition.scenarios[0]!,
          fieldIds: [
            ...arbitraryDefinition.scenarios[0]!.fieldIds,
            counterpartyField.fieldId,
          ],
        },
      ],
    };

    const model = mapPageDefinition({
      definition,
      contractSha256: "c".repeat(64),
    });

    expect(model.fieldSections.map(({ id }) => id)).toEqual([
      "TRANSACTION",
      "SETTLEMENT_INSTRUCTIONS",
    ]);
    expect(
      model.fieldSections[0]?.fields.map(({ fieldId }) => fieldId),
    ).toEqual(["future-choice", counterpartyField.fieldId, "79Z/free text"]);
    expect(model.fieldSections[0]?.fields[1]).toMatchObject({
      label: "Counterparty Bank",
      required: true,
      dataType: "SWIFT_BIC",
      section: "TRANSACTION",
      lookup: { provider: "BANK_SERVICE" },
    });
    expect(
      model.fieldSections[1]?.fields.map(({ fieldId }) => fieldId),
    ).toEqual(["future-bank"]);
  });

  it("places API-declared lookup prerequisites before the dependent lookup", () => {
    const dependentBank = {
      ...arbitraryDefinition.fields.find(
        ({ fieldId }) => fieldId === "future-bank",
      )!,
      displayOrder: 1,
      section: "TRANSACTION" as const,
      lookup: {
        ...arbitraryDefinition.fields.find(
          ({ fieldId }) => fieldId === "future-bank",
        )!.lookup!,
        dependency: {
          dependsOnFieldIds: ["future-choice", "79Z/free text"],
          invalidatesFieldIds: ["future-bank"],
          selectionPolicy: "SELECTABLE" as const,
        },
      },
    };
    const definition: ResolutionPageDefinition = {
      ...arbitraryDefinition,
      fields: arbitraryDefinition.fields.map((field) =>
        field.fieldId === "future-bank" ? dependentBank : field,
      ),
    };

    const model = mapPageDefinition({
      definition,
      contractSha256: "c".repeat(64),
    });

    expect(
      model.fieldSections[0]?.fields.map(({ fieldId }) => fieldId),
    ).toEqual(["future-choice", "79Z/free text", "future-bank"]);
    expect(model.fieldLabels).toMatchObject({
      "future-choice": "Future choice",
      "79Z/free text": "79Z",
    });
  });

  it("honors scenario ownership, applicability, processing and restriction policies", () => {
    const definition: ResolutionPageDefinition = {
      ...arbitraryDefinition,
      fields: arbitraryDefinition.fields.map((field) =>
        field.fieldId === "future-choice"
          ? {
              ...field,
              optionSource: {
                source: "GOVERNED_APPLICABILITY" as const,
                dependsOnFieldIds: [],
                invalidatesFieldIds: ["future-bank"],
                selectionPolicy: "SINGLE_VALUE_RESTRICTED" as const,
                restrictionMessage: "Only one governed currency is available.",
              },
            }
          : field,
      ),
      scenarios: [
        {
          ...arbitraryDefinition.scenarios[0]!,
          fieldPolicies: [
            {
              fieldId: "future-choice",
              applicability: "APPLICABLE",
              inputOwnership: "TRANSACTION_USER",
              visibility: "USER_INPUT",
              processingPolicy: "APPLY",
              required: true,
              readOnly: false,
            },
            {
              fieldId: "future-bank",
              applicability: "APPLICABLE",
              inputOwnership: "SSI_DERIVED",
              visibility: "HIDDEN_EVIDENCE",
              processingPolicy: "APPLY",
              required: false,
              readOnly: true,
            },
            {
              fieldId: "79Z/free text",
              applicability: "NOT_APPLICABLE",
              inputOwnership: "TRANSACTION_USER",
              visibility: "HIDDEN_EVIDENCE",
              processingPolicy: "IGNORE_AUDIT",
              required: false,
              readOnly: true,
            },
          ],
        },
      ],
    };

    const model = mapPageDefinition({
      definition,
      contractSha256: "c".repeat(64),
    });

    expect(
      model.fieldSections.flatMap(({ fields }) =>
        fields.map(({ fieldId }) => fieldId),
      ),
    ).toEqual(["future-choice"]);
    expect(model.fieldSections[0]?.fields[0]).toMatchObject({
      required: true,
      readOnly: true,
      scenarioPolicy: { inputOwnership: "TRANSACTION_USER" },
    });
  });

  it("fails closed when the API omits governed presentation metadata", () => {
    const definition = {
      ...arbitraryDefinition,
      fields: arbitraryDefinition.fields.map((field) =>
        field.fieldId === "future-choice"
          ? { ...field, visibility: undefined }
          : field,
      ),
    } as unknown as ResolutionPageDefinition;

    expect(() =>
      mapPageDefinition({
        definition,
        contractSha256: "c".repeat(64),
      }),
    ).toThrow("PAGE_PARAMETER_VISIBILITY_REQUIRED");
  });

  it("does not mutate the API definition", () => {
    const snapshot = JSON.stringify(arbitraryDefinition);
    mapPageDefinition({
      definition: arbitraryDefinition,
      contractSha256: "c".repeat(64),
    });
    expect(JSON.stringify(arbitraryDefinition)).toBe(snapshot);
  });
});
