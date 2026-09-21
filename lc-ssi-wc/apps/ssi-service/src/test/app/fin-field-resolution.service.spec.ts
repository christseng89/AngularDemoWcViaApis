import {
  BadRequestException,
  HttpException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  FinFieldResolutionService,
  type FinFieldResolutionRequest,
} from "../../app/fin-field-resolution.service";
import {
  MappingCatalogueService,
  type Mapping,
} from "../../app/mapping-catalogue.service";
import { FinFieldResolutionPolicy } from "../../app/fin-field-resolution.policy";
import { canonicalJson } from "../../app/canonical-json";

const catalogue = {
  standardsRelease: "SR2026",
  catalogueVersion: "test",
  sourceArtifactId: "test-catalogue",
  sourceArtifactHash: "abc",
  mappings: [
    {
      standardsRelease: "SR2026",
      messageType: "MT300",
      direction: "OUTGOING",
      businessFunction: "FX_CONFIRMATION",
      path: "B1.53A",
      sequence: "B1",
      settlementLeg: "Amount Bought",
      tag: "53",
      option: "A",
      canonicalRole: "DELIVERY_AGENT",
      officialRole: "DELIVERY_AGENT",
      officialFieldName: "Delivery Agent",
      presence: "OPTIONAL",
      scopeStatus: "SSI_SUPPORTED",
      nvrRefs: [],
      reusableCandidate: true,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
      evidenceArtifactId: "US3MA",
      evidencePages: [18],
    },
    {
      standardsRelease: "SR2026",
      messageType: "MT300",
      direction: "OUTGOING",
      businessFunction: "FX_CONFIRMATION",
      path: "B2.58A",
      sequence: "B2",
      settlementLeg: "Amount Sold",
      tag: "58",
      option: "A",
      canonicalRole: "BENEFICIARY_INSTITUTION",
      officialRole: "BENEFICIARY_INSTITUTION",
      officialFieldName: "Beneficiary Institution",
      presence: "OPTIONAL",
      scopeStatus: "SSI_SUPPORTED",
      nvrRefs: [],
      reusableCandidate: true,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
      evidenceArtifactId: "US3MA",
      evidencePages: [18],
    },
    {
      standardsRelease: "SR2026",
      messageType: "MT300",
      direction: "OUTGOING",
      businessFunction: "FX_CONFIRMATION",
      path: "B1.56A",
      sequence: "B1",
      settlementLeg: "Amount Bought",
      tag: "56",
      option: "A",
      canonicalRole: "INTERMEDIARY_INSTITUTION",
      officialRole: "INTERMEDIARY_INSTITUTION",
      officialFieldName: "Intermediary",
      presence: "OPTIONAL",
      scopeStatus: "SSI_SUPPORTED",
      nvrRefs: [],
      reusableCandidate: true,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
      evidenceArtifactId: "US3MA",
      evidencePages: [18],
    },
    {
      standardsRelease: "SR2026",
      messageType: "MT300",
      direction: "OUTGOING",
      businessFunction: "FX_CONFIRMATION",
      path: "B1.57A",
      sequence: "B1",
      settlementLeg: "Amount Bought",
      tag: "57",
      option: "A",
      canonicalRole: "RECEIVING_AGENT",
      officialRole: "RECEIVING_AGENT",
      officialFieldName: "Receiving Agent",
      presence: "MANDATORY",
      scopeStatus: "SSI_SUPPORTED",
      nvrRefs: [],
      reusableCandidate: true,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
      evidenceArtifactId: "US3MA",
      evidencePages: [18],
    },
    {
      standardsRelease: "SR2026",
      messageType: "MT400",
      direction: "OUTGOING",
      businessFunction: "COLLECTION_PAYMENT",
      path: "54A",
      sequence: "MESSAGE",
      settlementLeg: "Message",
      tag: "54",
      option: "A",
      canonicalRole: "RECEIVERS_CORRESPONDENT",
      officialRole: "RECEIVERS_CORRESPONDENT",
      officialFieldName: "Receiver's Correspondent",
      presence: "OPTIONAL",
      scopeStatus: "SSI_SUPPORTED",
      nvrRefs: ["C1"],
      reusableCandidate: true,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
      evidenceArtifactId: "US4M",
      evidencePages: [13],
    },
    {
      standardsRelease: "SR2026",
      messageType: "MT400",
      direction: "OUTGOING",
      businessFunction: "COLLECTION_PAYMENT",
      path: "57A",
      sequence: "MESSAGE",
      settlementLeg: "Message",
      tag: "57",
      option: "A",
      canonicalRole: "ACCOUNT_WITH_INSTITUTION",
      officialRole: "ACCOUNT_WITH_INSTITUTION",
      officialFieldName: "Account With Bank",
      presence: "OPTIONAL",
      scopeStatus: "SSI_SUPPORTED",
      nvrRefs: ["C1"],
      reusableCandidate: true,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
      evidenceArtifactId: "US4M",
      evidencePages: [13],
    },
    {
      standardsRelease: "SR2026",
      messageType: "MT765",
      direction: "OUTGOING",
      businessFunction: "CLAIM",
      path: "A.56A",
      sequence: "A",
      settlementLeg: "Beneficiary",
      tag: "56",
      option: "A",
      canonicalRole: "INTERMEDIARY_INSTITUTION",
      officialRole: "INTERMEDIARY_INSTITUTION",
      officialFieldName: "Intermediary",
      presence: "OPTIONAL",
      scopeStatus: "SSI_SUPPORTED",
      nvrRefs: [],
      reusableCandidate: true,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
      evidenceArtifactId: "US7M",
      evidencePages: [363],
    },
    {
      standardsRelease: "SR2026",
      messageType: "MT765",
      direction: "OUTGOING",
      businessFunction: "CLAIM",
      path: "A.57A",
      sequence: "A",
      settlementLeg: "Beneficiary",
      tag: "57",
      option: "A",
      canonicalRole: "ACCOUNT_WITH_INSTITUTION",
      officialRole: "ACCOUNT_WITH_INSTITUTION",
      officialFieldName: "Account With Institution",
      presence: "OPTIONAL",
      scopeStatus: "SSI_SUPPORTED",
      nvrRefs: [],
      reusableCandidate: true,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
      evidenceArtifactId: "US7M",
      evidencePages: [363],
    },
    {
      standardsRelease: "SR2026",
      messageType: "MT350",
      direction: "OUTGOING",
      businessFunction: "LOAN_DEPOSIT_INTEREST_PAYMENT",
      path: "C.57A",
      sequence: "C",
      settlementLeg: "Settlement Instructions",
      tag: "57",
      option: "A",
      canonicalRole: "RECEIVING_AGENT",
      officialRole: "RECEIVING_AGENT",
      officialFieldName: "Receiving Agent",
      scopeStatus: "SSI_SUPPORTED",
      nvrRefs: [],
      reusableCandidate: true,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
      evidenceArtifactId: "US3MB",
      evidencePages: [17],
    },
    {
      standardsRelease: "SR2026",
      messageType: "MT760",
      direction: "OUTGOING",
      businessFunction: "GUARANTEE_STANDBY_ISSUANCE",
      path: "B.57A",
      sequence: "B",
      settlementLeg: "Undertaking Details",
      tag: "57",
      option: "A",
      canonicalRole: "ADVISE_THROUGH_BANK",
      officialRole: "ADVISE_THROUGH_BANK",
      officialFieldName: "'Advise Through' Bank",
      scopeStatus: "OUT_OF_SSI_SCOPE",
      nvrRefs: [],
      reusableCandidate: false,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
      evidenceArtifactId: "US7M",
      evidencePages: [312],
    },
  ],
} as const;
const service = new FinFieldResolutionService(
  {
    get: () => catalogue,
  } as unknown as MappingCatalogueService,
  new FinFieldResolutionPolicy(),
);
const serviceWithMappings = (mappings: readonly Readonly<Mapping>[]) =>
  new FinFieldResolutionService(
    {
      get: () => ({
        standardsRelease: "SR2026",
        catalogueVersion: "custom",
        sourceArtifactId: "custom-catalogue",
        sourceArtifactHash: "custom-hash",
        mappings,
      }),
    } as unknown as MappingCatalogueService,
    new FinFieldResolutionPolicy(),
  );
