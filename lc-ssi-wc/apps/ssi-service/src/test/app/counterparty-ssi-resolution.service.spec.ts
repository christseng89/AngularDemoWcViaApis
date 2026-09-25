import { CounterpartySsiResolutionService } from "../../app/counterparty-ssi-resolution.service";
import type { RouteResolutionRequest } from "../../app/route-resolution.policy";

const request: RouteResolutionRequest = {
  consumer: "CENTRAL_PAYMENT",
  counterpartyId: "CP-CITIUS33",
  counterpartyBic: "CITIUS33",
  counterpartyCountry: "US",
  currency: "USD",
  product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
  bookingEntity: "HK01",
  valueDate: "2026-09-09",
  amount: "1",
  messageType: "pacs.009.001.08",
  sourceMessageType: "MT202",
  transactionReference: "QA",
};

const governedRaw = (
  source: string,
  raw: Record<string, unknown>,
): Record<string, unknown> => {
  const basePrevious = source.endsWith("COV")
    ? {
        type: "MT202COV",
        "20": "PREVIOUS",
        "21": "PREVIOUS",
        "121": "123e4567-e89b-12d3-a456-426614174000",
        "A.52A": "CITIUS33",
        "A.58A": "CITIUS33",
        sequenceB: { "50A": "DEMOHKHH", "59": "CUSTOMER" },
        artifactSha256: "b".repeat(64),
        artifactVersion: "1.0.0",
      }
    : {
        type: "MT202",
        "20": "PREVIOUS",
        "21": "PREVIOUS",
        nonCoverAttested: true,
        attestationId: "MT205-NON-COVER-001",
        attestationVersion: "1.0.0",
        artifactSha256: "a".repeat(64),
      };
  const suppliedPrevious = raw["previousMessage"];
  return {
    ...(source.endsWith("COV")
      ? {
          block3: { "119": "COV" },
          incoming121: "123e4567-e89b-12d3-a456-426614174000",
          sequenceB: { "50A": "DEMOHKHH", "59": "CUSTOMER" },
          underlyingCustomerCreditTransfer: true,
        }
      : {}),
    ...(source.startsWith("MT205")
      ? {
          previousMessage: basePrevious,
          senderCountry: "US",
          receiverCountry: "US",
          senderCountrySourceId: "ENTITY-US",
          senderCountrySourceVersion: "1",
          receiverCountrySourceId: "BANK-SVC-CITIUS33",
          receiverCountrySourceVersion: "1",
        }
      : {}),
    ...raw,
    ...(source.startsWith("MT205") &&
    suppliedPrevious &&
    typeof suppliedPrevious === "object"
      ? {
          previousMessage: {
            ...basePrevious,
            ...(suppliedPrevious as Record<string, unknown>),
          },
          ...(["MT200", "MT201"].includes(
            String((suppliedPrevious as Record<string, unknown>)["type"] ?? ""),
          )
            ? {
                initialTransferType: (
                  suppliedPrevious as Record<string, unknown>
                )["type"],
              }
            : {}),
        }
      : {}),
  };
};

