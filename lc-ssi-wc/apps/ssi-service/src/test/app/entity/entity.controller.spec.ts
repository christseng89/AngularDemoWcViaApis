import { BadRequestException } from "@nestjs/common";
import { EntityController } from "../../../app/entity/entity.controller";
import type { EntityApplicationService, EntityCommand } from "../../../app/entity/entity-application.service";

const body: EntityCommand = {
  branchCode: "HK01",
  branchName: "Hong Kong Branch",
  legalEntityCode: "DEMO-HK",
  legalEntityName: "Demo Bank Hong Kong",
  countryCode: "HK",
  validFrom: "2026-01-01",
  validTo: "2026-12-31",
  maker: "maker",
};

describe("EntityController", () => {
  const service = {
    list: jest.fn(() => ["listed"]),
    listPage: jest.fn((request: unknown) => ({ request })),
    create: jest.fn(() => ({ id: "created" })),
    update: jest.fn(() => ({ id: "updated" })),
    revise: jest.fn(() => ({ id: "revised" })),
    suppress: jest.fn(() => ({ id: "suppressed" })),
    transition: jest.fn(() => ({ id: "transitioned" })),
    revoke: jest.fn(() => ({ id: "revoked" })),
    audit: jest.fn(() => ["audited"]),
  };
  let controller: EntityController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new EntityController(service as unknown as EntityApplicationService);
  });

  it("delegates CRUD, revision, revocation and audit calls", () => {
    expect(controller.list()).toEqual(["listed"]);
    expect(controller.list("ACTIVE", "2", "10", "Hong Kong")).toEqual({
      request: expect.objectContaining({ page: 2, pageSize: 10 }),
    });
    expect(controller.create(body)).toEqual({ id: "created" });
    expect(controller.update("E1", body)).toEqual({ id: "updated" });
    expect(controller.revise("E1", { maker: "maker-2" })).toEqual({ id: "revised" });
    expect(controller.suppress("E1", { maker: "maker-2", reason: "closed" })).toEqual({ id: "suppressed" });
    expect(controller.revoke("E1", { actor: "checker", reason: "closed" })).toEqual({ id: "revoked" });
    expect(controller.audit()).toEqual(["audited"]);
    expect(service.update).toHaveBeenCalledWith("E1", body);
    expect(service.revise).toHaveBeenCalledWith("E1", "maker-2");
    expect(service.revoke).toHaveBeenCalledWith("E1", "checker", "closed");
  });

  it.each([
    ["submit", "SUBMIT"],
    ["approve", "APPROVE"],
    ["reject", "REJECT"],
    ["activate", "ACTIVATE"],
  ])("normalizes the %s transition", (input, expected) => {
    expect(controller.transition("E1", input, { actor: "actor" })).toEqual({ id: "transitioned" });
    expect(service.transition).toHaveBeenCalledWith(
      "E1",
      expected,
      "actor",
      undefined,
    );
  });

  it("rejects an unsupported lifecycle action", () => {
    expect(() => controller.transition("E1", "delete", { actor: "actor" })).toThrow(
      BadRequestException,
    );
    expect(service.transition).not.toHaveBeenCalled();
  });
});
