import { HttpException } from "@nestjs/common";
import { FinFieldResolutionPolicy } from "./fin-field-resolution.policy";
import {
  FinFieldResolutionService,
  type FinFieldResolutionRequest,
} from "./fin-field-resolution.service";
import type { MappingCatalogueService } from "./mapping-catalogue.service";

const mapping = (presence: "MANDATORY" | "OPTIONAL") => ({
  standardsRelease: "SR2026",
  messageType: "MT360",
  direction: "OUTGOING",
  businessFunction: "INTEREST_RATE_DERIVATIVE",
  path: "D.57A",
  sequence: "D",
  settlementLeg: "Interest Payable by Party B",
  tag: "57",
  option: "A",
  canonicalRole: "RECEIVING_AGENT",
  officialRole: "RECEIVING_AGENT",
  officialFieldName: "Receiving Agent",
  presence,
  scopeStatus: "SSI_SUPPORTED",
  nvrRefs: [],
  reusableCandidate: true,
  evidenceStatus: "FIELD_PROFILE_PROVEN",
  evidenceArtifactId: "US3MB",
  evidencePages: [58],
});
const request: FinFieldResolutionRequest = {
  service: "FIN",
  resolutionMode: "TREASURY",
  standardsRelease: "SR2026",
  messageType: "MT360",
  direction: "OUTGOING",
  businessFunction: "INTEREST_RATE_DERIVATIVE",
  sequence: "D",
  settlementLeg: "Interest Payable by Party B",
  transactionReference: "MT360-007",
  currency: "USD",
  receiverBic: "DEUTDEFF",
  valueDate: "2026-09-12",
  roles: {},
};
const service = (presence: "MANDATORY" | "OPTIONAL") =>
  new FinFieldResolutionService(
    {
      get: () => ({
        catalogueVersion: "SR2026-MT347-TDD-v5",
        sourceArtifactId: "controlled",
        sourceArtifactHash: "hash",
        mappings: [mapping(presence)],
      }),
    } as unknown as MappingCatalogueService,
    new FinFieldResolutionPolicy(),
  );

describe("FIN mandatory fail-closed contract", () => {
  it("rejects a missing mandatory 57a without returning a partial route", () => {
    try {
      service("MANDATORY").resolve(request);
      throw new Error("expected mandatory failure");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: "PROFILE_INCOMPLETE",
        payloadGenerated: false,
        fields: [{ sequence: "D", tag: "57", option: "A" }],
      });
    }
  });

  it("records a governed omission for a missing optional field", () => {
    const result = service("OPTIONAL").resolve(request) as {
      resolvedFields: Array<Record<string, unknown>>;
    };
    expect(result.resolvedFields[0]).toMatchObject({
      resolutionStatus: "NOT_REQUIRED",
      reasonCode: "OPTIONAL_FIELD_OMITTED",
      resolvedValue: null,
    });
  });

  it("preserves an immutable transaction-owned hybrid field without relabelling it as SSI", () => {
    const hybridMapping = {
      ...mapping("OPTIONAL"),
      messageType: "MT742",
      businessFunction: "REIMBURSEMENT_CLAIM",
      path: "58A",
      sequence: "MESSAGE",
      settlementLeg: "Message",
      tag: "58",
      canonicalRole: "BENEFICIARY_BANK",
      officialRole: "BENEFICIARY_BANK",
      officialFieldName: "Beneficiary Bank",
      scopeStatus: "OUT_OF_SSI_SCOPE",
      reusableCandidate: false,
    } as const;
    const hybridService = new FinFieldResolutionService(
      {
        get: () => ({
          catalogueVersion: "SR2026-MT347-TDD-v5",
          sourceArtifactId: "controlled",
          sourceArtifactHash: "hash",
          mappings: [
            hybridMapping,
            {
              ...hybridMapping,
              path: "57A",
              tag: "57",
              canonicalRole: "ACCOUNT_WITH_BANK",
              officialRole: "ACCOUNT_WITH_BANK",
              officialFieldName: "Account With Bank",
              scopeStatus: "SSI_SUPPORTED",
              reusableCandidate: true,
            },
          ],
        }),
      } as unknown as MappingCatalogueService,
      new FinFieldResolutionPolicy(),
    );
    const result = hybridService.resolve({
      ...request,
      resolutionMode: "TRADE_FINANCE",
      messageType: "MT742",
      businessFunction: "REIMBURSEMENT_CLAIM",
      sequence: "MESSAGE",
      settlementLeg: "Message",
      roles: { BENEFICIARY_BANK: "/ACCOUNT-1\nBARCGB22" },
      roleEvidence: {
        BENEFICIARY_BANK: {
          ownerSide: "TRANSACTION_PARTY",
          sourceType: "IMMUTABLE_UPSTREAM_INSTRUCTION",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
        },
      },
    }) as { resolvedFields: Array<Record<string, unknown>> };

    expect(result.resolvedFields.find((field) => field["tag"] === "58")).toMatchObject({
      tag: "58",
      scopeStatus: "OUT_OF_SSI_SCOPE",
      resolutionStatus: "RESOLVED",
      reasonCode: "PRESERVED_FROM_TRANSACTION_CONTEXT",
      resolvedValue: "/ACCOUNT-1\nBARCGB22",
    });
  });
});
