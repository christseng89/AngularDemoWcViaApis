import { BadRequestException } from "@nestjs/common";
import { SsiApplicationService } from "./ssi-application.service";
import type { SqliteSsiRepository } from "./sqlite-ssi.repository";
import type { RmaApplicationService } from "./rma/rma-application.service";
import type { NostroApplicationService } from "./nostro/nostro-application.service";
import { PaymentMessageIndexService } from "./payment-message-index.service";

const makeService = (
  counterpartyType: "BANK" | "CUSTOMER",
  directBank = false,
) => {
  const counterpartyId =
    counterpartyType === "BANK"
      ? directBank
        ? "CITIUS33"
        : "BARCGB22"
      : "CUST-00001";
  const settlementBic = directBank ? counterpartyId : "HSBCHKHH";
  const messageType =
    counterpartyType === "BANK" ? "pacs.009.001.08" : "pacs.008.001.12";
  const businessFunction =
    counterpartyType === "BANK"
      ? "INTERBANK_TRANSFER"
      : "CUSTOMER_CREDIT_TRANSFER";
  const paymentLeg =
    counterpartyType === "BANK" ? "INTERBANK_SETTLEMENT" : "CUSTOMER_TRANSFER";
  const record = {
    id: "SSI-PAYMENT-1",
    counterpartyId,
    status: "ACTIVE",
    version: 9,
    route: {
      counterpartyType,
      ...(counterpartyType === "BANK"
        ? { counterpartyBic: counterpartyId }
        : {}),
      counterpartyCountry: counterpartyType === "BANK" ? "GB" : "HK",
      currency: "HKD",
      accountCurrency: "HKD",
      accountId: "DEMO-NOSTRO-HKD-001",
      accountWithBic: settlementBic,
      actualReceiverBic: settlementBic,
      beneficiaryBic: counterpartyType === "BANK" ? counterpartyId : "",
      clearingSystem: "HKD_CHATS",
      settlementCountry: "HK",
      settlementMarket: "HK_DOLLAR",
      routePreference: "PRIMARY",
      routeType: directBank ? "DIRECT" : "CLEARING_AGENT",
      priority: "10",
      bookingEntity: "HK01",
      messagingService: "FINPLUS",
      messageTypes: messageType,
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
    },
  };
  const applicability = {
    id: "APPL-1",
    ssiId: record.id,
    consumer: "CENTRAL_PAYMENT",
    product: "CENTRAL_PAYMENT",
    businessFunction,
    paymentLeg,
    direction: "OUTBOUND",
    status: "ACTIVE",
    validFrom: "2026-01-01",
    validTo: "2027-12-31",
    version: 1,
  };
  const repository = {
    list: () => [record],
    listApplicability: () => [applicability],
  } as unknown as SqliteSsiRepository;
  const rma = {
    check: () => ({ authorised: true, decision: "AUTHORISED" }),
  } as unknown as RmaApplicationService;
  const nostro = {
    resolve: () => ({
      decision: "RESOLVED",
      nostroId: "NOSTRO-OWN-HKD-1",
      accountServicerBic: settlementBic,
      accountReference: "OWN-HKD-ACCOUNT-1",
      maskedAccountRef: "DEMO-OWN-NOSTRO-HKD-001",
    }),
    list: () =>
      ["OWN-HKD-ACCOUNT-1", "OWN-HKD-ACCOUNT-2"].map(
        (accountReference, index) => ({
          id: `NOSTRO-OWN-HKD-${index + 1}`,
          ownLegalEntityId: "HK01",
          allowedBookingEntities: ["HK01"],
          accountServicerBic: settlementBic,
          currency: "HKD",
          accountReference,
          maskedAccountRef: `DEMO-${index + 1}`,
          purpose: "SETTLEMENT",
          priority: index + 1,
          validFrom: "2026-01-01",
          validTo: "2027-12-31",
          status: "ACTIVE",
          version: 1,
          maker: "qa",
          createdAt: "2026-01-01",
          updatedAt: "2026-01-01",
        }),
      ),
  } as unknown as NostroApplicationService;
  return {
    service: new SsiApplicationService(
      repository,
      rma,
      nostro,
      new PaymentMessageIndexService(),
    ),
    request: {
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      counterpartyType,
      counterpartyId,
      ...(counterpartyType === "BANK"
        ? { counterpartyBic: counterpartyId }
        : {}),
      counterpartyCountry: counterpartyType === "BANK" ? "GB" : "HK",
      currency: "HKD",
      businessFunction,
      paymentLeg,
      direction: "OUTBOUND",
      bookingEntity: "HK01",
      valueDate: "2026-09-09",
      amount: "1000",
      messageType,
      ...(counterpartyType === "BANK"
        ? { sourceMessageType: "MT202" as const }
        : {}),
      transactionReference: "PAYMENT-1",
      ...(counterpartyType === "CUSTOMER"
        ? {
            beneficiaryCustomer: {
              customerId: "CUST-00001",
              name: "Demo Global Trading Ltd.",
              accountReference: "BENEFICIARY-ACCOUNT-1",
            },
          }
        : {}),
    },
  };
};

