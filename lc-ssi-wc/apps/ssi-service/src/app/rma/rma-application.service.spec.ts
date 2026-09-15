import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { RmaApplicationService } from "./rma-application.service";
import type { RmaRecord, RmaRepository } from "./rma.repository";

const record = (overrides: Partial<RmaRecord> = {}): RmaRecord => ({
  id: "RMA-1",
  ownBic: "DEMOHKHH",
  counterpartyBic: "CHASUS33",
  service: "FIN",
  direction: "OUTBOUND",
  messageTypes: ["*"],
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  maker: "maker",
  source: "LICENSED_IMPORT",
  status: "ACTIVE",
  version: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  ...overrides,
});

const service = (records: RmaRecord[]) =>
  new RmaApplicationService({
    list: () => records,
    findAuthorised: (query: {
      fixtureFamily?: string;
      usageGroup?: string;
      fixtureBindingId?: string;
      messageType: string;
    }) => {
      const scoped = records.filter(
        (item) =>
          (query.fixtureFamily === undefined ||
            item.fixtureFamily === query.fixtureFamily) &&
          (query.usageGroup === undefined ||
            item.usageGroup === query.usageGroup) &&
          (query.fixtureBindingId === undefined ||
            item.fixtureBindingIds?.includes(query.fixtureBindingId)),
      );
      const exact = scoped.filter((item) =>
        item.messageTypes.includes(query.messageType),
      );
      return exact.length
        ? exact
        : scoped.filter((item) => item.messageTypes.includes("*"));
    },
  } as unknown as RmaRepository);

const repository = (records: RmaRecord[] = []) => {
  const saved: RmaRecord[] = [];
  const auditRows = [{ action: "CREATED" }];
  const value = {
    list: jest.fn(() => records),
    findAuthorised: jest.fn(() => records),
    find: jest.fn((id: string) => records.find((item) => item.id === id)),
    save: jest.fn((item: RmaRecord) => {
      saved.push(item);
    }),
    audit: jest.fn(() => auditRows),
  };
  return { value: value as unknown as RmaRepository, saved, auditRows };
};

const command = () => ({
  ownBic: "DEMOHKHHXXX",
  counterpartyBic: "CHASUS33XXX",
  service: "FIN" as const,
  direction: "OUTBOUND" as const,
  messageTypes: ["MT202"],
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  maker: "maker",
});

describe("RmaApplicationService lifecycle", () => {
  it("creates, lists and audits records", () => {
    const repo = repository();
    const subject = new RmaApplicationService(repo.value);
    const created = subject.create(command());

    expect(created).toMatchObject({
      status: "DRAFT",
      version: 1,
      source: "SYNTHETIC_DEMO",
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(repo.value.save).toHaveBeenCalledWith(
      created,
      "CREATED",
      "maker",
      "RMA",
    );
    expect(subject.list()).toEqual([]);
    expect(subject.audit()).toEqual(repo.auditRows);
  });

  it("updates only the original maker's draft and retains its source", () => {
    const current = record({ status: "DRAFT", maker: "maker" });
    const repo = repository([current]);
    const updated = new RmaApplicationService(repo.value).update(
      current.id,
      command(),
    );
    expect(updated).toMatchObject({ version: 4, source: "LICENSED_IMPORT" });

    expect(() =>
      new RmaApplicationService(repository([record()]).value).update(
        "RMA-1",
        command(),
      ),
    ).toThrow(ConflictException);
    expect(() =>
      new RmaApplicationService(repository([current]).value).update("RMA-1", {
        ...command(),
        maker: "other",
      }),
    ).toThrow("Only original maker can update");
  });

  it("creates a revision without carrying the checker", () => {
    const current = record({ checker: "checker" });
    const repo = repository([current]);
    const revised = new RmaApplicationService(repo.value).revise(
      current.id,
      "new-maker",
    );
    expect(revised).toMatchObject({
      status: "DRAFT",
      amendmentOfId: current.id,
      maker: "new-maker",
      version: 4,
    });
    expect(revised.checker).toBeUndefined();
    expect(() =>
      new RmaApplicationService(repo.value).revise(current.id, ""),
    ).toThrow(BadRequestException);
    expect(() =>
      new RmaApplicationService(
        repository([record({ status: "REVOKED" })]).value,
      ).revise("RMA-1", "maker"),
    ).toThrow(ConflictException);
  });

  it("enforces maker/checker transitions and supersedes overlapping active records", () => {
    const draft = record({ id: "draft", status: "DRAFT" });
    const pending = record({ id: "pending", status: "PENDING_APPROVAL" });
    const approved = record({
      id: "approved",
      status: "APPROVED",
      messageTypes: ["MT202"],
    });
    const active = record({ id: "active", messageTypes: ["MT202"] });

    expect(
      new RmaApplicationService(repository([draft]).value).transition(
        "draft",
        "SUBMIT",
        "maker",
      ).status,
    ).toBe("PENDING_APPROVAL");
    expect(() =>
      new RmaApplicationService(repository([draft]).value).transition(
        "draft",
        "SUBMIT",
        "other",
      ),
    ).toThrow("Only maker can submit");
    expect(() =>
      new RmaApplicationService(repository([pending]).value).transition(
        "pending",
        "APPROVE",
        "maker",
      ),
    ).toThrow("Maker cannot approve");
    expect(
      new RmaApplicationService(repository([pending]).value).transition(
        "pending",
        "APPROVE",
        "checker",
      ),
    ).toMatchObject({ status: "APPROVED", checker: "checker" });

    const repo = repository([approved, active]);
    expect(
      new RmaApplicationService(repo.value).transition(
        "approved",
        "ACTIVATE",
        "operator",
      ).status,
    ).toBe("ACTIVE");
    expect(repo.saved).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "active", status: "SUPERSEDED" }),
      ]),
    );
    expect(() =>
      new RmaApplicationService(repository([draft]).value).transition(
        "draft",
        "ACTIVATE",
        "operator",
      ),
    ).toThrow(ConflictException);
  });

  it("revokes with a meaningful reason and rejects invalid requests", () => {
    const current = record();
    const repo = repository([current]);
    expect(
      new RmaApplicationService(repo.value).revoke(
        current.id,
        "operator",
        "expired mandate",
      ),
    ).toMatchObject({
      status: "REVOKED",
      revokeReason: "expired mandate",
      version: 4,
    });
    expect(() =>
      new RmaApplicationService(repo.value).revoke(current.id, "", "short"),
    ).toThrow("ACTOR_AND_REASON_REQUIRED");
    expect(() =>
      new RmaApplicationService(repo.value).revoke(
        current.id,
        "operator",
        "bad",
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      new RmaApplicationService(repository().value).revoke(
        "missing",
        "operator",
        "valid reason",
      ),
    ).toThrow(NotFoundException);
  });

  it.each([
    [{ ...command(), ownBic: "bad" }, "INVALID_BIC"],
    [{ ...command(), service: "OTHER" }, "INVALID_RMA_SCOPE"],
    [{ ...command(), direction: "SIDEWAYS" }, "INVALID_RMA_SCOPE"],
    [{ ...command(), messageTypes: [] }, "INVALID_MESSAGE_TYPES"],
    [{ ...command(), messageTypes: ["invalid"] }, "INVALID_MESSAGE_TYPES"],
    [{ ...command(), maker: "" }, "INVALID_RMA_DATES"],
    [{ ...command(), validFrom: "invalid" }, "INVALID_RMA_DATES"],
    [{ ...command(), validTo: "2025-01-01" }, "INVALID_RMA_DATES"],
  ])("rejects invalid lifecycle command %#", (candidate, code) => {
    expect(() =>
      new RmaApplicationService(repository().value).validateCommand(
        candidate as never,
      ),
    ).toThrow(code as string);
  });
});

