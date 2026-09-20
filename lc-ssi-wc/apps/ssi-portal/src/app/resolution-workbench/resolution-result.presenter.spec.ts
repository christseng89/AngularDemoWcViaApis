import type { ResolutionPageFieldResult, ResolutionPageGeneratedOutput } from "@ssi/contracts";
import {
  emptyResolutionMessage,
  resolutionResultRows,
} from "./resolution-result.presenter";

const resolved: ResolutionPageFieldResult = {
  fieldId: "future-field",
  sequenceId: "Q9",
  settlementLeg: "Future leg",
  swiftTag: "79",
  swiftOption: "Z",
  fieldName: "Future institution",
  role: "FUTURE_ROLE",
  outcome: "RESOLVED",
  resolutionStatus: "RESOLVED",
  value: "/ACCOUNT\nFUTRHKHH",
  institution: {
    bankServiceId: "bank-service-17",
    bic: "FUTRHKHH",
    name: "Future Bank",
  },
  partyIdentifier: "/PARTY",
  accountReference: "ACCOUNT",
  provenance: {
    source: "FUTURE_SOURCE",
    sourceRecordId: "record-17",
    ownerSide: "SENDER",
    version: "3",
    fieldProfileArtifactId: "profile-79z",
    fieldProfileEvidencePages: [17, 18],
  },
  evidenceIds: ["evidence-17"],
};

describe("resolution result presenter", () => {
  it("maps every API result field without looking it up in input controls", () => {
    expect(resolutionResultRows([resolved])).toEqual([
      expect.objectContaining({
        sequenceId: "Q9",
        swiftTag: "79",
        swiftOption: "Z",
        tagAndOption: "79Z",
        role: "FUTURE_ROLE",
        renderedValue: "/ACCOUNT\nFUTRHKHH",
        bic: "FUTRHKHH",
        institutionName: "Future Bank",
        accountReference: "ACCOUNT",
        partyIdentifier: "/PARTY",
        statusLabel: "RESOLVED",
        provenance:
          "FUTURE_SOURCE · record-17 · SENDER · 3 · profile-79z · pages 17, 18",
      }),
    ]);
  });

  it("does not fabricate institution or account data for not-required rows", () => {
    const [row] = resolutionResultRows([
      {
        ...resolved,
        outcome: "NOT_REQUIRED",
        resolutionStatus: "NOT_REQUIRED",
        value: undefined,
        institution: undefined,
        partyIdentifier: undefined,
        accountReference: undefined,
      },
    ]);

    expect(row).toMatchObject({
      renderedValue: "",
      bic: "",
      institutionName: "",
      accountReference: "",
      partyIdentifier: "",
      statusLabel: "NOT REQUIRED",
    });
  });

  it("shows the tag alone when the API does not supply an option", () => {
    const [row] = resolutionResultRows([{ ...resolved, swiftOption: "" }]);

    expect(row?.tagAndOption).toBe("79");
  });

  it("shows Payment field provenance beneath the status when no reason code is returned", () => {
    const [row] = resolutionResultRows([
      { ...resolved, provenance: { source: "OWN_NOSTRO", sourceRecordId: "NOSTRO-001" } },
    ]);

    expect(row?.statusDetail).toBe("RESOLVED_FROM_OWN_SSI");
  });

  it("prefers an explicit reason code over the provenance source", () => {
    const [row] = resolutionResultRows([
      { ...resolved, reasonCode: "RESOLVED_FROM_OWN_SSI" },
    ]);

    expect(row?.statusDetail).toBe("RESOLVED_FROM_OWN_SSI");
  });

  it("shows the governed own-SSI resolution domain for Payment book transfers", () => {
    const output: ResolutionPageGeneratedOutput = {
      outputId: "iso-20022",
      format: "ISO_20022",
      label: "pacs.009",
      messageIdentity: "pacs.009.001.08",
      mediaType: "application/json",
      document: { resolutionDomain: "OWN_SSI_NOSTRO" },
    };
    const [row] = resolutionResultRows([{ ...resolved, provenance: {} }], [output]);

    expect(row?.statusDetail).toBe("RESOLVED_FROM_OWN_SSI");
  });

  it("keeps the field reason authoritative when a result domain is also present", () => {
    const output: ResolutionPageGeneratedOutput = {
      outputId: "iso-20022",
      format: "ISO_20022",
      label: "pacs.009",
      messageIdentity: "pacs.009.001.08",
      mediaType: "application/json",
      document: { resolutionDomain: "OWN_SSI_NOSTRO" },
    };
    const [row] = resolutionResultRows([
      { ...resolved, reasonCode: "RESOLVED_FROM_COUNTERPARTY_SSI" },
    ], [output]);

    expect(row?.statusDetail).toBe("RESOLVED_FROM_COUNTERPARTY_SSI");
  });

  it("omits the repeated Tag + option prefix from the displayed role description", () => {
    const [row] = resolutionResultRows([
      {
        ...resolved,
        swiftTag: "58",
        swiftOption: "A",
        fieldName: "SWIFT 58A • BENEFICIARY INSTITUTION",
      },
    ]);
    expect(row).toMatchObject({
      tagAndOption: "58A",
      fieldName: "SWIFT 58A • BENEFICIARY INSTITUTION",
      displayFieldName: "BENEFICIARY INSTITUTION",
    });
  });

  it("keeps an unmatched governed description intact", () => {
    const [row] = resolutionResultRows([
      { ...resolved, fieldName: "SWIFT 58A • BENEFICIARY INSTITUTION" },
    ]);
    expect(row?.displayFieldName).toBe("SWIFT 58A • BENEFICIARY INSTITUTION");
  });

  it("distinguishes an empty not-required result from an absent result", () => {
    expect(emptyResolutionMessage("NOT_REQUIRED")).toBe(
      "Field-level SSI is not required for this scenario.",
    );
    expect(emptyResolutionMessage("RESOLVED")).toBe(
      "No field-level SSI resolution results were returned.",
    );
  });
});
