import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import {
  EntityApplicationService,
  type EntityCommand,
} from "../../../app/entity/entity-application.service";
import type { EntityRecord, EntityRepository } from "../../../app/entity/entity.repository";

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

function harness(initial: EntityRecord[] = []) {
  const records = [...initial];
  const auditEvents = [{ action: "SEEDED" }];
  const repository = {
    list: jest.fn(() => records),
    find: jest.fn((id: string) => records.find((item) => item.id === id)),
    save: jest.fn((item: EntityRecord) => {
      const index = records.findIndex((current) => current.id === item.id);
      if (index >= 0) records[index] = item;
      else records.push(item);
      return item;
    }),
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
    const service = harness([existing]).service;
    expect(service.list()).toEqual([existing]);
    expect(service.audit()).toEqual([{ action: "SEEDED" }]);
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
