import { BadRequestException } from "@nestjs/common";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MappingCatalogueService } from "./mapping-catalogue.service";
import { MessageMappingService } from "./message-mapping.service";

const setup = () => {
  const path = join(
    mkdtempSync(join(tmpdir(), "mapping-service-")),
    "catalogue.json",
  );
  writeFileSync(
    path,
    JSON.stringify({
      catalogueVersion: "2026.1-test",
      mappings: [
        {
          standardsRelease: "SR2026",
          messageType: "MT300",
          direction: "OUTGOING",
          businessFunction: "FX_CONFIRMATION",
          path: "53A",
          sequence: "MESSAGE",
          option: "A",
          canonicalRole: "DELIVERY_AGENT",
          officialFieldName: "Delivery Agent",
          reusableCandidate: true,
          evidenceStatus: "FIELD_PROFILE_PROVEN",
          evidenceArtifactId: "SWIFT-TEST-MRG",
          evidencePages: [10],
        },
        {
          standardsRelease: "SR2026",
          messageType: "MT400",
          direction: "OUTGOING",
          businessFunction: "COLLECTION_PAYMENT_DIRECT",
          path: "53A",
          canonicalRole: "SENDERS_CORRESPONDENT",
          reusableCandidate: true,
          evidenceStatus: "PENDING_EVIDENCE",
          suggestionEnabled: false,
          evidenceArtifactId: "SWIFT-TEST-CHANGE-POINTER",
          evidencePages: [7],
        },
        {
          standardsRelease: "SR2026",
          messageType: "MT705",
          direction: "OUTGOING",
          businessFunction: "REFERENCE_ONLY",
          path: "57A",
          sequence: "MESSAGE",
          option: "A",
          canonicalRole: "ADVISE_THROUGH_BANK",
          officialFieldName: "'Advise Through' Bank",
          reusableCandidate: false,
          evidenceStatus: "FIELD_PROFILE_PROVEN",
          evidenceArtifactId: "SWIFT-US7M-FULL-TEST",
          evidencePages: [58],
        },
      ],
    }),
  );
  const catalogues = new MappingCatalogueService({
    SR2026: { path, sourceArtifactId: "G2-SR2026-TEST" },
  });
  return new MessageMappingService(catalogues);
};

const setupWithMappings = (mappings: ReadonlyArray<Record<string, unknown>>) => {
  const path = join(
    mkdtempSync(join(tmpdir(), "mapping-service-custom-")),
    "catalogue.json",
  );
  writeFileSync(
    path,
    JSON.stringify({ catalogueVersion: "2026.1-custom", mappings }),
  );
  return new MessageMappingService(
    new MappingCatalogueService({
      SR2026: { path, sourceArtifactId: "G2-SR2026-CUSTOM" },
    }),
  );
};

const request = {
  service: "FIN" as const,
  standardsRelease: "SR2026",
  messageType: "MT300",
  direction: "OUTGOING" as const,
  businessFunction: "FX_CONFIRMATION",
  transactionReference: "TX-1",
  currency: "USD",
  receiverBic: "CHASUS33",
  valueDate: "2026-09-08",
  roles: { DELIVERY_AGENT: "CITIUS33" },
};

