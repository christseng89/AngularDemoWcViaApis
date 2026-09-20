import { SqliteSsiRepository, type SsiRecord, type SsiApplicabilityInput } from "./sqlite-ssi.repository";
import { previewResolution, type RouteResolutionRequest } from "./route-resolution.policy";
import { SsiDataQualityService } from "./ssi-data-quality.service";

const request: RouteResolutionRequest = {
  consumer: "CENTRAL_PAYMENT",
  counterpartyType: "BANK",
  counterpartyBic: "CITIUS33",
  counterpartyCountry: "US",
  currency: "USD",
  product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
  bookingEntity: "HK01",
  valueDate: "2026-09-21",
  amount: "1000",
  messageType: "pacs.009.001.08",
  sourceMessageType: "MT202",
  transactionReference: "PERF-PARITY",
};

const applicability: SsiApplicabilityInput = {
  consumer: "CENTRAL_PAYMENT",
  product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
  status: "ACTIVE",
  validFrom: "2026-01-01",
  validTo: "2027-12-31",
};

const ssi = (id: string, route: Record<string, string>, status = "ACTIVE"): SsiRecord => ({
  id,
  counterpartyId: "CITIUS33",
  scope: "STANDING",
  maker: "maker.test",
  status,
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  route: {
    currency: "USD", accountCurrency: "USD", bookingEntity: "HK01",
    counterpartyBic: "CITIUS33", counterpartyType: "BANK",
    validFrom: "2026-01-01", validTo: "2027-12-31",
    messageTypes: "pacs.009.001.08", sourceMessageTypes: "MT202",
    priority: "10", accountId: `ACCOUNT-${id}`,
    routePurpose: "INTERBANK_TRANSFER",
    ...route,
  },
});

