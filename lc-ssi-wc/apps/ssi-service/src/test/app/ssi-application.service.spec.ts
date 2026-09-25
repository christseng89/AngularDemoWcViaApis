import { BadRequestException } from "@nestjs/common";
import { SsiApplicationService } from "../../app/ssi-application.service";
import type { SqliteSsiRepository } from "../../app/sqlite-ssi.repository";
import type { RmaApplicationService } from "../../app/rma/rma-application.service";
import type { NostroApplicationService } from "../../app/nostro/nostro-application.service";
import { PaymentMessageIndexService } from "../../app/payment-message-index.service";

const service = new SsiApplicationService(
  {
    list: () => [],
    listApplicability: () => [],
  } as unknown as SqliteSsiRepository,
  {} as RmaApplicationService,
  {} as NostroApplicationService,
  new PaymentMessageIndexService(),
);

const request = {
  consumer: "TREASURY",
  counterpartyBic: "CHASUS33",
  counterpartyCountry: "US",
  currency: "USD",
  product: "PAYMENT",
  businessFunction: "FX_SETTLEMENT",
  paymentLeg: "INTERBANK_SETTLEMENT",
  direction: "OUTBOUND",
  bookingEntity: "HK01",
  valueDate: "2026-02-29",
  amount: "100",
  messageType: "MT202",
  transactionReference: "TX-1",
};

const validateRoute = (route: Record<string, string>): void =>
  (
    service as unknown as {
      validateRoute(candidate: Record<string, string>): void;
    }
  ).validateRoute(route);

const validRoute = {
  currency: "USD",
  routePreference: "PRIMARY",
  priority: "10",
  validFrom: "2026-01-01",
  validTo: "2027-12-31",
  settlementMarket: "US_DOLLAR",
  clearingSystem: "FEDWIRE",
  settlementCountry: "US",
  bic: "CITIUS33",
  accountWithBic: "CITIUS33",
  actualReceiverBic: "CITIUS33",
};

describe("SsiApplicationService resolution date validation", () => {
  it("fails fast before resolving routes", () => {
    expect(() => service.resolve(request)).toThrow(BadRequestException);
  });

  it("also protects clearing-option resolution", () => {
    expect(() => service.clearingOptions(request)).toThrow(BadRequestException);
  });
});

describe("SsiApplicationService COV profile gate", () => {
  it("returns PROFILE_INCOMPLETE before ranking when controlled COV metadata is absent", () => {
    const repository = {
      list: () => [
        {
          id: "SSI-ID-003",
          counterpartyId: "CP-BARCGB22",
          status: "ACTIVE",
          version: 1,
          route: {
            currency: "GBP",
            bookingEntity: "HK01",
            counterpartyBic: "BARCGB22",
            messageTypes: "pacs.009.001.08",
          },
        },
      ],
      listApplicability: () => [],
    } as unknown as SqliteSsiRepository;
    const coverService = new SsiApplicationService(
      repository,
      {} as RmaApplicationService,
      {} as NostroApplicationService,
      new PaymentMessageIndexService(),
    );

    expect(() =>
      coverService.resolve({
        consumer: "CENTRAL_PAYMENT",
        product: "CENTRAL_PAYMENT",
        businessFunction: "INTERBANK_TRANSFER",
        paymentLeg: "INTERBANK_SETTLEMENT",
        direction: "OUTBOUND",
        counterpartyType: "BANK",
        counterpartyBic: "BARCGB22",
        counterpartyCountry: "GB",
        currency: "GBP",
        bookingEntity: "HK01",
        valueDate: "2026-09-11",
        amount: "1000000",
        messagingService: "FINPLUS",
        messageType: "pacs.009.001.08",
        sourceMessageType: "MT202COV",
        businessService: "swift.cbprplus.cov.04",
        transactionReference: "COV-GATE-001",
      }),
    ).toThrow("PROFILE_INCOMPLETE");
  });
});

describe("SsiApplicationService counterparty identity policy", () => {
  it("requires a SWIFT BIC when the counterparty is a bank", () => {
    expect(() =>
      validateRoute({ ...validRoute, counterpartyType: "BANK" }),
    ).toThrow("BANK_COUNTERPARTY_BIC_REQUIRED");
  });

  it("keeps an internal Customer ID outside all BIC fields", () => {
    expect(() =>
      validateRoute({ ...validRoute, counterpartyType: "CUSTOMER" }),
    ).not.toThrow();
    expect(() =>
      validateRoute({
        ...validRoute,
        counterpartyType: "CUSTOMER",
        counterpartyBic: "CUST-00001",
      }),
    ).toThrow("INVALID_CUSTOMER_SWIFT_BIC");
  });
});

describe("SsiApplicationService route standing-data validation", () => {
  const completeRoute = {
    ...validRoute,
    counterpartyType: "BANK",
    counterpartyBic: "CHASUS33",
  };

  it.each([
    [{ currency: "US" }, "INVALID_ISO_4217_CURRENCY"],
    [{ currency: undefined }, "INVALID_ISO_4217_CURRENCY"],
    [{ routePreference: "UNKNOWN" }, "INVALID_ROUTE_CLASS_OR_PRIORITY"],
    [{ routePreference: undefined }, "INVALID_ROUTE_CLASS_OR_PRIORITY"],
    [{ priority: "high" }, "INVALID_ROUTE_CLASS_OR_PRIORITY"],
    [{ priority: undefined }, "INVALID_ROUTE_CLASS_OR_PRIORITY"],
    [{ validFrom: "" }, "INVALID_SSI_EFFECTIVE_DATES"],
    [
      { validFrom: "2028-01-01", validTo: "2027-01-01" },
      "INVALID_SSI_EFFECTIVE_DATES",
    ],
    [{ settlementMarket: "" }, "SETTLEMENT_MARKET_REQUIRED"],
    [{ clearingSystem: "ANY" }, "ACTIVE_CLEARING_SYSTEM_REQUIRED"],
    [{ clearingSystem: "UNKNOWN" }, "ACTIVE_CLEARING_SYSTEM_REQUIRED"],
    [{ currency: "EUR" }, "CLEARING_SYSTEM_CURRENCY_MISMATCH"],
    [{ settlementCountry: "" }, "SETTLEMENT_COUNTRY_REQUIRED"],
    [{ settlementCountry: "GB" }, "CLEARING_SYSTEM_COUNTRY_SCOPE_MISMATCH"],
    [
      { validFrom: "2025-01-01", validTo: "2025-12-31" },
      "CLEARING_SYSTEM_NOT_EFFECTIVE",
    ],
    [{ schemeType: "ACH" }, "CLEARING_SCHEME_TYPE_MISMATCH"],
    [{ bic: "not-a-bic" }, "INVALID_ISO_9362_BIC:bic"],
  ])("rejects invalid controlled route property %#", (change, message) => {
    expect(() => validateRoute({ ...completeRoute, ...change })).toThrow(
      message,
    );
  });

  it("accepts a pan-regional clearing system with settlement country ANY", () => {
    expect(() =>
      validateRoute({
        ...completeRoute,
        currency: "EUR",
        settlementMarket: "EURO_AREA",
        clearingSystem: "T2",
        settlementCountry: "ANY",
      }),
    ).not.toThrow();
  });

  it("accepts a governed correspondent-banking route without a domestic clearing-system reference", () => {
    expect(() =>
      validateRoute({
        ...completeRoute,
        currency: "JPY",
        settlementMarket: "CORRESPONDENT_BANKING",
        clearingSystem: "CORRESPONDENT_CHAIN",
        settlementCountry: "JP",
        bic: "SMBCJPJT",
        counterpartyBic: "SMBCJPJT",
        beneficiarySource: "SSI",
        beneficiaryBic: "SMBCJPJT",
        accountWithBic: "SMBCJPJT",
        actualReceiverBic: "SMBCJPJT",
      }),
    ).not.toThrow();
  });

  it.each([
    ["CHATS", "HKD", "HK_DOMESTIC", "HK"],
    ["TARGET", "EUR", "EURO_AREA", "ANY"],
    ["FEDWIRE_CHIPS", "USD", "US_DOLLAR", "US"],
  ])(
    "accepts the governed legacy clearing-system value %s already stored in the DB",
    (clearingSystem, currency, settlementMarket, settlementCountry) => {
      expect(() =>
        validateRoute({
          ...completeRoute,
          clearingSystem,
          currency,
          settlementMarket,
          settlementCountry,
        }),
      ).not.toThrow();
    },
  );

  it("requires Beneficiary BIC only when the governed source is SSI", () => {
    expect(() =>
      validateRoute({ ...completeRoute, beneficiarySource: "SSI" }),
    ).toThrow("BENEFICIARY_BIC_REQUIRED");
    expect(() =>
      validateRoute({ ...completeRoute, beneficiarySource: "TRANSACTION" }),
    ).not.toThrow();
  });

  it("defaults an unspecified counterparty type to governed bank validation", () => {
    expect(() => validateRoute(validRoute)).toThrow(
      "BANK_COUNTERPARTY_BIC_REQUIRED",
    );
  });

  it("does not allow transaction-sourced Beneficiary BIC to be stored in SSI", () => {
    expect(() =>
      validateRoute({
        ...completeRoute,
        beneficiarySource: "TRANSACTION",
        beneficiaryBic: "BOTKJPJT",
      }),
    ).toThrow("TRANSACTION_BENEFICIARY_MUST_NOT_BE_STORED_IN_SSI");
  });
});