describe("RmaApplicationService.check", () => {
  const request = {
    ownBic: " demohkhh ",
    counterpartyBic: "chasus33",
    service: "FIN",
    direction: "OUTBOUND" as const,
    messageType: "MT700",
    at: "2026-06-30",
  };

  it("normalizes BIC8 and returns auditable authorisation", () => {
    const result = service([record()]).check(request);
    expect(result).toMatchObject({
      decision: "AUTHORISED",
      authorised: true,
      rmaId: "RMA-1",
      rmaVersion: 3,
      source: "LICENSED_IMPORT",
      effectiveAt: "2026-06-30",
    });
    expect(result.decisionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("uses an exact message profile ahead of wildcard", () => {
    const exact = record({ id: "RMA-EXACT", messageTypes: ["MT700"] });
    const result = service([record(), exact]).check(request);
    expect(result).toMatchObject({
      decision: "AUTHORISED",
      rmaId: "RMA-EXACT",
    });
  });

  it("does not let QA-only RMA fixtures enter an operational family", () => {
    const operational = record({
      id: "RMA-OP",
      fixtureFamily: "MT2-UI-PARITY-V1",
      messageTypes: ["MT700"],
    });
    const qaOnly = record({
      id: "RMA-QA",
      fixtureFamily: "MT2-NEGATIVE-QA",
      messageTypes: ["MT700"],
    });
    expect(
      service([qaOnly, operational]).check({
        ...request,
        fixtureFamily: "MT2-UI-PARITY-V1",
      }),
    ).toMatchObject({ decision: "AUTHORISED", rmaId: "RMA-OP" });
  });

  it("returns AMBIGUOUS for multiple equally specific active records", () => {
    const result = service([
      record({ id: "RMA-A", messageTypes: ["MT700"] }),
      record({ id: "RMA-B", messageTypes: ["MT700"] }),
    ]).check(request);
    expect(result).toMatchObject({ decision: "AMBIGUOUS", authorised: false });
  });

  it.each(["2026-01-01", "2026-12-31"])(
    "treats %s as an inclusive boundary",
    (at) => {
      expect(service([record()]).check({ ...request, at }).authorised).toBe(
        true,
      );
    },
  );

  it("distinguishes NOT_AUTHORISED from NOT_FOUND", () => {
    expect(
      service([record({ status: "REVOKED" })]).check(request).decision,
    ).toBe("NOT_AUTHORISED");
    expect(service([]).check(request).decision).toBe("NOT_FOUND");
  });

  it.each(["bad-date", "2026-02-29"])(
    "rejects invalid effective date %s",
    (at) => {
      expect(() => service([]).check({ ...request, at })).toThrow(
        BadRequestException,
      );
    },
  );

  it("rejects invalid BICs and uses today's date when no date is supplied", () => {
    expect(() => service([]).check({ ...request, ownBic: "bad" })).toThrow(
      "INVALID_BIC",
    );
    const today = new Date().toISOString().slice(0, 10);
    expect(service([]).check({ ...request, at: undefined })).toMatchObject({
      decision: "NOT_FOUND",
      effectiveAt: today,
    });
  });
});