describe("CounterpartySsiResolutionService", () => {
  const service = new CounterpartySsiResolutionService();

  it("fails closed when an MT202COV own-account request omits genuine-cover context", () => {
    const result = service.validateContext(
      {
        ...request,
        sourceMessageType: "MT202COV",
        scenarioCode: "BOOK_TRANSFER_SAME_RECEIVER",
      } as never,
      {},
    );
    expect(result?.["mx"]).toMatchObject({
      httpStatus: 422,
      code: "INVALID_UPSTREAM_CONTEXT",
      payloadGenerated: false,
      ssiApplicability: "NOT_EVALUATED",
      resolutionOutcome: "INVALID_UPSTREAM_CONTEXT",
    });
  });

  it("defers MT205COV jurisdiction evidence to the selected route gate", () => {
    const raw = governedRaw("MT205COV", {});
    for (const key of [
      "senderCountry",
      "receiverCountry",
      "senderCountrySourceId",
      "senderCountrySourceVersion",
      "receiverCountrySourceId",
      "receiverCountrySourceVersion",
    ])
      delete raw[key];

    expect(
      service.validateContext(
        { ...request, sourceMessageType: "MT205COV" } as never,
        raw,
      ),
    ).toBeUndefined();
  });

  it.each([
    [{}, "INVALID_UPSTREAM_CONTEXT"],
    [
      {
        previousMessage: {
          type: "MT200",
          "20": "PREVIOUS",
          "21": "PREVIOUS",
        },
        senderCountry: "HK",
        receiverCountry: "HK",
      },
      "INVALID_UPSTREAM_CONTEXT",
    ],
    [
      {
        previousMessage: {
          type: "MT200",
          "20": "PREVIOUS",
          "21": "PREVIOUS",
          nonCoverAttested: true,
          attestationId: "MT205-NON-COVER-001",
          attestationVersion: "1",
          artifactSha256: "a".repeat(64),
        },
      },
      "INVALID_UPSTREAM_CONTEXT",
    ],
  ])(
    "fails closed for incomplete MT205 governed context %p",
    (raw, expectedCode) => {
      const result = service.validateContext(
        { ...request, sourceMessageType: "MT205" },
        raw,
      );
      expect(result?.["mx"]).toMatchObject({
        httpStatus: 422,
        code: expectedCode,
        payloadGenerated: false,
      });
    },
  );

  it.each([
    ["MT202", "BARCGB22", "UPSTREAM_MESSAGE_CONTEXT"],
    ["MT203", "CITIUS33", undefined],
    ["MT205", "CITIUS33", undefined],
  ])(
    "uses actual %s provenance only for governed downstream MT205 roles",
    (previousType, beneficiary, creditorSource) => {
      const result = service.resolve(
        { ...request, sourceMessageType: "MT205" },
        governedRaw("MT205", {
          previousMessage: {
            type: previousType,
            "21": "RELATED",
            "52A": "CHASUS33",
            "58A": "BARCGB22",
            nonCoverAttested: true,
            attestationId: `MT205-${previousType}`,
            attestationVersion: "1.0.0",
            artifactSha256: "a".repeat(64),
          },
        }),
      );
      expect(result["mt"]).toMatchObject({ tags: { "58A": beneficiary } });
      expect(
        (result["mx"] as Record<string, unknown>)["canonicalRoles"],
      ).toMatchObject(
        creditorSource
          ? { creditorSource }
          : { beneficiaryInstitution: "CITIUS33" },
      );
    },
  );

  it("renders a canonical MT202 envelope from the resolved Bank Service identity", () => {
    expect(service.resolve(request, {})).toMatchObject({
      mx: {
        httpStatus: 200,
        redirectDomain: null,
        canonicalScenario: "FI_TO_FI_TRANSFER",
      },
      mt: { tags: { "58A": "CITIUS33" } },
    });
  });

  it("applies the governed 52a equals 58a equivalence to an initial MT201", () => {
    const result = service.resolve(
      { ...request, sourceMessageType: "MT205" },
      governedRaw("MT205", {
        previousMessage: {
          type: "MT201",
          "20": "MT201-REFERENCE",
          "21": "RELATED",
          senderBic: "CHASUS33",
          nonCoverAttested: true,
          attestationId: "MT205-MT201",
          attestationVersion: "1.0.0",
          artifactSha256: "a".repeat(64),
        },
      }),
    );
    expect(result["mt"]).toMatchObject({
      tags: {
        "21": "MT201-REFERENCE",
        "52A": "CHASUS33",
        "58A": "CHASUS33",
      },
    });
  });

  it("returns the MT C81 envelope rather than emitting a partial route", () => {
    expect(
      service.resolve(request, { "56A": "HSBCHKHH", "57A": null }),
    ).toMatchObject({
      profileKind: "SSI_RESOLUTION_ONLY",
      paymentExecutable: false,
      payloadGenerated: false,
      confirmedResolutionCreated: false,
      repairQueueCreated: false,
      ssiApplicability: "REQUIRED",
      resolutionOutcome: "OPTION_CONSTRAINT_VIOLATION",
      mx: {
        httpStatus: 422,
        code: "OPTION_CONSTRAINT_VIOLATION",
        payloadGenerated: false,
      },
      mt: { validation: "FAIL", error: "C81" },
    });
  });

  it("keeps directory identity separate from Counterparty SSI eligibility", () => {
    expect(
      service.precondition({ bankServiceId: "BANK-SVC-DMOAAEAD" }),
    ).toMatchObject({
      mx: { httpStatus: 422, code: "SSI_NOT_FOUND", payloadGenerated: false },
      mt: { bankServiceIdentityResolved: true, routeEligibilityCreated: false },
    });
  });

  it("identifies the governed exact active Nostro relationship when a candidate is incomplete", () => {
    expect(
      service.resolve(request, { candidate: { nostroMatch: null } }),
    ).toMatchObject({
      mx: { httpStatus: 503, code: "PROFILE_INCOMPLETE" },
      mt: {
        validation: "FAIL",
        missingRelationship:
          "SSI.route.accountId -> ACTIVE Nostro.accountReference",
        payloadGenerated: false,
      },
    });
  });

  it.each([
    [{ counterpartyBic: "CITIUS33" }, "OPTION_CONSTRAINT_VIOLATION"],
    [{ selectedRouteVersionChanged: true }, "STALE_RESOLUTION"],
    [{ paymentBeneficiaryInstitutionInput: null }, "MESSAGE_CONTEXT_MISSING"],
    [{ userOverride58A: true }, "OPTION_CONSTRAINT_VIOLATION"],
    [{ manual5xTags: { "57a": "BANK" } }, "OPTION_CONSTRAINT_VIOLATION"],
    [{ bankServiceId: "BANK-SVC-UNKNOWN" }, "SSI_NOT_FOUND"],
    [{ bankServiceId: "BANK-SVC-INACTIVE" }, "SSI_NOT_FOUND"],
  ])("fails precondition %p with %s", (raw, code) => {
    expect(service.precondition(raw)?.["mx"]).toMatchObject({ code });
  });

  it("renders supported Bank Service preconditions without free-text BICs", () => {
    expect(
      service.precondition({ bankServiceId: "BANK-SVC-BARCGB22" }),
    ).toMatchObject({
      mx: { decision: "RESOLVED" },
      mt: { tags: { "58A": "BARCGB22" } },
    });
    expect(
      service.precondition({
        beneficiaryBankServiceId: "BANK-SVC-DEUTDEFF",
      }),
    ).toMatchObject({ mt: { tags: { "57A": "DEUTDEFF" } } });
  });

  it.each([
    ["MT202", { "58A": null }, "MESSAGE_CONTEXT_MISSING"],
    ["MT205", { "54A": "BANK" }, "OPTION_CONSTRAINT_VIOLATION"],
    ["MT202", { requiresReceiverCorrespondent: true }, "PROFILE_INCOMPLETE"],
    [
      "MT202",
      { intermediaryBankServiceId: "BANK", accountWithBankServiceId: null },
      "PROFILE_INCOMPLETE",
    ],
    ["MT205", { previousMessage: null }, "INVALID_UPSTREAM_CONTEXT"],
    ["MT202", { availableRmaVersions: [1] }, "RMA_NOT_AUTHORIZED"],
    ["MT202", { rmaFixture: true }, "RMA_NOT_AUTHORIZED"],
    ["MT202", { counterpartyId: "CUST-00002" }, "SSI_NOT_FOUND"],
    ["MT202", { currency: "XAU" }, "CURRENCY_NOT_SUPPORTED"],
    ["MT202", { accountWith: {} }, "AGENT_ID_INSUFFICIENT"],
    [
      "MT202",
      { "56D": "A", "57D": "B", "58D": "C" },
      "OPTION_CONSTRAINT_VIOLATION",
    ],
    [
      "MT202",
      { candidate: { ssiCode: "X", messageTypes: ["pacs.009.001.12"] } },
      "SSI_NOT_FOUND",
    ],
    [
      "MT202",
      { nostro: { allowedBookingEntitiesKeyPresent: false } },
      "PROFILE_INCOMPLETE",
    ],
    [
      "MT202",
      { candidate: { ownershipTypeKeyPresent: false } },
      "PROFILE_INCOMPLETE",
    ],
    ["MT202COV", { missing: ["B.50a"] }, "MESSAGE_CONTEXT_MISSING"],
    ["MT202COV", { coverSequenceB: null }, "INVALID_UPSTREAM_CONTEXT"],
    ["MT202COV", { block3: { "119": "CORE" } }, "INVALID_UPSTREAM_CONTEXT"],
    ["MT202COV", { sequenceB: { "59": "X" } }, "MESSAGE_CONTEXT_MISSING"],
    ["MT202COV", { sequenceB: { "50A": "X" } }, "MESSAGE_CONTEXT_MISSING"],
    [
      "MT202COV",
      { "A.56A": "X", "A.57A": null },
      "OPTION_CONSTRAINT_VIOLATION",
    ],
    [
      "MT202COV",
      { "B.56A": "X", "B.57A": null },
      "OPTION_CONSTRAINT_VIOLATION",
    ],
    ["MT202COV", { "A.56C": "X" }, "OPTION_CONSTRAINT_VIOLATION"],
    ["MT205COV", { "A.54A": "X" }, "OPTION_CONSTRAINT_VIOLATION"],
    [
      "MT202COV",
      { underlyingCustomerCreditTransfer: false },
      "INVALID_UPSTREAM_CONTEXT",
    ],
    ["MT202COV", { before: "x", after: "y" }, "OPTION_CONSTRAINT_VIOLATION"],
    ["MT202COV", { modified: ["B.50A"] }, "OPTION_CONSTRAINT_VIOLATION"],
    [
      "MT205",
      {
        previousMessage: {
          type: "GOVERNED_EQUIVALENT_FI_CREDIT_TRANSFER",
          nonCoverAttested: false,
        },
      },
      "INVALID_UPSTREAM_CONTEXT",
    ],
    [
      "MT205",
      { ownAccountSubScenario: "BOOK_TRANSFER_SAME_RECEIVER" },
      "PROFILE_INCOMPLETE",
    ],
    [
      "MT205",
      { bicCountryConsistency: "CONFLICT" },
      "JURISDICTION_EVIDENCE_CONFLICT",
    ],
    [
      "MT202COV",
      { previousMessage: { type: "MT202COV", "A.58A": null } },
      "MESSAGE_CONTEXT_MISSING",
    ],
  ])("fails %s governed input %p with %s", (source, raw, code) => {
    const result = service.resolve(
      { ...request, sourceMessageType: source },
      governedRaw(source, raw),
    );
    expect(result["mx"]).toMatchObject({ code, payloadGenerated: false });
  });

  it("does not apply the MT205 same-country rule to MT202", () => {
    expect(
      service.resolve(request, { senderCountry: "HK", receiverCountry: "US" }),
    ).toMatchObject({ mx: { httpStatus: 200, decision: "RESOLVED" } });
  });

  it.each([
    ["MT202", { ownAccountSubScenario: "BOOK_TRANSFER_SAME_RECEIVER" }],
    ["MT202", { ownAccountSubScenario: "CREDIT_ONE_OF_SEVERAL_AT_57A" }],
    ["MT202", { directAccountCount: 2 }],
    ["MT202", { qaSeedId: "QA-SSI-BARC-USD-INT" }],
    ["MT202", { qaSeedIds: ["A", "B"] }],
    ["MT202", { paymentBeneficiaryInstitutionInput: "BARCGB22" }],
    ["MT202", { counterpartyId: "CP-CHASUS33" }],
    ["MT202", { qaSeedId: "QA-SSI-DEUT-EUR-54" }],
    ["MT202", { senderCorrespondentBankServiceId: "BANK" }],
    ["MT202", { intermediaryBankServiceId: "BANK" }],
    ["MT202", { "13C": "/RNCTIME/1200+0000" }],
    ["MT202", { paymentBeneficiaryInstitutionInput: "DEUTDEFF" }],
    ["MT205", { previousMessage: { type: "MT200", "20": "REF" } }],
    ["MT205", { previousMessage: { type: "MT202", "58A": "BARCGB22" } }],
    ["MT205", { receiverIsAwi: true }],
    ["MT205", { "56A": "A", "57A": "B" }],
    ["MT205", { incoming121: "UETR" }],
    ["MT205", { previousMessage: { type: "MT202" } }],
    ["MT202COV", { qaSeedIds: ["A"] }],
    ["MT202COV", { ownAccountSubScenario: "CREDIT_ONE_OF_SEVERAL_AT_57A" }],
    ["MT202COV", { ownAccountSubScenario: "BOOK_TRANSFER_SAME_RECEIVER" }],
    ["MT202COV", { paymentBeneficiaryInstitutionInput: "BARCGB22" }],
    ["MT202COV", { incoming21: "REF" }],
    ["MT202COV", { "A.53A": "A" }],
    ["MT202COV", { "B.56C": "//FW123" }],
    ["MT205COV", { incoming21: "REF" }],
    ["MT205COV", { "B.56C": "//FW123" }],
    [
      "MT205COV",
      {
        previousMessage: {
          type: "MT202COV",
          "A.52A": "CHASUS33",
          "A.58A": "BARCGB22",
          sequenceBComplete: true,
        },
      },
    ],
  ])("renders %s governed success for %p", (source, raw) => {
    const result = service.resolve(
      { ...request, sourceMessageType: source },
      governedRaw(source, raw),
    );
    expect(result["mx"]).toMatchObject({
      httpStatus: 200,
      decision: "RESOLVED",
    });
  });
});