describe("MessageMappingService catalogue provenance", () => {
  it("pins the exact catalogue metadata to output and field evidence", () => {
    const result = setup().suggestFinTags(request) as {
      catalogue: Record<string, string>;
      suggestions: Array<{ provenance: Record<string, string> }>;
    };
    expect(result.catalogue).toMatchObject({
      catalogueVersion: "2026.1-test",
      sourceArtifactId: "G2-SR2026-TEST",
    });
    expect(result.catalogue["sourceArtifactHash"]).toMatch(/^[a-f0-9]{64}$/);
    expect(result.suggestions[0]?.provenance).toMatchObject(result.catalogue);
    expect(result.suggestions[0]?.provenance).toMatchObject({
      fieldProfileEvidenceStatus: "FIELD_PROFILE_PROVEN",
      fieldProfileArtifactId: "SWIFT-TEST-MRG",
      fieldProfileEvidencePages: [10],
    });
    expect(result.suggestions[0]).toMatchObject({
      sequence: "MESSAGE",
      option: "A",
      canonicalRole: "DELIVERY_AGENT",
      officialFieldName: "Delivery Agent",
    });
  });

  it("fails fast on an invalid value date", () => {
    expect(() =>
      setup().suggestFinTags({ ...request, valueDate: "2026-02-29" }),
    ).toThrow(BadRequestException);
  });

  it("accepts an effective, approved synthetic demo role and preserves its provenance", () => {
    const result = setup().suggestFinTags({
      ...request,
      messageType: "MT705",
      businessFunction: "REFERENCE_ONLY",
      roles: { ADVISE_THROUGH_BANK: "CITIUS33" },
      roleSources: { ADVISE_THROUGH_BANK: "SYNTHETIC_DEMO" },
      roleEvidence: {
        ADVISE_THROUGH_BANK: {
          ownerSide: "TRANSACTION_PARTY",
          sourceType: "SYNTHETIC_DEMO",
          sourceRecordId: "SYN-MT705-001",
          status: "ACTIVE",
          approvalStatus: "APPROVED",
          effectiveFrom: "2026-01-01",
          effectiveTo: "2027-12-31",
          version: "1",
          demoData: true,
        },
      },
    }) as {
      suggestions: unknown[];
      supportAnalysis: Array<Record<string, unknown>>;
    };
    expect(result.suggestions).toHaveLength(0);
    expect(result.supportAnalysis).toContainEqual(
      expect.objectContaining({
        tag: "57A",
        scopeStatus: "OUT_OF_SSI_SCOPE",
        resolutionStatus: "N_A",
        reasonCode: "TRADE_ROUTING_ROLE",
      }),
    );
  });

  it("rejects synthetic demo evidence outside its effective period", () => {
    expect(() =>
      setup().suggestFinTags({
        ...request,
        messageType: "MT705",
        businessFunction: "REFERENCE_ONLY",
        valueDate: "2028-01-01",
        roles: { ADVISE_THROUGH_BANK: "CITIUS33" },
        roleEvidence: {
          ADVISE_THROUGH_BANK: {
            ownerSide: "TRANSACTION_PARTY",
            sourceType: "SYNTHETIC_DEMO",
            sourceRecordId: "SYN-MT705-001",
            status: "ACTIVE",
            approvalStatus: "APPROVED",
            effectiveFrom: "2026-01-01",
            effectiveTo: "2027-12-31",
            version: "1",
            demoData: true,
          },
        },
      }),
    ).toThrow(BadRequestException);
  });

  it("fails closed when the only profile row has pointer-only evidence", () => {
    try {
      setup().suggestFinTags({
        ...request,
        messageType: "MT400",
        businessFunction: "COLLECTION_PAYMENT_DIRECT",
        roles: { SENDERS_CORRESPONDENT: "CITIUS33" },
      });
      throw new Error("expected MAPPING_PENDING");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "MAPPING_PENDING",
        candidateFields: [
          {
            tag: "53A",
            evidenceStatus: "PENDING_EVIDENCE",
            evidenceArtifactId: "SWIFT-TEST-CHANGE-POINTER",
            evidencePages: [7],
          },
        ],
      });
    }
  });

  it("requires direct-account relationship evidence before resolving omissions", () => {
    try {
      setup().suggestFinTags({
        ...request,
        messageType: "MT400",
        businessFunction: "COLLECTION_PAYMENT_DIRECT",
        controls: { accountRelationship: "DIRECT_ACCOUNT" },
        roles: {},
      });
      throw new Error("expected DIRECT_RELATIONSHIP_EVIDENCE_REQUIRED");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "DIRECT_RELATIONSHIP_EVIDENCE_REQUIRED",
        validationLayer: "EVIDENCE_MISSING",
      });
    }
  });

  it("separates an evidenced direct-route omission from pending field-profile evidence", () => {
    const result = setup().suggestFinTags({
      ...request,
      messageType: "MT400",
      businessFunction: "COLLECTION_PAYMENT_DIRECT",
      controls: {
        accountRelationship: "DIRECT_ACCOUNT",
        directRelationshipEvidenceId: "BILATERAL-USD-001",
      },
      roles: {},
    }) as {
      profileEvidence: { status: string };
      routeDecision: { status: string; reason: string };
      fieldDispositions: Array<{
        tag: string;
        disposition: string;
        reason: string;
      }>;
      fields: Record<string, string>;
      supportAnalysis: Array<Record<string, unknown>>;
    };

    expect(result.profileEvidence.status).toBe("PENDING_EVIDENCE");
    expect(result.routeDecision).toMatchObject({
      status: "EVIDENCED",
      reason: "DIRECT_ACCOUNT",
    });
    expect(result.fieldDispositions).toEqual([
      expect.objectContaining({ tag: "53A", disposition: "OMIT", reason: "DIRECT_ACCOUNT" }),
      expect.objectContaining({ tag: "54A", disposition: "OMIT", reason: "DIRECT_ACCOUNT" }),
      expect.objectContaining({ tag: "57A", disposition: "OMIT", reason: "DIRECT_ACCOUNT" }),
      expect.objectContaining({
        tag: "58A",
        disposition: "OPTIONAL_TRANSACTION_INPUT",
        reason: "TRANSACTION_INPUT_NOT_PROVIDED",
      }),
    ]);
    expect(result.fields).toEqual({});
    expect(result.supportAnalysis).toContainEqual(
      expect.objectContaining({
        tag: "53A",
        scopeStatus: "SSI_SUPPORTED",
        resolutionStatus: "NOT_REQUIRED",
        reasonCode: "DIRECT_ACCOUNT_RELATIONSHIP",
      }),
    );
  });

  it("shows a transaction-provided 58A only with qualified transaction evidence", () => {
    const result = setup().suggestFinTags({
      ...request,
      messageType: "MT400",
      businessFunction: "COLLECTION_PAYMENT_DIRECT",
      controls: {
        accountRelationship: "DIRECT_ACCOUNT",
        directRelationshipEvidenceId: "BILATERAL-USD-001",
      },
      roles: { BENEFICIARY_BANK: "BOFAUS3N" },
      roleEvidence: {
        BENEFICIARY_BANK: {
          ownerSide: "TRANSACTION_PARTY",
          sourceType: "AUTHENTICATED_TRANSACTION_INSTRUCTION",
          authorizedChannel: true,
          transactionId: "TX-1",
          messageVersion: "1",
          roleAssignment: "BENEFICIARY_BANK",
        },
      },
    }) as {
      fieldDispositions: Array<{
        tag: string;
        disposition: string;
        value?: string;
      }>;
      fields: Record<string, string>;
    };

    expect(result.fieldDispositions).toContainEqual(
      expect.objectContaining({
        tag: "58A",
        disposition: "VALUE_FROM_TRANSACTION_INPUT",
        value: "BOFAUS3N",
      }),
    );
    expect(result.fields).toEqual({});
  });
});