describe("SsiApplicationService governed lifecycle", () => {
  const route = {
    ...validRoute,
    counterpartyType: "BANK",
    counterpartyBic: "CHASUS33",
    bookingEntity: "HK01",
    ssiCode: "USD-PRIMARY",
  };
  const record = {
    id: "SSI-1",
    counterpartyId: "CP-1",
    scope: "STANDING",
    maker: "maker",
    status: "DRAFT",
    version: 1,
    route,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const applicability = {
    id: "APPL-1",
    ssiId: record.id,
    consumer: "TREASURY",
    product: "PAYMENT",
    businessFunction: "FX_SETTLEMENT",
    paymentLeg: "INTERBANK_SETTLEMENT",
    direction: "OUTBOUND",
    status: "ACTIVE" as const,
    validFrom: "2026-01-01",
    validTo: "2027-12-31",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const command = {
    counterpartyId: "CP-1",
    scope: "STANDING" as const,
    maker: "maker",
    route,
  };

  const harness = (
    initial = [record],
    applicabilityRows: Array<typeof applicability> = [applicability],
    currencyCoordinator?: { discoverApproved: (id: string) => void },
  ) => {
    const records = [...initial];
    const repository = {
      list: jest.fn(() => records),
      find: jest.fn((id: string) => records.find((item) => item.id === id)),
      listApplicability: jest.fn(() => applicabilityRows),
      replaceApplicability: jest.fn((_id, rows) => rows),
      approveWithApplicability: jest.fn((id: string, actor: string) => {
        const current = records.find((item) => item.id === id);
        return current
          ? {
              ...current,
              status: "ACTIVE",
              checker: actor,
              version: current.version + 1,
            }
          : undefined;
      }),
      approveSuppression: jest.fn((id: string, actor: string) => {
        const current = records.find((item) => item.id === id);
        return current
          ? {
              ...current,
              status: "SUPPRESSED",
              checker: actor,
              version: current.version + 1,
            }
          : undefined;
      }),
      save: jest.fn(),
      audit: jest.fn(() => [{ action: "CREATED" }]),
    };
    return {
      repository,
      service: new SsiApplicationService(
        repository as unknown as SqliteSsiRepository,
        {} as RmaApplicationService,
        {} as NostroApplicationService,
        new PaymentMessageIndexService(),
        currencyCoordinator as never,
      ),
    };
  };

  it("discovers new currency inside the normal approval transaction", () => {
    const pending = { ...record, status: "PENDING_APPROVAL" };
    const coordinator = {
      discoverApproved: jest.fn(() => ({
        inserted: 1,
        activated: 0,
        inactivated: 0,
      })),
      invalidateAfterCommit: jest.fn(),
    };
    const { service, repository } = harness(
      [pending],
      [applicability],
      coordinator,
    );
    repository.approveWithApplicability.mockImplementation(
      (id, actor, onApproved?: () => void) => {
        onApproved?.();
        return { ...pending, status: "ACTIVE", checker: actor, version: 2 };
      },
    );
    expect(service.transition(pending.id, "APPROVE", "checker")).toMatchObject({
      status: "ACTIVE",
    });
    expect(coordinator.discoverApproved).toHaveBeenCalledWith(pending.id);
    expect(coordinator.invalidateAfterCommit).toHaveBeenCalledWith(
      expect.objectContaining({ inserted: 1 }),
    );
  });

  it("lists explicit ownership with each record's applicability", () => {
    const { service: current, repository } = harness();
    expect(current.list()).toMatchObject([
      {
        id: "SSI-1",
        ownershipType: "COUNTERPARTY",
        ownerParty: "CHASUS33",
        publisherParty: "CHASUS33",
        applicability: [applicability],
      },
    ]);
    expect(current.listApplicability("SSI-1")).toEqual([applicability]);
    expect(repository.listApplicability).toHaveBeenCalledWith("SSI-1");
  });

  it("delegates paged lists and lifecycle summaries without changing repository semantics", () => {
    const { service: current, repository } = harness();
    const page = { items: [record], page: 1, pageSize: 20, totalItems: 1 };
    const summary = { ACTIVE: 1 };
    const coverage = [{ counterpartyId: "CP-1", count: 1 }];
    Object.assign(repository, {
      listPage: jest.fn(() => page),
      summary: jest.fn(() => summary),
      counterpartyCoverage: jest.fn(() => coverage),
    });

    expect(current.listPage({ page: 1, pageSize: 20 } as never)).toMatchObject({
      ...page,
      items: [
        expect.objectContaining({
          id: record.id,
          ownershipType: "COUNTERPARTY",
          applicability: [applicability],
        }),
      ],
    });
    expect(current.summary()).toBe(summary);
    expect(current.counterpartyCoverage("ACTIVE")).toBe(coverage);
    expect(repository.counterpartyCoverage).toHaveBeenCalledWith("ACTIVE");
  });

  it.each([
    [{ actor: "", records: [applicability] }, "SSI_APPLICABILITY_REQUIRED"],
    [{ actor: "ops", records: [] }, "SSI_APPLICABILITY_REQUIRED"],
    [
      { actor: "ops", records: [{ ...applicability, consumer: "" }] },
      "SSI_APPLICABILITY_FIELDS_REQUIRED",
    ],
    [
      {
        actor: "ops",
        records: [(({ consumer: _consumer, ...row }) => row)(applicability)],
      },
      "SSI_APPLICABILITY_FIELDS_REQUIRED",
    ],
    [
      { actor: "ops", records: [{ ...applicability, status: "BROKEN" }] },
      "INVALID_SSI_APPLICABILITY",
    ],
    [
      {
        actor: "ops",
        records: [
          { ...applicability, validFrom: "2028-01-01", validTo: "2027-01-01" },
        ],
      },
      "INVALID_SSI_APPLICABILITY",
    ],
  ])("rejects invalid applicability replacement %#", (body, message) => {
    expect(() =>
      harness().service.replaceApplicability("SSI-1", body as never),
    ).toThrow(message);
  });

  it("replaces a complete applicability matrix through the repository", () => {
    const { service: current, repository } = harness();
    expect(
      current.replaceApplicability("SSI-1", {
        actor: "ops",
        records: [applicability],
      }),
    ).toEqual([applicability]);
    expect(repository.replaceApplicability).toHaveBeenCalledWith(
      "SSI-1",
      [applicability],
      "ops",
    );
  });

  it("creates a governed draft and resolves explicitly supplied ownership", () => {
    const { service: current, repository } = harness([]);
    const created = current.create({
      ...command,
      ownershipType: "OWN",
      ownerParty: "  HK01  ",
      publisherParty: "  PAYMENT-OPS  ",
    });
    expect(created).toMatchObject({
      counterpartyId: "CP-1",
      status: "DRAFT",
      version: 1,
      ownershipType: "OWN",
      ownerParty: "HK01",
      publisherParty: "PAYMENT-OPS",
    });
    expect(repository.save).toHaveBeenCalledWith(created, "CREATED", "maker");
  });

  it("derives governed ownership defaults for own and counterparty SSI", () => {
    const routeWithoutBookingEntity: Record<string, string> = { ...route };
    delete routeWithoutBookingEntity.bookingEntity;
    const own = harness([]).service.create({
      ...command,
      counterpartyId: "ANY",
      route: {
        ...routeWithoutBookingEntity,
        counterpartyType: "ANY_BANK",
        counterpartyBic: "ANY",
      },
    });
    expect(own).toMatchObject({
      ownershipType: "OWN",
      ownerParty: "HK01",
      publisherParty: "HK01",
    });

    const counterparty = harness([]).service.create(command);
    expect(counterparty).toMatchObject({
      ownershipType: "COUNTERPARTY",
      ownerParty: "CHASUS33",
      publisherParty: "CHASUS33",
    });
  });

  it.each([
    [{ ...command, counterpartyId: "" }, "SSI_REQUIRED_FIELDS_MISSING"],
    [
      {
        ...command,
        ownershipType: "OWN",
        ownerParty: "",
        publisherParty: "ops",
      },
      "SSI_OWNERSHIP_FIELDS_REQUIRED",
    ],
  ])("rejects an invalid create command %#", (input, message) => {
    expect(() => harness([]).service.validate(input as never)).toThrow(message);
  });

  it("updates only the original maker's draft", () => {
    expect(() =>
      harness([
        { ...record, changeType: "SUPPRESSION" as const },
      ]).service.update("SSI-1", command),
    ).toThrow("SUPPRESSION_DRAFT_CANNOT_BE_EDITED");
    expect(() =>
      harness([{ ...record, status: "ACTIVE" }]).service.update(
        "SSI-1",
        command,
      ),
    ).toThrow("Only DRAFT SSI can be updated");
    expect(() =>
      harness().service.update("SSI-1", { ...command, maker: "other" }),
    ).toThrow("Only the original maker can update");

    const { service: current, repository } = harness();
    const updated = current.update("SSI-1", {
      ...command,
      route: { ...route, priority: "11" },
    });
    expect(updated).toMatchObject({ version: 2, route: { priority: "11" } });
    expect(repository.save).toHaveBeenCalledWith(updated, "UPDATED", "maker");
  });

  it("enforces revision state and creates an independent draft revision", () => {
    expect(() => harness().service.revise("SSI-1", "")).toThrow(
      "MAKER_REQUIRED",
    );
    expect(() => harness().service.revise("SSI-1", "maker")).toThrow(
      "INVALID_REVISION_STATUS",
    );
    expect(() =>
      harness([{ ...record, status: "REVOKED" }]).service.revise(
        "SSI-1",
        "maker2",
      ),
    ).toThrow("Revoked or superseded SSI cannot be revised");

    const { service: current, repository } = harness([
      { ...record, status: "ACTIVE", version: 4 },
    ]);
    const revision = current.revise("SSI-1", "maker2");
    expect(revision).toMatchObject({
      amendmentOfId: "SSI-1",
      maker: "maker2",
      status: "WIP",
      version: 5,
    });
    expect(repository.save).toHaveBeenCalledWith(
      revision,
      "WIP_RESERVED",
      "maker2",
    );
    expect(repository.replaceApplicability).toHaveBeenCalledWith(
      revision.id,
      [
        expect.objectContaining({
          consumer: "TREASURY",
          product: "PAYMENT",
          status: "ACTIVE",
        }),
      ],
      "maker2",
    );
  });

  it("keeps an empty applicability set empty when reserving a revision", () => {
    const active = { ...record, status: "ACTIVE" };
    const { service, repository } = harness([active], []);
    expect(service.revise(active.id, "maker2")).toMatchObject({
      status: "WIP",
    });
    expect(repository.replaceApplicability).not.toHaveBeenCalled();
  });

  it("copies governed fixture bindings into a revision reservation", () => {
    const active = { ...record, status: "ACTIVE" };
    const boundApplicability = {
      ...applicability,
      fixtureBindingIds: ["FIXTURE-1"],
    };
    const { service, repository } = harness([active], [boundApplicability]);
    const revision = service.revise(active.id, "maker2");
    expect(repository.replaceApplicability).toHaveBeenCalledWith(
      revision.id,
      [expect.objectContaining({ fixtureBindingIds: ["FIXTURE-1"] })],
      "maker2",
    );
  });

  it("fails closed for an open or concurrently unavailable revision", () => {
    const active = { ...record, status: "ACTIVE" };
    const open = harness([active]);
    Object.assign(open.repository, {
      hasOpenRevision: jest.fn(() => true),
    });
    expect(() => open.service.revise(active.id, "maker2")).toThrow(
      "OPEN_REVISION_EXISTS",
    );

    const unavailable = harness([active]);
    Object.assign(unavailable.repository, {
      hasOpenRevision: jest.fn(() => false),
      saveRevisionWorkInProgress: jest.fn(() => false),
    });
    expect(() => unavailable.service.revise(active.id, "maker2")).toThrow(
      "REVISION_NOT_AVAILABLE",
    );
    expect(unavailable.repository.save).not.toHaveBeenCalled();
  });

  it("uses the repository's atomic WIP reservation when it is available", () => {
    const active = { ...record, status: "ACTIVE" };
    const { service, repository } = harness([active]);
    const saveRevisionWorkInProgress = jest.fn(() => true);
    Object.assign(repository, {
      hasOpenRevision: jest.fn(() => false),
      saveRevisionWorkInProgress,
    });

    const revision = service.revise(active.id, "maker2");
    expect(saveRevisionWorkInProgress).toHaveBeenCalledWith(revision, "maker2");
    expect(repository.save).not.toHaveBeenCalledWith(
      revision,
      "WIP_RESERVED",
      "maker2",
    );
  });

  it("lets only the WIP maker cancel a revision reservation", () => {
    const wip = {
      ...record,
      id: "SSI-WIP",
      status: "WIP" as const,
      maker: "maker2",
      amendmentOfId: "SSI-1",
      revisionWipExpiresAt: "2026-09-16T12:05:00.000Z",
    };
    expect(() => harness([wip]).service.cancelRevision(wip.id, "")).toThrow(
      "ACTOR_REQUIRED",
    );
    expect(() =>
      harness([wip]).service.cancelRevision(wip.id, "other-maker"),
    ).toThrow("ONLY_REVISION_MAKER_CAN_CANCEL");
    expect(() =>
      harness([{ ...wip, status: "DRAFT" }]).service.cancelRevision(
        wip.id,
        "maker2",
      ),
    ).toThrow("CANCELLATION_REQUIRES_WIP");

    const { service, repository } = harness([wip]);
    const cancelled = service.cancelRevision(wip.id, "maker2");
    expect(cancelled).toMatchObject({
      status: "REVOKED",
      revokeReason: "Revision WIP cancelled by maker",
      version: 2,
    });
    expect(cancelled.revisionWipExpiresAt).toBeUndefined();
    expect(repository.save).toHaveBeenCalledWith(
      cancelled,
      "WIP_CANCELLED",
      "maker2",
    );
  });

  it("enforces suppression validation and atomic reservation", () => {
    const active = { ...record, status: "ACTIVE" };
    expect(() =>
      harness([active]).service.suppress(active.id, "", "retired"),
    ).toThrow("MAKER_REQUIRED");
    expect(() =>
      harness([active]).service.suppress(active.id, "maker2", "bad"),
    ).toThrow("SUPPRESSION_REASON_REQUIRED");
    expect(() =>
      harness([active]).service.suppress(
        active.id,
        "maker2",
        undefined as never,
      ),
    ).toThrow("SUPPRESSION_REASON_REQUIRED");
    expect(() =>
      harness().service.suppress(record.id, "maker2", "retired route"),
    ).toThrow("ONLY_ACTIVE_CAN_BE_SUPPRESSED");

    const open = harness([active]);
    Object.assign(open.repository, { hasOpenRevision: jest.fn(() => true) });
    expect(() =>
      open.service.suppress(active.id, "maker2", "retired route"),
    ).toThrow("OPEN_REVISION_EXISTS");

    const unavailable = harness([active]);
    Object.assign(unavailable.repository, {
      hasOpenRevision: jest.fn(() => false),
      saveRevisionWorkInProgress: jest.fn(() => false),
    });
    expect(() =>
      unavailable.service.suppress(active.id, "maker2", "retired route"),
    ).toThrow("SUPPRESSION_NOT_AVAILABLE");

    const reserved = harness([active]);
    const saveRevisionWorkInProgress = jest.fn(() => true);
    Object.assign(reserved.repository, {
      hasOpenRevision: jest.fn(() => false),
      saveRevisionWorkInProgress,
    });
    const suppression = reserved.service.suppress(
      active.id,
      "maker2",
      "  retired route  ",
    );
    expect(suppression).toMatchObject({
      status: "DRAFT",
      changeType: "SUPPRESSION",
      suppressionReason: "retired route",
      amendmentOfId: active.id,
    });
    expect(saveRevisionWorkInProgress).toHaveBeenCalledWith(
      suppression,
      "maker2",
      "SUPPRESSION_DRAFT_CREATED",
    );
    expect(reserved.repository.replaceApplicability).toHaveBeenCalledWith(
      suppression.id,
      [expect.objectContaining({ consumer: applicability.consumer })],
      "maker2",
    );
  });

  it("keeps the suppression reservation fallback for legacy repositories", () => {
    const active = { ...record, status: "ACTIVE" };
    const { service, repository } = harness([active]);
    const suppression = service.suppress(active.id, "maker2", "retired route");
    expect(repository.save).toHaveBeenCalledWith(
      suppression,
      "SUPPRESSION_DRAFT_CREATED",
      "maker2",
    );
  });

  it("restores inherited applicability before approving a legacy revision", () => {
    const pending = {
      ...record,
      id: "SSI-REVISION",
      status: "PENDING_APPROVAL",
      amendmentOfId: "SSI-1",
      maker: "maker2",
    };
    const { service: current, repository } = harness([
      { ...record, status: "ACTIVE" },
      pending,
    ]);
    repository.listApplicability.mockImplementation((id?: string) =>
      id === pending.id ? [] : [applicability],
    );
    expect(current.transition(pending.id, "APPROVE", "checker")).toMatchObject({
      status: "ACTIVE",
      checker: "checker",
    });
    expect(repository.listApplicability).toHaveBeenCalledWith("SSI-1");
    expect(repository.replaceApplicability).not.toHaveBeenCalled();
    expect(repository.approveWithApplicability).toHaveBeenCalledWith(
      pending.id,
      "checker",
    );
  });

  it("approves a submitted SSI and its draft applicability as one governed transition", () => {
    const pending = {
      ...record,
      id: "SSI-PENDING",
      status: "PENDING_APPROVAL",
      amendmentOfId: "SSI-1",
      maker: "maker.datafix",
    };
    const draftApplicability = {
      ...applicability,
      id: `${pending.id}:APPL:1`,
      ssiId: pending.id,
      status: "DRAFT" as const,
    };
    const { service: current, repository } = harness(
      [{ ...record, status: "ACTIVE" }, pending],
      [draftApplicability as unknown as typeof applicability],
    );

    expect(
      current.transition(pending.id, "APPROVE", "checker.demo"),
    ).toMatchObject({
      id: pending.id,
      status: "ACTIVE",
      checker: "checker.demo",
    });
    expect(repository.approveWithApplicability).toHaveBeenCalledWith(
      pending.id,
      "checker.demo",
    );
    expect(repository.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: pending.id }),
      "APPROVE",
      "checker.demo",
    );
  });

  it("preserves suppression submission and atomic approval behavior", () => {
    const suppressionDraft = {
      ...record,
      changeType: "SUPPRESSION" as const,
      suppressionReason: "  duplicate settlement route  ",
    };
    const submitted = harness([suppressionDraft]).service.transition(
      suppressionDraft.id,
      "SUBMIT",
      suppressionDraft.maker,
    );
    expect(submitted).toMatchObject({ status: "PENDING_APPROVAL" });

    const pending = { ...suppressionDraft, status: "PENDING_APPROVAL" };
    const { service, repository } = harness([pending]);
    expect(service.transition(pending.id, "APPROVE", "checker")).toMatchObject({
      status: "SUPPRESSED",
      checker: "checker",
    });
    expect(repository.approveSuppression).toHaveBeenCalledWith(
      pending.id,
      "checker",
    );
    expect(repository.approveWithApplicability).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("fails closed when suppression approval state changes", () => {
    const pending = {
      ...record,
      status: "PENDING_APPROVAL",
      changeType: "SUPPRESSION" as const,
      suppressionReason: "duplicate settlement route",
    };
    const { service, repository } = harness([pending]);
    repository.approveSuppression.mockReturnValue(undefined);

    expect(() => service.transition(pending.id, "APPROVE", "checker")).toThrow(
      "SUPPRESSION_STATE_CHANGED",
    );
    expect(repository.approveWithApplicability).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("requires a governed suppression reason before submission", () => {
    const suppressionDraft = {
      ...record,
      changeType: "SUPPRESSION" as const,
      suppressionReason: "bad",
    };
    expect(() =>
      harness([suppressionDraft]).service.transition(
        suppressionDraft.id,
        "SUBMIT",
        suppressionDraft.maker,
      ),
    ).toThrow("SUPPRESSION_REASON_REQUIRED");

    expect(() =>
      harness([
        { ...suppressionDraft, suppressionReason: undefined },
      ]).service.transition(
        suppressionDraft.id,
        "SUBMIT",
        suppressionDraft.maker,
      ),
    ).toThrow("SUPPRESSION_REASON_REQUIRED");
  });

  it("fails closed when ordinary approval state changes", () => {
    const pending = { ...record, status: "PENDING_APPROVAL" };
    const { service, repository } = harness([pending]);
    repository.approveWithApplicability.mockReturnValue(undefined);

    expect(() => service.transition(pending.id, "APPROVE", "checker")).toThrow(
      "APPROVAL_STATE_CHANGED",
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("does not invalidate currency coverage when approval discovers no delta", () => {
    const pending = { ...record, status: "PENDING_APPROVAL" };
    const coordinator = {
      discoverApproved: jest.fn(() => undefined),
      invalidateAfterCommit: jest.fn(),
    };
    const { service, repository } = harness(
      [pending],
      [applicability],
      coordinator,
    );
    repository.approveWithApplicability.mockImplementation(
      (id, actor, onApproved?: () => void) => {
        onApproved?.();
        return { ...pending, id, status: "ACTIVE", checker: actor, version: 2 };
      },
    );

    expect(service.transition(pending.id, "APPROVE", "checker")).toMatchObject({
      status: "ACTIVE",
    });
    expect(coordinator.discoverApproved).toHaveBeenCalledWith(pending.id);
    expect(coordinator.invalidateAfterCommit).not.toHaveBeenCalled();
  });

  it("enforces revocation authority, reason and idempotency", () => {
    expect(() => harness().service.revoke("SSI-1", "", "retired")).toThrow(
      "ACTOR_REQUIRED",
    );
    expect(() => harness().service.revoke("SSI-1", "ops", "no")).toThrow(
      "REVOCATION_REASON_REQUIRED",
    );
    expect(() =>
      harness([{ ...record, status: "REVOKED" }]).service.revoke(
        "SSI-1",
        "ops",
        "retired",
      ),
    ).toThrow("SSI already revoked");
    expect(() =>
      harness([{ ...record, status: "ACTIVE" }]).service.revoke(
        "SSI-1",
        "maker",
        "retired",
      ),
    ).toThrow("ACTIVE_REQUIRES_SUPPRESSION");

    const { service: current, repository } = harness();
    const revoked = current.revoke("SSI-1", "ops", "  retired route  ");
    expect(revoked).toMatchObject({
      status: "REVOKED",
      revokeReason: "retired route",
      version: 2,
    });
    expect(repository.save).toHaveBeenCalledWith(revoked, "REVOKED", "ops");

    expect(() =>
      harness([{ ...record, status: "WIP" }]).service.revoke(
        "SSI-1",
        "maker",
        "Maker cannot revoke own WIP",
      ),
    ).toThrow("Maker cannot revoke an approved SSI");
  });

  it("enforces maker/checker and state transitions", () => {
    expect(() =>
      harness([{ ...record, status: "ACTIVE" }]).service.transition(
        "SSI-1",
        "SUBMIT",
        "maker",
      ),
    ).toThrow("Expected DRAFT, found ACTIVE");
    expect(() =>
      harness().service.transition("SSI-1", "SUBMIT", "other"),
    ).toThrow("Only the maker can submit");
    expect(() =>
      harness([{ ...record, status: "PENDING_APPROVAL" }]).service.transition(
        "SSI-1",
        "APPROVE",
        "maker",
      ),
    ).toThrow("Maker cannot check their own SSI");

    const submitted = harness().service.transition("SSI-1", "SUBMIT", "maker");
    expect(submitted).toMatchObject({ status: "PENDING_APPROVAL", version: 2 });
    const approved = harness([
      { ...record, status: "PENDING_APPROVAL" },
    ]).service.transition("SSI-1", "APPROVE", "checker");
    expect(approved).toMatchObject({ status: "ACTIVE", checker: "checker" });

    expect(() =>
      harness([{ ...record, status: "PENDING_APPROVAL" }]).service.transition(
        "SSI-1",
        "REJECT",
        "checker",
        "bad",
      ),
    ).toThrow("REJECTION_REASON_REQUIRED");
    const rejected = harness([
      { ...record, status: "PENDING_APPROVAL" },
    ]).service.transition(
      "SSI-1",
      "REJECT",
      "checker",
      "Account reference is not supported",
    );
    expect(rejected).toMatchObject({
      status: "DRAFT",
      checker: "checker",
      rejectionReason: "Account reference is not supported",
    });
    expect(
      harness([{ ...rejected }]).service.revoke(
        rejected.id,
        rejected.maker,
        "Maker abandoned rejected draft",
      ),
    ).toMatchObject({
      status: "REVOKED",
      revokeReason: "Maker abandoned rejected draft",
    });
    expect(() =>
      harness([{ ...record, status: "PENDING_APPROVAL" }]).service.revoke(
        "SSI-1",
        "maker",
        "Cannot bypass Checker while submitted",
      ),
    ).toThrow("REVOCATION_REQUIRES_DRAFT");
  });

  it("requires transaction binding and active applicability before activation", () => {
    expect(() =>
      harness([
        { ...record, status: "APPROVED", scope: "TRANSACTION_SPECIFIC" },
      ]).service.transition("SSI-1", "ACTIVATE", "checker"),
    ).toThrow("TRANSACTION_BINDING_REQUIRED");
    expect(() =>
      harness([{ ...record, status: "APPROVED" }], []).service.transition(
        "SSI-1",
        "ACTIVATE",
        "checker",
      ),
    ).toThrow("ACTIVE_SSI_APPLICABILITY_REQUIRED");
  });

  it("activates a revision and supersedes the previous logical SSI", () => {
    const previous = {
      ...record,
      id: "SSI-OLD",
      status: "ACTIVE",
      version: 7,
    };
    const revision = {
      ...record,
      status: "APPROVED",
      amendmentOfId: "SSI-OLD",
    };
    const { service: current, repository } = harness([revision, previous]);
    const activated = current.transition("SSI-1", "ACTIVATE", "checker");
    expect(activated).toMatchObject({ status: "ACTIVE", version: 2 });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "SSI-OLD",
        status: "SUPERSEDED",
        version: 8,
      }),
      "SUPERSEDED",
      "checker",
    );
    expect(repository.save).toHaveBeenCalledWith(
      activated,
      "ACTIVATE",
      "checker",
    );
  });

  it("inherits applicability when activating a legacy approved revision", () => {
    const previous = { ...record, id: "SSI-OLD", status: "ACTIVE" };
    const revision = {
      ...record,
      id: "SSI-REVISION",
      status: "APPROVED",
      amendmentOfId: previous.id,
    };
    const { service, repository } = harness([previous, revision]);
    repository.listApplicability.mockImplementation((id?: string) =>
      id === revision.id ? [] : [applicability],
    );

    expect(
      service.transition(revision.id, "ACTIVATE", "checker"),
    ).toMatchObject({
      status: "ACTIVE",
    });
    expect(repository.replaceApplicability).toHaveBeenCalledWith(
      revision.id,
      [expect.objectContaining({ consumer: applicability.consumer })],
      "checker",
    );
  });

  it("reports missing records and exposes the audit trail", () => {
    expect(() => harness([]).service.update("missing", command)).toThrow(
      "SSI not found",
    );
    expect(harness().service.audit()).toEqual([{ action: "CREATED" }]);
  });
});

describe("SsiApplicationService resolution failure boundaries", () => {
  const paymentHarness = (options?: {
    rmaAuthorised?: boolean;
    nostroDecision?: string;
    includeAlternative?: boolean;
    includeRoute?: boolean;
    routeOverrides?: Record<string, string | undefined>;
    nostroRecords?: readonly Record<string, unknown>[];
  }) => {
    const route = {
      counterpartyType: "BANK",
      counterpartyBic: "BARCGB22",
      counterpartyCountry: "GB",
      currency: "HKD",
      accountCurrency: "HKD",
      accountId: "OWN-HKD-1",
      accountWithBic: "HSBCHKHH",
      actualReceiverBic: "HSBCHKHH",
      beneficiaryBic: "BARCGB22",
      clearingSystem: "HKD_CHATS",
      settlementCountry: "HK",
      settlementMarket: "HK_DOLLAR",
      routePreference: "PRIMARY",
      routeType: "CLEARING_AGENT",
      priority: "10",
      bookingEntity: "HK01",
      messagingService: "FINPLUS",
      messageTypes: "pacs.009.001.08",
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
      ...options?.routeOverrides,
    };
    const record = {
      id: "SSI-PAY-1",
      counterpartyId: "BARCGB22",
      status: "ACTIVE",
      version: 2,
      route,
    };
    const applicability = {
      id: "APPL-PAY-1",
      ssiId: record.id,
      consumer: "CENTRAL_PAYMENT",
      product: "CENTRAL_PAYMENT",
      businessFunction: "INTERBANK_TRANSFER",
      paymentLeg: "INTERBANK_SETTLEMENT",
      direction: "OUTBOUND",
      status: "ACTIVE",
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
      version: 1,
    };
    const alternative = {
      ...record,
      id: "SSI-PAY-2",
      route: { ...route },
    };
    const alternativeApplicability = {
      ...applicability,
      id: "APPL-PAY-2",
      ssiId: alternative.id,
    };
    const repository = {
      list: jest.fn(() =>
        options?.includeRoute === false
          ? []
          : [record, ...(options?.includeAlternative ? [alternative] : [])],
      ),
      listApplicability: jest.fn(() =>
        options?.includeRoute === false
          ? []
          : [
              applicability,
              ...(options?.includeAlternative
                ? [alternativeApplicability]
                : []),
            ],
      ),
    };
    const rmaCheck = jest.fn(() => ({
      authorised: options?.rmaAuthorised ?? true,
    }));
    const rma = { check: rmaCheck } as unknown as RmaApplicationService;
    const nostroResolve = jest.fn(() => ({
      decision: options?.nostroDecision ?? "RESOLVED",
      nostroId: "NOSTRO-1",
      accountReference: "OWN-HKD-1",
      accountServicerBic: "HSBCHKHH",
      maskedAccountRef: "MASKED-HKD-1",
    }));
    const nostroImplementation = {
      resolve: nostroResolve,
      ...(options?.nostroRecords
        ? { list: jest.fn(() => options.nostroRecords) }
        : {}),
    };
    const nostro = nostroImplementation as unknown as NostroApplicationService;
    return {
      service: new SsiApplicationService(
        repository as unknown as SqliteSsiRepository,
        rma,
        nostro,
        new PaymentMessageIndexService(),
      ),
      repository,
      rmaCheck,
      nostroResolve,
      record,
      applicability,
      request: {
        consumer: "CENTRAL_PAYMENT",
        product: "CENTRAL_PAYMENT",
        counterpartyType: "BANK" as const,
        counterpartyId: "BARCGB22",
        counterpartyBic: "BARCGB22",
        counterpartyCountry: "GB",
        currency: "HKD",
        businessFunction: "INTERBANK_TRANSFER",
        paymentLeg: "INTERBANK_SETTLEMENT",
        direction: "OUTBOUND" as const,
        bookingEntity: "HK01",
        valueDate: "2026-09-12",
        amount: "1000",
        messageType: "pacs.009.001.08",
        sourceMessageType: "MT202",
        transactionReference: "TX-PAY-1",
      },
    };
  };

  it.each([
    [{ transactionReference: "" }, "RESOLUTION_FIELDS_REQUIRED"],
    [{ transactionReference: undefined }, "RESOLUTION_FIELDS_REQUIRED"],
    [{ paymentLeg: "INFORMATION_ONLY" }, "PAYMENT_TRIGGER_REQUIRED"],
    [
      { direction: "INBOUND" },
      "EXECUTABLE_SETTLEMENT_REQUIRES_OUTGOING_PAYMENT",
    ],
    [{ currency: "US" }, "INVALID_ISO_4217_CURRENCY"],
    [{ currency: undefined }, "INVALID_ISO_4217_CURRENCY"],
    [{ sourceMessageType: "MT103" }, "MESSAGE_TYPE_NOT_SUPPORTED"],
  ])(
    "rejects an invalid executable-resolution request %#",
    (change, message) => {
      const { service: current, request: validRequest } = paymentHarness();
      expect(() =>
        current.resolve({ ...validRequest, ...change } as never),
      ).toThrow(message);
    },
  );

  it("rejects a selectable source profile whose MX target does not match", () => {
    const { request: validRequest } = paymentHarness();
    const mismatchedIndex = {
      findSelectable: () => ({ targetMessage: "pacs.008.001.12" }),
    } as unknown as PaymentMessageIndexService;
    const current = new SsiApplicationService(
      {} as SqliteSsiRepository,
      {} as RmaApplicationService,
      {} as NostroApplicationService,
      mismatchedIndex,
    );
    expect(() => current.resolve(validRequest)).toThrow(
      "PAYMENT_SOURCE_TARGET_MISMATCH",
    );
  });

  it("returns non-executable clearing decisions for incomplete and non-payment input", () => {
    const { service: current, request: validRequest } = paymentHarness();
    expect(current.clearingOptions({ ...validRequest, amount: "" })).toEqual({
      items: [],
      decision: "INCOMPLETE_CRITERIA",
    });
    expect(
      current.clearingOptions({
        ...validRequest,
        amount: undefined as never,
      }),
    ).toEqual({ items: [], decision: "INCOMPLETE_CRITERIA" });
    expect(
      current.clearingOptions({
        ...validRequest,
        paymentLeg: "INFORMATION_ONLY",
      }),
    ).toEqual({ items: [], decision: "PAYMENT_TRIGGER_REQUIRED" });
  });

  it("returns only clearing systems backed by eligible SSI routes", () => {
    const { service: current, request: validRequest } = paymentHarness();
    expect(current.clearingOptions(validRequest)).toMatchObject({
      items: [expect.objectContaining({ code: "HKD_CHATS" })],
      source: "ELIGIBLE_SSI_ROUTES_INTERSECT_CLEARING_STANDING_DATA",
    });
  });

  it("fails preview when the selected route's Nostro profile is incomplete", () => {
    const { service: current, request: validRequest } = paymentHarness({
      nostroDecision: "NOT_FOUND",
    });
    expect(() => current.resolve(validRequest)).toThrow("PROFILE_INCOMPLETE");
  });

  it("uses scoped route bindings when the repository provides them", () => {
    const {
      service: current,
      request: validRequest,
      repository,
      record,
      applicability,
    } = paymentHarness();
    const findRelatedRouteBindings = jest.fn(() => ({
      ssi: [record],
      applicability: [applicability],
    }));
    Object.assign(repository, { findRelatedRouteBindings });

    expect(current.resolve(validRequest)).toMatchObject({
      recommendedRoute: expect.objectContaining({ ssiId: record.id }),
    });
    expect(findRelatedRouteBindings).toHaveBeenCalledWith(validRequest);
  });

  it("uses the repository cover-profile check when that capability exists", () => {
    const {
      service: current,
      request: validRequest,
      repository,
    } = paymentHarness();
    const hasCoverProfile = jest.fn(() => true);
    Object.assign(repository, { hasCoverProfile });
    const covRequest = {
      ...validRequest,
      sourceMessageType: "MT202COV",
      businessService: "swift.cbprplus.cov.04",
    };
    const internals = current as unknown as {
      requireCoverProfile(request: never): void;
    };

    expect(() =>
      internals.requireCoverProfile(covRequest as never),
    ).not.toThrow();
    expect(hasCoverProfile).toHaveBeenCalledWith(covRequest);
  });

  it("returns a non-executable preview when no route is eligible", () => {
    const { service: current, request: validRequest } = paymentHarness({
      includeRoute: false,
    });
    expect(current.resolve(validRequest)).toMatchObject({
      paymentExecutable: false,
      preSettlement: true,
      alternatives: [],
    });
    expect(current.resolve(validRequest)).not.toHaveProperty(
      "canonicalSettlementPreview",
    );
  });

  it("rejects stale, unauthenticated and ineligible confirmation attempts", () => {
    const { service: current, request: validRequest } = paymentHarness();
    expect(() =>
      current.confirm({
        attemptId: "missing",
        selectedSsiId: "SSI-PAY-1",
        actor: "ops",
      }),
    ).toThrow("STALE_PREVIEW");
    const preview = current.resolve(validRequest) as {
      attemptId: string;
      recommendedRoute: { ssiId: string };
    };
    expect(() =>
      current.confirm({
        attemptId: preview.attemptId,
        selectedSsiId: preview.recommendedRoute.ssiId,
        actor: "",
      }),
    ).toThrow("ACTOR_REQUIRED");
    expect(() =>
      current.confirm({
        attemptId: preview.attemptId,
        selectedSsiId: "SSI-NOT-ELIGIBLE",
        actor: "ops",
      }),
    ).toThrow("SELECTED_ROUTE_NOT_ELIGIBLE");
  });

  it("checks RMA before allowing payment execution", () => {
    const { service: current, request: validRequest } = paymentHarness({
      rmaAuthorised: false,
    });
    const preview = current.resolve(validRequest) as {
      attemptId: string;
      recommendedRoute: { ssiId: string };
    };
    expect(() =>
      current.confirm({
        attemptId: preview.attemptId,
        selectedSsiId: preview.recommendedRoute.ssiId,
        actor: "ops",
      }),
    ).toThrow("RMA_NOT_AUTHORISED_FOR_ACTUAL_RECEIVER");
  });

  it("requires a reason when confirming a lower-ranked eligible route", () => {
    const { service: current, request: validRequest } = paymentHarness({
      includeAlternative: true,
    });
    const preview = current.resolve(validRequest) as {
      attemptId: string;
      alternatives: Array<{ ssiId: string }>;
    };
    expect(() =>
      current.confirm({
        attemptId: preview.attemptId,
        selectedSsiId: preview.alternatives[0]!.ssiId,
        actor: "ops",
      }),
    ).toThrow("OVERRIDE_REASON_REQUIRED");
  });

  it("confirms the recommended route with preserved RMA, Nostro and snapshot inputs", () => {
    const {
      service: current,
      request: validRequest,
      rmaCheck,
      nostroResolve,
    } = paymentHarness();
    const preview = current.resolve(validRequest) as {
      attemptId: string;
      recommendedRoute: { ssiId: string };
    };

    const confirmed = current.confirm({
      attemptId: preview.attemptId,
      selectedSsiId: preview.recommendedRoute.ssiId,
      actor: "ops",
    }) as Record<string, unknown>;
    expect(confirmed).toMatchObject({
      decision: "CONFIRMED",
      paymentExecutable: true,
      actor: "ops",
      overrideReason: null,
      actualReceiverBic: "HSBCHKHH",
      resolutionToken: expect.any(String),
      snapshotHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(rmaCheck).toHaveBeenCalledWith({
      ownBic: "DEMOHKHH",
      counterpartyBic: "HSBCHKHH",
      service: "FINPLUS",
      direction: "OUTBOUND",
      messageType: validRequest.messageType,
      at: validRequest.valueDate,
    });
    expect(nostroResolve).toHaveBeenLastCalledWith({
      ownLegalEntityId: validRequest.bookingEntity,
      accountReference: "OWN-HKD-1",
      accountServicerBic: "HSBCHKHH",
      currency: validRequest.currency,
      purpose: "SETTLEMENT",
      at: validRequest.valueDate,
    });
  });

  it("confirms an eligible override only with its governed reason", () => {
    const { service: current, request: validRequest } = paymentHarness({
      includeAlternative: true,
    });
    const preview = current.resolve(validRequest) as {
      attemptId: string;
      alternatives: Array<{ ssiId: string }>;
    };
    expect(
      current.confirm({
        attemptId: preview.attemptId,
        selectedSsiId: preview.alternatives[0]!.ssiId,
        actor: "ops",
        overrideReason: "  approved alternate settlement route  ",
      }),
    ).toMatchObject({
      decision: "CONFIRMED",
      overrideReason: "approved alternate settlement route",
    });
  });

  it("counts only distinct eligible direct-account relationships", () => {
    const baseNostro = {
      status: "ACTIVE",
      accountServicerBic: "HSBCHKHH",
      currency: "HKD",
      purpose: "SETTLEMENT",
      validFrom: "2026-01-01",
      validTo: "2027-12-31",
      ownLegalEntityId: "HK01",
    };
    const { service: current, request: validRequest } = paymentHarness({
      routeOverrides: { routeType: "DIRECT", beneficiaryBic: "HSBCHKHH" },
      nostroRecords: [
        { ...baseNostro, accountReference: "ACC-DEFAULT" },
        {
          ...baseNostro,
          accountReference: "ACC-EMPTY",
          allowedBookingEntities: [],
        },
        {
          ...baseNostro,
          accountReference: "ACC-ANY",
          allowedBookingEntities: ["ANY"],
        },
        {
          ...baseNostro,
          accountReference: "ACC-EXACT",
          allowedBookingEntities: ["HK01"],
        },
        {
          ...baseNostro,
          accountReference: "ACC-BLOCKED",
          allowedBookingEntities: ["SG01"],
        },
      ],
    });
    const preview = current.resolve(validRequest) as {
      attemptId: string;
      recommendedRoute: { ssiId: string };
    };
    const confirmed = current.confirm({
      attemptId: preview.attemptId,
      selectedSsiId: preview.recommendedRoute.ssiId,
      actor: "ops",
    }) as { canonicalSettlement: Record<string, unknown> };

    expect(confirmed.canonicalSettlement).toMatchObject({
      directAccountRelationshipCount: 4,
      creditorAgentBic: "",
      deliveryAgentBic: "",
    });
  });

  it("reports zero direct relationships when a canonical route has no receiver", () => {
    const { service: current, request: validRequest } = paymentHarness();
    const internals = current as unknown as {
      buildCanonicalSettlement(
        request: never,
        selected: never,
        nostroEvidence?: never,
      ): Record<string, unknown>;
    };
    expect(
      internals.buildCanonicalSettlement(
        validRequest as never,
        { ssiId: "SSI-NO-RECEIVER", route: { currency: "HKD" } } as never,
      ),
    ).toMatchObject({
      instructedAgentBic: "",
      directAccountRelationshipCount: 0,
    });
  });

  it("detects a currency change between preview request and candidate snapshot", () => {
    const { service: current, request: validRequest } = paymentHarness();
    const internals = current as unknown as {
      resolveCandidateNostro(request: never, candidate: never): unknown;
    };
    expect(() =>
      internals.resolveCandidateNostro(
        validRequest as never,
        { ssiId: "SSI-PAY-1", route: { currency: "USD" } } as never,
      ),
    ).toThrow("RESOLUTION_SNAPSHOT_CURRENCY_MISMATCH");
  });

  it("passes empty optional route account fields to Nostro resolution", () => {
    const {
      service: current,
      request: validRequest,
      nostroResolve,
    } = paymentHarness();
    const internals = current as unknown as {
      resolveCandidateNostro(request: never, candidate: never): unknown;
    };
    expect(
      internals.resolveCandidateNostro(
        validRequest as never,
        {
          ssiId: "SSI-PAY-EMPTY",
          route: { currency: "HKD" },
        } as never,
      ),
    ).toMatchObject({ ssiId: "SSI-PAY-EMPTY", decision: "RESOLVED" });
    expect(nostroResolve).toHaveBeenLastCalledWith(
      expect.objectContaining({
        accountReference: "",
        accountServicerBic: "",
      }),
    );
  });

  it("preserves request messaging-service precedence", () => {
    const {
      service: current,
      request: validRequest,
      rmaCheck,
    } = paymentHarness();
    const requestWithService = {
      ...validRequest,
      messagingService: "FINPLUS",
    };
    const preview = current.resolve(requestWithService) as {
      attemptId: string;
      recommendedRoute: { ssiId: string };
    };
    expect(
      current.confirm({
        attemptId: preview.attemptId,
        selectedSsiId: preview.recommendedRoute.ssiId,
        actor: "ops",
      }),
    ).toMatchObject({ actualReceiverBic: "HSBCHKHH" });
    expect(rmaCheck).toHaveBeenLastCalledWith(
      expect.objectContaining({
        counterpartyBic: "HSBCHKHH",
        service: "FINPLUS",
      }),
    );
  });

  it("builds customer canonical settlement with transaction provenance", () => {
    const { service: current, request: validRequest } = paymentHarness();
    const internals = current as unknown as {
      buildCanonicalSettlement(
        request: never,
        selected: never,
        nostroEvidence?: never,
      ): Record<string, unknown>;
    };
    const customerRequest = {
      ...validRequest,
      counterpartyType: "CUSTOMER",
      sourceMessageType: "MT103",
      beneficiaryCustomer: {
        customerId: "CUSTOMER-1",
        name: "Customer One",
        accountReference: "CUSTOMER-ACCOUNT-1",
      },
    };
    const settlement = internals.buildCanonicalSettlement(
      customerRequest as never,
      {
        ssiId: "SSI-CUSTOMER-1",
        route: {
          currency: "HKD",
          accountWithBic: "HSBCHKHH",
          routeType: "CLEARING_AGENT",
        },
      } as never,
    );
    expect(settlement).toMatchObject({
      finMessageType: "MT103",
      instructedAgentBic: "HSBCHKHH",
      beneficiaryCustomer: customerRequest.beneficiaryCustomer,
      fieldProvenance: {
        "57A": {
          source: "CUSTOMER_SSI",
          evidenceId: "SSI-CUSTOMER-1",
        },
        "59": {
          source: "TRANSACTION_INPUT",
          evidenceId: "CUSTOMER-1",
        },
      },
    });
  });

  it.each([
    ["ENTITY_NOT_AUTHORIZED", "ENTITY_NOT_AUTHORIZED"],
    ["NOT_FOUND", "NOSTRO_NOT_ELIGIBLE"],
  ])("fails confirmation for Nostro decision %s", (decision, message) => {
    const { service: current } = paymentHarness({
      nostroDecision: decision,
    });
    const previewService = paymentHarness();
    const preview = previewService.service.resolve(previewService.request) as {
      attemptId: string;
      recommendedRoute: { ssiId: string };
    };
    const attempts = (
      previewService.service as unknown as {
        resolutionAttempts: Map<string, unknown>;
      }
    ).resolutionAttempts;
    (
      current as unknown as { resolutionAttempts: Map<string, unknown> }
    ).resolutionAttempts.set(
      preview.attemptId,
      attempts.get(preview.attemptId)!,
    );
    expect(() =>
      current.confirm({
        attemptId: preview.attemptId,
        selectedSsiId: preview.recommendedRoute.ssiId,
        actor: "ops",
      }),
    ).toThrow(message);
  });
});
