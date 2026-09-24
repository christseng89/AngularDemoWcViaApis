import type { SsiApplicabilityRecord } from "../../app/sqlite-ssi.repository";
import {
  previewResolution,
  type RouteResolutionRequest,
} from "../../app/route-resolution.policy";

const request: RouteResolutionRequest = {
  consumer: "TRADE_FINANCE",
  product: "IMPORT_LC",
  businessFunction: "IMPORT_LC_BANK_REIMBURSEMENT",
  paymentLeg: "BANK_REIMBURSEMENT",
  direction: "OUTBOUND",
  counterpartyBic: "NSSIUSN1",
  counterpartyCountry: "US",
  currency: "USD",
  bookingEntity: "HK01",
  valueDate: "2026-09-08",
  amount: "1000000",
  messageType: "pacs.009.001.12",
  transactionReference: "NO-SSI-COVERAGE",
};

const generic = {
  id: "GLOBAL-USD-FALLBACK",
  counterpartyId: "CP-ANY",
  status: "ACTIVE",
  version: 1,
  route: {
    currency: "USD",
    counterpartyBic: "ANY",
    counterpartyCountry: "ANY",
  },
};

const applicability = {
  id: "GLOBAL-USD-FALLBACK:APPL:1",
  ssiId: generic.id,
  version: 1,
  consumer: "ANY",
  product: "ANY",
  businessFunction: "IMPORT_LC_BANK_REIMBURSEMENT",
  paymentLeg: "BANK_REIMBURSEMENT",
  direction: "OUTBOUND",
  status: "ACTIVE",
  validFrom: "2026-01-01",
  validTo: "2027-12-31",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as SsiApplicabilityRecord;

describe("counterparty SSI coverage boundary", () => {
  it("resolves the exact eligible SSI selected from a tied Payment route set", () => {
    const first = {
      ...generic,
      id: "SSI-SELECTED",
      counterpartyId: "CP-CITI",
      route: {
        currency: "USD",
        counterpartyBic: "CITIUS33",
        counterpartyCountry: "US",
        accountWithBic: "CITIUS33",
        accountCurrency: "USD",
        bookingEntity: "HK01",
        messageTypes: "pacs.009.001.08",
        sourceMessageTypes: "MT202COV",
        businessService: "swift.cbprplus.cov.04",
        priority: "10",
        routePreference: "PRIMARY",
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
      },
    };
    const second = { ...first, id: "SSI-OTHER" };
    const rows = [first, second].map((ssi) => ({
      ...applicability,
      id: `${ssi.id}:APPL:1`,
      ssiId: ssi.id,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER",
      paymentLeg: "INTERBANK_SETTLEMENT",
    }));
    const covRequest: RouteResolutionRequest = {
      ...request,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER",
      paymentLeg: "INTERBANK_SETTLEMENT",
      counterpartyBic: "CITIUS33",
      counterpartyCountry: "US",
      messageType: "pacs.009.001.08",
      sourceMessageType: "MT202COV",
      businessService: "swift.cbprplus.cov.04",
    };
    expect(previewResolution(covRequest, [first, second], rows).decision).toBe(
      "SSI_AMBIGUOUS",
    );
    expect(
      previewResolution(
        { ...covRequest, selectedSsiId: first.id },
        [first, second],
        rows,
      ).recommendedRoute?.ssiId,
    ).toBe(first.id);
  });

  it.each([
    "AUD",
    "CAD",
    "CHF",
    "CNY",
    "EUR",
    "GBP",
    "HKD",
    "JPY",
    "SGD",
    "USD",
  ])(
    "resolves %s Payment SSI without local clearing-system eligibility",
    (currency) => {
      const paymentRequest: RouteResolutionRequest = {
        ...request,
        consumer: "CENTRAL_PAYMENT",
        product: "CENTRAL_PAYMENT",
        businessFunction: "INTERBANK_TRANSFER",
        paymentLeg: "INTERBANK_SETTLEMENT",
        counterpartyBic: "CTBAAU2S",
        counterpartyCountry: "AU",
        settlementCountry: "AU",
        settlementMarket: "CORRESPONDENT_BANKING",
        clearingSystem: "RITS",
        currency,
        messageType: "pacs.009.001.08",
        sourceMessageType: "MT202",
      };
      const ssi = {
        id: "SSI-AUD-CTBA",
        counterpartyId: "CP-CTBA",
        status: "ACTIVE",
        version: 1,
        route: {
          currency,
          counterpartyBic: "CTBAAU2S",
          counterpartyCountry: "AU",
          accountWithBic: "CTBAAU2S",
          accountCurrency: currency,
          settlementCountry: "AU",
          settlementMarket: "CORRESPONDENT_BANKING",
          clearingSystem: "CORRESPONDENT_CHAIN",
          bookingEntity: "HK01",
          messageTypes: "pacs.009.001.08",
          sourceMessageTypes: "MT202",
          validFrom: "2026-01-01",
          validTo: "2027-12-31",
          priority: "10",
        },
      };
      const row = {
        ...applicability,
        id: "SSI-AUD-CTBA:APPL:1",
        ssiId: ssi.id,
        consumer: "CENTRAL_PAYMENT",
        product: "CENTRAL_PAYMENT",
        businessFunction: "INTERBANK_TRANSFER",
        paymentLeg: "INTERBANK_SETTLEMENT",
      };

      const result = previewResolution(paymentRequest, [ssi], [row]);
      expect(result.decision).toBe("RESOLVED");
      expect(result.recommendedRoute?.ssiId).toBe(ssi.id);
      expect(
        result.recommendedRoute?.evidence.some(({ criterion }) =>
          criterion.startsWith("CLEARING_"),
        ),
      ).toBe(false);
      expect(
        previewResolution(
          { ...paymentRequest, settlementCountry: "NZ" },
          [ssi],
          [row],
        ).decision,
      ).toBe("NO_ELIGIBLE_ROUTE");
      expect(
        previewResolution(
          { ...paymentRequest, settlementMarket: "AU_DOMESTIC" },
          [ssi],
          [row],
        ).decision,
      ).toBe("NO_ELIGIBLE_ROUTE");
    },
  );

  it("requires an explicit COV business service and source-message allow-list", () => {
    const coverRequest: RouteResolutionRequest = {
      ...request,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER",
      paymentLeg: "INTERBANK_SETTLEMENT",
      counterpartyBic: "BARCGB22",
      counterpartyCountry: "GB",
      currency: "GBP",
      messageType: "pacs.009.001.08",
      sourceMessageType: "MT202COV",
      businessService: "swift.cbprplus.cov.04",
    };
    const candidate = (id: string, profile = true) => ({
      id,
      counterpartyId: "CP-BARCGB22",
      status: "ACTIVE",
      version: 1,
      route: {
        ssiCode: id,
        currency: "GBP",
        counterpartyBic: "BARCGB22",
        counterpartyCountry: "GB",
        accountWithBic: "BARCGB22",
        accountCurrency: "GBP",
        clearingSystem: "CHAPS",
        bookingEntity: "HK01",
        messageTypes: "pacs.009.001.08",
        ...(profile
          ? {
              businessService: "swift.cbprplus.04,swift.cbprplus.cov.04",
              sourceMessageTypes: "MT202,MT205,MT202COV,MT205COV",
            }
          : {}),
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
        routePreference: "PRIMARY",
        priority: "10",
      },
    });
    const rows = (ids: readonly string[]) =>
      ids.map((id) => ({
        ...applicability,
        id: `${id}:APPL:1`,
        ssiId: id,
        consumer: "CENTRAL_PAYMENT",
        product: "CENTRAL_PAYMENT",
        businessFunction: "INTERBANK_TRANSFER",
        paymentLeg: "INTERBANK_SETTLEMENT",
      }));

    const incomplete = candidate("SSI-INCOMPLETE", false);
    const incompleteResult = previewResolution(
      coverRequest,
      [incomplete],
      rows([incomplete.id]),
    );
    expect(incompleteResult).toMatchObject({ decision: "NO_ELIGIBLE_ROUTE" });
    expect(incompleteResult.excludedRoutes[0]?.evidence).toContainEqual(
      expect.objectContaining({
        criterion: "COV_PROFILE",
        outcome: "FAIL",
        reasonCode: "COV_PROFILE_MISMATCH",
      }),
    );

    const tied = [candidate("SSI-DEMO-003"), candidate("SSI-DEMO-022")];
    expect(
      previewResolution(coverRequest, tied, rows(tied.map(({ id }) => id))),
    ).toMatchObject({ decision: "SSI_AMBIGUOUS" });
  });

  it("does not turn a global fallback into counterparty SSI coverage", () => {
    expect(
      previewResolution(request, [generic], [applicability]),
    ).toMatchObject({
      decision: "NO_ELIGIBLE_ROUTE",
      alternatives: [],
      excludedRoutes: [],
    });
  });

  it("keeps currency and MX target as hard eligibility conditions for an MT compatibility response", () => {
    const paymentRequest: RouteResolutionRequest = {
      ...request,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER",
      paymentLeg: "INTERBANK_SETTLEMENT",
      counterpartyType: "BANK",
      counterpartyBic: "CHASUS33",
      currency: "USD",
      messageType: "pacs.009.001.08",
      sourceMessageType: "MT200",
    };
    const route = (id: string, currency: string, accountWithBic: string) => ({
      id,
      counterpartyId: "CP-CHASUS33",
      status: "ACTIVE",
      version: 1,
      route: {
        ssiCode: id,
        currency,
        counterpartyType: "BANK",
        counterpartyBic: "CHASUS33",
        counterpartyCountry: "US",
        accountWithBic,
        accountCurrency: currency,
        clearingSystem: currency === "USD" ? "FEDWIRE" : "LYNX",
        bookingEntity: "HK01",
        messageTypes: "pacs.009.001.08",
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
        routePreference: "PRIMARY",
        priority: "10",
      },
    });
    const candidateRows = [
      route("SSI-DEMO-015", "CAD", "ROYCCAT2"),
      route("SSI-DEMO-016", "CAD", "BOFMCAM2"),
      route("SSI-DEMO-021", "USD", "CITIUS33"),
    ];
    const rows = candidateRows.map((candidate, index) => ({
      ...applicability,
      id: `${candidate.id}:APPL:1`,
      ssiId: candidate.id,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER",
      paymentLeg: "INTERBANK_SETTLEMENT",
      direction: "OUTBOUND",
      version: index + 1,
    }));

    const result = previewResolution(paymentRequest, candidateRows, rows);

    expect(result).toMatchObject({
      decision: "RESOLVED",
      recommendedRoute: {
        route: {
          ssiCode: "SSI-DEMO-021",
          currency: "USD",
          accountWithBic: "CITIUS33",
        },
      },
      alternatives: [],
    });
  });

  it("fails closed when two routes share the same governed business rank", () => {
    const exactRequest: RouteResolutionRequest = {
      ...request,
      counterpartyBic: "NSSIUSN1",
    };
    const candidate = (id: string, accountId: string) => ({
      id,
      counterpartyId: "CP-NSSIUSN1",
      status: "ACTIVE",
      version: 1,
      route: {
        ssiCode: id,
        currency: "USD",
        counterpartyBic: "NSSIUSN1",
        counterpartyCountry: "US",
        accountId,
        accountWithBic: "CITIUS33",
        accountCurrency: "USD",
        clearingSystem: "FEDWIRE",
        bookingEntity: "HK01",
        messageTypes: "pacs.009.001.12",
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
        routePreference: "PRIMARY",
        priority: "10",
      },
    });
    const candidates = [
      candidate("SSI-B", "ACCOUNT-B"),
      candidate("SSI-A", "ACCOUNT-A"),
    ];
    const rows = candidates.map((item) => ({
      ...applicability,
      id: `${item.id}:APPL:1`,
      ssiId: item.id,
    }));

    const result = previewResolution(exactRequest, candidates, rows);

    expect(result.decision).toBe("SSI_AMBIGUOUS");
    expect(result.recommendedRoute).toBeUndefined();
    expect(result.alternatives.map(({ ssiId }) => ssiId).sort()).toEqual([
      "SSI-A",
      "SSI-B",
    ]);
    expect(result.alternatives[0]?.rank).toEqual([10, 0, 2]);
  });

  it("filters a C81-invalid MT2 candidate without rejecting a valid route", () => {
    const mt2Request: RouteResolutionRequest = {
      ...request,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER",
      paymentLeg: "INTERBANK_SETTLEMENT",
      counterpartyBic: "CITIUS33",
      counterpartyCountry: "US",
      messageType: "pacs.009.001.08",
      sourceMessageType: "MT202",
    };
    const candidate = (
      id: string,
      sequenceA: Readonly<Record<string, string>>,
    ) => ({
      id,
      counterpartyId: "CP-CITIUS33",
      status: "ACTIVE",
      version: 1,
      route: {
        currency: "USD",
        counterpartyBic: "CITIUS33",
        counterpartyCountry: "US",
        accountCurrency: "USD",
        bookingEntity: "HK01",
        messageTypes: "pacs.009.001.08",
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
        routePreference: "PRIMARY",
        priority: "10",
        ...sequenceA,
      },
    });
    const invalid = candidate("SSI-C81-INVALID", {
      intermediaryBic: "HSBCHKHH",
    });
    const valid = candidate("SSI-C81-VALID", {
      intermediaryBic: "HSBCHKHH",
      accountWithBic: "CITIUS33",
    });
    const rows = [invalid, valid].map((item) => ({
      ...applicability,
      id: `${item.id}:APPL:1`,
      ssiId: item.id,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER",
      paymentLeg: "INTERBANK_SETTLEMENT",
    }));

    const result = previewResolution(mt2Request, [invalid, valid], rows);

    expect(result).toMatchObject({
      decision: "RESOLVED",
      recommendedRoute: { ssiId: "SSI-C81-VALID" },
    });
    expect(result.excludedRoutes[0]?.evidence).toContainEqual(
      expect.objectContaining({
        criterion: "MT2_SEQUENCE_A_C81",
        outcome: "FAIL",
        reasonCode: "C81_SEQUENCE_A_56_REQUIRES_57",
      }),
    );
  });

  it("returns no eligible route when every MT2 candidate violates C81", () => {
    const mt2Request: RouteResolutionRequest = {
      ...request,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER",
      paymentLeg: "INTERBANK_SETTLEMENT",
      counterpartyBic: "CITIUS33",
      counterpartyCountry: "US",
      messageType: "pacs.009.001.08",
      sourceMessageType: "MT205",
    };
    const invalid = {
      id: "SSI-C81-ONLY",
      counterpartyId: "CP-CITIUS33",
      status: "ACTIVE",
      version: 1,
      route: {
        currency: "USD",
        counterpartyBic: "CITIUS33",
        counterpartyCountry: "US",
        intermediaryBic: "HSBCHKHH",
        accountCurrency: "USD",
        bookingEntity: "HK01",
        messageTypes: "pacs.009.001.08",
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
      },
    };
    const row = {
      ...applicability,
      id: `${invalid.id}:APPL:1`,
      ssiId: invalid.id,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER",
      paymentLeg: "INTERBANK_SETTLEMENT",
    };

    const result = previewResolution(mt2Request, [invalid], [row]);

    expect(result.decision).toBe("NO_ELIGIBLE_ROUTE");
    expect(result.excludedRoutes[0]?.evidence).toContainEqual(
      expect.objectContaining({
        criterion: "MT2_SEQUENCE_A_C81",
        outcome: "FAIL",
        reasonCode: "C81_SEQUENCE_A_56_REQUIRES_57",
      }),
    );
  });

  it("fails closed for blank applicability and a different booking entity", () => {
    const exact = {
      id: "SSI-EXACT",
      counterpartyId: "CP-NSSIUSN1",
      status: "ACTIVE",
      version: 1,
      route: {
        currency: "USD",
        counterpartyBic: "NSSIUSN1",
        counterpartyCountry: "US",
        accountCurrency: "USD",
        clearingSystem: "FEDWIRE",
        bookingEntity: "SG01",
        messageTypes: "pacs.009.001.12",
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
      },
    };
    const blankApplicability = {
      ...applicability,
      id: "SSI-EXACT:APPL:1",
      ssiId: exact.id,
      consumer: "",
      product: "",
      businessFunction: "",
      paymentLeg: "",
      direction: "",
    };

    expect(
      previewResolution(request, [exact], [blankApplicability]),
    ).toMatchObject({
      decision: "NO_SSI_FOUND",
      alternatives: [],
    });

    const result = previewResolution(
      request,
      [exact],
      [{ ...applicability, id: "SSI-EXACT:APPL:2", ssiId: exact.id }],
    );
    expect(result).toMatchObject({ decision: "NO_ELIGIBLE_ROUTE" });
    expect(result.excludedRoutes[0]?.evidence).toContainEqual(
      expect.objectContaining({
        criterion: "BOOKING_ENTITY",
        outcome: "FAIL",
        reasonCode: "BOOKING_ENTITY_MISMATCH",
      }),
    );
  });

  it("uses the verified bank BIC as the canonical identity when an upstream ID is also present", () => {
    const bankRequest: RouteResolutionRequest = {
      ...request,
      counterpartyId: "CP-NSSIUSN1",
      counterpartyBic: "NSSIUSN1",
    };
    const exact = {
      ...generic,
      id: "SSI-EXACT-BANK",
      counterpartyId: "CP-NSSIUSN1",
      route: {
        currency: "USD",
        counterpartyBic: "NSSIUSN1",
        counterpartyCountry: "US",
        accountCurrency: "USD",
        clearingSystem: "FEDWIRE",
        bookingEntity: "HK01",
        messageTypes: "pacs.009.001.12",
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
      },
    };

    expect(
      previewResolution(
        bankRequest,
        [exact],
        [{ ...applicability, id: `${exact.id}:APPL:1`, ssiId: exact.id }],
      ),
    ).toMatchObject({ decision: "RESOLVED" });
  });

  it("matches a customer-owned SSI by internal Customer ID without treating it as a BIC", () => {
    const customerRequest: RouteResolutionRequest = {
      ...request,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "CUSTOMER_CREDIT_TRANSFER",
      paymentLeg: "CUSTOMER_TRANSFER",
      counterpartyType: "CUSTOMER",
      counterpartyId: "CUST-00001",
      counterpartyBic: undefined,
      counterpartyCountry: "HK",
      currency: "HKD",
      messageType: "pacs.008.001.12",
    };
    const customer = {
      id: "CUSTOMER-HKD",
      counterpartyId: "CUST-00001",
      status: "ACTIVE",
      version: 1,
      route: {
        currency: "HKD",
        counterpartyType: "CUSTOMER",
        counterpartyCountry: "HK",
        accountWithBic: "HSBCHKHH",
        actualReceiverBic: "HSBCHKHH",
        accountCurrency: "HKD",
        clearingSystem: "HKD_CHATS",
        bookingEntity: "HK01",
        messageTypes: "pacs.008.001.12",
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
        routePreference: "PRIMARY",
        priority: "10",
      },
    };
    const customerApplicability = {
      ...applicability,
      id: "CUSTOMER-HKD:APPL:1",
      ssiId: customer.id,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "CUSTOMER_CREDIT_TRANSFER",
      paymentLeg: "CUSTOMER_TRANSFER",
    };

    expect(
      previewResolution(customerRequest, [customer], [customerApplicability]),
    ).toMatchObject({
      decision: "RESOLVED",
      recommendedRoute: { counterpartyId: "CUST-00001" },
    });
  });

  it("excludes bank fallbacks from customer resolution even when the bank channel is identical", () => {
    const customerRequest: RouteResolutionRequest = {
      ...request,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "CUSTOMER_CREDIT_TRANSFER",
      paymentLeg: "CUSTOMER_TRANSFER",
      counterpartyType: "CUSTOMER",
      counterpartyId: "CUST-00001",
      counterpartyBic: undefined,
      counterpartyCountry: "HK",
      currency: "HKD",
      messageType: "pacs.008.001.12",
    };
    const customer = {
      id: "CUSTOMER-HKD",
      counterpartyId: "CUST-00001",
      status: "ACTIVE",
      version: 1,
      route: {
        currency: "HKD",
        counterpartyType: "CUSTOMER",
        counterpartyCountry: "HK",
        accountWithBic: "HSBCHKHH",
        actualReceiverBic: "HSBCHKHH",
        accountCurrency: "HKD",
        clearingSystem: "HKD_CHATS",
        bookingEntity: "HK01",
        messageTypes: "pacs.008.001.12",
        validFrom: "2026-01-01",
        validTo: "2027-12-31",
        routePreference: "PRIMARY",
        priority: "10",
      },
    };
    const bankFallback = {
      ...customer,
      id: "BANK-HKD-FALLBACK",
      counterpartyId: "CP-ANY-HKD",
      route: {
        ...customer.route,
        counterpartyType: "BANK",
        counterpartyBic: "ANY",
        counterpartyCountry: "ANY",
        approvedGlobal: "true",
        routePreference: "FALLBACK",
        priority: "999",
      },
    };
    const customerApplicability = {
      ...applicability,
      id: "CUSTOMER-HKD:APPL:1",
      ssiId: customer.id,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "CUSTOMER_CREDIT_TRANSFER",
      paymentLeg: "CUSTOMER_TRANSFER",
    };
    const fallbackApplicability = {
      ...customerApplicability,
      id: "BANK-HKD-FALLBACK:APPL:1",
      ssiId: bankFallback.id,
    };

    const result = previewResolution(
      customerRequest,
      [customer, bankFallback],
      [customerApplicability, fallbackApplicability],
    );

    expect(result).toMatchObject({
      decision: "RESOLVED",
      recommendedRoute: { counterpartyId: "CUST-00001" },
      alternatives: [],
    });
    expect(result.excludedRoutes[0]?.evidence).toContainEqual(
      expect.objectContaining({
        criterion: "COUNTERPARTY_TYPE",
        outcome: "FAIL",
        reasonCode: "COUNTERPARTY_TYPE_MISMATCH",
      }),
    );
  });
});
