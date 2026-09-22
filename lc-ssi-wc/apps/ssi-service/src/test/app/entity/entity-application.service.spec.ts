import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  EntityApplicationService,
  type EntityCommand,
} from "../../../app/entity/entity-application.service";
import type {
  EntityRecord,
  EntityRepository,
} from "../../../app/entity/entity.repository";

const command = (overrides: Partial<EntityCommand> = {}): EntityCommand => ({
  branchCode: "HK01",
  branchName: "Hong Kong Branch",
  legalEntityCode: "DEMO-HK",
  legalEntityName: "Demo Bank Hong Kong",
  countryCode: "HK",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  maker: "maker",
  ...overrides,
});

const record = (overrides: Partial<EntityRecord> = {}): EntityRecord => ({
  id: "ENTITY-1",
  ...command(),
  status: "ACTIVE",
  version: 2,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
  ...overrides,
});

function harness(
  initial: EntityRecord[] = [],
  options: {
    approveSuppressionResult?: EntityRecord | null;
    hasOpenRevision?: boolean;
    legacyReservation?: boolean;
    reservationResult?: boolean;
  } = {},
) {
  const records = [...initial];
  const auditEvents = [{ action: "SEEDED" }];
  const repository = {
    list: jest.fn(() => records),
    listPage: jest.fn(() => ({ items: records, total: records.length })),
    find: jest.fn((id: string) => records.find((item) => item.id === id)),
    save: jest.fn((item: EntityRecord) => {
      const index = records.findIndex((current) => current.id === item.id);
      if (index >= 0) records[index] = item;
      else records.push(item);
      return item;
    }),
    approveSuppression: jest.fn(() => options.approveSuppressionResult ?? null),
    hasOpenRevision: jest.fn(() => options.hasOpenRevision ?? false),
    saveRevisionWorkInProgress: options.legacyReservation
      ? undefined
      : jest.fn(() => options.reservationResult ?? true),
    audit: jest.fn(() => auditEvents),
  };
  return {
    repository,
    service: new EntityApplicationService(
      repository as unknown as EntityRepository,
    ),
  };
}