describe("MessageMappingService parsing and mapping round trips", () => {
  it("parses MX JSON and rejects malformed JSON", () => {
    expect(
      setup().parse(
        JSON.stringify({
          standardsRelease: "SR2026",
          messageType: "MT300",
          direction: "OUTGOING",
          businessFunction: "FX_CONFIRMATION",
          fields: { "53A": "CITIUS33" },
        }),
        "MX_JSON",
      ),
    ).toMatchObject({ messageType: "MT300", fields: { "53A": "CITIUS33" } });
    expect(() => setup().parse("{not-json", "MX_JSON")).toThrow("INVALID_JSON");
  });

  it("parses FIN-like headers and fields and reports malformed input", () => {
    const parsed = setup().parse(
      [
        "STANDARDS_RELEASE=SR2026",
        "MESSAGE_TYPE=MT300",
        "DIRECTION=OUTGOING",
        "BUSINESS_FUNCTION=FX_CONFIRMATION",
        ":53A:CITIUS33",
      ].join("\n"),
      "FIN_LIKE",
    );
    expect(parsed).toEqual({
      standardsRelease: "SR2026",
      messageType: "MT300",
      direction: "OUTGOING",
      businessFunction: "FX_CONFIRMATION",
      fields: { "53A": "CITIUS33" },
    });
    expect(() => setup().parse("not-a-header-or-field", "FIN_LIKE")).toThrow(
      "INVALID_PSEUDO_LINE",
    );
    expect(() =>
      setup().parse("STANDARDS_RELEASE=SR2026", "FIN_LIKE"),
    ).toThrow("MISSING_OR_INVALID_HEADER");
  });

  it("extracts a unique role and diagnoses unmapped fields", () => {
    expect(
      setup().extract({
        standardsRelease: "SR2026",
        messageType: "MT300",
        direction: "OUTGOING",
        businessFunction: "FX_CONFIRMATION",
        fields: { "53A": "CITIUS33", "59": "CUSTOMER" },
      }),
    ).toMatchObject({
      roles: [
        {
          role: "DELIVERY_AGENT",
          sourcePath: "53A",
          value: "CITIUS33",
          reusableCandidate: true,
        },
      ],
      diagnostics: [
        { code: "UNMAPPED_SSI_FIELD", severity: "WARNING", path: "59" },
      ],
    });
  });

  it("diagnoses an ambiguous catalogue instead of choosing a role", () => {
    const mappings = ["DELIVERY_AGENT", "INTERMEDIARY_INSTITUTION"].map(
      (canonicalRole) => ({
        standardsRelease: "SR2026",
        messageType: "MT300",
        direction: "OUTGOING",
        businessFunction: "FX_CONFIRMATION",
        path: "53A",
        canonicalRole,
        reusableCandidate: true,
      }),
    );
    expect(
      setupWithMappings(mappings).extract({
        standardsRelease: "SR2026",
        messageType: "MT300",
        direction: "OUTGOING",
        businessFunction: "FX_CONFIRMATION",
        fields: { "53A": "CITIUS33" },
      }),
    ).toMatchObject({
      roles: [],
      diagnostics: [
        { code: "AMBIGUOUS_SSI_MAPPING", severity: "ERROR", path: "53A" },
      ],
    });
  });

  it("generates only fields backed by supplied canonical roles", () => {
    expect(
      setup().generate(
        {
          standardsRelease: "SR2026",
          messageType: "MT300",
          direction: "OUTGOING",
          businessFunction: "FX_CONFIRMATION",
        },
        { DELIVERY_AGENT: "CITIUS33" },
      ),
    ).toEqual({
      fields: { "53A": "CITIUS33" },
      disclaimer: "SSI-field subset only; not a complete SWIFT message.",
    });
  });
});