const resolveAndConfirm = (
  counterpartyType: "BANK" | "CUSTOMER",
  directBank = false,
) => {
  const { service, request } = makeService(counterpartyType, directBank);
  const preview = service.resolve(request) as {
    attemptId: string;
    recommendedRoute: { ssiId: string };
  };
  return service.confirm({
    attemptId: preview.attemptId,
    selectedSsiId: preview.recommendedRoute.ssiId,
    actor: "maker.demo",
  }) as {
    canonicalSettlement: Record<string, unknown>;
    rmaEvidence: Record<string, unknown>;
  };
};

describe("SR2026 payment settlement classification", () => {
  it("returns an MT/MX-renderable canonical preview before RMA and Nostro confirmation", () => {
    const { service, request } = makeService("BANK");
    const preview = service.resolve(request) as {
      paymentExecutable: boolean;
      canonicalSettlementPreview: Record<string, unknown>;
    };
    expect(preview.paymentExecutable).toBe(false);
    expect(preview.canonicalSettlementPreview).toMatchObject({
      finMessageType: "MT202",
      deliveryAgentBic: "HSBCHKHH",
      beneficiaryInstitutionBic: "BARCGB22",
      settlementAccountReference: "OWN-HKD-ACCOUNT-1",
      directAccountRelationshipCount: 2,
    });
  });

  it("rejects MT200 because it belongs to the Own SSI / Nostro domain", () => {
    const { service, request } = makeService("BANK");
    expect(() =>
      service.resolve({ ...request, sourceMessageType: "MT200" }),
    ).toThrow(new BadRequestException("MESSAGE_TYPE_NOT_SUPPORTED"));
  });

  it("rejects a Bank payment when the Message Index selection is missing", () => {
    const { service, request } = makeService("BANK");
    expect(() =>
      service.resolve({ ...request, sourceMessageType: undefined }),
    ).toThrow(new BadRequestException("PAYMENT_SOURCE_MESSAGE_TYPE_REQUIRED"));
  });

  it("rejects a non-selectable MT2XX profile", () => {
    const { service, request } = makeService("BANK");
    expect(() =>
      service.resolve({
        ...request,
        sourceMessageType: "MT204",
      }),
    ).toThrow(new BadRequestException("MESSAGE_TYPE_NOT_SUPPORTED"));
  });

  it("creates an MT103 canonical view with 59 transaction input and no 58A value", () => {
    const confirmation = resolveAndConfirm("CUSTOMER");
    expect(confirmation.canonicalSettlement).toMatchObject({
      finMessageType: "MT103",
      deliveryAgentBic: "HSBCHKHH",
      creditorAgentBic: "HSBCHKHH",
      beneficiaryInstitutionBic: "",
      beneficiaryCustomer: {
        customerId: "CUST-00001",
        accountReference: "BENEFICIARY-ACCOUNT-1",
      },
      fieldProvenance: {
        "53A": { source: "OWN_NOSTRO", evidenceId: "NOSTRO-OWN-HKD-1" },
        "57A": { source: "CUSTOMER_SSI", evidenceId: "SSI-PAYMENT-1" },
        "59": { source: "TRANSACTION_INPUT", evidenceId: "CUST-00001" },
      },
    });
    expect(confirmation.rmaEvidence).toHaveProperty("decision", "AUTHORISED");
  });

  it("creates an MT202 canonical view with mandatory beneficiary institution 58A", () => {
    const confirmation = resolveAndConfirm("BANK");
    expect(confirmation.canonicalSettlement).toMatchObject({
      finMessageType: "MT202",
      beneficiaryInstitutionBic: "BARCGB22",
      fieldProvenance: {
        "58A": { source: "TRANSACTION_CONTEXT", evidenceId: "BARCGB22" },
      },
    });
    expect(confirmation.canonicalSettlement).not.toHaveProperty(
      "beneficiaryCustomer",
    );
  });

  it("normalizes a proven direct MT202 route to mandatory 58A only", () => {
    const confirmation = resolveAndConfirm("BANK", true);
    expect(confirmation.canonicalSettlement).toMatchObject({
      finMessageType: "MT202",
      deliveryAgentBic: "",
      intermediaryAgentBics: [],
      creditorAgentBic: "",
      beneficiaryInstitutionBic: "CITIUS33",
      fieldProvenance: {
        "58A": { source: "TRANSACTION_CONTEXT", evidenceId: "CITIUS33" },
      },
    });
    expect(confirmation.canonicalSettlement).not.toHaveProperty(
      "fieldProvenance.53A",
    );
    expect(confirmation.canonicalSettlement).not.toHaveProperty(
      "fieldProvenance.57A",
    );
  });

  it("rejects a Customer payment without mandatory beneficiary transaction input", () => {
    const { service, request } = makeService("CUSTOMER");
    expect(() =>
      service.resolve({ ...request, beneficiaryCustomer: undefined }),
    ).toThrow(new BadRequestException("BENEFICIARY_CUSTOMER_REQUIRED"));
  });

  it("rejects an incoherent Bank/pacs.008 Customer Transfer profile", () => {
    const { service, request } = makeService("BANK");
    expect(() =>
      service.resolve({
        ...request,
        businessFunction: "CUSTOMER_CREDIT_TRANSFER",
        paymentLeg: "CUSTOMER_TRANSFER",
        messageType: "pacs.008.001.12",
      }),
    ).toThrow(new BadRequestException("COUNTERPARTY_PAYMENT_PROFILE_MISMATCH"));
  });
});