describe("EntityApplicationService", () => {
  it("lists records and audit events", () => {
    const existing = record();
    const { service, repository } = harness([existing]);
    expect(service.list()).toEqual([existing]);
    expect(service.list("ACTIVE")).toEqual([existing]);
    expect(repository.list).toHaveBeenLastCalledWith("ACTIVE");
    expect(service.listPage({ page: 2, pageSize: 25 })).toEqual({
      items: [existing],
      total: 1,
    });
    expect(service.audit()).toEqual([{ action: "SEEDED" }]);
  });

  it("exposes command validation without persistence", () => {
    const { service, repository } = harness();
    expect(service.validateCommand(command())).toBeUndefined();
    expect(() =>
      service.validateCommand(command({ countryCode: "HKG" })),
    ).toThrow(new BadRequestException("ENTITY_FIELDS_INVALID"));
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("creates and persists a draft", () => {
    const { service, repository } = harness();
    const created = service.create(command());
    expect(created).toMatchObject({
      status: "DRAFT",
      version: 1,
      maker: "maker",
    });
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(repository.save).toHaveBeenCalledWith(
      created,
      "CREATED",
      "maker",
      "ENTITY",
    );
  });

  it("updates only the original maker's draft", () => {
    const current = record({ status: "DRAFT" });
    expect(
      harness([current]).service.update(
        current.id,
        command({ branchName: "HK Main Branch" }),
      ),
    ).toMatchObject({ branchName: "HK Main Branch", version: 3 });
    expect(() =>
      harness([record()]).service.update("ENTITY-1", command()),
    ).toThrow(ConflictException);
    expect(() =>
      harness([record({ status: "DRAFT", maker: "alice" })]).service.update(
        "ENTITY-1",
        command({ maker: "bob" }),
      ),
    ).toThrow(ConflictException);
    expect(() =>
      harness([
        record({ status: "DRAFT", changeType: "SUPPRESSION" }),
      ]).service.update("ENTITY-1", command()),
    ).toThrow("SUPPRESSION_DRAFT_CANNOT_BE_EDITED");

    const wip = record({
      status: "WIP",
      revisionWipExpiresAt: "2026-06-01T00:00:00.000Z",
    });
    const updatedWip = harness([wip]).service.update(wip.id, command());
    expect(updatedWip).toMatchObject({ status: "DRAFT" });
    expect(updatedWip).not.toHaveProperty("revisionWipExpiresAt");
  });

  it("creates a checker-free linked revision", () => {
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

  it("preserves atomic revision reservation and legacy fallback semantics", () => {
    const current = record();
    const atomic = harness([current]);
    const reserved = atomic.service.revise(current.id, "new-maker");
    expect(atomic.repository.saveRevisionWorkInProgress).toHaveBeenCalledWith(
      reserved,
      "new-maker",
      "ENTITY",
    );
    expect(atomic.repository.save).not.toHaveBeenCalled();

    expect(() =>
      harness([current], { reservationResult: false }).service.revise(
        current.id,
        "new-maker",
      ),
    ).toThrow("REVISION_NOT_AVAILABLE");

    const legacy = harness([current], { legacyReservation: true });
    const legacyRevision = legacy.service.revise(current.id, "new-maker");
    expect(legacy.repository.save).toHaveBeenCalledWith(
      legacyRevision,
      "WIP_RESERVED",
      "new-maker",
      "ENTITY",
    );
  });

  it("rejects invalid or concurrently reserved revisions", () => {
    const draft = record({ status: "DRAFT" });
    expect(() =>
      harness([draft]).service.revise(draft.id, "new-maker"),
    ).toThrow("INVALID_REVISION_STATUS");
    const active = record();
    expect(() =>
      harness([active], { hasOpenRevision: true }).service.revise(
        active.id,
        "new-maker",
      ),
    ).toThrow("OPEN_REVISION_EXISTS");
  });

  it.each(["REVOKED", "SUPERSEDED"] as const)(
    "rejects revision of %s records",
    (status) => {
      const current = record({ status });
      expect(() =>
        harness([current]).service.revise(current.id, "new-maker"),
      ).toThrow(ConflictException);
    },
  );

  it("rejects a revision without a maker", () => {
    const current = record({ status: "DRAFT" });
    expect(() => harness([current]).service.revise(current.id, "")).toThrow(
      ConflictException,
    );
  });

  it("enforces state and maker-checker transition rules", () => {
    const active = record();
    expect(() =>
      harness([active]).service.transition(active.id, "SUBMIT", "maker"),
    ).toThrow("Expected DRAFT");
    const draft = record({ status: "DRAFT" });
    expect(() =>
      harness([draft]).service.transition(draft.id, "SUBMIT", "other"),
    ).toThrow("Only maker can submit");
    expect(
      harness([draft]).service.transition(draft.id, "SUBMIT", "maker"),
    ).toMatchObject({
      status: "PENDING_APPROVAL",
    });
    const pending = record({ status: "PENDING_APPROVAL" });
    expect(() =>
      harness([pending]).service.transition(pending.id, "APPROVE", "maker"),
    ).toThrow("Maker cannot approve");
    expect(
      harness([pending]).service.transition(pending.id, "APPROVE", "checker"),
    ).toMatchObject({
      status: "ACTIVE",
      checker: "checker",
    });
  });

  it("activates and supersedes only the same branch", () => {
    const current = record({ id: "NEW", status: "APPROVED", version: 4 });
    const previous = record({ id: "OLD", version: 7 });
    const otherBranch = record({ id: "OTHER", branchCode: "US01" });
    const { service, repository } = harness([current, previous, otherBranch]);
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
      "ENTITY",
    );
    expect(repository.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: "OTHER", status: "SUPERSEDED" }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("characterizes rejection metadata and repository call semantics", () => {
    const pending = record({ status: "PENDING_APPROVAL", maker: "maker" });
    expect(() =>
      harness([pending]).service.transition(
        pending.id,
        "REJECT",
        "checker",
        "bad",
      ),
    ).toThrow(new BadRequestException("REJECTION_REASON_REQUIRED"));

    const { service, repository } = harness([pending]);
    const rejected = service.transition(
      pending.id,
      "REJECT",
      "checker",
      "  invalid branch ownership  ",
    );
    expect(rejected).toMatchObject({
      status: "DRAFT",
      checker: "checker",
      rejectionReason: "invalid branch ownership",
      version: 3,
    });
    expect(repository.save).toHaveBeenCalledWith(
      rejected,
      "REJECT",
      "checker",
      "ENTITY",
    );
  });

  it("characterizes suppression submission and atomic approval", () => {
    const suppressionDraft = record({
      status: "DRAFT",
      changeType: "SUPPRESSION",
      suppressionReason: "  branch relationship retired  ",
    });
    expect(
      harness([suppressionDraft]).service.transition(
        suppressionDraft.id,
        "SUBMIT",
        suppressionDraft.maker,
      ),
    ).toMatchObject({ status: "PENDING_APPROVAL" });

    for (const suppressionReason of [undefined, "bad"]) {
      const invalid = record({
        status: "DRAFT",
        changeType: "SUPPRESSION",
        suppressionReason,
      });
      expect(() =>
        harness([invalid]).service.transition(
          invalid.id,
          "SUBMIT",
          invalid.maker,
        ),
      ).toThrow(new BadRequestException("SUPPRESSION_REASON_REQUIRED"));
    }

    const pending = record({
      status: "PENDING_APPROVAL",
      changeType: "SUPPRESSION",
      suppressionReason: "branch relationship retired",
    });
    const suppressed = { ...pending, status: "SUPPRESSED" } as EntityRecord;
    const approved = harness([pending], {
      approveSuppressionResult: suppressed,
    });
    expect(approved.service.transition(pending.id, "APPROVE", "checker")).toBe(
      suppressed,
    );
    expect(approved.repository.approveSuppression).toHaveBeenCalledWith(
      pending.id,
      "checker",
      "ENTITY",
    );
    expect(approved.repository.save).not.toHaveBeenCalled();

    expect(() =>
      harness([pending]).service.transition(pending.id, "APPROVE", "checker"),
    ).toThrow(new ConflictException("SUPPRESSION_STATE_CHANGED"));
  });

  it("characterizes approval superseding only the same active branch", () => {
    const pending = record({ id: "PENDING", status: "PENDING_APPROVAL" });
    const previous = record({ id: "PREVIOUS", version: 9 });
    const otherBranch = record({ id: "OTHER", branchCode: "US01" });
    const inactiveSameBranch = record({ id: "DRAFT", status: "DRAFT" });
    const { service, repository } = harness([
      pending,
      previous,
      otherBranch,
      inactiveSameBranch,
    ]);

    expect(service.transition(pending.id, "APPROVE", "checker")).toMatchObject({
      status: "ACTIVE",
      checker: "checker",
    });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: previous.id,
        status: "SUPERSEDED",
        version: 10,
      }),
      "SUPERSEDED",
      "checker",
      "ENTITY",
    );
    expect(repository.save).not.toHaveBeenCalledWith(
      expect.objectContaining({ id: otherBranch.id, status: "SUPERSEDED" }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(repository.save).not.toHaveBeenCalledWith(
      expect.objectContaining({
        id: inactiveSameBranch.id,
        status: "SUPERSEDED",
      }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("creates suppression drafts with atomic and legacy reservation semantics", () => {
    const active = record({ checker: "checker" });
    const atomic = harness([active]);
    const suppression = atomic.service.suppress(
      active.id,
      "new-maker",
      "  branch relationship retired  ",
    );
    expect(suppression).toMatchObject({
      maker: "new-maker",
      status: "DRAFT",
      changeType: "SUPPRESSION",
      suppressionReason: "branch relationship retired",
      amendmentOfId: active.id,
      version: 3,
    });
    expect(suppression.checker).toBeUndefined();
    expect(atomic.repository.saveRevisionWorkInProgress).toHaveBeenCalledWith(
      suppression,
      "new-maker",
      "ENTITY",
      "SUPPRESSION_DRAFT_CREATED",
    );

    expect(() =>
      harness([active], { reservationResult: false }).service.suppress(
        active.id,
        "new-maker",
        "branch relationship retired",
      ),
    ).toThrow("SUPPRESSION_NOT_AVAILABLE");

    const legacy = harness([active], { legacyReservation: true });
    const legacySuppression = legacy.service.suppress(
      active.id,
      "new-maker",
      "branch relationship retired",
    );
    expect(legacy.repository.save).toHaveBeenCalledWith(
      legacySuppression,
      "SUPPRESSION_DRAFT_CREATED",
      "new-maker",
      "ENTITY",
    );
  });

  it("validates suppression maker, reason, state and concurrency", () => {
    const active = record();
    expect(() =>
      harness([active]).service.suppress(active.id, "", "valid reason"),
    ).toThrow("MAKER_REQUIRED");
    for (const reason of ["bad", undefined]) {
      expect(() =>
        harness([active]).service.suppress(
          active.id,
          "new-maker",
          reason as unknown as string,
        ),
      ).toThrow("SUPPRESSION_REASON_REQUIRED");
    }
    expect(() =>
      harness([record({ status: "DRAFT" })]).service.suppress(
        active.id,
        "new-maker",
        "valid reason",
      ),
    ).toThrow("ONLY_ACTIVE_CAN_BE_SUPPRESSED");
    expect(() =>
      harness([active], { hasOpenRevision: true }).service.suppress(
        active.id,
        "new-maker",
        "valid reason",
      ),
    ).toThrow("OPEN_REVISION_EXISTS");
  });

  it("revokes with a trimmed reason and validates revoke metadata", () => {
    const current = record({ status: "DRAFT" });
    expect(
      harness([current]).service.revoke(
        current.id,
        "checker",
        "  branch closed  ",
      ),
    ).toMatchObject({
      status: "REVOKED",
      revokeReason: "branch closed",
      version: 3,
    });
    expect(() =>
      harness([current]).service.revoke(current.id, "", "valid reason"),
    ).toThrow(BadRequestException);
    expect(() =>
      harness([current]).service.revoke(current.id, "checker", "bad"),
    ).toThrow(BadRequestException);
    expect(() =>
      harness([record()]).service.revoke("ENTITY-1", "checker", "valid reason"),
    ).toThrow("ACTIVE_REQUIRES_SUPPRESSION");
    expect(() =>
      harness([record({ status: "PENDING_APPROVAL" })]).service.revoke(
        "ENTITY-1",
        "checker",
        "valid reason",
      ),
    ).toThrow("REVOCATION_REQUIRES_DRAFT");
  });

  it("throws when a requested entity is missing", () => {
    expect(() => harness().service.update("missing", command())).toThrow(
      NotFoundException,
    );
  });

  it.each([
    command({ branchCode: "HK1" }),
    command({ branchName: "" }),
    command({ legalEntityCode: "" }),
    command({ legalEntityName: "" }),
    command({ countryCode: "HKG" }),
    command({ maker: "" }),
  ])("rejects invalid required entity fields %#", (invalid) => {
    expect(() => harness().service.create(invalid)).toThrow(
      "ENTITY_FIELDS_INVALID",
    );
  });

  it("rejects an invalid effective date range", () => {
    expect(() =>
      harness().service.create(
        command({ validFrom: "2026-12-31", validTo: "2026-01-01" }),
      ),
    ).toThrow("INVALID_DATES");
  });
});
