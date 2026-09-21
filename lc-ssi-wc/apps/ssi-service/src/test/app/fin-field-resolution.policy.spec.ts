import { FinFieldResolutionPolicy } from "../../app/fin-field-resolution.policy";
import type {
  FinFieldResolutionRequest,
  ResolvedFinField,
} from "../../app/fin-field-resolution.service";
import type { Mapping } from "../../app/mapping-catalogue.service";

const policy = new FinFieldResolutionPolicy();

const request = {
  service: "FIN",
  resolutionMode: "TREASURY",
  standardsRelease: "SR2026",
  messageType: "MT300",
  direction: "OUTGOING",
  businessFunction: "FX_CONFIRMATION",
  sequence: "B1",
  settlementLeg: "Amount Bought",
  transactionReference: "TX-POLICY",
  currency: "USD",
  receiverBic: "CITIUS33",
  valueDate: "2026-09-08",
  roles: {},
} satisfies FinFieldResolutionRequest;

const mapping = (
  tag: string,
  canonicalRole: string,
  overrides: Partial<Mapping> = {},
): Readonly<Mapping> => ({
  standardsRelease: "SR2026",
  messageType: "MT300",
  direction: "OUTGOING",
  businessFunction: "FX_CONFIRMATION",
  path: `B1.${tag}A`,
  sequence: "B1",
  settlementLeg: "Amount Bought",
  tag,
  option: "A",
  canonicalRole,
  officialRole: canonicalRole,
  officialFieldName: canonicalRole,
  presence: "OPTIONAL",
  scopeStatus: "SSI_SUPPORTED",
  nvrRefs: [],
  reusableCandidate: true,
  evidenceStatus: "FIELD_PROFILE_PROVEN",
  evidenceArtifactId: "POLICY-MRG",
  ...overrides,
});

const field = (
  tag: string,
  canonicalRole: string,
  nodeId?: string,
  ownerSide = "SENDER_SIDE",
  overrides: Partial<ResolvedFinField> = {},
): ResolvedFinField => ({
  standardsRelease: "SR2026",
  messageType: "MT300",
  sequence: "B1",
  settlementLeg: "Amount Bought",
  tag,
  option: "A",
  officialFieldName: canonicalRole,
  officialRole: canonicalRole,
  businessFunction: "FX_CONFIRMATION",
  scopeStatus: "SSI_SUPPORTED",
  resolutionStatus: "RESOLVED",
  reasonCode: "EXACT_ELIGIBLE_SSI",
  resolvedValue: "BANKBIC1",
  nvrRefs: [],
  provenance: { canonicalRouteNodeId: nodeId, ownerSide },
  ...overrides,
});

