import { SqliteSsiRepository, type SsiRecord } from "../../app/sqlite-ssi.repository";
import type { DiscoveredCurrency } from "../../app/resolution-currency-store";
import { DatabaseSync } from "node:sqlite";

const paymentUsd: DiscoveredCurrency = {
  standardsRelease: "SR2026",
  businessDomain: "PAYMENT",
  currency: "USD",
};

describe("Resolution currency repository transaction boundary", () => {
  const oldPath = process.env["SSI_DATABASE_PATH"];
  let repository: SqliteSsiRepository;

  beforeEach(() => {
    process.env["SSI_DATABASE_PATH"] = ":memory:";
    repository = new SqliteSsiRepository();
  });
  afterEach(() => {
    repository.onModuleDestroy();
    if (oldPath === undefined) delete process.env["SSI_DATABASE_PATH"];
    else process.env["SSI_DATABASE_PATH"] = oldPath;
  });

  it("bootstraps empty coverage once and never auto-reconciles nonempty coverage", () => {
    const discover = jest.fn(() => [paymentUsd]);
    expect(repository.bootstrapResolutionCurrencyCoverage(discover, "2026-09-15").inserted).toBe(1);
    expect(repository.bootstrapResolutionCurrencyCoverage(discover, "2026-09-15").inserted).toBe(0);
    expect(discover).toHaveBeenCalledTimes(1);
    expect(repository.activeResolutionCurrencies("SR2026", "PAYMENT")).toEqual(["USD"]);
  });

  it("uses a deterministic baseline timestamp for identical empty-table bootstraps", () => {
    repository.bootstrapResolutionCurrencyCoverage(() => [paymentUsd], "2026-09-15");
    const first = repository.resolutionCurrencyInquiry("SR2026");
    const second = new SqliteSsiRepository();
    try {
      second.bootstrapResolutionCurrencyCoverage(() => [paymentUsd], "2026-09-15");
      expect(second.resolutionCurrencyInquiry("SR2026")).toEqual(first);
      expect(first[0]?.updatedAt).toBe("2026-09-15T00:00:00Z");
    } finally {
      second.onModuleDestroy();
    }
  });

  it("sets a bounded busy timeout before startup writer-lock operations", () => {
    const db = (repository as unknown as { db: DatabaseSync }).db;
    expect((db.prepare("PRAGMA busy_timeout").get() as { timeout: number }).timeout).toBeGreaterThanOrEqual(5000);
  });

  it("fails closed if coverage exists without matching initialization control", () => {
    repository.bootstrapResolutionCurrencyCoverage(() => [paymentUsd], "2026-09-15");
    const db = (repository as unknown as { db: DatabaseSync }).db;
    db.prepare("DELETE FROM resolution_currency_sync_control WHERE standards_release=?").run("SR2026");
    const discover = jest.fn(() => [paymentUsd]);
    expect(() => repository.bootstrapResolutionCurrencyCoverage(discover, "2026-09-15"))
      .toThrow("RESOLUTION_CURRENCY_BOOTSTRAP_CONTROL_MISMATCH");
    expect(discover).not.toHaveBeenCalled();
  });

  it("rolls back partial discovery failure and keeps coverage empty", () => {
    expect(() => repository.resyncResolutionCurrencyCoverage(() => {
      throw new Error("DISCOVERY_FAILED");
    }, "2026-09-15")).toThrow("DISCOVERY_FAILED");
    expect(repository.resolutionCurrencyInquiry("SR2026")).toEqual([]);
  });

  it("can retry safely after failed empty-table bootstrap", () => {
    expect(() => repository.bootstrapResolutionCurrencyCoverage(() => {
      throw new Error("DISCOVERY_FAILED");
    }, "2026-09-15")).toThrow("DISCOVERY_FAILED");
    expect(repository.bootstrapResolutionCurrencyCoverage(() => [paymentUsd], "2026-09-15").inserted).toBe(1);
    expect(repository.activeResolutionCurrencies("SR2026", "PAYMENT")).toEqual(["USD"]);
  });

  it("resyncs idempotently and only the complete reconciliation inactivates", () => {
    repository.bootstrapResolutionCurrencyCoverage(() => [paymentUsd], "2026-09-15");
    const first = repository.resyncResolutionCurrencyCoverage(() => [], "2026-09-15");
    const second = repository.resyncResolutionCurrencyCoverage(() => [], "2026-09-15");
    expect(first.inactivated).toBe(1);
    expect(second).toMatchObject({ inserted: 0, inactivated: 0, activated: 0 });
    expect(repository.activeResolutionCurrencies("SR2026", "PAYMENT")).toEqual([]);
  });

  it("discovers approved coverage inside the SSI approval transaction and skips duplicate approval", () => {
    const pending: SsiRecord = {
      id: "SSI-PENDING", counterpartyId: "CP-1", scope: "STANDING",
      maker: "maker", status: "PENDING_APPROVAL", version: 1,
      route: { currency: "USD" }, createdAt: "2026-09-15T00:00:00Z",
      updatedAt: "2026-09-15T00:00:00Z",
    };
    repository.save(pending, "SUBMIT", "maker");
    repository.replaceApplicability(pending.id, [{
      consumer: "CENTRAL_PAYMENT", product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER", paymentLeg: "INTERBANK_SETTLEMENT",
      direction: "OUTBOUND", status: "DRAFT",
      validFrom: "2026-01-01", validTo: "2027-12-31",
    }], "maker");
    const discover = jest.fn(() => {
      repository.insertApprovedResolutionCurrencies([paymentUsd], "2026-09-15");
    });
    expect(repository.approveWithApplicability(pending.id, "checker", discover)?.status).toBe("ACTIVE");
    expect(repository.approveWithApplicability(pending.id, "checker", discover)).toBeUndefined();
    expect(discover).toHaveBeenCalledTimes(1);
    expect(repository.activeResolutionCurrencies("SR2026", "PAYMENT")).toEqual(["USD"]);
  });

  it("rolls SSI approval back when coverage discovery fails", () => {
    const pending: SsiRecord = {
      id: "SSI-PENDING", counterpartyId: "CP-1", scope: "STANDING",
      maker: "maker", status: "PENDING_APPROVAL", version: 1,
      route: { currency: "USD" }, createdAt: "2026-09-15T00:00:00Z",
      updatedAt: "2026-09-15T00:00:00Z",
    };
    repository.save(pending, "SUBMIT", "maker");
    repository.replaceApplicability(pending.id, [{
      consumer: "CENTRAL_PAYMENT", product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER", paymentLeg: "INTERBANK_SETTLEMENT",
      direction: "OUTBOUND", status: "DRAFT",
      validFrom: "2026-01-01", validTo: "2027-12-31",
    }], "maker");
    expect(() => repository.approveWithApplicability(pending.id, "checker", () => {
      throw new Error("DISCOVERY_FAILED");
    })).toThrow("DISCOVERY_FAILED");
    expect(repository.find(pending.id)?.status).toBe("PENDING_APPROVAL");
    expect(repository.resolutionCurrencyInquiry("SR2026")).toEqual([]);
  });
});
