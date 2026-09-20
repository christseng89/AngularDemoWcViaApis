import type {
  SsiApplicabilityRecord,
  SsiRecord,
} from "../sqlite-ssi.repository";
import { PaymentGovernedApplicabilityService } from "./payment-governed-applicability.service";
import { hashCanonical } from "../canonical-json";

const route = (overrides: Record<string, string> = {}): SsiRecord => ({
  id: "SSI-PAYMENT-1",
  counterpartyId: "BANK-1",
  scope: "STANDING",
  maker: "maker",
  status: "ACTIVE",
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  route: {
    sourceMessageTypes: "MT202,MT202COV,MT205,MT205COV",
    messageTypes: "pacs.009.001.08",
    businessService: "swift.cbprplus.04,swift.cbprplus.cov.04",
    currency: "EUR",
    bookingEntity: "HK01",
    counterpartyBic: "DEUTDEFF",
    accountId: "ACCT-1",
    accountWithBic: "DEUTDEFF",
    senderBic: "DEMOHKHH",
    actualReceiverBic: "DEUTDEFF",
    messagingService: "FINPLUS",
    validFrom: "2026-01-01",
    validTo: "2027-12-31",
    ...overrides,
  },
});

const applicability = (
  overrides: Partial<SsiApplicabilityRecord> = {},
): SsiApplicabilityRecord => ({
  id: "SSI-PAYMENT-1:APPL:1",
  ssiId: "SSI-PAYMENT-1",
  consumer: "CENTRAL_PAYMENT",
  product: "CENTRAL_PAYMENT",
  businessFunction: "INTERBANK_TRANSFER",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
  status: "ACTIVE",
  validFrom: "2026-01-01",
  validTo: "2027-12-31",
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("PaymentGovernedApplicabilityService", () => {
  it("keeps MT205 SSI, Applicability, Nostro, RMA and rank independent of prior FI message", () => {
    const ssi = route({ priority: "10" });
    const app = applicability();
    const findPaymentCandidateBindings = jest.fn(() => [{ ssi, applicability: app }]);
    const service = new PaymentGovernedApplicabilityService(
      { findPaymentCandidateBindings } as never,
      undefined,
      undefined,
      { resolve: jest.fn(() => ({
        decision: "RESOLVED", nostroId: "N-1", nostroVersion: 4,
        priority: 10, accountServicerBic: "DEUTDEFF",
      })) } as never,
      { check: jest.fn(() => ({ authorised: true, rmaId: "R-1", rmaVersion: 5 })) } as never,
      { current: jest.fn(() => ({ sha256: "db-sha", method: "logical" })) } as never,
    );

    const identities = ["MT202", "MT203", "MT205"].map((previousMessageType) => {
      const [candidate] = service.atomicCandidates({
        messageType: "MT205", currency: "EUR", bookingEntity: "HK01",
        valueDate: "2026-09-15", previousMessageType,
      });
      expect(candidate).toBeDefined();
      return {
        ssiId: candidate!.ssi.id,
        applicabilityId: candidate!.applicability.id,
        nostroId: candidate!.nostro.id,
        rmaId: candidate!.rma.id,
        priority: candidate!.nostro.priority,
        routeId: hashCanonical({
          ssi: { id: candidate!.ssi.id, version: candidate!.ssi.version },
          applicability: { id: candidate!.applicability.id, version: candidate!.applicability.version },
          nostro: { id: candidate!.nostro.id, version: candidate!.nostro.version },
          rma: candidate!.rma,
        }),
      };
    });

    expect(identities[1]).toEqual(identities[0]);
    expect(identities[2]).toEqual(identities[0]);
    expect(findPaymentCandidateBindings).toHaveBeenCalledTimes(3);
    expect(findPaymentCandidateBindings.mock.calls.every(([query]) =>
      !Object.hasOwn(query, "previousMessageType"),
    )).toBe(true);
  });
  it("uses the configured single-bank Own BIC when the SSI route has no sender BIC", () => {
    const previous = process.env["OWN_BIC"];
    process.env["OWN_BIC"] = "DEMOHKHH";
    try {
      const ssi = route();
      delete ssi.route["senderBic"];
      const check = jest.fn(() => ({ authorised: false }));
      const service = new PaymentGovernedApplicabilityService(
        { findPaymentCandidateBindings: jest.fn(() => [{ ssi, applicability: applicability() }]) } as never,
        undefined,
        undefined,
        { resolve: jest.fn(() => ({
          decision: "RESOLVED", nostroId: "N-1", nostroVersion: 1,
          accountServicerBic: "DEUTDEFF",
        })) } as never,
        { check } as never,
        { current: jest.fn(() => ({ sha256: "db-sha", method: "logical" })) } as never,
      );

      expect(service.atomicCandidates({
        messageType: "MT202", currency: "EUR", bookingEntity: "HK01", valueDate: "2026-09-15",
      })).toEqual([]);
      expect(check).toHaveBeenCalledWith(expect.objectContaining({ ownBic: "DEMOHKHH" }));
    } finally {
      if (previous === undefined) delete process.env["OWN_BIC"];
      else process.env["OWN_BIC"] = previous;
    }
  });

  it("fails closed when a route sender BIC conflicts with the configured Own BIC", () => {
    const previous = process.env["OWN_BIC"];
    process.env["OWN_BIC"] = "DEMOHKHH";
    try {
      const ssi = route({ senderBic: "OTHERBIC" });
      const check = jest.fn();
      const service = new PaymentGovernedApplicabilityService(
        { findPaymentCandidateBindings: jest.fn(() => [{ ssi, applicability: applicability() }]) } as never,
        undefined,
        undefined,
        { resolve: jest.fn(() => ({ decision: "RESOLVED" })) } as never,
        { check } as never,
        { current: jest.fn(() => ({ sha256: "db-sha", method: "logical" })) } as never,
      );

      expect(() => service.atomicCandidates({
        messageType: "MT202", currency: "EUR", bookingEntity: "HK01", valueDate: "2026-09-15",
      })).toThrow("OWN_BIC_ROUTE_MISMATCH");
      expect(check).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env["OWN_BIC"];
      else process.env["OWN_BIC"] = previous;
    }
  });

  it("propagates the exact fixture binding to the payment candidate query", () => {
    const findPaymentCandidates = jest.fn(() => []);
    const service = new PaymentGovernedApplicabilityService({
      findPaymentCandidates,
    } as never);

    service.candidates({
      messageType: "MT202",
      currency: "EUR",
      bookingEntity: "HK01",
      valueDate: "2026-09-15",
      fixtureBindingId: "FIXTURE-MT202-OP-DIRECT",
    });

    expect(findPaymentCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        fixtureBindingId: "FIXTURE-MT202-OP-DIRECT",
      }),
    );
  });

  it("builds one atomic persisted SSI/applicability/Nostro/RMA candidate in one stable snapshot", () => {
    const ssi = route();
    const app = applicability();
    const snapshots = {
      current: jest.fn(() => ({ sha256: "db-sha", method: "logical" })),
    };
    const service = new PaymentGovernedApplicabilityService(
      {
        findPaymentCandidateBindings: jest.fn(() => [
          { ssi, applicability: app },
        ]),
      } as never,
      undefined,
      undefined,
      {
        resolve: jest.fn(() => ({
          decision: "RESOLVED",
          nostroId: "N-1",
          nostroVersion: 4,
          priority: 10,
          accountServicerBic: "DEUTDEFF",
        })),
      } as never,
      {
        check: jest.fn(() => ({
          authorised: true,
          rmaId: "R-1",
          rmaVersion: 5,
        })),
      } as never,
      snapshots as never,
    );

    expect(
      service.atomicCandidates({
        messageType: "MT202",
        currency: "EUR",
        bookingEntity: "HK01",
        valueDate: "2026-09-15",
      }),
    ).toEqual([
      {
        ssi,
        applicability: app,
        nostro: { id: "N-1", version: 4, accountServicerBic: "DEUTDEFF", priority: 10 },
        rma: { id: "R-1", version: 5 },
        snapshot: { sha256: "db-sha", method: "logical" },
      },
    ]);
    expect(snapshots.current).toHaveBeenCalledTimes(2);
  });

  it("does not expose a SAME-servicer route to a DIFFERENT-servicer scenario", () => {
    const ssi = route();
    const service = new PaymentGovernedApplicabilityService(
      { findPaymentCandidateBindings: jest.fn(() => [{ ssi, applicability: applicability() }]) } as never,
      undefined,
      undefined,
      { resolve: jest.fn(() => ({
        decision: "RESOLVED", nostroId: "N-1", nostroVersion: 1,
        priority: 10, accountServicerBic: "DEUTDEFF",
      })) } as never,
      { check: jest.fn(() => ({ authorised: true, rmaId: "R-1", rmaVersion: 1 })) } as never,
      { current: jest.fn(() => ({ sha256: "db-sha", method: "logical" })) } as never,
    );
    const query = {
      messageType: "MT202COV", currency: "EUR", bookingEntity: "HK01",
      valueDate: "2026-09-15",
    };

    expect(service.atomicCandidates({ ...query, servicerRelationship: "DIFFERENT" })).toEqual([]);
    expect(service.atomicCandidates({ ...query, servicerRelationship: "SAME" })).toHaveLength(1);
  });

  it("checks the active RMA bank relationship without SSI scenario fixture filters", () => {
    const ssi = { ...route(), fixtureFamily: "MT2-UI-PARITY-V1" };
    const app = applicability();
    const check = jest.fn((request: Record<string, unknown>) =>
      "fixtureFamily" in request || "fixtureBindingId" in request ||
      request["operationalOnly"] !== true
        ? { authorised: false }
        : { authorised: true, rmaId: "RMA-ACTIVE", rmaVersion: 19 },
    );
    const service = new PaymentGovernedApplicabilityService(
      { findPaymentCandidateBindings: jest.fn(() => [{ ssi, applicability: app }]) } as never,
      undefined,
      undefined,
      { resolve: jest.fn(() => ({
        decision: "RESOLVED", nostroId: "N-1", nostroVersion: 4,
        priority: 10,
        accountServicerBic: "DEUTDEFF",
      })) } as never,
      { check } as never,
      { current: jest.fn(() => ({ sha256: "db-sha", method: "logical" })) } as never,
    );

    const candidates = service.atomicCandidates({
      messageType: "MT202", currency: "EUR", bookingEntity: "HK01",
      valueDate: "2026-09-15", fixtureBindingId: "FIXTURE-MT202-OP-DIRECT",
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.rma).toEqual({ id: "RMA-ACTIVE", version: 19 });
    expect(check).toHaveBeenCalledWith(expect.objectContaining({
      ownBic: "DEMOHKHH", counterpartyBic: "DEUTDEFF",
      direction: "OUTBOUND", messageType: "pacs.009.001.08",
      at: "2026-09-15",
    }));
    expect(check.mock.calls[0]?.[0]).not.toHaveProperty("fixtureFamily");
    expect(check.mock.calls[0]?.[0]).not.toHaveProperty("fixtureBindingId");
    expect(check.mock.calls[0]?.[0]).toHaveProperty("operationalOnly", true);
  });

  it("does not stringify malformed account-servicer metadata", () => {
    const ssi = route();
    const app = applicability();
    const snapshots = {
      current: jest.fn(() => ({ sha256: "db-sha", method: "logical" })),
    };
    const service = new PaymentGovernedApplicabilityService(
      {
        findPaymentCandidateBindings: jest.fn(() => [
          { ssi, applicability: app },
        ]),
      } as never,
      undefined,
      undefined,
      {
        resolve: jest.fn(() => ({
          decision: "RESOLVED",
          nostroId: "N-1",
          nostroVersion: 4,
          priority: 10,
          accountServicerBic: { unexpected: true },
        })),
      } as never,
      {
        check: jest.fn(() => ({
          authorised: true,
          rmaId: "R-1",
          rmaVersion: 5,
        })),
      } as never,
      snapshots as never,
    );

    expect(
      service.atomicCandidates({
        messageType: "MT202",
        currency: "EUR",
        bookingEntity: "HK01",
        valueDate: "2026-09-15",
      })[0]?.nostro.accountServicerBic,
    ).toBe("");
  });

  it("exposes only effective active, applicable MT2/pacs.009 options", () => {
    const records = [
      route(),
      { ...route({ currency: "USD" }), id: "SSI-DRAFT", status: "DRAFT" },
      {
        ...route({ currency: "GBP" }),
        id: "SSI-OTHER",
        route: route({ currency: "GBP", sourceMessageTypes: "MT400" }).route,
      },
    ];
    const service = new PaymentGovernedApplicabilityService({
      list: () => records,
      listApplicability: () => [applicability()],
    } as never);

    expect(
      service.candidates({ messageType: "MT202", valueDate: "2026-09-15" }),
    ).toEqual([records[0]]);
    expect(service.options("MT202", "2026-09-15")).toEqual({
      currencies: ["EUR"],
      bookingEntities: ["HK01"],
    });
    expect(
      service.candidates({ messageType: "MT400", valueDate: "2026-09-15" }),
    ).toEqual([]);
  });

  it("does not require downstream businessService metadata in the SSI candidate fallback", () => {
    const core = route({ businessService: "", sourceMessageTypes: "MT202,MT205" });
    const cov = { ...route({ businessService: "", sourceMessageTypes: "MT202COV,MT205COV" }), id: "SSI-COV" };
    const service = new PaymentGovernedApplicabilityService({
      list: () => [core, cov],
      listApplicability: () => [applicability(), applicability({ id: "SSI-COV:APPL:1", ssiId: "SSI-COV" })],
    } as never);
    expect(service.candidates({ messageType: "MT202", valueDate: "2026-09-15" }).map(({ id }) => id))
      .toEqual([core.id]);
    expect(service.candidates({ messageType: "MT202COV", valueDate: "2026-09-15" }).map(({ id }) => id))
      .toEqual([cov.id]);
  });

  it("excludes rows with inactive or expired applicability", () => {
    const service = new PaymentGovernedApplicabilityService({
      list: () => [route()],
      listApplicability: () => [applicability({ status: "INACTIVE" })],
    } as never);
    expect(service.options("MT202", "2026-09-15")).toEqual({
      currencies: [],
      bookingEntities: [],
    });
  });

  it("sorts distinct options and exposes only a directory-confirmed governed default", () => {
    const eur = route();
    const usd = {
      ...route({ currency: "USD", counterpartyBic: "CITIUS33" }),
      id: "SSI-PAYMENT-2",
    };
    const cad = {
      ...route({
        currency: "CAD",
        bookingEntity: "CA01",
        counterpartyBic: "ROYCCAT2",
      }),
      id: "SSI-PAYMENT-3",
    };
    const service = new PaymentGovernedApplicabilityService(
      {
        list: () => [usd, eur, cad],
        listApplicability: () => [
          applicability(),
          applicability({ id: "SSI-PAYMENT-2:APPL:1", ssiId: "SSI-PAYMENT-2" }),
          applicability({ id: "SSI-PAYMENT-3:APPL:1", ssiId: "SSI-PAYMENT-3" }),
        ],
      } as never,
      {
        find: jest.fn(({ currency }: { currency: string }) =>
          currency === "USD"
            ? { defaultBankServiceId: "BANK-SVC-CITIUS33" }
            : undefined,
        ),
      } as never,
      {
        resolve: jest.fn(() => ({ bic: "CITIUS33" })),
      } as never,
    );

    expect(service.options("MT202", "2026-09-15")).toEqual({
      currencies: ["CAD", "EUR", "USD"],
      bookingEntities: ["CA01", "HK01"],
      defaultCurrency: "USD",
      defaultBookingEntity: "HK01",
    });
  });

  it("applies the governed open-start date while rejecting an open end date", () => {
    const missingFrom = route();
    delete (missingFrom.route as Record<string, string | undefined>)[
      "validFrom"
    ];
    const missingTo = {
      ...route(),
      id: "SSI-PAYMENT-2",
      route: { ...route().route },
    };
    delete (missingTo.route as Record<string, string | undefined>)["validTo"];
    const service = new PaymentGovernedApplicabilityService({
      list: () => [missingFrom, missingTo],
      listApplicability: () => [
        applicability(),
        applicability({ id: "SSI-PAYMENT-2:APPL:1", ssiId: "SSI-PAYMENT-2" }),
      ],
    } as never);

    expect(
      service.candidates({ messageType: "MT202", valueDate: "2026-09-15" }),
    ).toEqual([missingFrom]);
  });
});
