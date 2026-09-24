import type {
  ResolutionPageFieldResult,
  ResolutionPageGeneratedOutput,
} from "@ssi/contracts";
import {
  emptyResolutionMessage,
  resolutionDomainFromOutputs,
  resolutionRouteSummary,
  resolutionResultRows,
} from "../../../app/resolution-workbench/resolution-result.presenter";

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
  it("shows the chosen SSI and Nostro even when no governed 5x field was emitted", () => {
    const outputs: ResolutionPageGeneratedOutput[] = [
      {
        outputId: "iso-20022",
        format: "ISO_20022",
        label: "pacs.009.001.08",
        messageIdentity: "pacs.009.001.08",
        mediaType: "application/json",
        document: {
          chosenRoute: {
            ssiId: "SSI-1",
            ssiCode: "MT2-USD-CITI-DEBIT-V1",
            settlementRouteId: "ROUTE-1",
            nostroId: "NOSTRO-1",
            accountId: "ACCOUNT-1",
            matchedApplicabilityId: "APP-1",
          },
        },
      },
    ];
    expect(resolutionRouteSummary(outputs)).toEqual({
      ssiId: "SSI-1",
      ssiCode: "MT2-USD-CITI-DEBIT-V1",
      settlementRouteId: "ROUTE-1",
      nostroId: "NOSTRO-1",
      accountId: "ACCOUNT-1",
      applicabilityId: "APP-1",
      rmaId: "",
      counterpartyBic: "",
      counterpartyName: "",
      roles: [],
      legs: [],
      projections: [],
    });
  });

  it("shows the bank-controlled MT1 settlement route without generating a message", () => {
    expect(
      resolutionRouteSummary([], {
        routeBindingId: "ROUTE-MT1",
        counterparty: {
          bankServiceId: "BANK-SVC-CITIUS33",
          bic: "CITIUS33",
          name: "Citibank Demo",
        },
        ssi: { id: "MT1-SSI-CITI", version: 1 },
        applicability: { id: "MT1-APP-CITI", version: 1 },
        nostro: { id: "MT1-NOSTRO-CITI", version: 1 },
        rma: { id: "MT1-RMA-CITI", version: 1 },
        roles: [
          {
            role: "INDA_SETTLEMENT_ACCOUNT_RELATIONSHIP",
            owner: "COUNTERPARTY_SSI",
            recordId: "MT1-SSI-CITI",
            version: 1,
          },
        ],
        legs: [
          {
            order: 1,
            relationship: "INDA",
            role: "INDA_SETTLEMENT_ACCOUNT_RELATIONSHIP",
            accountOwner: { bankServiceId: "LOCAL", bic: "DEMOHKHH" },
            accountServicer: {
              bankServiceId: "BANK-SVC-CITIUS33",
              bic: "CITIUS33",
            },
            accountReference: "DEMO-USD-CITI-INDA",
            currency: "USD",
            source: "MT1_SSI_DEMO_ROUTE_FIXTURE",
            sourceRecordId: "MT1-NOSTRO-CITI-INDA",
            version: 1,
          },
        ],
        projections: [
          {
            kind: "SWIFT_MT_FIELD",
            identifier: "53",
            option: "A",
            label: "Sender's Correspondent",
            role: "INDA_SETTLEMENT_ACCOUNT_RELATIONSHIP",
            value: "INDA",
            accountReference: "DEMO-USD-CITI-INDA",
            sourceRecordId: "MT1-NOSTRO-CITI-INDA",
            version: 1,
          },
        ],
      }),
    ).toMatchObject({
      ssiId: "MT1-SSI-CITI v1",
      settlementRouteId: "ROUTE-MT1",
      nostroId: "MT1-NOSTRO-CITI v1",
      applicabilityId: "MT1-APP-CITI v1",
      rmaId: "MT1-RMA-CITI v1",
      counterpartyBic: "CITIUS33",
      counterpartyName: "Citibank Demo",
      roles: [
        "INDA_SETTLEMENT_ACCOUNT_RELATIONSHIP · COUNTERPARTY_SSI · MT1-SSI-CITI v1",
      ],
      legs: ["1 · INDA · DEMOHKHH → CITIUS33 · DEMO-USD-CITI-INDA · USD"],
      projections: [
        "SWIFT 53A · Sender's Correspondent · INDA · DEMO-USD-CITI-INDA",
      ],
    });
  });
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

  it("labels the raw Payment field provenance when no reason code is returned", () => {
    const [row] = resolutionResultRows([
      {
        ...resolved,
        provenance: { source: "OWN_NOSTRO", sourceRecordId: "NOSTRO-001" },
      },
    ]);

    expect(row?.statusDetail).toBe("Source: OWN_NOSTRO");
  });

  it("prefers an explicit reason code over the provenance source", () => {
    const [row] = resolutionResultRows([
      { ...resolved, reasonCode: "RESOLVED_FROM_OWN_SSI" },
    ]);

    expect(row?.statusDetail).toBe("RESOLVED_FROM_OWN_SSI");
  });

  it("does not attribute a message-level resolution domain to a field", () => {
    const output: ResolutionPageGeneratedOutput = {
      outputId: "iso-20022",
      format: "ISO_20022",
      label: "pacs.009",
      messageIdentity: "pacs.009.001.08",
      mediaType: "application/json",
      document: { resolutionDomain: "OWN_SSI_NOSTRO" },
    };
    const [row] = resolutionResultRows([{ ...resolved, provenance: {} }]);

    expect(row?.statusDetail).toBe("");
    expect(resolutionDomainFromOutputs([output])).toBe("OWN_SSI_NOSTRO");
  });

  it("keeps the explicit field reason authoritative", () => {
    const [row] = resolutionResultRows([
      { ...resolved, reasonCode: "RESOLVED_FROM_COUNTERPARTY_SSI" },
    ]);

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
