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

describe("CounterpartySsiResolutionService", () => {
  const service = new CounterpartySsiResolutionService();

  it.each([
    ["MT202", "BARCGB22", "UPSTREAM_MESSAGE_CONTEXT"],
    ["MT203", "CITIUS33", undefined],
    ["MT205", "CITIUS33", undefined],
  ])("uses actual %s provenance only for governed downstream MT205 roles", (previousType, beneficiary, creditorSource) => {
    const result = service.resolve(
      { ...request, sourceMessageType: "MT205" },
      { previousMessage: { type: previousType, "21": "RELATED", "52A": "CHASUS33", "58A": "BARCGB22" } },
    );
    expect(result["mt"]).toMatchObject({ tags: { "58A": beneficiary } });
    expect((result["mx"] as Record<string, unknown>)["canonicalRoles"]).toMatchObject(
      creditorSource ? { creditorSource } : { beneficiaryInstitution: "CITIUS33" },
    );
  });

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

  it("returns the MT C81 envelope rather than emitting a partial route", () => {
    expect(
      service.resolve(request, { "56A": "HSBCHKHH", "57A": null }),
    ).toEqual({
      mx: {
        httpStatus: 422,
        code: "OPTION_CONSTRAINT_VIOLATION",
        redirectDomain: null,
        payloadGenerated: false,
        detail: "",
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
    ["MT205", { previousMessage: null }, "MESSAGE_CONTEXT_MISSING"],
    [
      "MT205",
      { senderCountry: "HK", receiverCountry: "US" },
      "COUNTERPARTY_PAYMENT_PROFILE_MISMATCH",
    ],
    ["MT202", { availableRmaVersions: [1] }, "RMA_NOT_AUTHORISED"],
    ["MT202", { rmaFixture: true }, "RMA_NOT_AUTHORISED"],
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
    ["MT202COV", { coverSequenceB: null }, "MESSAGE_CONTEXT_MISSING"],
    ["MT202COV", { block3: { "119": "CORE" } }, "PROFILE_INCOMPLETE"],
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
      "COUNTERPARTY_PAYMENT_PROFILE_MISMATCH",
    ],
    ["MT202COV", { before: "x", after: "y" }, "OPTION_CONSTRAINT_VIOLATION"],
    ["MT202COV", { modified: ["B.50A"] }, "OPTION_CONSTRAINT_VIOLATION"],
    [
      "MT205COV",
      { senderCountry: "HK", receiverCountry: "US" },
      "COUNTERPARTY_PAYMENT_PROFILE_MISMATCH",
    ],
    [
      "MT202COV",
      { previousMessage: { type: "MT202COV", "A.58A": null } },
      "MESSAGE_CONTEXT_MISSING",
    ],
  ])("fails %s governed input %p with %s", (source, raw, code) => {
    const result = service.resolve(
      { ...request, sourceMessageType: source },
      raw,
    );
    expect(result["mx"]).toMatchObject({ code, payloadGenerated: false });
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
      raw,
    );
    expect(result["mx"]).toMatchObject({
      httpStatus: 200,
      decision: "RESOLVED",
    });
  });
});