describe("request-scoped SSI SQL", () => {
  const original = process.env["SSI_DATABASE_PATH"];
  beforeEach(() => { process.env["SSI_DATABASE_PATH"] = ":memory:"; });
  afterEach(() => {
    if (original === undefined) delete process.env["SSI_DATABASE_PATH"];
    else process.env["SSI_DATABASE_PATH"] = original;
  });

  it("preserves ranked and excluded route decisions without loading unrelated currencies", () => {
    const repository = new SqliteSsiRepository();
    const records = [
      ssi("MATCH", {}),
      ssi("WRONG-BOOKING", { bookingEntity: "SG01" }),
      ssi("WRONG-MESSAGE", { messageTypes: "pacs.008.001.08" }),
      ssi("OTHER-CURRENCY", { currency: "EUR", accountCurrency: "EUR" }),
      ssi("REVOKED", {}, "REVOKED"),
    ];
    for (const record of records) {
      repository.save(record, "CREATED", "maker.test");
      repository.replaceApplicability(record.id, [applicability], "maker.test");
    }
    const sameDecision = (context: RouteResolutionRequest) => {
      const complete = previewResolution(context, repository.list(), repository.listApplicability());
      const bindings = repository.findRelatedRouteBindings(context);
      expect(previewResolution(context, bindings.ssi, bindings.applicability)).toEqual(complete);
      return complete.decision;
    };
    expect(sameDecision(request)).toBe("RESOLVED");
    expect(sameDecision({ ...request, currency: "CHF" })).toBe("NO_SSI_FOUND");
    expect(sameDecision({ ...request, counterpartyBic: "OTHERXXX" })).toBe("NO_ELIGIBLE_ROUTE");
    expect(sameDecision({ ...request, selectedSsiId: "WRONG-MESSAGE" })).toBe("NO_ELIGIBLE_ROUTE");
    const scoped = repository.findRelatedRouteBindings(request);
    expect(scoped.ssi.map(({ id }) => id)).not.toContain("OTHER-CURRENCY");
    expect(scoped.ssi.map(({ id }) => id)).not.toContain("REVOKED");
    expect(scoped.ssi.map(({ id }) => id)).toContain("WRONG-BOOKING");
    expect(scoped.ssi.map(({ id }) => id)).toContain("WRONG-MESSAGE");
    const tied = ssi("TIED", {});
    repository.save(tied, "CREATED", "maker.test");
    repository.replaceApplicability(tied.id, [applicability], "maker.test");
    expect(sameDecision(request)).toBe("SSI_AMBIGUOUS");
    repository.onModuleDestroy();
  });

  it("preserves request-specific invalid-purpose diagnostics without scanning all SSI", () => {
    const repository = new SqliteSsiRepository();
    for (const record of [
      ssi("VALID", { consumer: "CENTRAL_PAYMENT", product: "CENTRAL_PAYMENT", businessFunction: "INTERBANK_TRANSFER", paymentLeg: "INTERBANK_SETTLEMENT", direction: "OUTBOUND" }),
      ssi("INVALID", { routePurpose: "OTHER" }),
      ssi("OTHER-CURRENCY", { currency: "EUR" }),
    ]) {
      repository.save(record, "CREATED", "maker.test");
      repository.replaceApplicability(record.id, [applicability], "maker.test");
    }
    const expected = new SsiDataQualityService(repository).issuesFor(request);
    const related = repository.findRequestDataQualityBindings(request);
    expect(related.map(({ ssi }) => ssi.id)).toContain("INVALID");
    expect(related.map(({ ssi }) => ssi.id)).not.toContain("OTHER-CURRENCY");
    expect(expected.map(({ applicabilityId }) => applicabilityId)).toHaveLength(1);
    jest.spyOn(repository, "list").mockImplementation(() => { throw new Error("FULL_SCAN_FORBIDDEN"); });
    jest.spyOn(repository, "listApplicability").mockImplementation(() => { throw new Error("FULL_SCAN_FORBIDDEN"); });
    expect(new SsiDataQualityService(repository).issuesFor(request)).toEqual(expected);
    repository.onModuleDestroy();
  });

  it("expires abandoned WIP before the scoped resolution read, as the former list did", () => {
    const repository = new SqliteSsiRepository();
    const expired: SsiRecord = {
      ...ssi("EXPIRED-WIP", {}, "WIP"),
      amendmentOfId: "ORIGINAL",
      revisionWipExpiresAt: "2000-01-01T00:00:00.000Z",
    };
    repository.save(expired, "WIP_RESERVED", expired.maker);
    repository.replaceApplicability(expired.id, [applicability], "maker.test");
    repository.findRelatedRouteBindings(request);
    expect(repository.find(expired.id)?.status).toBe("REVOKED");
    expect(repository.findRelatedRouteBindings(request).ssi.map(({ id }) => id)).not.toContain(expired.id);
    repository.onModuleDestroy();
  });

  it("checks an exact COV profile in SQL without loading all SSI records", () => {
    const repository = new SqliteSsiRepository();
    const cover = ssi("COVER", {
      businessService: "swift.cbprplus.cov.04",
      sourceMessageTypes: "MT202COV,MT205COV",
    });
    repository.save(cover, "CREATED", "maker.test");
    const context = {
      ...request,
      sourceMessageType: "MT202COV",
      businessService: "swift.cbprplus.cov.04",
    };
    expect(repository.hasCoverProfile(context)).toBe(true);
    expect(repository.hasCoverProfile({ ...context, sourceMessageType: "MT205COV" })).toBe(true);
    expect(repository.hasCoverProfile({ ...context, sourceMessageType: "MT202" })).toBe(false);
    expect(repository.hasCoverProfile({ ...context, counterpartyBic: "CHASUS33" })).toBe(false);
    expect(repository.hasCoverProfile({ ...context, bookingEntity: "SG01" })).toBe(false);
    repository.save({ ...cover, route: { ...cover.route, counterpartyBic: "" } }, "UPDATED", "maker.test");
    expect(repository.hasCoverProfile(context)).toBe(true);
    repository.save({ ...cover, route: { ...cover.route, businessService: "swift.cbprplus.cov. 04" } }, "UPDATED", "maker.test");
    expect(repository.hasCoverProfile(context)).toBe(false);
    repository.save({ ...cover, route: { ...cover.route, businessService: "\tswift.cbprplus.cov.04\t" } }, "UPDATED", "maker.test");
    expect(repository.hasCoverProfile(context)).toBe(true);
    const abandoned: SsiRecord = {
      ...ssi("ABANDONED", {}, "WIP"),
      amendmentOfId: "COVER",
      revisionWipExpiresAt: "2000-01-01T00:00:00.000Z",
    };
    repository.save(abandoned, "WIP_RESERVED", "maker.test");
    repository.hasCoverProfile({ ...context, counterpartyBic: "UNKNOWNXX" });
    expect(repository.find(abandoned.id)?.status).toBe("REVOKED");
    repository.save({ ...cover, status: "SUPPRESSED" }, "SUPPRESSED", "maker.test");
    expect(repository.hasCoverProfile(context)).toBe(false);
    repository.onModuleDestroy();
  });
});