const treasuryRequest: FinFieldResolutionRequest = {
  service: "FIN",
  resolutionMode: "TREASURY",
  standardsRelease: "SR2026",
  messageType: "MT350",
  direction: "OUTGOING",
  businessFunction: "LOAN_DEPOSIT_INTEREST_PAYMENT",
  sequence: "C",
  settlementLeg: "Settlement Instructions",
  transactionReference: "TX-1",
  currency: "USD",
  receiverBic: "CHASUS33",
  valueDate: "2026-09-08",
  roles: { RECEIVING_AGENT: "CITIUS33" },
  roleEvidence: {
    RECEIVING_AGENT: {
      ownerSide: "RECEIVER_SIDE",
      sourceType: "SYNTHETIC_DEMO",
      sourceRecordId: "SSI-1",
      status: "ACTIVE",
      approvalStatus: "APPROVED",
      effectiveFrom: "2026-01-01",
      effectiveTo: "2027-01-01",
    },
  },
};

describe("FinFieldResolutionService", () => {
  it("builds the MT catalogue SSI-scope marker from the governed mappings", () => {
    const result = service.catalogueIndex("SR2026") as {
      items: Array<{
        messageType: string;
        profileSlots: string[];
        ssiResolvableTags: string[];
      }>;
    };
    expect(
      result.items.find((item) => item.messageType === "MT300"),
    ).toMatchObject({
      profileSlots: expect.arrayContaining(["53A", "58A"]),
      ssiResolvableTags: expect.arrayContaining(["53A", "58A"]),
    });
    expect(result.items).toHaveLength(4);
    expect(
      result.items.find((item) => item.messageType === "MT760"),
    ).toBeUndefined();
  });

  it("excludes every non-governed mapping class from the FIN catalogue index", () => {
    const base = catalogue.mappings[0] as Mapping;
    const result = serviceWithMappings([
      { ...base, direction: "INCOMING" },
      { ...base, evidenceStatus: "UNPROVEN" },
      { ...base, messageType: "MT202" },
      { ...base, path: "B1.59A", tag: "59" },
    ]).catalogueIndex("SR2026") as { items: unknown[] };

    expect(result.items).toEqual([]);
  });

  it("returns reference-only resolvedFields without confirmation semantics", () => {
    const result = service.resolve(treasuryRequest) as Record<
      string,
      unknown
    > & { resolvedFields: Array<Record<string, unknown>> };
    expect(result).toMatchObject({
      usage: "REFERENCE_ONLY",
      paymentExecutable: false,
      confirmationSupported: false,
    });
    expect(result).not.toHaveProperty("resolutionId");
    expect(result).not.toHaveProperty("confirmationToken");
    expect(result.resolvedFields[0]).toMatchObject({
      tag: "57",
      option: "A",
      officialFieldName: "Receiving Agent",
      resolutionStatus: "RESOLVED",
      resolvedValue: "CITIUS33",
    });
  });

  it("returns a canonical-safe response when optional route evidence is absent", () => {
    const result = service.resolve(treasuryRequest);

    expect(() => canonicalJson(result)).not.toThrow();
  });

  it("returns NOT_SUPPORTED for an MT outside the BA-approved SSI list", () => {
    try {
      service.resolve({
        ...treasuryRequest,
        resolutionMode: "TRADE_FINANCE",
        messageType: "MT760",
        businessFunction: "GUARANTEE_STANDBY_ISSUANCE",
        sequence: "B",
        settlementLeg: "Undertaking Details",
        roles: {},
      });
      throw new Error("Expected NOT_SUPPORTED");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "NOT_SUPPORTED",
        messageType: "MT760",
      });
    }
  });

  it("normalizes a duplicate MT300 delivery/intermediary node in the API response", () => {
    const result = service.resolve({
      ...treasuryRequest,
      messageType: "MT300",
      businessFunction: "FX_CONFIRMATION",
      sequence: "B1",
      settlementLeg: "Amount Bought",
      roles: {
        DELIVERY_AGENT: "BARCGB22",
        INTERMEDIARY_INSTITUTION: "BARCGB22",
        RECEIVING_AGENT: "SCBLGB2L",
      },
      roleEvidence: {
        DELIVERY_AGENT: {
          ownerSide: "SENDER_SIDE",
          sourceType: "SYNTHETIC_DEMO",
          sourceRecordId: "SSI-GBP-1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          canonicalRouteNodeId: "NODE-BARC-GBP",
        },
        INTERMEDIARY_INSTITUTION: {
          ownerSide: "SENDER_SIDE",
          sourceType: "SYNTHETIC_DEMO",
          sourceRecordId: "SSI-GBP-1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          canonicalRouteNodeId: "NODE-BARC-GBP",
        },
        RECEIVING_AGENT: {
          ownerSide: "RECEIVER_SIDE",
          sourceType: "SYNTHETIC_DEMO",
          sourceRecordId: "SSI-GBP-1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          canonicalRouteNodeId: "NODE-SCBL-GBP",
        },
      },
    }) as { resolvedFields: Array<Record<string, unknown>> };
    expect(result.resolvedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "53",
          resolutionStatus: "RESOLVED",
          resolvedValue: "BARCGB22",
        }),
        expect.objectContaining({
          tag: "56",
          resolutionStatus: "NOT_REQUIRED",
          reasonCode: "ROUTE_COMPLETE",
          resolvedValue: null,
          provenance: expect.objectContaining({
            source: "ROUTE_RESOLVER",
            ownerSide: "CANONICAL_ROUTE",
            candidateSource: "SYNTHETIC_DEMO",
            candidateOwnerSide: "SENDER_SIDE",
          }),
        }),
        expect.objectContaining({
          tag: "57",
          resolutionStatus: "RESOLVED",
          resolvedValue: "SCBLGB2L",
        }),
        expect.objectContaining({
          tag: "58",
          officialFieldName: "Beneficiary Institution",
          scopeStatus: "OUT_OF_SSI_SCOPE",
          resolutionStatus: "N_A",
          reasonCode: "MESSAGE_PROFILE_EXCLUDED",
          resolvedValue: null,
          provenance: expect.objectContaining({
            source: "MESSAGE_PROFILE",
            ownerSide: "CANONICAL_ROUTE",
          }),
        }),
      ]),
    );
  });

  it("does not normalize equal BICs when canonical route nodes differ", () => {
    const result = service.resolve({
      ...treasuryRequest,
      messageType: "MT300",
      businessFunction: "FX_CONFIRMATION",
      sequence: "B1",
      settlementLeg: "Amount Bought",
      roles: {
        DELIVERY_AGENT: "BARCGB22",
        INTERMEDIARY_INSTITUTION: "BARCGB22",
        RECEIVING_AGENT: "SCBLGB2L",
      },
      roleEvidence: {
        DELIVERY_AGENT: {
          ownerSide: "SENDER_SIDE",
          sourceType: "SYNTHETIC_DEMO",
          sourceRecordId: "SSI-GBP-1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          canonicalRouteNodeId: "BARC-LONDON-ACCOUNT-1",
        },
        INTERMEDIARY_INSTITUTION: {
          ownerSide: "SENDER_SIDE",
          sourceType: "SYNTHETIC_DEMO",
          sourceRecordId: "SSI-GBP-1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          canonicalRouteNodeId: "BARC-LONDON-ACCOUNT-2",
        },
        RECEIVING_AGENT: {
          ownerSide: "RECEIVER_SIDE",
          sourceType: "SYNTHETIC_DEMO",
          sourceRecordId: "SSI-GBP-1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          canonicalRouteNodeId: "NODE-SCBL-GBP",
        },
      },
    }) as { resolvedFields: Array<Record<string, unknown>> };
    expect(
      result.resolvedFields.find((field) => field["tag"] === "56"),
    ).toMatchObject({
      resolutionStatus: "RESOLVED",
      resolvedValue: "BARCGB22",
    });
  });

  it("keeps the MT400 receiver correspondent when 54 and 57 are the same route node", () => {
    const result = service.resolve({
      ...treasuryRequest,
      resolutionMode: "TRADE_FINANCE",
      messageType: "MT400",
      businessFunction: "COLLECTION_PAYMENT",
      sequence: "MESSAGE",
      settlementLeg: "Message",
      roles: {
        RECEIVERS_CORRESPONDENT: "CITIUS33",
        ACCOUNT_WITH_INSTITUTION: "CITIUS33",
      },
      roleEvidence: {
        RECEIVERS_CORRESPONDENT: {
          ownerSide: "RECEIVER_SIDE",
          sourceType: "SYNTHETIC_DEMO",
          sourceRecordId: "SSI-USD-1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          canonicalRouteNodeId: "NODE-CITI-USD",
        },
        ACCOUNT_WITH_INSTITUTION: {
          ownerSide: "RECEIVER_SIDE",
          sourceType: "SYNTHETIC_DEMO",
          sourceRecordId: "SSI-USD-1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          canonicalRouteNodeId: "NODE-CITI-USD",
        },
      },
    }) as { resolvedFields: Array<Record<string, unknown>> };
    expect(result.resolvedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "54",
          resolutionStatus: "RESOLVED",
          resolvedValue: "CITIUS33",
        }),
        expect.objectContaining({
          tag: "57",
          resolutionStatus: "NOT_REQUIRED",
          reasonCode: "ROUTE_COMPLETE",
          resolvedValue: null,
        }),
      ]),
    );
  });

  it("keeps the MT765 endpoint and omits a duplicate intermediary", () => {
    const result = service.resolve({
      ...treasuryRequest,
      resolutionMode: "TRADE_FINANCE",
      messageType: "MT765",
      businessFunction: "CLAIM",
      sequence: "A",
      settlementLeg: "Beneficiary",
      roles: {
        INTERMEDIARY_INSTITUTION: "BARCGB22",
        ACCOUNT_WITH_INSTITUTION: "BARCGB22",
      },
      roleEvidence: {
        INTERMEDIARY_INSTITUTION: {
          ownerSide: "SENDER_SIDE",
          sourceType: "SYNTHETIC_DEMO",
          sourceRecordId: "SSI-GBP-1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          canonicalRouteNodeId: "NODE-BARC-GBP",
        },
        ACCOUNT_WITH_INSTITUTION: {
          ownerSide: "SENDER_SIDE",
          sourceType: "SYNTHETIC_DEMO",
          sourceRecordId: "SSI-GBP-1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          canonicalRouteNodeId: "NODE-BARC-GBP",
        },
      },
    }) as { resolvedFields: Array<Record<string, unknown>> };
    expect(result.resolvedFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tag: "56",
          resolutionStatus: "NOT_REQUIRED",
          reasonCode: "ROUTE_COMPLETE",
          resolvedValue: null,
        }),
        expect.objectContaining({
          tag: "57",
          resolutionStatus: "RESOLVED",
          resolvedValue: "BARCGB22",
        }),
      ]),
    );
  });

  it("normalizes every SR2026 MT3/MT4/MT7 exact option-A profile independently", () => {
    const realCatalogueService = new MappingCatalogueService();
    const realService = new FinFieldResolutionService(
      realCatalogueService,
      new FinFieldResolutionPolicy(),
    );
    const mappings = realCatalogueService
      .get("SR2026")
      .mappings.filter(
        (mapping) =>
          mapping.direction === "OUTGOING" &&
          /^MT[347]/.test(mapping.messageType) &&
          mapping.option === "A" &&
          /(?:^|\.)(5[3-8])A$/.test(mapping.path) &&
          mapping.evidenceStatus === "FIELD_PROFILE_PROVEN",
      );
    const supportedMessages = new Set(
      mappings
        .filter(
          (mapping) =>
            mapping.scopeStatus === "SSI_SUPPORTED" &&
            mapping.reusableCandidate === true,
        )
        .map((mapping) => mapping.messageType),
    );
    const groups = new Map<string, Mapping[]>();
    for (const mapping of mappings.filter((item) =>
      supportedMessages.has(item.messageType),
    )) {
      const key = [
        mapping.messageType,
        mapping.businessFunction,
        mapping.sequence,
        mapping.settlementLeg,
      ].join("|");
      groups.set(key, [...(groups.get(key) ?? []), mapping]);
    }
    expect(groups.size).toBeGreaterThan(50);

    for (const profile of groups.values()) {
      const first = profile[0]!;
      const isMt400 = first.messageType === "MT400";
      const roleOwner = (role: string) =>
        [
          "RECEIVING_AGENT",
          "RECEIVERS_CORRESPONDENT",
          "BENEFICIARY_INSTITUTION",
        ].includes(role) ||
        (isMt400 && role === "ACCOUNT_WITH_INSTITUTION")
          ? "RECEIVER_SIDE"
          : [
                "ADVISING_BANK",
                "ADVISE_THROUGH_BANK",
                "REQUESTED_CONFIRMATION_PARTY",
                "NEGOTIATING_BANK",
                "BENEFICIARY_BANK",
              ].includes(role)
            ? "TRANSACTION_PARTY"
            : "SENDER_SIDE";
      const roleValue = (role: string) =>
        roleOwner(role) === "RECEIVER_SIDE"
          ? "SCBLGB2L"
          : roleOwner(role) === "TRANSACTION_PARTY"
            ? "CITIUS33"
            : "BARCGB22";
      const roles = Object.fromEntries(
        profile.map((mapping) => [
          mapping.canonicalRole,
          roleValue(mapping.canonicalRole),
        ]),
      );
      const roleEvidence = Object.fromEntries(
        profile.map((mapping) => {
          const ownerSide = roleOwner(mapping.canonicalRole);
          const value = roleValue(mapping.canonicalRole);
          return [
            mapping.canonicalRole,
            {
              ownerSide,
              sourceType: "SYNTHETIC_DEMO",
              sourceRecordId: `ALL-PROFILES-${first.messageType}`,
              status: "ACTIVE",
              approvalStatus: "APPROVED",
              canonicalRouteNodeId: `${ownerSide}|${value}|GBP|TEST-ACCOUNT`,
            },
          ];
        }),
      );
      const result = realService.resolve({
        ...treasuryRequest,
        resolutionMode: first.messageType.startsWith("MT3")
          ? "TREASURY"
          : "TRADE_FINANCE",
        messageType: first.messageType,
        businessFunction: first.businessFunction,
        sequence: first.sequence,
        settlementLeg: first.settlementLeg,
        roles,
        roleEvidence,
      }) as { resolvedFields: ResolvedFieldForTest[] };
      const resolvedNodes = result.resolvedFields
        .filter((field) => field.resolutionStatus === "RESOLVED")
        .map(
          (field) =>
            `${field.provenance["ownerSide"]}|${field.provenance["canonicalRouteNodeId"]}`,
        );
      expect(new Set(resolvedNodes).size).toBe(resolvedNodes.length);
      expect(
        result.resolvedFields.every((field) =>
          ["RESOLVED", "NOT_REQUIRED", "N_A", "NO_ELIGIBLE_SSI"].includes(
            field.resolutionStatus,
          ),
        ),
      ).toBe(true);
    }
  });

  it.each(["MT202", "pacs.009.001.12", "MT321", "MT370"])(
    "rejects %s from reference-only FIN field resolution",
    (messageType) => {
      expect(() =>
        service.resolve({ ...treasuryRequest, messageType }),
      ).toThrow(BadRequestException);
    },
  );

  it("fails closed when an exact option profile does not exist", () => {
    try {
      service.resolve({ ...treasuryRequest, fieldOptions: { "57": "B" } });
      throw new Error("expected failure");
    } catch (error) {
      expect(error).toBeInstanceOf(UnprocessableEntityException);
      expect(
        (error as UnprocessableEntityException).getResponse(),
      ).toMatchObject({
        code: "OPTION_CONSTRAINT_VIOLATION",
        reasonCode: "NO_EXACT_FIN_FIELD_OPTION_PROFILE",
        payloadGenerated: false,
      });
    }
  });

  it("fails closed when a governed profile has no selectable default option", () => {
    const mappingWithoutOption = {
      ...catalogue.mappings.find(({ messageType }) => messageType === "MT350")!,
      option: undefined,
    } satisfies Mapping;

    expect(() =>
      serviceWithMappings([mappingWithoutOption]).resolve(treasuryRequest),
    ).toThrow(UnprocessableEntityException);
  });

  it("fails closed when any requested tag option is absent from a multi-tag profile", () => {
    expect(() =>
      service.resolve({
        ...treasuryRequest,
        resolutionMode: "TRADE_FINANCE",
        messageType: "MT400",
        businessFunction: "COLLECTION_PAYMENT",
        sequence: "MESSAGE",
        settlementLeg: "Message",
        fieldOptions: { "54": "Z", "57": "A" },
        roles: {
          RECEIVERS_CORRESPONDENT: "DEUTDEFF",
          ACCOUNT_WITH_INSTITUTION: "CITIUS33",
        },
      }),
    ).toThrow(UnprocessableEntityException);
  });

  it("returns a data-quality profile failure when an explicit option has no structured source", () => {
    const optionD = {
      ...catalogue.mappings.find(({ messageType }) => messageType === "MT350")!,
      path: "C.57D",
      option: "D",
      presence: "OPTIONAL",
    } as const;
    const action = () =>
      serviceWithMappings([optionD]).resolve({
        ...treasuryRequest,
        fieldOptions: { "57": "D" },
        roles: {},
      });

    expect(action).toThrow(HttpException);
    try {
      action();
    } catch (error) {
      expect((error as HttpException).getStatus()).toBe(409);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: "PROFILE_INCOMPLETE",
        payloadGenerated: false,
      });
    }
  });

  it("returns a server failure for an incomplete mandatory profile outside development", () => {
    const priorRuntimeEnvironment = process.env["SSI_RUNTIME_ENV"];
    process.env["SSI_RUNTIME_ENV"] = "production";
    try {
      service.resolve({
        ...treasuryRequest,
        messageType: "MT300",
        businessFunction: "FX_CONFIRMATION",
        sequence: "B1",
        settlementLeg: "Amount Bought",
        roles: {},
        roleEvidence: {},
      });
      throw new Error("expected mandatory profile failure");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(500);
      expect((error as HttpException).getResponse()).toMatchObject({
        code: "PROFILE_INCOMPLETE",
        reasonCode: "MANDATORY_FIN_ROLE_UNAVAILABLE",
        payloadGenerated: false,
      });
    } finally {
      if (priorRuntimeEnvironment === undefined)
        delete process.env["SSI_RUNTIME_ENV"];
      else process.env["SSI_RUNTIME_ENV"] = priorRuntimeEnvironment;
    }
  });

  it("defaults an unset runtime environment to development for profile failures", () => {
    const priorRuntimeEnvironment = process.env["SSI_RUNTIME_ENV"];
    delete process.env["SSI_RUNTIME_ENV"];
    try {
      service.resolve({
        ...treasuryRequest,
        messageType: "MT300",
        businessFunction: "FX_CONFIRMATION",
        sequence: "B1",
        settlementLeg: "Amount Bought",
        roles: {},
        roleEvidence: {},
      });
      throw new Error("expected mandatory profile failure");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(409);
    } finally {
      if (priorRuntimeEnvironment === undefined)
        delete process.env["SSI_RUNTIME_ENV"];
      else process.env["SSI_RUNTIME_ENV"] = priorRuntimeEnvironment;
    }
  });

  it("requires an exact sequence or settlement leg for multi-leg profiles", () => {
    expect(() =>
      service.resolve({
        ...treasuryRequest,
        messageType: "MT300",
        businessFunction: "FX_CONFIRMATION",
        sequence: undefined,
        settlementLeg: undefined,
      }),
    ).toThrow(BadRequestException);
  });

  it("fails closed when the requested exact profile is absent", () => {
    expect(() =>
      service.resolve({ ...treasuryRequest, sequence: "UNKNOWN" }),
    ).toThrow(BadRequestException);
  });

  it("requires evidence before applying a direct-account omission", () => {
    expect(() =>
      service.resolve({
        ...treasuryRequest,
        controls: { accountRelationship: "DIRECT_ACCOUNT" },
      }),
    ).toThrow(BadRequestException);
  });

  it("attributes direct-account omissions to the canonical route resolver", () => {
    const result = service.resolve({
      ...treasuryRequest,
      controls: {
        accountRelationship: "DIRECT_ACCOUNT",
        directRelationshipEvidenceId: "DIRECT-USD-1",
      },
    }) as { resolvedFields: Array<Record<string, unknown>> };
    expect(result.resolvedFields[0]).toMatchObject({
      resolutionStatus: "NOT_REQUIRED",
      reasonCode: "DIRECT_ACCOUNT_RELATIONSHIP",
      resolvedValue: null,
      provenance: {
        source: "ROUTE_RESOLVER",
        ownerSide: "CANONICAL_ROUTE",
        sourceRecordId: "DIRECT-USD-1",
      },
    });
  });

  it("attributes a complete-route omission to the canonical route resolver", () => {
    const result = service.resolve({
      ...treasuryRequest,
      controls: {
        routeGraph: {
          routeComplete: true,
          evidenceValid: true,
          additionalAccountWithRequired: false,
        },
      },
    }) as { resolvedFields: Array<Record<string, unknown>> };
    expect(result.resolvedFields[0]).toMatchObject({
      resolutionStatus: "NOT_REQUIRED",
      reasonCode: "ROUTE_COMPLETE",
      resolvedValue: null,
      provenance: {
        source: "ROUTE_RESOLVER",
        ownerSide: "CANONICAL_ROUTE",
      },
    });
  });

  it("returns MISSING_SSI when a required role has no candidate value", () => {
    const result = service.resolve({
      ...treasuryRequest,
      roles: {},
      roleEvidence: {},
    }) as { resolvedFields: Array<Record<string, unknown>> };
    expect(result.resolvedFields[0]).toMatchObject({
      resolutionStatus: "NO_ELIGIBLE_SSI",
      reasonCode: "MISSING_SSI",
      resolvedValue: null,
    });
  });

  it("does not resolve a role value when its persisted provenance is absent", () => {
    const result = service.resolve({
      ...treasuryRequest,
      sourceSsiId: undefined,
      roleSources: {},
      roleEvidence: {},
    }) as { resolvedFields: Array<Record<string, unknown>> };
    expect(result.resolvedFields[0]).toMatchObject({
      resolutionStatus: "NO_ELIGIBLE_SSI",
      reasonCode: "CONFLICTING_SSI",
      resolvedValue: null,
    });
  });

  it.each([
    {
      controls: {
        routeGraph: {
          routeComplete: false,
          evidenceValid: false,
          additionalAccountWithRequired: true,
        },
      },
    },
    { roleEvidence: { RECEIVING_AGENT: { status: "INACTIVE" } } },
    { roleEvidence: { RECEIVING_AGENT: { approvalStatus: "REJECTED" } } },
    { roleEvidence: { RECEIVING_AGENT: { effectiveFrom: "2026-09-09" } } },
    { roleEvidence: { RECEIVING_AGENT: { effectiveTo: "2026-09-07" } } },
  ])("rejects an ineligible SSI candidate: %#", (override) => {
    const result = service.resolve({
      ...treasuryRequest,
      ...override,
    } as FinFieldResolutionRequest) as {
      resolvedFields: Array<Record<string, unknown>>;
    };
    expect(result.resolvedFields[0]).toMatchObject({
      resolutionStatus: "NO_ELIGIBLE_SSI",
      reasonCode: "CONFLICTING_SSI",
      resolvedValue: null,
    });
  });

  it.each([
    { service: "NOT_FIN" },
    { direction: "INCOMING" },
    { standardsRelease: "SR2025" },
    { businessFunction: "" },
    { transactionReference: "" },
    { currency: "" },
    { receiverBic: "" },
    { valueDate: "" },
  ])("rejects an incomplete or invalid FIN context: %#", (override) => {
    expect(() =>
      service.resolve({
        ...treasuryRequest,
        ...override,
      } as FinFieldResolutionRequest),
    ).toThrow(BadRequestException);
  });

  it("rejects a message family outside MT3/MT4/MT7", () => {
    expect(() =>
      service.resolve({ ...treasuryRequest, messageType: "MT500" }),
    ).toThrow(BadRequestException);
  });

  it("rejects a resolution mode that does not match the message category", () => {
    expect(() =>
      service.resolve({
        ...treasuryRequest,
        resolutionMode: "TRADE_FINANCE",
      }),
    ).toThrow(BadRequestException);
  });

  it("derives a unique exact profile when sequence and leg are omitted", () => {
    const result = service.resolve({
      ...treasuryRequest,
      sequence: undefined,
      settlementLeg: undefined,
    }) as { messageContext: Record<string, unknown> };
    expect(result.messageContext).toMatchObject({
      sequence: "C",
      settlementLeg: "Settlement Instructions",
    });
  });

  it("supports a proven path-derived tag and optional catalogue metadata", () => {
    const sparseMapping = {
      standardsRelease: "SR2026",
      messageType: "MT350",
      direction: "OUTGOING",
      businessFunction: "LOAN_DEPOSIT_INTEREST_PAYMENT",
      path: "C.57A",
      sequence: "C",
      canonicalRole: "RECEIVING_AGENT",
      officialFieldName: "Receiving Agent",
      scopeStatus: "SSI_SUPPORTED",
      reusableCandidate: true,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
      option: "A",
    } satisfies Mapping;
    const nonFinMapping = {
      ...sparseMapping,
      path: "C.59A",
      canonicalRole: "NON_FIN_FIELD",
    } satisfies Mapping;
    const result = serviceWithMappings([nonFinMapping, sparseMapping]).resolve({
      ...treasuryRequest,
      settlementLeg: undefined,
      fieldOptions: { "57": "A" },
      sourceSsiId: "SSI-FALLBACK",
      roleSources: { RECEIVING_AGENT: "ROLE_SOURCE" },
      roleEvidence: undefined,
    }) as { resolvedFields: Array<Record<string, unknown>> };
    expect(result.resolvedFields[0]).toMatchObject({
      tag: "57",
      sequence: "C",
      settlementLeg: "C",
      option: "A",
      officialFieldName: "Receiving Agent",
      officialRole: "RECEIVING_AGENT",
      nvrRefs: [],
      reasonCode: "EXACT_ELIGIBLE_SSI",
      provenance: {
        source: "ROLE_SOURCE",
        sourceRecordId: "SSI-FALLBACK",
      },
    });
  });

  it.each([
    ["REQUESTED_CONFIRMATION_PARTY", "CONFIRMATION_PARTY"],
    ["ADVISE_THROUGH_BANK", "TRADE_ROUTING_ROLE"],
    ["BENEFICIARY_BANK", "TRANSACTION_CONTEXT_PROVIDED"],
  ])("returns the controlled out-of-scope reason for %s", (role, reason) => {
    const outOfScopeMapping = {
      standardsRelease: "SR2026",
      messageType: "MT700",
      direction: "OUTGOING",
      businessFunction: "MT700_ISSUANCE",
      path: "58A",
      sequence: "MESSAGE",
      settlementLeg: "MESSAGE",
      tag: "58",
      option: "A",
      canonicalRole: role,
      officialFieldName: role,
      scopeStatus: "OUT_OF_SSI_SCOPE",
      reusableCandidate: false,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
    } satisfies Mapping;
    const supportedMapping = {
      ...outOfScopeMapping,
      path: "57A",
      tag: "57",
      canonicalRole: "RECEIVING_AGENT",
      officialFieldName: "Receiving Agent",
      scopeStatus: "SSI_SUPPORTED",
      reusableCandidate: true,
    } satisfies Mapping;
    const result = serviceWithMappings([
      outOfScopeMapping,
      supportedMapping,
    ]).resolve({
      ...treasuryRequest,
      resolutionMode: "TRADE_FINANCE",
      messageType: "MT700",
      businessFunction: "MT700_ISSUANCE",
      sequence: "MESSAGE",
      settlementLeg: "MESSAGE",
      roles: {},
      roleEvidence: undefined,
    }) as { resolvedFields: Array<Record<string, unknown>> };
    expect(
      result.resolvedFields.find((field) => field["tag"] === "58"),
    ).toMatchObject({
      resolutionStatus: "N_A",
      reasonCode: reason,
    });
  });

  it("preserves an eligible out-of-scope role from immutable transaction context", () => {
    const transactionPartyMapping = {
      standardsRelease: "SR2026",
      messageType: "MT700",
      direction: "OUTGOING",
      businessFunction: "MT700_ISSUANCE",
      path: "58A",
      sequence: "MESSAGE",
      settlementLeg: "MESSAGE",
      tag: "58",
      option: "A",
      canonicalRole: "ADVISE_THROUGH_BANK",
      officialFieldName: "Advise Through Bank",
      scopeStatus: "OUT_OF_SSI_SCOPE",
      reusableCandidate: false,
      evidenceStatus: "FIELD_PROFILE_PROVEN",
    } satisfies Mapping;
    const supportedMapping = {
      ...transactionPartyMapping,
      path: "57A",
      tag: "57",
      canonicalRole: "RECEIVING_AGENT",
      officialFieldName: "Receiving Agent",
      scopeStatus: "SSI_SUPPORTED",
      reusableCandidate: true,
    } satisfies Mapping;

    const result = serviceWithMappings([
      transactionPartyMapping,
      supportedMapping,
    ]).resolve({
      ...treasuryRequest,
      resolutionMode: "TRADE_FINANCE",
      messageType: "MT700",
      businessFunction: "MT700_ISSUANCE",
      sequence: "MESSAGE",
      settlementLeg: "MESSAGE",
      roles: {
        ADVISE_THROUGH_BANK: "DEUTDEFF",
        RECEIVING_AGENT: "CITIUS33",
      },
      roleEvidence: {
        ADVISE_THROUGH_BANK: {
          ownerSide: "TRANSACTION_PARTY",
          sourceType: "IMMUTABLE_UPSTREAM_INSTRUCTION",
          sourceRecordId: "TX-CONTEXT-1",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
        },
        RECEIVING_AGENT:
          treasuryRequest.roleEvidence?.["RECEIVING_AGENT"] ?? {},
      },
    }) as { resolvedFields: Array<Record<string, unknown>> };

    expect(
      result.resolvedFields.find((field) => field["tag"] === "58"),
    ).toMatchObject({
      resolutionStatus: "RESOLVED",
      reasonCode: "PRESERVED_FROM_TRANSACTION_CONTEXT",
      resolvedValue: "DEUTDEFF",
      provenance: {
        source: "IMMUTABLE_UPSTREAM_INSTRUCTION",
        sourceRecordId: "TX-CONTEXT-1",
        ownerSide: "TRANSACTION_PARTY",
      },
    });
  });
});

interface ResolvedFieldForTest {
  resolutionStatus: string;
  provenance: Record<string, unknown>;
}
