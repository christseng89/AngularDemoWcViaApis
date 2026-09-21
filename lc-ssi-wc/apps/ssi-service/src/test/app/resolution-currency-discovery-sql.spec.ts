import { SqliteSsiRepository, type SsiRecord } from "../../app/sqlite-ssi.repository";

const activeSsi = (
  id: string,
  currency: string,
  messageTypes: string | readonly string[],
  usageScope?: string,
): SsiRecord => ({
  id,
  counterpartyId: "BANK-1",
  scope: "STANDING",
  maker: "maker",
  checker: "checker",
  status: "ACTIVE",
  version: 1,
  route: {
    currency,
    businessFunction: "FX_CONFIRMATION",
    messageTypes: messageTypes as string,
    validFrom: "2026-01-01",
    validTo: "2027-12-31",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...(usageScope ? { usageScope } : {}),
});

describe("ordinary Resolution Currency SQL discovery", () => {
  const priorPath = process.env["SSI_DATABASE_PATH"];
  let repository: SqliteSsiRepository;

  beforeEach(() => {
    process.env["SSI_DATABASE_PATH"] = ":memory:";
    repository = new SqliteSsiRepository();
  });
  afterEach(() => {
    repository.onModuleDestroy();
    if (priorPath === undefined) delete process.env["SSI_DATABASE_PATH"];
    else process.env["SSI_DATABASE_PATH"] = priorPath;
  });

  const add = (
    repository: SqliteSsiRepository,
    id: string,
    currency: string,
    messageTypes: string | readonly string[],
    usageScope?: string,
  ) => {
    repository.save(
      activeSsi(id, currency, messageTypes, usageScope),
      "APPROVE",
      "checker",
    );
    repository.replaceApplicability(
      id,
      [
        {
          consumer: "TREASURY",
          product: "FX",
          businessFunction: "FX_CONFIRMATION",
          paymentLeg: "SETTLEMENT",
          direction: "OUTBOUND",
          status: "ACTIVE",
          validFrom: "2026-01-01",
          validTo: "2027-12-31",
        },
      ],
      "checker",
    );
  };

  it("discovers ordinary CSV and governed fixture array tokens without QA-negative rows", () => {
    add(repository, "SSI-CAD", "CAD", "MT300,MT320");
    add(repository, "SSI-EUR", "EUR", ["MT300"]);
    add(repository, "SSI-NEG", "JPY", ["MT300"], "QA_NEGATIVE");
    expect(
      repository.findResolutionCurrencyCoverage({
        consumer: "TREASURY",
        businessFunction: "FX_CONFIRMATION",
        messageType: "MT300",
        asOfDate: "2026-09-20",
      }),
    ).toEqual(["CAD", "EUR"]);
  });

  it("ignores inactive or expired SSI and applicability", () => {
    add(repository, "SSI-OLD", "USD", "MT300");
    expect(
      repository.findResolutionCurrencyCoverage({
        consumer: "TREASURY",
        businessFunction: "FX_CONFIRMATION",
        messageType: "MT300",
        asOfDate: "2028-01-01",
      }),
    ).toEqual([]);
  });

  it("does not count a cross-message applicability as coverage for another SSI message", () => {
    repository.save(activeSsi("SSI-CROSS", "CHF", ["MT300", "MT320"]), "APPROVE", "checker");
    repository.replaceApplicability("SSI-CROSS", [{
      consumer: "TREASURY", product: "FX", businessFunction: "FX_CONFIRMATION",
      messageType: "MT320", paymentLeg: "SETTLEMENT", direction: "OUTBOUND",
      status: "ACTIVE", validFrom: "2026-01-01", validTo: "2027-12-31",
    }], "checker");
    expect(repository.findResolutionCurrencyCoverage({
      consumer: "TREASURY", businessFunction: "FX_CONFIRMATION",
      messageType: "MT300", asOfDate: "2026-09-20",
    })).toEqual([]);
    expect(repository.findResolutionCurrencyCoverage({
      consumer: "TREASURY", businessFunction: "FX_CONFIRMATION",
      messageType: "MT320", asOfDate: "2026-09-20",
    })).toEqual(["CHF"]);
  });

  it("preserves the governed MT347 QA_POSITIVE visibility exception but excludes QA_NEGATIVE", () => {
    for (const [id, currency, usageScope] of [
      ["SSI-POS", "USD", "QA_POSITIVE"],
      ["SSI-NEG", "JPY", "QA_NEGATIVE"],
    ]) {
      repository.save({
        ...activeSsi(id!, currency!, ["MT300"], usageScope),
        fixtureFamily: "MT347-SR2026-SSI",
        fixtureVariantVersion: "MT347-DEMO-ORACLE-V1.1",
        datasetVersion: "MT347-DEMO-V1.1",
        operationalVisible: false,
      }, "APPROVE", "checker");
      repository.replaceApplicability(id!, [{
        consumer: "TREASURY", product: "FX", businessFunction: "FX_CONFIRMATION",
        paymentLeg: "SETTLEMENT", direction: "OUTBOUND", status: "ACTIVE",
        validFrom: "2026-01-01", validTo: "2027-12-31",
      }], "checker");
    }
    expect(repository.findResolutionCurrencyCoverage({
      consumer: "TREASURY", businessFunction: "FX_CONFIRMATION",
      messageType: "MT300", asOfDate: "2026-09-20",
    })).toEqual(["USD"]);
  });

  it("restricts Payment candidate discovery to the approved SSI when requested", () => {
    for (const [id, currency] of [
      ["SSI-PAY-USD", "USD"],
      ["SSI-PAY-EUR", "EUR"],
    ]) {
      repository.save(
        {
          ...activeSsi(id!, currency!, "pacs.009.001.08"),
          route: {
            routePurpose: "INTERBANK_TRANSFER",
            sourceMessageTypes: "MT202,MT205",
            messageTypes: "pacs.009.001.08",
            businessService: "swift.cbprplus.04",
            currency: currency!,
            bookingEntity: "HK01",
            validFrom: "2026-01-01",
            validTo: "2027-12-31",
          },
        },
        "APPROVE",
        "checker",
      );
      repository.replaceApplicability(
        id!,
        [
          {
            consumer: "CENTRAL_PAYMENT",
            product: "CENTRAL_PAYMENT",
            businessFunction: "INTERBANK_TRANSFER",
            paymentLeg: "INTERBANK_SETTLEMENT",
            direction: "OUTBOUND",
            status: "ACTIVE",
            validFrom: "2026-01-01",
            validTo: "2027-12-31",
          },
        ],
        "checker",
      );
    }
    const query = {
      sourceMessageType: "MT202",
      messageType: "pacs.009.001.08",
      valueDate: "2026-09-20",
    };
    expect(repository.findPaymentCandidateBindings(query)).toHaveLength(2);
    expect(repository.findPaymentResolutionCurrencies(query)).toEqual(["EUR", "USD"]);
    expect(repository.findPaymentResolutionCurrencies({ ...query, ssiId: "SSI-PAY-EUR" })).toEqual(["EUR"]);
    expect(
      repository
        .findPaymentCandidateBindings({ ...query, ssiId: "SSI-PAY-EUR" })
        .map(({ ssi }) => ssi.id),
    ).toEqual(["SSI-PAY-EUR"]);
  });

  it.each(["MT202", "MT202COV", "MT205", "MT205COV"])(
    "keeps %s pacs.009 SSI discovery independent of downstream businessService while preserving Core/COV routes",
    (sourceMessageType) => {
      for (const [suffix, supportedMessage] of [
        ["CORE", "MT202,MT205"],
        ["COV", "MT202COV,MT205COV"],
      ]) {
        const id = `SSI-${suffix}`;
        repository.save(
          {
            ...activeSsi(id, "USD", "pacs.009.001.08"),
            route: {
              routePurpose: "INTERBANK_TRANSFER",
              sourceMessageTypes: supportedMessage,
              messageTypes: "pacs.009.001.08",
              businessService: suffix === "CORE" ? "swift.cbprplus.04" : "swift.cbprplus.cov.04",
              currency: "USD",
              bookingEntity: "HK01",
              accountId: `ACCOUNT-${suffix}`,
              actualReceiverBic: `RECEIVER-${suffix}`,
              validFrom: "2026-01-01",
              validTo: "2027-12-31",
            },
          },
          "APPROVE",
          "checker",
        );
        repository.replaceApplicability(id, [{
          consumer: "CENTRAL_PAYMENT", product: "CENTRAL_PAYMENT",
          businessFunction: "INTERBANK_TRANSFER", paymentLeg: "INTERBANK_SETTLEMENT",
          direction: "OUTBOUND", status: "ACTIVE",
          validFrom: "2026-01-01", validTo: "2027-12-31",
        }], "checker");
      }
      const query = {
        sourceMessageType,
        messageType: "pacs.009.001.08",
        businessService: "nonmatching.profile.only",
        valueDate: "2026-09-20",
        currency: "USD",
        bookingEntity: "HK01",
      };
      const expected = sourceMessageType.endsWith("COV") ? "COV" : "CORE";
      expect(repository.findPaymentCandidateBindings(query).map(({ ssi }) => [
        ssi.id, ssi.route["accountId"], ssi.route["actualReceiverBic"],
      ])).toEqual([[`SSI-${expected}`, `ACCOUNT-${expected}`, `RECEIVER-${expected}`]]);
      expect(repository.findPaymentResolutionCurrencies(query)).toEqual(["USD"]);
    },
  );
});
