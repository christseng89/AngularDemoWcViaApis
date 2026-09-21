import type { RouteResolutionRequest } from "../../app/route-resolution.policy";
import type {
  SsiApplicabilityRecord,
  SsiRecord,
  SqliteSsiRepository,
} from "../../app/sqlite-ssi.repository";
import {
  PURPOSE_APPLICABILITY_MISMATCH,
  PURPOSE_REMEDIATION,
  SsiDataQualityService,
  incorrectSsiConfigurationStatusPolicy,
} from "../../app/ssi-data-quality.service";

const request: RouteResolutionRequest = {
  consumer: "CENTRAL_PAYMENT",
  counterpartyType: "BANK",
  counterpartyBic: "BARCGB22",
  counterpartyCountry: "GB",
  currency: "GBP",
  product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
  bookingEntity: "HK01",
  valueDate: "2026-09-12",
  amount: "1000000",
  messageType: "pacs.009.001.08",
  businessService: "swift.cbprplus.04",
  sourceMessageType: "MT202",
  transactionReference: "DQ-1",
};

const ssi = (purposeBuilt: boolean): SsiRecord => ({
  id: "SSI-ID-1",
  counterpartyId: "CP-BARCGB22",
  scope: "STANDING",
  maker: "maker",
  status: "ACTIVE",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  route: {
    ssiCode: "SSI-SPECIALIST-1",
    counterpartyBic: "BARCGB22",
    currency: "GBP",
    bookingEntity: "HK01",
    validFrom: "2026-01-01",
    validTo: "2027-12-31",
    messageTypes: "pacs.009.001.08",
    businessService: "swift.cbprplus.04",
    sourceMessageTypes: "MT202",
    ...(purposeBuilt
      ? {
          routePurpose: "INTERBANK_TRANSFER",
          consumer: "CENTRAL_PAYMENT",
          product: "CENTRAL_PAYMENT",
          businessFunction: "INTERBANK_TRANSFER",
          paymentLeg: "INTERBANK_SETTLEMENT",
          direction: "OUTBOUND",
        }
      : { businessFunction: "IMPORT_COLLECTION_PAYMENT" }),
  },
});

const applicability: SsiApplicabilityRecord = {
  id: "SSI-ID-1:APPL:2",
  ssiId: "SSI-ID-1",
  consumer: "CENTRAL_PAYMENT",
  product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
  status: "ACTIVE",
  validFrom: "2026-01-01",
  validTo: "2027-12-31",
  version: 1,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
};

const quality = (record: SsiRecord) =>
  new SsiDataQualityService({
    list: () => [record],
    listApplicability: () => [applicability],
  } as unknown as SqliteSsiRepository);

describe("SsiDataQualityService", () => {
  it.each([
    [{ SSI_RUNTIME_ENV: "development", NODE_ENV: "production" }, 409, "development"],
    [{ SSI_RUNTIME_ENV: "DEMO", NODE_ENV: "production" }, 409, "demo"],
    [{ SSI_RUNTIME_ENV: "", NODE_ENV: "development" }, 500, "unknown"],
    [{ SSI_RUNTIME_ENV: "misspelled", NODE_ENV: "development" }, 500, "misspelled"],
    [{ NODE_ENV: "test" }, 500, "test"],
    [{}, 500, "production"],
  ] as const)(
    "maps runtime policy %# to HTTP %i",
    (environment, expectedStatus, expectedEnvironment) => {
      expect(incorrectSsiConfigurationStatusPolicy(environment)).toEqual({
        httpStatus: expectedStatus,
        runtimeEnvironment: expectedEnvironment,
        statusPolicyVersion: "SSI-CONFIG-HTTP-01",
      });
    },
  );

  it("uses the process runtime environment when no policy input is supplied", () => {
    const previousEnvironment = process.env["SSI_RUNTIME_ENV"];
    process.env["SSI_RUNTIME_ENV"] = "development";
    try {
      expect(incorrectSsiConfigurationStatusPolicy()).toMatchObject({
        httpStatus: 409,
        runtimeEnvironment: "development",
      });
    } finally {
      if (previousEnvironment === undefined)
        delete process.env["SSI_RUNTIME_ENV"];
      else process.env["SSI_RUNTIME_ENV"] = previousEnvironment;
    }
  });

  it("quarantines a specialist SSI with generic applicability", () => {
    const service = quality(ssi(false));
    const expected = [
      {
        ssiCode: "SSI-SPECIALIST-1",
        applicabilityId: "SSI-ID-1:APPL:2",
        violation: PURPOSE_APPLICABILITY_MISMATCH,
        remediation: PURPOSE_REMEDIATION,
      },
    ];
    expect(service.globalIssues()).toEqual(expected);
    expect(service.issuesFor(request)).toEqual(expected);
  });

  it("does not quarantine an explicit purpose-built generic route", () => {
    expect(quality(ssi(true)).globalIssues()).toEqual([]);
  });

  it("does not block an unrelated request scope", () => {
    expect(
      quality(ssi(false)).issuesFor({ ...request, currency: "USD" }),
    ).toEqual([]);
  });

  it("handles absent route tokens and counterparty metadata conservatively", () => {
    const withoutTokens = ssi(false);
    delete withoutTokens.route["messageTypes"];
    expect(quality(withoutTokens).issuesFor(request)).toEqual([]);

    const byCounterpartyId = ssi(false);
    delete byCounterpartyId.route["ssiCode"];
    delete byCounterpartyId.route["counterpartyBic"];
    expect(quality(byCounterpartyId).globalIssues()).toEqual([
      expect.objectContaining({ ssiCode: "" }),
    ]);
    expect(
      quality(byCounterpartyId).issuesFor({
        ...request,
        counterpartyBic: undefined,
        counterpartyId: "CP-BARCGB22",
      }),
    ).toHaveLength(1);
  });

  it("sorts multiple quarantined applicability records deterministically", () => {
    const secondSsi = {
      ...ssi(false),
      id: "SSI-ID-2",
      route: { ...ssi(false).route, ssiCode: "SSI-SPECIALIST-2" },
    };
    const secondApplicability = {
      ...applicability,
      id: "SSI-ID-2:APPL:1",
      ssiId: "SSI-ID-2",
    };
    const service = new SsiDataQualityService({
      list: () => [secondSsi, ssi(false)],
      listApplicability: () => [secondApplicability, applicability],
    } as unknown as SqliteSsiRepository);

    expect(service.globalIssues().map((issue) => issue.applicabilityId)).toEqual([
      "SSI-ID-1:APPL:2",
      "SSI-ID-2:APPL:1",
    ]);
  });
});
