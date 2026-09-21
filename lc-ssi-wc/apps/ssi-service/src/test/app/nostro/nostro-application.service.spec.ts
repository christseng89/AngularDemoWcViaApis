import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  NostroApplicationService,
  type NostroCommand,
} from "../../../app/nostro/nostro-application.service";
import type { NostroRecord, NostroRepository } from "../../../app/nostro/nostro.repository";

const command = (overrides: Partial<NostroCommand> = {}): NostroCommand => ({
  ownLegalEntityId: "HK01",
  allowedBookingEntities: ["HK01"],
  accountServicerBic: "CITIUS33",
  currency: "USD",
  maskedAccountRef: "DEMO-NOSTRO-001",
  accountReference: "ACCOUNT-1",
  purpose: "SETTLEMENT",
  priority: 10,
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  maker: "maker",
  ...overrides,
});

const record = (overrides: Partial<NostroRecord> = {}): NostroRecord => ({
  id: "NOSTRO-1",
  ...command(),
  source: "SYNTHETIC_DEMO",
  status: "ACTIVE",
  version: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  ...overrides,
});

function harness(initial: NostroRecord[] = []) {
  const records = [...initial];
  const auditEvents: unknown[] = [{ action: "SEEDED" }];
  const repository = {
    list: jest.fn(() => records),
    findEligible: jest.fn(
      (query: {
        ownLegalEntityId?: string;
        accountReference?: string;
        accountServicerBic: string;
        currency: string;
        purpose: string;
        at: string;
        fixtureFamily?: string;
        usageGroup?: string;
        fixtureBindingId?: string;
      }) =>
        records
          .filter(
            (item) =>
              item.status === "ACTIVE" &&
              (!query.accountReference ||
                item.accountReference === query.accountReference) &&
              item.accountServicerBic === query.accountServicerBic &&
              item.currency === query.currency &&
              item.purpose === query.purpose &&
              item.validFrom <= query.at &&
              query.at <= item.validTo &&
              (query.fixtureFamily === undefined ||
                item.fixtureFamily === query.fixtureFamily) &&
              (query.usageGroup === undefined ||
                item.usageGroup === query.usageGroup) &&
              (query.fixtureBindingId === undefined ||
                item.fixtureBindingIds?.includes(query.fixtureBindingId)) &&
              (!query.ownLegalEntityId ||
                !item.allowedBookingEntities?.length ||
                item.allowedBookingEntities.includes("ANY") ||
                item.allowedBookingEntities.includes(query.ownLegalEntityId)),
          )
          .sort((a, b) => a.priority - b.priority),
    ),
    find: jest.fn((id: string) => records.find((item) => item.id === id)),
    save: jest.fn((item: NostroRecord) => {
      const index = records.findIndex((current) => current.id === item.id);
      if (index >= 0) records[index] = item;
      else records.push(item);
      return item;
    }),
    audit: jest.fn(() => auditEvents),
  };
  return {
    repository,
    service: new NostroApplicationService(
      repository as unknown as NostroRepository,
    ),
  };
}

