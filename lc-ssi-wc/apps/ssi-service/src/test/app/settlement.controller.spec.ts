import { BadRequestException, HttpException } from "@nestjs/common";
import type { BatchResolutionService } from "../../app/batch-resolution.service";
import type { CounterpartySsiResolutionService } from "../../app/counterparty-ssi-resolution.service";
import type { PaymentMessageIndexService } from "../../app/payment-message-index.service";
import { SettlementController } from "../../app/settlement.controller";
import type { SsiApplicationService } from "../../app/ssi-application.service";
import type { MessageDomainResolutionService } from "../../app/message-domain-resolution.service";
import type { DatabaseSnapshotIdentityService } from "../../app/database-snapshot-identity.service";
import type { SsiDataQualityService } from "../../app/ssi-data-quality.service";
import { hashCanonical } from "../../app/canonical-json";

type Json = Record<string, unknown>;

const baseBody = (overrides: Json = {}): Json => ({
  sourceMessageType: "MT201",
  messageType: "pacs.009.001.08",
  currency: "USD",
  counterpartyBankServiceId: "BANK-SVC-CHASUS33",
  ...overrides,
});

const routePreview = (recommended = true) => ({
  attemptId: "ATTEMPT-1",
  requestHash: "snapshot-hash",
  decision: recommended ? "RESOLVED" : "NO_SSI_FOUND",
  explanation: recommended ? "Exact route" : "No route for currency",
  recommendedRoute: recommended
    ? {
        ssiId: "SSI-ID-024",
        ssiVersion: 14,
        route: {
          ssiCode: "SSI-DEMO-024",
          actualReceiverBic: "CITIUS33",
          accountWithBic: "CITIUS33",
          accountId: "NOSTRO-USD",
          senderBic: "DEMOHKHH",
          messagingService: "FINPLUS",
          currency: "USD",
          routePurpose: "INTERBANK_TRANSFER",
        },
        applicability: { id: "APPL-024", version: 6 },
        fallbackTier: 0,
        rank: [10, 0, 0],
        evidence: [{ criterion: "CURRENCY", outcome: "PASS" }],
      }
    : undefined,
  alternatives: [],
  excludedRoutes: [
    {
      ssiId: "SSI-ID-025",
      route: { ssiCode: "SSI-DEMO-025" },
      evidence: [
        {
          criterion: "MESSAGE_TYPE",
          outcome: "FAIL",
          reasonCode: "MESSAGE_TYPE_NOT_SUPPORTED",
        },
      ],
    },
  ],
  canonicalSettlementPreview: {
    settlementAccountReference: "NOSTRO-USD",
    directAccountRelationshipCount: 2,
    fieldProvenance: { "58A": { source: "TRANSACTION_CONTEXT" } },
  },
  nostroEvidence: {
    decision: "RESOLVED",
    nostroId: "NOSTRO-ID-USD",
    nostroVersion: 7,
    accountReference: "NOSTRO-USD",
  },
});

const harness = (
  dataIssues: readonly Json[] = [],
  gates: {
    readonly rma?: object;
    readonly banks?: object;
    readonly entities?: object;
  } = {},
) => {
  const service = {
    resolve: jest.fn(() => ({ decision: "RESOLVED" })),
    clearingOptions: jest.fn(() => ["FEDWIRE"]),
    confirm: jest.fn(() => ({ status: "CONFIRMED" })),
  };
  const batch = { resolve: jest.fn(() => ({ count: 2 })) };
  const index = {
    getIndex: jest.fn(() => ({ items: [] })),
    findSelectable: jest.fn((source: string) => ({
      messageType: source,
      targetMessage: "pacs.009.001.08",
      selectable: true,
    })),
  };
  const counterparty = {
    precondition: jest.fn(() => undefined),
    validateContext: jest.fn(() => undefined),
    supports: jest.fn(() => false),
    resolve: jest.fn(() => ({ mx: { httpStatus: 200 }, mt: {} })),
  };
  const domains = {
    resolve: jest.fn(() => ({
      mx: { httpStatus: 200, resolutionDomain: "OWN_SSI_NOSTRO" },
      mt: { omitted: ["57A"] },
    })),
  };
  return {
    controller: new SettlementController(
      service as unknown as SsiApplicationService,
      batch as unknown as BatchResolutionService,
      index as unknown as PaymentMessageIndexService,
      counterparty as unknown as CounterpartySsiResolutionService,
      domains as unknown as MessageDomainResolutionService,
      {
        current: () => ({
          sha256: "snapshot-hash",
          method: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
        }),
      } as DatabaseSnapshotIdentityService,
      {
        globalIssues: () => dataIssues,
        issuesFor: () => dataIssues,
      } as unknown as SsiDataQualityService,
      gates.rma as never,
      gates.banks as never,
      gates.entities as never,
    ),
    service,
    batch,
    index,
    counterparty,
    domains,
  };
};

const responseOf = (operation: () => unknown): Json => {
  try {
    operation();
    throw new Error("Expected HttpException");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpException);
    return (error as HttpException).getResponse() as Json;
  }
};

const mtOf = (body: Json): Json => body["mt"] as Json;
const mxOf = (body: Json): Json => body["mx"] as Json;

