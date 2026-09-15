import type { PageParameterField } from "@ssi/contracts";
import { ResolutionPageOasFieldPolicyService } from "./resolution-page-oas-field-policy.service";

const bankField = (swiftTag: string): PageParameterField => ({
  fieldId: `MESSAGE.${swiftTag}.bankServiceId`,
  path: "roleBankServiceIds.TEST_ROLE",
  label: "Test bank",
  control: "SELECT",
  dataType: "SWIFT_BIC",
  required: false,
  visibility: "HIDDEN_EVIDENCE",
  section: "SETTLEMENT_INSTRUCTIONS",
  swiftTag,
  lookup: {
    provider: "BANK_SERVICE",
    action: "BANK_SERVICE",
    endpoint: "/lookups/bank-services",
    valueField: "bankServiceId",
    displayField: "bic",
    validationField: "bic",
    targetRole: "TEST_ROLE",
  },
  constraints: [],
});

describe("ResolutionPageOasFieldPolicyService", () => {
  const policy = new ResolutionPageOasFieldPolicyService();

  it("keeps ordinary settlement Bank Services SSI-derived", () => {
    expect(policy.resolve("MT300", bankField("53"))).toMatchObject({
      inputOwnership: "SSI_DERIVED",
      visibility: "HIDDEN_EVIDENCE",
      processingPolicy: "APPLY",
    });
    expect(policy.resolve("MT400", bankField("57"))).toMatchObject({
      inputOwnership: "SSI_DERIVED",
      visibility: "HIDDEN_EVIDENCE",
    });
  });

  it.each([
    ["MT300", "58"],
    ["MT400", "58"],
    ["MT742", "58"],
    ["MT754", "58"],
    ["MT754", "53"],
  ])(
    "exposes OAS-governed transaction Bank input for %s tag %s",
    (messageType, tag) => {
      expect(policy.resolve(messageType, bankField(tag))).toMatchObject({
        inputOwnership: "TRANSACTION_USER",
        visibility: "USER_INPUT",
        processingPolicy: "APPLY",
      });
    },
  );

  it("publishes the OAS-governed transaction inputs for the message index", () => {
    expect(policy.inputFields("MT400")).toEqual([
      expect.objectContaining({
        swiftTag: "58",
        swiftOptions: ["A", "B", "D"],
        label: "Beneficiary Bank",
        display: "58A/58B/58D",
      }),
    ]);
    expect(policy.inputFields("MT742").map(({ display }) => display)).toEqual([
      "58A/58D",
    ]);
    expect(policy.inputFields("MT754").map(({ display }) => display)).toEqual([
      "53A/53B/53D",
      "58A/58D",
    ]);
    expect(policy.inputFields("MT730")).toEqual([]);
  });

  it("materializes governed Bank inputs only for their OAS-owned scenarios", () => {
    const field = policy.materializedFields("MT400")[0]!;
    expect(field).toMatchObject({
      fieldId: "MESSAGE.58.bankServiceId",
      swiftTag: "58",
      officialRole: "Beneficiary Bank",
      lookup: { provider: "BANK_SERVICE", targetRole: "BENEFICIARY_BANK" },
    });
    expect(policy.scenarioApplicability("MT400", field, "MT400-001")).toEqual({
      applicable: true,
      required: true,
    });
    expect(
      policy.scenarioApplicability("MT400", field, "MT400-003"),
    ).toBeUndefined();
    expect(
      policy.materializedFields("MT754").map(({ fieldId }) => fieldId),
    ).toEqual(["MESSAGE.58.bankServiceId", "MESSAGE.53.bankServiceId"]);
    const mt754Fields = policy.materializedFields("MT754");
    expect(
      policy.scenarioApplicability("MT754", mt754Fields[0]!, "MT754-011"),
    ).toEqual({ applicable: true, required: true });
    expect(
      policy.scenarioApplicability("MT754", mt754Fields[1]!, "MT754-005"),
    ).toEqual({ applicable: true, required: true });
    expect(
      policy.scenarioApplicability("MT754", mt754Fields[0]!, "MT754-007"),
    ).toBeUndefined();
  });
});