describe("NostroApplicationService", () => {
  it("lists records, exposes audit events and validates a command", () => {
    const existing = record();
    const { service } = harness([existing]);
    expect(service.list()).toEqual([existing]);
    expect(service.audit()).toEqual([{ action: "SEEDED" }]);
    expect(() => service.validateCommand(command())).not.toThrow();
  });

  it("creates a draft with defaults and persists the audit context", () => {
    const { service, repository } = harness();
    const created = service.create(command({ source: undefined }));
    expect(created).toMatchObject({
      status: "DRAFT",
      version: 1,
      source: "SYNTHETIC_DEMO",
      maker: "maker",
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(repository.save).toHaveBeenCalledWith(
      created,
      "CREATED",
      "maker",
      "NOSTRO",
    );
  });

  it("updates only the original maker's draft and preserves its source", () => {
    const current = record({
      status: "DRAFT",
      maker: "maker",
      source: "LICENSED_IMPORT",
    });
    const { service } = harness([current]);
    const updated = service.update(
      current.id,
      command({ priority: 20, source: undefined }),
    );
    expect(updated).toMatchObject({
      priority: 20,
      version: 3,
      source: "LICENSED_IMPORT",
    });
  });

  it.each([
    [record({ status: "ACTIVE" }), command(), "non-draft"],
    [
      record({ status: "DRAFT", maker: "alice" }),
      command({ maker: "bob" }),
      "different maker",
    ],
  ])("rejects update of %s (%s)", (current, next) => {
    expect(() => harness([current]).service.update(current.id, next)).toThrow(
      ConflictException,
    );
  });

  it("creates a revision, removes checker and links its predecessor", () => {
    const current = record({ checker: "checker" });
    const revised = harness([current]).service.revise(current.id, "new-maker");
    expect(revised).toMatchObject({
      maker: "new-maker",
      status: "WIP",
      version: 3,
      amendmentOfId: current.id,
    });
    expect(revised.id).not.toBe(current.id);
    expect(revised.checker).toBeUndefined();
  });

  it.each(["REVOKED", "SUPERSEDED"] as const)(
    "rejects revision of %s records",
    (status) => {
      const current = record({ status });
      expect(() =>
        harness([current]).service.revise(current.id, "maker-2"),
      ).toThrow(ConflictException);
    },
  );

  it("rejects a revision without a maker", () => {
    const current = record({ status: "DRAFT" });
    expect(() => harness([current]).service.revise(current.id, "")).toThrow(
      ConflictException,
    );
  });

  it("submits a draft only for its maker", () => {
    const current = record({ status: "DRAFT" });
    const service = harness([current]).service;
    expect(() => service.transition(current.id, "SUBMIT", "other")).toThrow(
      ConflictException,
    );
    expect(service.transition(current.id, "SUBMIT", "maker")).toMatchObject({
      status: "PENDING_APPROVAL",
      version: 3,
    });
  });

  it("requires checker independence and records the approver", () => {
    const current = record({ status: "PENDING_APPROVAL" });
    expect(() =>
      harness([current]).service.transition(current.id, "APPROVE", "maker"),
    ).toThrow(ConflictException);
    expect(
      harness([current]).service.transition(current.id, "APPROVE", "checker"),
    ).toMatchObject({
      status: "ACTIVE",
      checker: "checker",
    });
  });

  it("rejects a transition from an unexpected state", () => {
    const current = record({ status: "ACTIVE" });
    expect(() =>
      harness([current]).service.transition(current.id, "SUBMIT", "maker"),
    ).toThrow("Expected DRAFT");
  });

  it("activates and supersedes only an equivalent active predecessor", () => {
    const current = record({ id: "NEW", status: "APPROVED", version: 4 });
    const previous = record({ id: "OLD", version: 7 });
    const unrelated = record({ id: "OTHER", maskedAccountRef: "DEMO-OTHER" });
    const { service, repository } = harness([current, previous, unrelated]);
    expect(service.transition(current.id, "ACTIVATE", "checker")).toMatchObject(
      {
        status: "ACTIVE",
        version: 5,
      },
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "OLD", status: "SUPERSEDED", version: 8 }),
      "SUPERSEDED",
      "checker",
      "NOSTRO",
    );
    expect(repository.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "OTHER", status: "SUPERSEDED" }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("revokes with a trimmed reason", () => {
    const current = record({ status: "DRAFT" });
    expect(
      harness([current]).service.revoke(
        current.id,
        "checker",
        "  closed by ops  ",
      ),
    ).toMatchObject({
      status: "REVOKED",
      revokeReason: "closed by ops",
      version: 3,
    });
  });

  it.each([
    ["", "valid reason"],
    ["checker", "bad"],
  ])("requires a revoke actor and meaningful reason", (actor, reason) => {
    const current = record();
    expect(() =>
      harness([current]).service.revoke(current.id, actor, reason),
    ).toThrow(BadRequestException);
  });

  it("resolves the lowest-priority eligible exact account match", () => {
    const higher = record({ id: "HIGH", priority: 20 });
    const selected = record({ id: "LOW", priority: 5, version: 9 });
    const { service, repository } = harness([higher, selected]);
    const result = service.resolve({
      ownLegalEntityId: "HK01",
      accountReference: "ACCOUNT-1",
      accountServicerBic: "CITIUS33",
      currency: "USD",
      purpose: "SETTLEMENT",
      at: "2026-06-30",
    });
    expect(result).toEqual({
      decision: "RESOLVED",
      nostroId: "LOW",
      nostroVersion: 9,
      priority: 5,
      accountReference: "ACCOUNT-1",
      ownLegalEntityId: "HK01",
      allowedBookingEntities: ["HK01"],
      maskedAccountRef: "DEMO-NOSTRO-001",
      accountServicerBic: "CITIUS33",
      currency: "USD",
      purpose: "SETTLEMENT",
      validFrom: "2026-01-01",
      validTo: "2026-12-31",
    });
    expect(repository.findEligible).toHaveBeenCalledTimes(1);
  });

  it("does not let QA-only Nostro fixtures enter an operational family", () => {
    const operational = record({ id: "OP", fixtureFamily: "MT2-UI-PARITY-V1" });
    const qaOnly = record({
      id: "QA",
      fixtureFamily: "MT2-NEGATIVE-QA",
      priority: 1,
    });
    expect(
      harness([qaOnly, operational]).service.resolve({
        ownLegalEntityId: "HK01",
        accountServicerBic: "CITIUS33",
        currency: "USD",
        purpose: "SETTLEMENT",
        at: "2026-06-30",
        fixtureFamily: "MT2-UI-PARITY-V1",
      }),
    ).toMatchObject({ decision: "RESOLVED", nostroId: "OP" });
  });

  it("supports ANY and absent booking-entity controls", () => {
    const request = {
      ownLegalEntityId: "US01",
      accountServicerBic: "CITIUS33",
      currency: "USD",
      purpose: "SETTLEMENT",
      at: "2026-06-30",
    };
    expect(
      harness([record({ allowedBookingEntities: ["ANY"] })]).service.resolve(
        request,
      ),
    ).toMatchObject({
      decision: "RESOLVED",
    });
    expect(
      harness([record({ allowedBookingEntities: undefined })]).service.resolve(
        request,
      ),
    ).toMatchObject({
      decision: "RESOLVED",
      allowedBookingEntities: [],
    });
  });

  it("distinguishes entity rejection, missing routes and ambiguity", () => {
    const request = {
      ownLegalEntityId: "US01",
      accountServicerBic: "CITIUS33",
      currency: "USD",
      purpose: "SETTLEMENT",
      at: "2026-06-30",
    };
    expect(harness([record()]).service.resolve(request)).toEqual({
      decision: "ENTITY_NOT_AUTHORIZED",
      reasonCode: "ENTITY_NOT_AUTHORIZED",
    });
    expect(harness([]).service.resolve(request)).toEqual({
      decision: "NOT_FOUND",
      reasonCode: "NOSTRO_NOT_FOUND",
    });
    expect(
      harness([
        record({ id: "A", allowedBookingEntities: ["ANY"] }),
        record({ id: "B", allowedBookingEntities: ["ANY"] }),
      ]).service.resolve(request),
    ).toEqual({ decision: "AMBIGUOUS" });
  });

  it("excludes inactive, mismatched and out-of-window records", () => {
    const baseRequest = {
      accountServicerBic: "CITIUS33",
      currency: "USD",
      purpose: "SETTLEMENT",
      at: "2026-06-30",
    };
    const mismatches = [
      record({ status: "REVOKED" }),
      record({ accountReference: "OTHER" }),
      record({ accountServicerBic: "CHASUS33" }),
      record({ currency: "EUR" }),
      record({ purpose: "FEES" }),
      record({ validFrom: "2027-01-01", validTo: "2027-12-31" }),
    ];
    expect(
      harness(mismatches).service.resolve({
        ...baseRequest,
        accountReference: "ACCOUNT-1",
      }),
    ).toMatchObject({ decision: "NOT_FOUND" });
  });

  it("throws when a requested record does not exist", () => {
    expect(() => harness().service.update("missing", command())).toThrow(
      NotFoundException,
    );
  });

  it("resolves a pinned ACTIVE own Nostro by id and exact version", () => {
    const current = record({ id: "NOSTRO-PIN", version: 7 });
    expect(
      harness([current]).service.resolvePinned({
        nostroId: "NOSTRO-PIN",
        version: 7,
        bookingEntity: "HK01",
        at: "2026-06-30",
      }),
    ).toEqual({ decision: "RESOLVED", record: current });
  });

  it("fails closed for a stale pinned version without falling back", () => {
    expect(
      harness([record({ id: "NOSTRO-PIN", version: 8 })]).service.resolvePinned(
        {
          nostroId: "NOSTRO-PIN",
          version: 7,
          bookingEntity: "HK01",
          at: "2026-06-30",
        },
      ),
    ).toEqual({
      decision: "REJECTED",
      reasonCode: "OWN_ACCOUNT_VERSION_MISMATCH",
    });
  });

  it.each([
    [command({ ownLegalEntityId: "" }), "NOSTRO_REQUIRED_FIELDS"],
    [command({ maker: "" }), "NOSTRO_REQUIRED_FIELDS"],
    [command({ purpose: "" }), "NOSTRO_REQUIRED_FIELDS"],
    [command({ accountServicerBic: "BAD" }), "INVALID_BANK_OR_CURRENCY"],
    [command({ currency: "US" }), "INVALID_BANK_OR_CURRENCY"],
    [
      command({ maskedAccountRef: "LIVE-ACCOUNT" }),
      "DEMO_MASKED_ACCOUNT_REQUIRED",
    ],
    [command({ priority: 0 }), "INVALID_PRIORITY"],
    [command({ priority: 1000 }), "INVALID_PRIORITY"],
    [command({ priority: 1.5 }), "INVALID_PRIORITY"],
    [command({ validFrom: "bad-date" }), "INVALID_DATES"],
    [command({ validTo: "bad-date" }), "INVALID_DATES"],
    [
      command({ validFrom: "2026-01-01", validTo: "2026-01-01" }),
      "INVALID_DATES",
    ],
  ])("rejects invalid command %#", (invalid, message) => {
    expect(() => harness().service.validateCommand(invalid)).toThrow(message);
  });
});