describe("SettlementController", () => {
  it("covers governed route binding, transport and topology decisions", () => {
    const context = harness();
    const internals = context.controller as unknown as {
      assertCurrentRouteBinding(request: Json): void;
      executionTransport(route: Json): "FIN" | "FINPLUS";
      governedSettlementMethod(
        accountWith: string,
        actualReceiver: string,
        senderBic: string,
      ): "INDA" | "INGA";
    };
    expect(() => internals.assertCurrentRouteBinding({})).not.toThrow();
    const bindingRequest = {
      selectedSsiId: "SSI-1",
      selectedSsiVersion: 1,
      selectedApplicabilityId: "APPL-1",
      selectedApplicabilityVersion: 1,
      selectedNostroId: "NOSTRO-1",
      selectedNostroVersion: 1,
      selectedRmaId: "RMA-1",
      selectedRmaVersion: 1,
      selectedRmaDecisionId: "RMA-DECISION-1",
      contextSnapshotId: "CONTEXT-1",
      databaseSnapshotId: "snapshot-hash",
      snapshotIdentityMethod: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
    };
    const routeBindingId = hashCanonical({
      ssi: { id: "SSI-1", version: 1 },
      applicability: { id: "APPL-1", version: 1 },
      nostro: { id: "NOSTRO-1", version: 1 },
      rma: { id: "RMA-1", version: 1, decisionId: "RMA-DECISION-1" },
      contextSha256: "CONTEXT-1",
    });
    expect(() =>
      internals.assertCurrentRouteBinding({
        ...bindingRequest,
        routeBindingId,
      }),
    ).not.toThrow();
    expect(
      mxOf(
        responseOf(() =>
          internals.assertCurrentRouteBinding({
            ...bindingRequest,
            routeBindingId: "stale-binding",
          }),
        ),
      ).code,
    ).toBe("STALE");
    expect(internals.executionTransport({ messagingService: "FINPLUS" })).toBe(
      "FINPLUS",
    );
    expect(
      internals.executionTransport({
        messagingService: "FIN",
        finContingencyApproved: true,
      }),
    ).toBe("FIN");
    expect(
      mxOf(
        responseOf(() =>
          internals.executionTransport({ messagingService: "UNKNOWN" }),
        ),
      ).code,
    ).toBe("PROFILE_INCOMPLETE");
    expect(
      mxOf(
        responseOf(() =>
          internals.executionTransport({ messagingService: "FIN" }),
        ),
      ).code,
    ).toBe("PROFILE_INCOMPLETE");
    expect(
      internals.governedSettlementMethod("DEMOHKHH", "CITIUS33", "DEMOHKHH"),
    ).toBe("INGA");
    expect(
      mxOf(
        responseOf(() =>
          internals.governedSettlementMethod(
            "OTHERBIC",
            "CITIUS33",
            "DEMOHKHH",
          ),
        ),
      ).code,
    ).toBe("INVALID_CONTEXT_TOPOLOGY");
  });

  it("fails closed and returns governed RMA route decisions", () => {
    const check = jest.fn(() => ({
      authorised: true,
      rmaId: "RMA-1",
      rmaVersion: 2,
      decisionId: "RMA-DECISION-1",
      profileId: "MT2-MT202-PLAIN-SR2026",
      pairedEvidenceProfileId: "PACS009-PLAIN-SR2026",
      businessService: "swift.cbprplus.04",
    }));
    const context = harness([], { rma: { check } });
    const internals = context.controller as unknown as {
      routeRmaDecision(
        request: Json,
        senderBic: string,
        actualReceiver: string,
        executionTransport: "FIN" | "FINPLUS",
      ): Json | undefined;
    };
    expect(
      mxOf(
        responseOf(() =>
          internals.routeRmaDecision({}, "", "CITIUS33", "FINPLUS"),
        ),
      ).code,
    ).toBe("RMA_NOT_AUTHORIZED");
    const request = {
      valueDate: "2026-09-25",
      selectedRmaId: "RMA-1",
      selectedRmaVersion: 2,
      selectedRmaDecisionId: "RMA-DECISION-1",
      profileId: "MT2-MT202-PLAIN-SR2026",
      pairedEvidenceProfileId: "PACS009-PLAIN-SR2026",
      businessService: "swift.cbprplus.04",
    };
    expect(
      internals.routeRmaDecision(request, "DEMOHKHH", "CITIUS33", "FINPLUS"),
    ).toMatchObject({ authorised: true, rmaId: "RMA-1" });
    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({
        decisionId: "RMA-DECISION-1",
        profileId: "MT2-MT202-PLAIN-SR2026",
        pairedEvidenceProfileId: "PACS009-PLAIN-SR2026",
        businessService: "swift.cbprplus.04",
      }),
    );

    const minimal = harness([], {
      rma: {
        check: jest.fn(() => ({ authorised: true })),
      },
    }).controller as unknown as {
      routeRmaDecision(
        request: Json,
        senderBic: string,
        actualReceiver: string,
        executionTransport: "FIN" | "FINPLUS",
      ): Json | undefined;
    };
    expect(
      minimal.routeRmaDecision(
        { valueDate: "2026-09-25" },
        "DEMOHKHH",
        "CITIUS33",
        "FINPLUS",
      ),
    ).toMatchObject({ authorised: true });
  });

  it("preserves governed scenario context failures", () => {
    const context = harness();
    context.counterparty.validateContext.mockReturnValue({
      mx: { httpStatus: 422, code: "INVALID_UPSTREAM_CONTEXT" },
      payloadGenerated: false,
    });
    expect(
      mxOf(
        responseOf(() =>
          context.controller.resolve(
            baseBody({
              sourceMessageType: "MT202",
              scenarioCode: "DIRECT_INSTITUTIONAL_TRANSFER",
            }) as never,
          ),
        ),
      ),
    ).toMatchObject({ httpStatus: 422, code: "INVALID_UPSTREAM_CONTEXT" });
  });

  it("covers MT205 jurisdiction source, conflict and permitted decisions", () => {
    const request = {
      sourceMessageType: "MT205",
      bookingEntity: "HK01",
      valueDate: "2026-09-14",
    };
    const missing = harness();
    const missingInternals = missing.controller as unknown as {
      jurisdictionEvidence(
        request: Json,
        actualReceiver: string,
        senderBic: string,
      ): Json | undefined;
    };
    expect(
      mxOf(
        responseOf(() =>
          missingInternals.jurisdictionEvidence(
            request,
            "DEMOHKHH",
            "DEMOHKHH",
          ),
        ),
      ).code,
    ).toBe("PROFILE_INCOMPLETE");

    const jurisdictionHarness = (country: string) =>
      harness([], {
        banks: {
          search: jest.fn(() => [
            {
              bankServiceId: "BANK-SVC-DEMOHKHH",
              bic: "DEMOHKHH",
              country,
            },
          ]),
        },
        entities: {
          list: jest.fn(() => [
            {
              id: "ENTITY-HK01",
              version: 3,
              branchCode: "HK01",
              countryCode: "HK",
              validFrom: "2026-01-01",
              validTo: null,
            },
          ]),
        },
      });
    const conflict = jurisdictionHarness("US").controller as unknown as {
      jurisdictionEvidence(
        request: Json,
        actualReceiver: string,
        senderBic: string,
      ): Json | undefined;
    };
    expect(
      mxOf(
        responseOf(() =>
          conflict.jurisdictionEvidence(request, "DEMOHKHH", "DEMOHKHH"),
        ),
      ).code,
    ).toBe("JURISDICTION_EVIDENCE_CONFLICT");
    const permitted = jurisdictionHarness("HK").controller as unknown as {
      jurisdictionEvidence(
        request: Json,
        actualReceiver: string,
        senderBic: string,
      ): Json | undefined;
    };
    expect(
      permitted.jurisdictionEvidence(request, "DEMOHKHH", "DEMOHKHH"),
    ).toMatchObject({ senderCountry: "HK", receiverCountry: "HK" });
    expect(
      permitted.jurisdictionEvidence(
        { ...request, sourceMessageType: "MT202" },
        "DEMOHKHH",
        "DEMOHKHH",
      ),
    ).toBeUndefined();
  });

  it("reports global SSI data-quality state", () => {
    expect(harness().controller.dataQualityStatus()).toEqual({
      status: "PASS",
      code: "SSI_DATA_VALID",
      dataIssues: [],
    });
    const issue = { ssiCode: "SSI-1" };
    expect(harness([issue]).controller.dataQualityStatus()).toEqual({
      status: "FAIL",
      code: "INCORRECT_SSI_CONFIGURATION",
      dataIssues: [issue],
    });
  });

  it("returns a controlled request-scoped 409 for conflicting SSI data before ranking", () => {
    const previousEnvironment = process.env["SSI_RUNTIME_ENV"];
    process.env["SSI_RUNTIME_ENV"] = "demo";
    const issue = {
      ssiCode: "SSI-DEMO-022",
      applicabilityId: "SSI-ID-022:APPL:2",
      violation: "PURPOSE_APPLICABILITY_MISMATCH",
      remediation: "REMOVE_INVALID_APPLICABILITY_OR_CREATE_PURPOSE_BUILT_ROUTE",
    };
    const context = harness([issue]);
    context.counterparty.supports.mockReturnValue(true);

    const response = responseOf(() =>
      context.controller.resolve(
        baseBody({
          sourceMessageType: "MT202",
          consumer: "CENTRAL_PAYMENT",
          product: "CENTRAL_PAYMENT",
          businessFunction: "INTERBANK_TRANSFER",
          paymentLeg: "INTERBANK_SETTLEMENT",
          direction: "OUTBOUND",
          bookingEntity: "HK01",
          valueDate: "2026-09-12",
          amount: "1000000",
          transactionReference: "DQ-409",
        }) as never,
      ),
    );

    expect(mxOf(response)).toMatchObject({
      httpStatus: 409,
      decision: "REJECTED",
      code: "INCORRECT_SSI_CONFIGURATION",
      errorCategory: "SSI_DATA_QUALITY",
      runtimeEnvironment: "demo",
      statusPolicyVersion: "SSI-CONFIG-HTTP-01",
      retryable: false,
      chosenRoute: null,
      candidates: [],
      payloadGenerated: false,
      dataIssues: [issue],
      remediationSteps: [
        "QUARANTINE_LISTED_APPLICABILITY",
        "REMOVE_INVALID_GENERIC_APPLICABILITY_FROM_SPECIALIST_SSI",
        "CREATE_PURPOSE_BUILT_INTERBANK_TRANSFER_SSI_WITH_APPROVED_PRIMARY_NOSTRO",
        "RERUN_DATA_QUALITY_GATE_AND_PUBLISH_NEW_SNAPSHOT_HASH",
      ],
      governanceDestination: "CONFIGURATION_GOVERNANCE",
    });
    expect(context.service.resolve).not.toHaveBeenCalled();
    expect(context.counterparty.resolve).not.toHaveBeenCalled();
    if (previousEnvironment === undefined)
      delete process.env["SSI_RUNTIME_ENV"];
    else process.env["SSI_RUNTIME_ENV"] = previousEnvironment;
  });

  it("routes own-account scenarios before counterparty SSI preconditions", () => {
    const context = harness();
    const body = baseBody({
      sourceMessageType: "MT202",
      scenarioCode: "BOOK_TRANSFER_SAME_RECEIVER",
      ownDebitAccountId: "DEBIT",
      ownDebitAccountVersion: 4,
      ownCreditAccountId: "CREDIT",
      ownCreditAccountVersion: 4,
      receiverBankServiceId: "BANK-SVC-CITIUS33",
    });
    expect(context.controller.resolve(body as never)).toMatchObject({
      mx: { resolutionDomain: "OWN_SSI_NOSTRO" },
    });
    expect(context.domains.resolve).toHaveBeenCalledWith(
      "OWN_SSI_NOSTRO",
      body,
    );
    expect(context.counterparty.precondition).not.toHaveBeenCalled();
  });
  it("delegates message index, batch, clearing and confirmation operations", () => {
    const context = harness();
    expect(context.controller.messageIndex()).toEqual({ items: [] });
    expect(context.controller.resolveBatch({ legs: [] } as never)).toEqual({
      count: 2,
    });
    expect(context.controller.clearingOptions(baseBody() as never)).toEqual([
      "FEDWIRE",
    ]);
    expect(
      context.controller.confirm("attempt-1", { actor: "qa" } as never),
    ).toEqual({ status: "CONFIRMED" });
    expect(context.service.confirm).toHaveBeenCalledWith({
      actor: "qa",
      attemptId: "attempt-1",
    });
  });

  it("returns ordinary and counterparty SSI resolutions", () => {
    const ordinary = harness();
    expect(ordinary.controller.resolve(baseBody() as never)).toEqual({
      decision: "RESOLVED",
    });

    const supported = harness();
    supported.counterparty.supports.mockReturnValue(true);
    supported.counterparty.resolve.mockReturnValue({
      mx: { httpStatus: 200 },
      mt: { tags: { "58A": "BARCGB22" }, omitted: ["57a"] },
    });
    supported.service.resolve.mockReturnValue(routePreview());
    const contract = supported.controller.resolve(
      baseBody({
        sourceMessageType: "MT202",
        counterpartyBankServiceId: "BANK-SVC-BARCGB22",
        paymentBeneficiaryInstitutionInput: "BARCGB22",
      }) as never,
    );
    expect(contract).toMatchObject({
      code: "SSI_RESOLVED",
      payloadGenerated: false,
      mx: {
        httpStatus: 200,
        code: "SSI_RESOLVED",
        payloadGenerated: false,
        canonicalRoles: {
          selectedSsi: "SSI-DEMO-024",
          creditor: "BARCGB22",
          creditorSource: "REQUEST_PASS_THROUGH",
        },
        messageComposerContext: {
          SttlmMtd: {
            value: "INDA",
            source: "BA-TOPOLOGY-INDA-INGA-001",
          },
          Dbtr: { value: "DEMOHKHH", source: "OWN_ENTITY" },
          SttlmAcct: {
            value: "NOSTRO-USD",
            source: "OWN_SSI_NOSTRO",
            nostroId: "NOSTRO-ID-USD",
            nostroVersion: 7,
          },
          Cdtr: { value: "BARCGB22", source: "REQUEST_PASS_THROUGH" },
        },
      },
      mt: {
        tags: { "53B": "/NOSTRO-USD", "58A": "BARCGB22" },
        omitted: ["57a"],
      },
      chosenRoute: {
        ssiCode: "SSI-DEMO-024",
        ssiVersion: 14,
        currency: "USD",
        accountId: "NOSTRO-USD",
        nostroId: "NOSTRO-ID-USD",
        nostroVersion: 7,
        matchedApplicabilityId: "APPL-024",
        applicabilityVersion: 6,
        routePurpose: "INTERBANK_TRANSFER",
        selectedBy: "EXACT_BUSINESS_PURPOSE_MATCH",
      },
      roleProvenance: {
        instructedAgent: {
          value: "CITIUS33",
          source: "COUNTERPARTY_SSI",
          ssiCode: "SSI-DEMO-024",
          ssiVersion: 14,
          sourceField: "actualReceiverBic",
        },
      },
      snapshotHash: "snapshot-hash",
      resolutionToken: "ATTEMPT-1",
      alternatives: [],
      excludedCandidates: [
        { ssiCode: "SSI-DEMO-025", reason: "PROFILE_VERSION_MISMATCH" },
      ],
      renderingDecisions: {
        "MT202.53a": {
          outcome: "INCLUDE",
          option: "B",
          renderedTag: "53B",
          rule: "MRG_MT202_53A_MULTIPLE_DIRECT_ACCOUNTS",
        },
        "MT202.57a": {
          outcome: "OMITTED_BY_RULE",
          rule: "MRG_MT202_57A_RECEIVER_IS_AWI",
        },
        "pacs.009.CdtrAgt": { outcome: "INCLUDE" },
      },
    });
    expect(supported.counterparty.resolve).toHaveBeenCalled();
  });

  it("revalidates the selected route against the active exact RMA record", () => {
    const context = harness([], {
      rma: {
        check: jest.fn(() => ({
          decisionId: "RMA-DECISION-NEW",
          decision: "AUTHORISED",
          authorised: true,
          checkedAt: "2026-09-14T00:00:00.000Z",
          effectiveAt: "2026-09-14",
          rmaId: "RMA-DIFFERENT",
          rmaVersion: 2,
        })),
      },
    });
    context.counterparty.supports.mockReturnValue(true);
    context.counterparty.resolve.mockReturnValue({
      mx: { httpStatus: 200 },
      mt: {},
    });
    context.service.resolve.mockReturnValue(routePreview());

    const response = responseOf(() =>
      context.controller.resolve(
        baseBody({
          sourceMessageType: "MT202",
          selectedRmaId: "RMA-SELECTED",
          selectedRmaVersion: 1,
        }) as never,
      ),
    );
    expect(mxOf(response)).toMatchObject({
      httpStatus: 422,
      code: "RMA_NOT_AUTHORIZED",
      payloadGenerated: false,
    });
  });

  it("reuses the governed OWN_BIC for the post-discovery RMA check", () => {
    const previousOwnBic = process.env["OWN_BIC"];
    process.env["OWN_BIC"] = "DEMOHKHH";
    const rma = {
      check: jest.fn((rmaRequest: Record<string, unknown>) => ({
        decisionId: rmaRequest["decisionId"],
        decision: "AUTHORISED",
        authorised: true,
        checkedAt: "2026-09-25T00:00:00.000Z",
        effectiveAt: "2026-09-25",
        rmaId: "RMA-SELECTED",
        rmaVersion: 3,
        profileId: rmaRequest["profileId"],
        pairedEvidenceProfileId: rmaRequest["pairedEvidenceProfileId"],
        businessService: rmaRequest["businessService"],
      })),
    };
    const context = harness([], { rma });
    context.counterparty.supports.mockReturnValue(true);
    context.counterparty.resolve.mockReturnValue({
      mx: { httpStatus: 200, canonicalRoles: { sender: "CITIUS33" } },
      mt: {},
    });
    const preview = routePreview();
    delete (preview.recommendedRoute!.route as Record<string, unknown>)[
      "senderBic"
    ];
    context.service.resolve.mockReturnValue(preview);

    expect(
      context.controller.resolve(
        baseBody({
          sourceMessageType: "MT202",
          selectedRmaId: "RMA-SELECTED",
          selectedRmaVersion: 3,
        }) as never,
      ),
    ).toMatchObject({ code: "SSI_RESOLVED" });
    expect(rma.check).toHaveBeenCalledWith(
      expect.objectContaining({
        ownBic: "DEMOHKHH",
        counterpartyBic: "CITIUS33",
      }),
    );

    if (previousOwnBic === undefined) delete process.env["OWN_BIC"];
    else process.env["OWN_BIC"] = previousOwnBic;
  });

  it("applies MT205 jurisdiction to the selected route actual receiver", () => {
    const context = harness([], {
      banks: {
        search: jest.fn(() => [
          {
            bankServiceId: "BANK-SVC-CITIUS33",
            bic: "CITIUS33",
            country: "US",
          },
        ]),
      },
      entities: {
        list: jest.fn(() => [
          {
            id: "ENTITY-HK01",
            version: 3,
            branchCode: "HK01",
            countryCode: "HK",
            validFrom: "2026-01-01",
            validTo: "2026-12-31",
          },
        ]),
      },
    });
    context.counterparty.supports.mockReturnValue(true);
    context.counterparty.resolve.mockReturnValue({
      mx: { httpStatus: 200 },
      mt: {},
    });
    context.service.resolve.mockReturnValue(routePreview());

    const response = responseOf(() =>
      context.controller.resolve(
        baseBody({
          sourceMessageType: "MT205",
          bookingEntity: "HK01",
          valueDate: "2026-09-14",
        }) as never,
      ),
    );
    expect(mxOf(response)).toMatchObject({
      httpStatus: 422,
      code: "JURISDICTION_NOT_PERMITTED",
      payloadGenerated: false,
    });
  });

  it.each([
    ["development", 409],
    ["production", 500],
  ])(
    "fails closed with %s status %i when required 53B has no operational accountReference",
    (runtimeEnvironment, expectedStatus) => {
      const previousEnvironment = process.env["SSI_RUNTIME_ENV"];
      process.env["SSI_RUNTIME_ENV"] = runtimeEnvironment;
      const context = harness();
      context.counterparty.supports.mockReturnValue(true);
      context.counterparty.resolve.mockReturnValue({
        mx: { httpStatus: 200 },
        mt: { tags: { "58A": "BARCGB22" }, omitted: ["53a", "57a"] },
      });
      const preview = routePreview();
      context.service.resolve.mockReturnValue({
        ...preview,
        nostroEvidence: { ...preview.nostroEvidence, accountReference: " " },
        canonicalSettlementPreview: {
          ...preview.canonicalSettlementPreview,
          settlementAccountReference: " ",
          directAccountRelationshipCount: 2,
        },
      });

      const response = responseOf(() =>
        context.controller.resolve(
          baseBody({ sourceMessageType: "MT202" }) as never,
        ),
      );

      expect(mxOf(response)).toMatchObject({
        httpStatus: expectedStatus,
        code: "INCORRECT_SSI_CONFIGURATION",
        errorCategory: "SSI_DATA_QUALITY",
        payloadGenerated: false,
        dataIssues: [
          expect.objectContaining({
            violation: "MISSING_OPERATIONAL_ACCOUNT_REFERENCE",
          }),
        ],
        remediationSteps: [
          "POPULATE_SELECTED_NOSTRO_ACCOUNT_REFERENCE",
          "RERUN_DATA_QUALITY_GATE_AND_PUBLISH_NEW_SNAPSHOT_HASH",
        ],
      });
      expect(response["resolutionDecision"]).toBe("REJECTED");

      if (previousEnvironment === undefined)
        delete process.env["SSI_RUNTIME_ENV"];
      else process.env["SSI_RUNTIME_ENV"] = previousEnvironment;
    },
  );

  it("records the MRG omission decision for one direct account relationship", () => {
    const context = harness();
    context.counterparty.supports.mockReturnValue(true);
    context.counterparty.resolve.mockReturnValue({
      mx: { httpStatus: 200 },
      mt: { tags: { "58A": "BARCGB22" }, omitted: ["53a", "57a"] },
    });
    const preview = routePreview();
    context.service.resolve.mockReturnValue({
      ...preview,
      canonicalSettlementPreview: {
        ...preview.canonicalSettlementPreview,
        directAccountRelationshipCount: 1,
      },
    });

    const response = context.controller.resolve(
      baseBody({ sourceMessageType: "MT202" }) as never,
    ) as Json;

    expect((mtOf(response)["tags"] as Json)["53B"]).toBeUndefined();
    expect(mtOf(response)["omitted"]).toContain("53a");
    expect(response["renderingDecisions"]).toMatchObject({
      "MT202.53a": {
        outcome: "OMITTED_BY_RULE",
        rule: "MRG_MT202_53A_SINGLE_DIRECT_ACCOUNT_RELATIONSHIP",
      },
    });
  });

  it("covers governed MT202 account-with fallbacks and Core/COV omission branches", () => {
    const resolveWithRoute = (
      routeOverrides: Json,
      sourceMessageType = "MT202",
      tag = "57A",
    ): Json => {
      const context = harness();
      context.counterparty.supports.mockReturnValue(true);
      context.counterparty.resolve.mockReturnValue({
        mx: { httpStatus: 200 },
        mt: { tags: { [tag]: "ORIGINAL57" }, omitted: [] },
      });
      const preview = routePreview();
      context.service.resolve.mockReturnValue({
        ...preview,
        recommendedRoute: {
          ...preview.recommendedRoute!,
          route: { ...preview.recommendedRoute!.route, ...routeOverrides },
        },
      });
      return context.controller.resolve(
        baseBody({
          sourceMessageType,
          paymentBeneficiaryInstitutionInput: "BARCGB22",
        }) as never,
      ) as Json;
    };

    const accountWithFallback = resolveWithRoute({
      actualReceiverBic: undefined,
      accountWithBic: "CITIUS33",
    });
    expect(mtOf(accountWithFallback)["omitted"]).toContain("57a");

    const receiverFallback = resolveWithRoute({
      actualReceiverBic: "CITIUS33",
      accountWithBic: undefined,
    });
    expect(mtOf(receiverFallback)["omitted"]).toContain("57a");

    expect(() =>
      resolveWithRoute({
        actualReceiverBic: "CHASUS33",
        accountWithBic: "CITIUS33",
      }),
    ).toThrow(HttpException);

    const cover = resolveWithRoute(
      { actualReceiverBic: "CITIUS33", accountWithBic: "CITIUS33" },
      "MT202COV",
      "A.57A",
    );
    expect((mtOf(cover)["tags"] as Json)["A.57A"]).toBeUndefined();
    expect(mtOf(cover)["omitted"]).toContain("A.57a");
  });

  it("fails closed when the DB resolver finds no SSI for the requested currency", () => {
    const context = harness();
    context.counterparty.supports.mockReturnValue(true);
    context.service.resolve.mockReturnValue(routePreview(false));

    const response = responseOf(() =>
      context.controller.resolve(
        baseBody({ sourceMessageType: "MT202", currency: "SGD" }) as never,
      ),
    );

    expect(mxOf(response)).toMatchObject({
      httpStatus: 422,
      code: "SSI_NOT_FOUND",
      payloadGenerated: false,
    });
  });

  it("serializes every lower-ranked eligible route as a resolved alternative", () => {
    const context = harness();
    context.counterparty.supports.mockReturnValue(true);
    context.counterparty.resolve.mockReturnValue({
      mx: { httpStatus: 200 },
      mt: { tags: { "58A": "BARCGB22" }, omitted: ["57a"] },
    });
    const preview = routePreview();
    context.service.resolve.mockReturnValue({
      ...preview,
      lowerRankedEligibleCandidates: [
        {
          ...preview.recommendedRoute!,
          ssiId: "SSI-ID-025",
          ssiVersion: 8,
          route: {
            ...preview.recommendedRoute!.route,
            ssiCode: "SSI-DEMO-025",
            accountId: "NOSTRO-USD-FALLBACK",
          },
          rank: [20, 1, 0],
        },
      ],
      lowerRankedNostroEvidence: [
        {
          ssiId: "SSI-ID-025",
          nostroId: "NOSTRO-ID-FALLBACK",
          nostroVersion: 3,
          maskedAccountRef: "NOSTRO-USD-FALLBACK-PRIMARY",
        },
      ],
    });

    const response = context.controller.resolve(
      baseBody({
        sourceMessageType: "MT202",
        counterpartyBankServiceId: "BANK-SVC-BARCGB22",
        paymentBeneficiaryInstitutionInput: "BARCGB22",
      }) as never,
    ) as Json;

    expect(response["alternatives"]).toEqual([
      expect.objectContaining({
        ssiId: "SSI-ID-025",
        ssiCode: "SSI-DEMO-025",
        nostroId: "NOSTRO-ID-FALLBACK",
      }),
    ]);
    expect((response["mx"] as Json)["alternatives"]).toEqual(
      response["alternatives"],
    );
  });

  it("renders a missing exact active Nostro relationship as PROFILE_INCOMPLETE", () => {
    const context = harness();
    context.counterparty.supports.mockReturnValue(true);
    context.service.resolve.mockImplementation(() => {
      throw new HttpException("PROFILE_INCOMPLETE", 503);
    });

    const response = responseOf(() =>
      context.controller.resolve(
        baseBody({ sourceMessageType: "MT202" }) as never,
      ),
    );

    expect(mxOf(response)).toMatchObject({
      httpStatus: 503,
      code: "PROFILE_INCOMPLETE",
      payloadGenerated: false,
    });
  });

  it("fails Barclays GBP closed when two executable SSI routes share the top business rank", () => {
    const context = harness();
    context.counterparty.supports.mockReturnValue(true);
    context.counterparty.resolve.mockReturnValue({
      mx: {
        httpStatus: 200,
        canonicalRoles: {
          instructedAgent: "CITIUS33",
          creditorAgent: "CITIUS33",
        },
      },
      mt: { tags: { "58A": "BARCGB22" }, omitted: ["57a"] },
    });
    context.service.resolve.mockReturnValue({
      ...routePreview(),
      decision: "SSI_AMBIGUOUS",
      recommendedRoute: undefined,
      alternatives: [
        {
          ssiId: "SSI-ID-003",
          ssiVersion: 39,
          route: {
            ssiCode: "SSI-DEMO-003",
            settlementRouteId: "ROUTE-GBP-BARCGB22",
            currency: "GBP",
            accountId: "DEMO-NOSTRO-002-PRIMARY",
            routePreference: "PRIMARY",
          },
          applicability: { id: "SSI-ID-003:APPL:2" },
          fallbackTier: 0,
          rank: [10, 0, 0],
          evidence: [],
        },
        {
          ssiId: "SSI-ID-022",
          ssiVersion: 34,
          route: {
            ssiCode: "SSI-DEMO-022",
            settlementRouteId: "ROUTE-GBP-BARCGB22",
            currency: "GBP",
            accountId: "DEMO-NOSTRO-002-IMPCOLL",
            routePreference: "PRIMARY",
          },
          applicability: { id: "SSI-ID-022:APPL:2" },
          fallbackTier: 0,
          rank: [10, 0, 0],
          evidence: [],
        },
      ],
      alternativeNostroEvidence: [
        {
          ssiId: "SSI-ID-003",
          decision: "RESOLVED",
          nostroId: "NOSTRO-GBP-003",
          nostroVersion: 9,
          maskedAccountRef: "DEMO-NOSTRO-002-PRIMARY-PRIMARY",
        },
        {
          ssiId: "SSI-ID-022",
          decision: "RESOLVED",
          nostroId: "NOSTRO-GBP-022",
          nostroVersion: 4,
          maskedAccountRef: "DEMO-NOSTRO-002-IMPCOLL-PRIMARY",
        },
      ],
      lowerRankedEligibleCandidates: [
        {
          ssiId: "SSI-ID-004",
          ssiVersion: 39,
          route: {
            ssiCode: "SSI-DEMO-004",
            settlementRouteId: "ROUTE-GBP-SCBLGB2L",
            currency: "GBP",
            accountId: "DEMO-NOSTRO-002-SECONDARY",
            routePreference: "SECONDARY",
          },
          applicability: { id: "SSI-ID-004:APPL:2" },
          fallbackTier: 0,
          rank: [20, 1, 0],
          evidence: [],
        },
      ],
      lowerRankedNostroEvidence: [
        {
          ssiId: "SSI-ID-004",
          decision: "RESOLVED",
          nostroId: "NOSTRO-GBP-004",
          nostroVersion: 9,
          maskedAccountRef: "DEMO-NOSTRO-002-SECONDARY-PRIMARY",
        },
      ],
    });

    const response = responseOf(() =>
      context.controller.resolve(
        baseBody({
          sourceMessageType: "MT202",
          currency: "GBP",
          counterpartyBankServiceId: "BANK-SVC-BARCGB22",
        }) as never,
      ),
    );

    expect(mxOf(response)).toMatchObject({
      httpStatus: 422,
      decision: "SSI_AMBIGUOUS",
      code: "SSI_AMBIGUOUS",
      payloadGenerated: false,
      chosenRoute: null,
      canonicalRoles: null,
      roleProvenance: null,
      messageComposerContext: null,
      candidates: [
        {
          ssiCode: "SSI-DEMO-003",
          nostroId: "NOSTRO-GBP-003",
          businessRank: {
            priority: 10,
            routePreference: "PRIMARY",
            specificity: 0,
          },
          ambiguityReason: "TIED_ON_CONTROLLED_RANK_KEYS",
          tiedOn: ["priority", "routePreference", "specificity"],
          selectionStatus: "TOP_RANK_TIE",
          tieMember: true,
        },
        {
          ssiCode: "SSI-DEMO-022",
          nostroId: "NOSTRO-GBP-022",
          businessRank: {
            priority: 10,
            routePreference: "PRIMARY",
            specificity: 0,
          },
          ambiguityReason: "TIED_ON_CONTROLLED_RANK_KEYS",
          tiedOn: ["priority", "routePreference", "specificity"],
          selectionStatus: "TOP_RANK_TIE",
          tieMember: true,
        },
        {
          ssiCode: "SSI-DEMO-004",
          nostroId: "NOSTRO-GBP-004",
          businessRank: {
            priority: 20,
            routePreference: "SECONDARY",
            specificity: 0,
          },
          selectionStatus: "LOWER_BUSINESS_RANK",
          reason: "LOWER_BUSINESS_RANK",
          tieMember: false,
        },
      ],
      rankingRuleId: "EC-RANK-01",
      repairQueue: { required: true, makerCheckerRequired: true },
    });
    expect(mtOf(response)).toEqual({
      validation: "FAIL",
      code: "SSI_AMBIGUOUS",
      payloadGenerated: false,
    });
    expect(response).toMatchObject({
      resolutionDecision: "SSI_AMBIGUOUS",
      chosenRoute: null,
      roleProvenance: null,
      messageComposerContext: null,
      payloadGenerated: false,
      rankingRuleId: "EC-RANK-01",
      ambiguityReason: "TIED_ON_CONTROLLED_RANK_KEYS",
      tiedOn: ["priority", "routePreference", "specificity"],
    });
    expect(response).not.toHaveProperty("lowerRankedEligibleCandidates");
    expect(mxOf(response)).not.toHaveProperty("lowerRankedEligibleCandidates");
  });

  it("applies creditor pass-through without overwriting an existing governed role", () => {
    const controller = harness().controller as unknown as {
      applyCreditorContext(
        roles: Json,
        creditor: { bic: string; source: string },
      ): { value: string; source: string };
    };
    const empty: Json = {};
    expect(
      controller.applyCreditorContext(empty, {
        bic: "BARCGB22",
        source: "REQUEST_PASS_THROUGH",
      }),
    ).toEqual({ value: "BARCGB22", source: "REQUEST_PASS_THROUGH" });
    expect(empty).toEqual({
      creditor: "BARCGB22",
      creditorSource: "REQUEST_PASS_THROUGH",
    });

    const governed = {
      creditor: "DEUTDEFF",
      creditorSource: "UPSTREAM_MESSAGE_CONTEXT",
    };
    expect(
      controller.applyCreditorContext(governed, {
        bic: "BARCGB22",
        source: "REQUEST_PASS_THROUGH",
      }),
    ).toEqual({
      value: "DEUTDEFF",
      source: "UPSTREAM_MESSAGE_CONTEXT",
    });
    expect(
      controller.applyCreditorContext({}, { bic: "", source: "" }),
    ).toEqual({ value: "", source: "" });
  });

  it("resolves creditor provenance and default exclusion reasons", () => {
    const controller = harness().controller as unknown as {
      creditorFromContext(
        request: Json,
        raw: Json,
      ): { bic: string; source: string };
      exclusionReason(evidence: readonly Json[]): string;
    };
    expect(
      controller.creditorFromContext(
        { sourceMessageType: "MT205" },
        { previousMessage: { "A.58A": "DEUTDEFF" } },
      ),
    ).toEqual({ bic: "DEUTDEFF", source: "UPSTREAM_MESSAGE_CONTEXT" });
    expect(
      controller.creditorFromContext(
        { sourceMessageType: "MT202", counterpartyBic: "BARCGB22" },
        {},
      ),
    ).toEqual({ bic: "BARCGB22", source: "REQUEST_PASS_THROUGH" });
    expect(controller.exclusionReason([{ outcome: "FAIL" }])).toBe(
      "NOT_ELIGIBLE",
    );
  });

  it("binds an existing account-with role to governed SSI provenance", () => {
    const controller = harness().controller as unknown as {
      bindSsiRoles(
        roles: Json,
        provenance: Json,
        chosen: Json,
        raw: Json,
        actualReceiver: string,
        accountWith: string,
      ): void;
    };
    const roles: Json = { accountWithInstitution: "PENDING" };
    const provenance: Json = {};

    controller.bindSsiRoles(
      roles,
      provenance,
      routePreview().recommendedRoute as Json,
      { skipCounterpartySsiResolution: true },
      "CITIUS33",
      "CITIUS33",
    );

    expect(roles).toMatchObject({
      instructedAgent: "CITIUS33",
      accountWithInstitution: "CITIUS33",
    });
    expect(provenance["accountWithInstitution"]).toEqual({
      value: "CITIUS33",
      source: "COUNTERPARTY_SSI",
      ssiCode: "SSI-DEMO-024",
      ssiVersion: 14,
      sourceField: "accountWithBic",
    });
  });

  it("requires a selectable message profile before own-account routing", () => {
    const context = harness();
    context.index.findSelectable.mockReturnValueOnce(undefined);
    const controller = context.controller as unknown as {
      ownAccountScenario(body: Json): unknown | undefined;
    };

    expect(
      controller.ownAccountScenario({
        scenarioCode: "BOOK_TRANSFER_SAME_RECEIVER",
        sourceMessageType: "MT202",
      }),
    ).toBeUndefined();
    expect(context.domains.resolve).not.toHaveBeenCalled();

    context.index.findSelectable.mockReturnValueOnce({
      messageType: "MT202",
      targetMessage: "pacs.009.001.08",
      businessService: "swift.cbprplus.04",
      selectable: true,
    });
    controller.ownAccountScenario({
      scenarioCode: "CREDIT_ONE_OF_SEVERAL_AT_57A",
      sourceMessageType: "MT202",
    });
    expect(context.domains.resolve).toHaveBeenCalledWith(
      "OWN_SSI_NOSTRO",
      expect.objectContaining({ businessService: "swift.cbprplus.04" }),
    );
  });

  it("omits account-with tags only for matching MT202 receivers", () => {
    const controller = harness().controller as unknown as {
      omitMt202AccountWithWhenReceiverMatches(
        tags: Json,
        omitted: Set<unknown>,
        sourceMessageType: string | undefined,
        actualReceiver: string,
        accountWith: string,
      ): void;
    };
    const tags: Json = { "57A": "CITIUS33" };
    const omitted = new Set<unknown>();

    controller.omitMt202AccountWithWhenReceiverMatches(
      tags,
      omitted,
      "MT205",
      "CITIUS33",
      "CITIUS33",
    );
    expect(tags).toEqual({ "57A": "CITIUS33" });
    controller.omitMt202AccountWithWhenReceiverMatches(
      tags,
      omitted,
      "MT202",
      "CITIUS33",
      "CITIUS33",
    );
    expect(tags).toEqual({});
    expect(omitted).toContain("57a");
  });

  it("preserves counterparty precondition and resolution HTTP failures", () => {
    const precondition = harness();
    precondition.counterparty.precondition.mockReturnValue({
      mx: { httpStatus: 422, code: "OPTION_CONSTRAINT_VIOLATION" },
      mt: {},
    });
    expect(
      mxOf(
        responseOf(() => precondition.controller.resolve(baseBody() as never)),
      ),
    ).toMatchObject({ httpStatus: 422, code: "OPTION_CONSTRAINT_VIOLATION" });

    const supported = harness();
    supported.counterparty.supports.mockReturnValue(true);
    supported.counterparty.resolve.mockReturnValue({
      mx: { httpStatus: 503, code: "PROFILE_INCOMPLETE" },
      mt: {},
    });
    expect(
      mxOf(responseOf(() => supported.controller.resolve(baseBody() as never))),
    ).toMatchObject({ httpStatus: 503, code: "PROFILE_INCOMPLETE" });
  });

  it.each([
    [
      baseBody({ sourceMessageType: "MT204", messageType: "pacs.010.001.03" }),
      "MESSAGE_TYPE_NOT_SUPPORTED",
      "FI_DIRECT_DEBIT",
    ],
    [
      baseBody({ sourceMessageType: "MT204" }),
      "PAYMENT_SOURCE_TARGET_MISMATCH",
      "FI_DIRECT_DEBIT",
    ],
    [
      baseBody({ sourceMessageType: "MT210" }),
      "MESSAGE_TYPE_NOT_SUPPORTED",
      "NOTIFICATION",
    ],
    [
      baseBody({ sourceMessageType: "MT200", requestedUse: "book transfer" }),
      "MESSAGE_TYPE_NOT_SUPPORTED",
      "OWN_SSI_NOSTRO",
    ],
  ])(
    "routes domain-specific unsupported request %#",
    (body, code, redirectDomain) => {
      const context = harness();
      context.service.resolve.mockImplementation(() => {
        throw new Error("unsupported");
      });
      const response = responseOf(() =>
        context.controller.resolve(body as never),
      );
      expect(mxOf(response)).toMatchObject({ code, redirectDomain });
    },
  );

  it.each([
    [{ "19": "present" }, "C01"],
    [{ sequenceB: [] }, "C02"],
    [{ sequenceBCount: 11 }, "T10"],
  ])("maps direct-debit validation signal %#", (signal, error) => {
    const context = harness();
    context.service.resolve.mockImplementation(() => {
      throw new Error("unsupported");
    });
    const response = responseOf(() =>
      context.controller.resolve(baseBody(signal) as never),
    );
    expect(mtOf(response)).toMatchObject({ validation: "FAIL", error });
  });

  it("returns direct-debit assertions when a mandate source is supplied", () => {
    const context = harness();
    context.service.resolve.mockImplementation(() => {
      throw new Error("unsupported");
    });
    const response = responseOf(() =>
      context.controller.resolve(
        baseBody({ "B.53A.source": "MANDATE" }) as never,
      ),
    );
    expect(mtOf(response)["assertions"]).toEqual([
      "B.53a=mandate Debit Institution",
      "A.58a=Sender identity",
    ]);
  });

  it.each([
    [{ "50F": "party" }, "C06"],
    [{ "50a": null }, "C06"],
    [{ occurrenceCount: 11 }, "T10"],
    [{ occurrences: [] }, "C02"],
    [{ currency: "XAU" }, "C08"],
  ])("maps notification validation signal %#", (signal, error) => {
    const context = harness();
    context.service.resolve.mockImplementation(() => {
      throw new Error("unsupported");
    });
    const response = responseOf(() =>
      context.controller.resolve(baseBody(signal) as never),
    );
    expect(mtOf(response)).toMatchObject({ validation: "FAIL", error });
  });

  it("requires account master and notification context when only account source is signalled", () => {
    const context = harness();
    context.service.resolve.mockImplementation(() => {
      throw new Error("unsupported");
    });
    const response = responseOf(() =>
      context.controller.resolve(
        baseBody({ "25.source": "ACCOUNT_MASTER" }) as never,
      ),
    );
    expect(mtOf(response)["requiredSources"]).toEqual([
      "ACCOUNT_MASTER",
      "NOTIFICATION_CONTEXT",
    ]);
  });

  it.each([
    [{ legs: ["USD-1", "EUR-2"] }, { parserConformance: "FAIL", error: "C02" }],
    [{ legs: ["USD-1", "USD-2"] }, { parserConformance: "FAIL", error: "C01" }],
    [{ legCount: 1 }, { parserConformance: "FAIL", error: "T11" }],
    [{ legCount: 11 }, { parserConformance: "FAIL", error: "T10" }],
    [
      { legCount: [2, 10] },
      { parserConformance: "PASS", execution: "REJECTED" },
    ],
    [
      { legCount: [1, 11] },
      { parserConformance: "FAIL", errors: ["T11", "T10"] },
    ],
    [
      { leg2: { "57A": null } },
      { parserConformance: "FAIL", error: "C81", wholeMessageFailClosed: true },
    ],
    [
      { leg2: { "58A": null } },
      { parserConformance: "FAIL", missing: ["leg[2].58a"] },
    ],
    [
      { legs: [{ "57A": "BANK", "58A": "BENEFICIARY" }] },
      { parserConformance: "PASS", execution: "REJECTED" },
    ],
  ])("reports split parser outcome %#", (signal, expected) => {
    const context = harness();
    context.service.resolve.mockImplementation(() => {
      throw new Error("unsupported");
    });
    const response = responseOf(() =>
      context.controller.resolve(baseBody(signal) as never),
    );
    expect(mtOf(response)).toMatchObject(expected);
  });

  it("reports missing leg agent, own-account and beneficiary provenance outcomes", () => {
    const cases: Array<[Json, Json]> = [
      [{ legs: [{ "57A": "BANK" }, {}] }, { missing: ["leg[2].57a"] }],
      [
        { legCount: 2, leg1: { "57A": "BANK", "58A": "OWN" } },
        { expectedMTLeg: { "57A": "BANK", "58A": "OWN" } },
      ],
      [
        {
          legs: [{ "57A": "BANK", beneficiarySource: "MESSAGE_CONTEXT" }],
        },
        {
          assertions: expect.arrayContaining([
            "never derive from Counterparty SSI.beneficiaryBic",
          ]),
        },
      ],
    ];
    for (const [signal, expected] of cases) {
      const context = harness();
      context.service.resolve.mockImplementation(() => {
        throw new Error("unsupported");
      });
      expect(
        mtOf(
          responseOf(() =>
            context.controller.resolve(baseBody(signal) as never),
          ),
        ),
      ).toMatchObject(expected);
    }
  });

  it("uses known policy codes and handles string/object error payloads", () => {
    const policy = harness();
    const policyResponse = responseOf(() =>
      policy.controller.resolve(
        baseBody({ counterpartyType: "BANK" }) as never,
      ),
    );
    expect(mxOf(policyResponse)["code"]).toBe(
      "MT2_COUNTERPARTY_TYPE_NOT_ACCEPTED",
    );

    const stringError = harness();
    stringError.index.findSelectable.mockImplementation(() => {
      throw new HttpException("PAYMENT_SOURCE_MESSAGE_TYPE_REQUIRED", 400);
    });
    expect(
      mxOf(
        responseOf(() => stringError.controller.resolve(baseBody() as never)),
      )["code"],
    ).toBe("PAYMENT_SOURCE_MESSAGE_TYPE_REQUIRED");

    const objectError = harness();
    objectError.index.findSelectable.mockImplementation(() => {
      throw new BadRequestException({
        message: "PAYMENT_SOURCE_TARGET_MISMATCH",
      });
    });
    expect(
      mxOf(
        responseOf(() => objectError.controller.resolve(baseBody() as never)),
      )["code"],
    ).toBe("PAYMENT_SOURCE_TARGET_MISMATCH");
  });
});