describe("MessageMappingService FIN context and support decisions", () => {
  const expectCode = (operation: () => unknown, expectedCode: string): void => {
    try {
      operation();
      throw new Error(`expected ${expectedCode}`);
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: expectedCode,
      });
    }
  };

  it("requires complete, well-formed outward FIN context", () => {
    expect(() =>
      setup().suggestFinTags({ ...request, transactionReference: "" }),
    ).toThrow("REFERENCE_FIN_CONTEXT_REQUIRED");
    expectCode(
      () => setup().suggestFinTags({ ...request, currency: "US" }),
      "INPUT_INVALID_CURRENCY",
    );
    expectCode(
      () => setup().suggestFinTags({ ...request, receiverBic: "NOT-A-BIC" }),
      "INVALID_RECEIVER_FI_BIC_FORMAT",
    );
    expectCode(
      () =>
        setup().suggestFinTags({ ...request, direction: "INCOMING" as const }),
      "DIRECTION_NOT_SUPPORTED",
    );
  });

  it("fails closed for a message without a verified 5x profile", () => {
    expect(() =>
      setup().suggestFinTags({ ...request, messageType: "MT999" }),
    ).toThrow("NO_VERIFIED_FIN_5X_MAPPING");
  });

  it("returns the maintained pending-field set when a trade profile is unavailable", () => {
    try {
      setup().suggestFinTags({
        ...request,
        messageType: "MT707",
        businessFunction: "DOCUMENTARY_CREDIT_AMENDMENT",
        roles: {},
      });
      throw new Error("expected MAPPING_PENDING");
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: "MAPPING_PENDING",
        candidateFields: [
          { tag: "53A", semanticRole: "REIMBURSING_BANK" },
          { tag: "57A", semanticRole: "ADVISE_THROUGH_BANK" },
          { tag: "58A", semanticRole: "REQUESTED_CONFIRMATION_PARTY" },
        ],
      });
    }
  });

  it("sorts and deduplicates direct-account field-profile evidence pages", () => {
    const mappings = [
      {
        standardsRelease: "SR2026",
        messageType: "MT400",
        direction: "OUTGOING",
        businessFunction: "COLLECTION_PAYMENT_DIRECT",
        path: "53A",
        sequence: "MESSAGE",
        option: "A",
        canonicalRole: "SENDERS_CORRESPONDENT",
        officialFieldName: "Sender's Correspondent",
        reusableCandidate: true,
        evidenceStatus: "FIELD_PROFILE_PROVEN",
        evidenceArtifactId: "PROFILE-B",
        evidencePages: [20, 1],
      },
      {
        standardsRelease: "SR2026",
        messageType: "MT400",
        direction: "OUTGOING",
        businessFunction: "COLLECTION_PAYMENT_DIRECT",
        path: "58A",
        sequence: "MESSAGE",
        option: "A",
        canonicalRole: "BENEFICIARY_BANK",
        officialFieldName: "Beneficiary Bank",
        reusableCandidate: false,
        evidenceStatus: "FIELD_PROFILE_PROVEN",
        evidenceArtifactId: "PROFILE-A",
        evidencePages: [10, 20],
      },
    ];
    expect(
      setupWithMappings(mappings).suggestFinTags({
        ...request,
        messageType: "MT400",
        businessFunction: "COLLECTION_PAYMENT_DIRECT",
        roles: {},
        controls: {
          accountRelationship: "DIRECT_ACCOUNT",
          directRelationshipEvidenceId: "BILATERAL-1",
        },
      }),
    ).toMatchObject({
      profileEvidence: {
        status: "FIELD_PROFILE_PROVEN",
        sourceArtifactIds: ["PROFILE-B", "PROFILE-A"],
        evidencePages: [1, 10, 20],
      },
    });
  });

  it("classifies resolved, missing, conflicting and complete-route support", () => {
    const internals = setup() as unknown as {
      finMappingSupportAnalysis(
        request: never,
        mapping: never,
        suggestions: readonly never[],
      ): Record<string, unknown>;
    };
    const mapping = {
      standardsRelease: "SR2026",
      messageType: "MT400",
      direction: "OUTGOING",
      businessFunction: "COLLECTION_PAYMENT",
      path: "57A",
      sequence: "MESSAGE",
      option: "A",
      canonicalRole: "ACCOUNT_WITH_INSTITUTION",
      officialFieldName: "Account With Institution",
      reusableCandidate: true,
    };
    const supportRequest = {
      ...request,
      messageType: "MT400",
      businessFunction: "COLLECTION_PAYMENT",
    };
    expect(
      internals.finMappingSupportAnalysis(
        supportRequest as never,
        mapping as never,
        [] as never[],
      ),
    ).toMatchObject({ resolutionStatus: "NO_ELIGIBLE_SSI", reasonCode: "MISSING_SSI" });
    expect(
      internals.finMappingSupportAnalysis(
        {
          ...supportRequest,
          controls: {
            routeGraph: {
              routeComplete: false,
              evidenceValid: false,
              additionalAccountWithRequired: true,
            },
          },
        } as never,
        mapping as never,
        [] as never[],
      ),
    ).toMatchObject({
      resolutionStatus: "NO_ELIGIBLE_SSI",
      reasonCode: "CONFLICTING_SSI",
    });
    expect(
      internals.finMappingSupportAnalysis(
        {
          ...supportRequest,
          controls: {
            routeGraph: {
              routeComplete: true,
              evidenceValid: true,
              additionalAccountWithRequired: false,
            },
          },
        } as never,
        mapping as never,
        [] as never[],
      ),
    ).toMatchObject({ resolutionStatus: "NOT_REQUIRED", reasonCode: "ROUTE_COMPLETE" });

    for (const [ownerSide, reasonCode] of [
      ["RECEIVER_SIDE", "RESOLVED_FROM_COUNTERPARTY_SSI"],
      ["SENDER_SIDE", "RESOLVED_FROM_OWN_SSI"],
      [undefined, "EXACT_ELIGIBLE_SSI"],
    ] as const) {
      expect(
        internals.finMappingSupportAnalysis(
          supportRequest as never,
          mapping as never,
          [
            {
              tag: "57A",
              value: "CITIUS33",
              provenance: {
                source: "APPROVED_REFERENCE",
                sourceRecordId: "SSI-1",
                ownerSide,
              },
            } as never,
          ],
        ),
      ).toMatchObject({ resolutionStatus: "RESOLVED", reasonCode });
    }
  });

  it.each([
    ["MT700", "REQUESTED_CONFIRMATION_PARTY", "CONFIRMATION_PARTY"],
    ["MT700", "ADVISING_BANK", "TRADE_ROUTING_ROLE"],
    ["MT730", "ACCOUNT_WITH_BANK", "MESSAGE_PROFILE_EXCLUDED"],
    ["MT400", "BENEFICIARY_BANK", "TRANSACTION_CONTEXT_PROVIDED"],
  ])("classifies out-of-SSI-scope reason %#", (messageType, role, reason) => {
    const internals = setup() as unknown as {
      outOfScopeReason(messageType: string, canonicalRole: string): string;
    };
    expect(internals.outOfScopeReason(messageType, role)).toBe(reason);
  });
});

