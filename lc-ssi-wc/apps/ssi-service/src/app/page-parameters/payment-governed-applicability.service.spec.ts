import type {
  SsiApplicabilityRecord,
  SsiRecord,
} from "../sqlite-ssi.repository";
import { PaymentGovernedApplicabilityService } from "./payment-governed-applicability.service";

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
        nostro: { id: "N-1", version: 4, accountServicerBic: "DEUTDEFF" },
        rma: { id: "R-1", version: 5 },
        snapshot: { sha256: "db-sha", method: "logical" },
      },
    ]);
    expect(snapshots.current).toHaveBeenCalledTimes(2);
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