describe("FinFieldResolutionPolicy", () => {
  it("leaves unresolved, out-of-scope, and unidentified route nodes unchanged", () => {
    const mappings = [
      mapping("53", "DELIVERY_AGENT"),
      mapping("56", "INTERMEDIARY_INSTITUTION"),
      mapping("57", "RECEIVING_AGENT"),
    ];
    const fields = [
      field("53", "DELIVERY_AGENT", undefined),
      field("56", "INTERMEDIARY_INSTITUTION", "NODE", "SENDER_SIDE", {
        resolutionStatus: "NO_ELIGIBLE_SSI",
        resolvedValue: null,
      }),
      field("57", "RECEIVING_AGENT", "NODE", "RECEIVER_SIDE", {
        scopeStatus: "OUT_OF_SSI_SCOPE",
        resolutionStatus: "N_A",
        resolvedValue: null,
      }),
    ];
    expect(policy.normalizeCanonicalRoute(request, mappings, fields)).toEqual(
      fields,
    );
  });

  it("does not merge equal nodes owned by different sides", () => {
    const fields = [
      field("53", "DELIVERY_AGENT", "NODE", "SENDER_SIDE"),
      field("56", "INTERMEDIARY_INSTITUTION", "NODE", "RECEIVER_SIDE"),
    ];
    expect(
      policy.normalizeCanonicalRoute(
        request,
        [
          mapping("53", "DELIVERY_AGENT"),
          mapping("56", "INTERMEDIARY_INSTITUTION"),
        ],
        fields,
      ),
    ).toEqual(fields);
  });

  it("preserves the only mandatory role in a duplicate run", () => {
    const result = policy.normalizeCanonicalRoute(
      request,
      [
        mapping("53", "DELIVERY_AGENT"),
        mapping("56", "INTERMEDIARY_INSTITUTION", { presence: "MANDATORY" }),
      ],
      [
        field("53", "DELIVERY_AGENT", "NODE"),
        field("56", "INTERMEDIARY_INSTITUTION", "NODE"),
      ],
    );
    expect(
      result.map(({ tag, resolutionStatus }) => [tag, resolutionStatus]),
    ).toEqual([
      ["53", "NOT_REQUIRED"],
      ["56", "RESOLVED"],
    ]);
  });

  it.each([
    {
      name: "endpoint",
      messageType: "MT300",
      roles: ["UNCLASSIFIED", "RECEIVING_AGENT"],
      keptTag: "57",
    },
    {
      name: "source",
      messageType: "MT300",
      roles: ["DELIVERY_AGENT", "UNCLASSIFIED"],
      keptTag: "53",
    },
    {
      name: "first fallback",
      messageType: "MT300",
      roles: ["UNCLASSIFIED", "ALSO_UNCLASSIFIED"],
      keptTag: "53",
    },
    {
      name: "MT400 fallback without receiver correspondent",
      messageType: "MT400",
      roles: ["UNCLASSIFIED", "ALSO_UNCLASSIFIED"],
      keptTag: "53",
    },
  ])("selects the $name keeper", ({ messageType, roles, keptTag }) => {
    const mappings = roles.map((role, index) =>
      mapping(index === 0 ? "53" : "57", role, { messageType }),
    );
    const fields = roles.map((role, index) =>
      field(index === 0 ? "53" : "57", role, "NODE"),
    );
    const result = policy.normalizeCanonicalRoute(
      { ...request, messageType },
      mappings,
      fields,
    );
    expect(
      result.find(({ resolutionStatus }) => resolutionStatus === "RESOLVED")
        ?.tag,
    ).toBe(keptTag);
  });

  it("filters profile alternatives and emits one explicit excluded disposition per tag", () => {
    const candidate58 = mapping("58", "BENEFICIARY_INSTITUTION", {
      sequence: "B2",
      settlementLeg: "Amount Sold",
    });
    const result = policy.profileExcludedFields(
      { ...request, fieldOptions: { "58": "A" } },
      [
        mapping("53", "DELIVERY_AGENT"),
        mapping("58", "BENEFICIARY_INSTITUTION", { option: "J" }),
        mapping("55", "REIMBURSEMENT_PARTY", {
          scopeStatus: "OUT_OF_SSI_SCOPE",
        }),
        candidate58,
        { ...candidate58 },
      ],
      [mapping("53", "DELIVERY_AGENT")],
      {
        catalogueVersion: "v1",
        sourceArtifactId: "catalogue",
        sourceArtifactHash: "hash",
      },
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      tag: "58",
      resolutionStatus: "N_A",
      reasonCode: "MESSAGE_PROFILE_EXCLUDED",
    });
  });

  it("uses safe defaults when excluded-profile metadata is absent", () => {
    const sparse = mapping("58", "BENEFICIARY_INSTITUTION", {
      path: "58A",
      sequence: undefined,
      settlementLeg: undefined,
      tag: undefined,
      option: "A",
      officialFieldName: undefined,
      officialRole: undefined,
    });
    const result = policy.profileExcludedFields(
      {
        ...request,
        sequence: undefined,
        settlementLeg: undefined,
      },
      [sparse],
      [],
      {
        catalogueVersion: "v1",
        sourceArtifactId: "catalogue",
        sourceArtifactHash: "hash",
      },
    );
    expect(result[0]).toMatchObject({
      sequence: "MESSAGE",
      settlementLeg: "MESSAGE",
      tag: "58",
      option: "A",
      officialFieldName: "Official field name pending verification",
      officialRole: "BENEFICIARY_INSTITUTION",
    });
  });
});