describe("MessageMappingService role evidence policy", () => {
  const validate = (change: Record<string, unknown>): void => {
    const internals = setup() as unknown as {
      validateFinSuggestionRequest(request: never): void;
    };
    internals.validateFinSuggestionRequest({ ...request, ...change } as never);
  };
  const expectCode = (change: Record<string, unknown>, expectedCode: string): void => {
    try {
      validate(change);
      throw new Error(`expected ${expectedCode}`);
    } catch (error) {
      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toMatchObject({
        code: expectedCode,
      });
    }
  };
  const masterEvidence = (ownerSide: string, sourceType: string) => ({
    ownerSide,
    sourceType,
    sourceRecordId: "MASTER-1",
    status: "ACTIVE",
    approvalStatus: "APPROVED",
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-12-31",
    version: "1",
  });
  const transactionEvidence = (ownerSide: string, sourceType: string, role: string) => ({
    ownerSide,
    sourceType,
    authorizedChannel: true,
    transactionId: "TX-1",
    messageVersion: "1",
    roleAssignment: role,
  });

  it("rejects malformed registered-FI role values", () => {
    expectCode(
      { roles: { DELIVERY_AGENT: "not-a-bic" } },
      "INVALID_REGISTERED_FI_BIC_FORMAT",
    );
  });

  it.each([
    [
      {
        messageType: "MT400",
        roles: { ACCOUNT_WITH_INSTITUTION: "CITIUS33" },
        controls: { accountRelationship: "AUTHENTICATED_RECEIVING_ROUTE" },
      },
      "MT400_C11_57A_REQUIRES_53A_AND_54A",
    ],
    [
      {
        messageType: "MT400",
        roles: { SENDERS_CORRESPONDENT: "CITIUS33" },
      },
      "NO_VERIFIED_RECEIVING_ROUTE",
    ],
    [
      {
        messageType: "MT400",
        roles: {},
        controls: { accountRelationship: "DIRECT_ACCOUNT" },
      },
      "MT400_DIRECT_RELATIONSHIP_EVIDENCE_REQUIRED",
    ],
    [
      {
        messageType: "MT400",
        roles: { SENDERS_CORRESPONDENT: "CITIUS33" },
        controls: {
          accountRelationship: "DIRECT_ACCOUNT",
          directRelationshipEvidenceId: "BILATERAL-1",
        },
      },
      "MT400_DIRECT_ACCOUNT_REQUIRES_53A_54A_57A_OMITTED",
    ],
  ])("enforces MT400 route relationship case %#", (change, code) => {
    expectCode(change, code);
  });

  it("accepts an evidenced MT400 route and rejects collapsed receiver roles", () => {
    const roles = {
      SENDERS_CORRESPONDENT: "CITIUS33",
      RECEIVERS_CORRESPONDENT: "BOFAUS3N",
      ACCOUNT_WITH_INSTITUTION: "CHASUS33",
      BENEFICIARY_BANK: "BARCGB22",
    };
    const roleEvidence = {
      SENDERS_CORRESPONDENT: masterEvidence("SENDER_SIDE", "NOSTRO_MASTER"),
      RECEIVERS_CORRESPONDENT: masterEvidence(
        "RECEIVER_SIDE",
        "COUNTERPARTY_AUTHENTICATED_SSI",
      ),
      ACCOUNT_WITH_INSTITUTION: transactionEvidence(
        "RECEIVER_SIDE",
        "AUTHENTICATED_TRANSACTION_INSTRUCTION",
        "ACCOUNT_WITH_INSTITUTION",
      ),
      BENEFICIARY_BANK: masterEvidence("TRANSACTION_PARTY", "PARTY_MASTER_ROLE"),
    };
    expect(() =>
      validate({
        messageType: "MT400",
        roles,
        roleEvidence,
        controls: { accountRelationship: "AUTHENTICATED_RECEIVING_ROUTE" },
      }),
    ).not.toThrow();
    expectCode(
      {
        messageType: "MT400",
        roles: { ...roles, ACCOUNT_WITH_INSTITUTION: "BOFAUS3N" },
        roleEvidence,
        controls: { accountRelationship: "AUTHENTICATED_RECEIVING_ROUTE" },
      },
      "ACCOUNT_WITH_EQUALS_RECEIVERS_CORRESPONDENT",
    );
  });

  it("validates MT700 and claim-role ownership contracts", () => {
    expect(() =>
      validate({
        messageType: "MT700",
        roles: {
          REIMBURSING_BANK: "CITIUS33",
          ADVISE_THROUGH_BANK: "BOFAUS3N",
          REQUESTED_CONFIRMATION_PARTY: "CHASUS33",
        },
        roleEvidence: {
          REIMBURSING_BANK: masterEvidence(
            "SENDER_SIDE",
            "APPROVED_REIMBURSEMENT_PROFILE",
          ),
          ADVISE_THROUGH_BANK: transactionEvidence(
            "TRANSACTION_PARTY",
            "TRANSACTION_ADVISING_CHAIN",
            "ADVISE_THROUGH_BANK",
          ),
          REQUESTED_CONFIRMATION_PARTY: masterEvidence(
            "TRANSACTION_PARTY",
            "CONFIRMATION_MANDATE",
          ),
        },
      }),
    ).not.toThrow();
    expect(() =>
      validate({
        messageType: "MT742",
        roles: {
          ACCOUNT_WITH_INSTITUTION: "CITIUS33",
          BENEFICIARY_BANK: "BOFAUS3N",
        },
        roleEvidence: {
          ACCOUNT_WITH_INSTITUTION: masterEvidence(
            "SENDER_SIDE",
            "APPROVED_CLAIM_RECEIVING_ROUTE",
          ),
          BENEFICIARY_BANK: transactionEvidence(
            "TRANSACTION_PARTY",
            "AUTHENTICATED_TRANSACTION_INSTRUCTION",
            "BENEFICIARY_BANK",
          ),
        },
      }),
    ).not.toThrow();
  });

  it.each([
    [{ controls: {} }, "MT760_SEQUENCE_B_CONTEXT_REQUIRED"],
    [{ controls: { sequence: "B" } }, "MT760_22A_22D_CONTEXT_REQUIRED"],
    [
      { controls: { sequence: "B", purpose: "ISSU", formOfUndertaking: "STBY" } },
      "MT760_C5_STBY_ISSU_REQUIRES_49",
    ],
    [
      {
        controls: {
          sequence: "B",
          purpose: "ISSU",
          formOfUndertaking: "STBY",
          confirmationInstructions: "WITHOUT",
        },
      },
      "MT760_C17_FIELD_50_REQUIRED",
    ],
    [
      {
        controls: {
          sequence: "B",
          purpose: "AMND",
          formOfUndertaking: "DGAR",
          confirmationInstructions: "WITHOUT",
        },
      },
      "MT760_C5_DGAR_PROHIBITS_49",
    ],
    [
      {
        roles: { ADVISE_THROUGH_BANK: "CITIUS33" },
        controls: { sequence: "B", purpose: "AMND", formOfUndertaking: "STBY" },
      },
      "MT760_C81_57A_REQUIRES_56A",
    ],
    [
      {
        roles: { REQUESTED_CONFIRMATION_PARTY: "CITIUS33" },
        controls: {
          sequence: "B",
          purpose: "AMND",
          formOfUndertaking: "STBY",
          confirmationInstructions: "WITHOUT",
        },
      },
      "MT760_C20_WITHOUT_PROHIBITS_58A",
    ],
    [
      {
        roles: {},
        controls: {
          sequence: "B",
          purpose: "AMND",
          formOfUndertaking: "STBY",
          confirmationInstructions: "CONFIRM",
        },
      },
      "MT760_C20_CONFIRMATION_REQUIRES_58A",
    ],
    [
      {
        roles: { REQUESTED_CONFIRMATION_PARTY: "CITIUS33" },
        controls: { sequence: "B", purpose: "AMND", formOfUndertaking: "STBY" },
      },
      "MT760_C20_58A_REQUIRES_49",
    ],
    [
      {
        roles: { ADVISING_BANK: "CITIUS33", ADVISE_THROUGH_BANK: "CITIUS33" },
        controls: { sequence: "B", purpose: "AMND", formOfUndertaking: "STBY" },
      },
      "ADVISE_THROUGH_EQUALS_ADVISING_BANK",
    ],
  ])("enforces MT760 sequence-B rule %#", (change, code) => {
    expectCode({ messageType: "MT760", roles: {}, ...change }, code);
  });

  it("accepts complete MT760 role evidence", () => {
    const roles = {
      ADVISING_BANK: "CITIUS33",
      ADVISE_THROUGH_BANK: "BOFAUS3N",
      REQUESTED_CONFIRMATION_PARTY: "CHASUS33",
    };
    expect(() =>
      validate({
        messageType: "MT760",
        roles,
        controls: {
          sequence: "B",
          purpose: "AMND",
          formOfUndertaking: "STBY",
          confirmationInstructions: "CONFIRM",
        },
        roleEvidence: {
          ADVISING_BANK: masterEvidence(
            "TRANSACTION_PARTY",
            "APPROVED_ADVISORY_ROUTING_PROFILE",
          ),
          ADVISE_THROUGH_BANK: transactionEvidence(
            "TRANSACTION_PARTY",
            "TRANSACTION_ADVISING_CHAIN",
            "ADVISE_THROUGH_BANK",
          ),
          REQUESTED_CONFIRMATION_PARTY: masterEvidence(
            "TRANSACTION_PARTY",
            "CONFIRMATION_MANDATE",
          ),
        },
      }),
    ).not.toThrow();
  });

  it("accepts a complete synthetic role through both role and demo evidence gates", () => {
    expect(() =>
      validate({
        messageType: "MT700",
        roles: { REIMBURSING_BANK: "CITIUS33" },
        roleEvidence: {
          REIMBURSING_BANK: {
            ...masterEvidence("SENDER_SIDE", "SYNTHETIC_DEMO"),
            demoData: true,
          },
        },
      }),
    ).not.toThrow();
  });

  it("rejects incomplete synthetic evidence for a registered demo role", () => {
    expectCode(
      {
        messageType: "MT705",
        roles: { ADVISE_THROUGH_BANK: "CITIUS33" },
        roleEvidence: {
          ADVISE_THROUGH_BANK: {
            ownerSide: "TRANSACTION_PARTY",
            sourceType: "SYNTHETIC_DEMO",
          },
        },
      },
      "ADVISE_THROUGH_BANK_DEMO_EVIDENCE_INVALID",
    );
  });

  it.each([
    [
      { ownerSide: "SENDER_SIDE", sourceType: "SYNTHETIC_DEMO" },
      "DELIVERY_AGENT_DEMO_OWNER_INVALID",
    ],
    [
      { ownerSide: "TRANSACTION_PARTY", sourceType: "SYNTHETIC_DEMO" },
      "DELIVERY_AGENT_DEMO_OWNER_INVALID",
    ],
  ])("rejects synthetic evidence for an unregistered demo role %#", (evidence, code) => {
    expectCode(
      {
        roles: { DELIVERY_AGENT: "CITIUS33" },
        roleEvidence: { DELIVERY_AGENT: evidence },
      },
      code,
    );
  });

  it("distinguishes incomplete, expired and contract-invalid role evidence", () => {
    expectCode(
      {
        messageType: "MT700",
        roles: { REIMBURSING_BANK: "CITIUS33" },
        roleEvidence: {
          REIMBURSING_BANK: masterEvidence(
            "RECEIVER_SIDE",
            "APPROVED_REIMBURSEMENT_PROFILE",
          ),
        },
      },
      "REIMBURSING_BANK_OWNER_OR_SOURCE_INVALID",
    );
    expectCode(
      {
        messageType: "MT700",
        roles: { REIMBURSING_BANK: "CITIUS33" },
        roleEvidence: {
          REIMBURSING_BANK: {
            ownerSide: "SENDER_SIDE",
            sourceType: "APPROVED_REIMBURSEMENT_PROFILE",
          },
        },
      },
      "REIMBURSING_BANK_MASTER_EVIDENCE_INVALID",
    );
    expectCode(
      {
        messageType: "MT700",
        roles: { REIMBURSING_BANK: "CITIUS33" },
        roleEvidence: {
          REIMBURSING_BANK: {
            ...masterEvidence("SENDER_SIDE", "APPROVED_REIMBURSEMENT_PROFILE"),
            effectiveTo: "2025-12-31",
          },
        },
      },
      "REIMBURSING_BANK_EVIDENCE_NOT_EFFECTIVE",
    );
    expectCode(
      {
        messageType: "MT700",
        roles: { ADVISE_THROUGH_BANK: "CITIUS33" },
        roleEvidence: {
          ADVISE_THROUGH_BANK: {
            ownerSide: "TRANSACTION_PARTY",
            sourceType: "TRANSACTION_ADVISING_CHAIN",
          },
        },
      },
      "ADVISE_THROUGH_BANK_TRANSACTION_EVIDENCE_INVALID",
    );
  });
});
