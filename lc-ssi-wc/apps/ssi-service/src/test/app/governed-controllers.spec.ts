import { NostroController } from "../../app/nostro/nostro.controller";
import { RmaController } from "../../app/rma/rma.controller";
import { SsiController } from "../../app/ssi.controller";
import { BadRequestException } from "@nestjs/common";
import type { NostroApplicationService } from "../../app/nostro/nostro-application.service";
import type { RmaApplicationService } from "../../app/rma/rma-application.service";
import type { SsiApplicationService } from "../../app/ssi-application.service";

const governedService = () => ({
  list: jest.fn(() => ["listed"]),
  listPage: jest.fn((request: unknown) => ({ request })),
  create: jest.fn((body: unknown) => ({ body })),
  update: jest.fn((id: string, body: unknown) => ({ id, body })),
  revise: jest.fn((id: string, maker: string) => ({ id, maker })),
  suppress: jest.fn((id: string, maker: string, reason: string) => ({ id, maker, reason })),
  cancelRevision: jest.fn((id: string, actor: string) => ({ id, actor })),
  transition: jest.fn((id: string, action: string, actor: string) => ({
    id,
    action,
    actor,
  })),
  revoke: jest.fn((id: string, actor: string, reason: string) => ({
    id,
    actor,
    reason,
  })),
  audit: jest.fn(() => ["audit"]),
});

describe("governed HTTP controller contracts", () => {
  it("delegates every Nostro lifecycle and resolution operation", () => {
    const service = {
      ...governedService(),
      resolve: jest.fn((body: unknown) => ({ body })),
    };
    const controller = new NostroController(
      service as unknown as NostroApplicationService,
    );
    const command = { accountReference: "ACCOUNT-1" } as never;

    expect(controller.list()).toEqual(["listed"]);
    expect(controller.list("ACTIVE", "2", "10", "usd")).toEqual({
      request: expect.objectContaining({ page: 2, pageSize: 10, search: "usd" }),
    });
    expect(
      controller.resolve({
        accountServicerBic: "CITIUS33",
        currency: "USD",
        purpose: "SETTLEMENT",
      }),
    ).toEqual({ body: expect.any(Object) });
    expect(controller.create(command)).toEqual({ body: command });
    expect(controller.update("n-1", command)).toEqual({
      id: "n-1",
      body: command,
    });
    expect(controller.revise("n-1", { maker: "maker" })).toEqual({
      id: "n-1",
      maker: "maker",
    });
    expect(controller.suppress("n-1", { maker: "maker", reason: "closed" })).toEqual({
      id: "n-1",
      maker: "maker",
      reason: "closed",
    });
    expect(
      controller.transition("n-1", "APPROVE", { actor: "checker" }),
    ).toEqual({ id: "n-1", action: "APPROVE", actor: "checker" });
    expect(() =>
      controller.transition("n-1", "delete", { actor: "checker" }),
    ).toThrow(BadRequestException);
    expect(
      controller.revoke("n-1", { actor: "checker", reason: "test" }),
    ).toEqual({ id: "n-1", actor: "checker", reason: "test" });
    expect(controller.audit()).toEqual(["audit"]);
  });

  it("delegates every RMA lifecycle and authorization operation", () => {
    const service = {
      ...governedService(),
      check: jest.fn((body: unknown) => ({ body })),
      supportedMessageTypes: jest.fn(() => ["MT300"]),
      messageTypePolicy: jest.fn(() => ({ version: "SR2026" })),
      pairState: jest.fn((ownBic: string, counterpartyBic: string) => ({
        ownBic,
        counterpartyBic,
      })),
    };
    const controller = new RmaController(
      service as unknown as RmaApplicationService,
    );
    const command = { ownBic: "DEMOHKHH" } as never;

    expect(controller.list()).toEqual(["listed"]);
    expect(controller.list("ACTIVE", "1", "20", "DEMO")).toEqual({
      request: expect.objectContaining({ page: 1, pageSize: 20, search: "DEMO" }),
    });
    expect(controller.messageTypes()).toEqual(["MT300"]);
    expect(controller.messageTypePolicy()).toEqual({ version: "SR2026" });
    expect(controller.pairState("DEMOHKHH", "CITIUS33")).toEqual({
      ownBic: "DEMOHKHH",
      counterpartyBic: "CITIUS33",
    });
    expect(
      controller.check({
        ownBic: "DEMOHKHH",
        counterpartyBic: "CITIUS33",
        service: "swift.fin",
        direction: "OUTBOUND",
        messageType: "MT300",
      }),
    ).toEqual({ body: expect.any(Object) });
    expect(controller.create(command)).toEqual({ body: command });
    expect(controller.update("r-1", command)).toEqual({
      id: "r-1",
      body: command,
    });
    expect(controller.revise("r-1", { maker: "maker" })).toEqual({
      id: "r-1",
      maker: "maker",
    });
    expect(controller.suppress("r-1", { maker: "maker", reason: "closed" })).toEqual({
      id: "r-1",
      maker: "maker",
      reason: "closed",
    });
    expect(
      controller.transition("r-1", "ACTIVATE", { actor: "checker" }),
    ).toEqual({ id: "r-1", action: "ACTIVATE", actor: "checker" });
    expect(
      controller.revoke("r-1", { actor: "checker", reason: "test" }),
    ).toEqual({ id: "r-1", actor: "checker", reason: "test" });
    expect(controller.audit()).toEqual(["audit"]);
  });

  it("delegates the complete SSI lifecycle, applicability, and resolution API", () => {
    const service = {
      ...governedService(),
      listApplicability: jest.fn((id?: string) => id ?? "all"),
      replaceApplicability: jest.fn((id: string, body: unknown) => ({
        id,
        body,
      })),
      confirm: jest.fn((body: unknown) => ({ confirm: body })),
      clearingOptions: jest.fn((body: unknown) => ({ options: body })),
      resolve: jest.fn((body: unknown) => ({ resolution: body })),
    };
    const controller = new SsiController(
      service as unknown as SsiApplicationService,
    );
    const command = { name: "SSI" } as never;

    expect(controller.list()).toEqual(["listed"]);
    expect(controller.applicability()).toBe("all");
    expect(controller.applicability("ssi-1")).toBe("ssi-1");
    expect(controller.create(command)).toEqual({ body: command });
    expect(controller.update("ssi-1", command)).toEqual({
      id: "ssi-1",
      body: command,
    });
    expect(controller.replaceApplicability("ssi-1", [] as never)).toEqual({
      id: "ssi-1",
      body: [],
    });
    expect(controller.revise("ssi-1", { maker: "maker" })).toEqual({
      id: "ssi-1",
      maker: "maker",
    });
    expect(controller.cancelRevision("ssi-1", { actor: "maker" })).toEqual({
      id: "ssi-1",
      actor: "maker",
    });
    expect(
      controller.revoke("ssi-1", { actor: "checker", reason: "test" }),
    ).toEqual({ id: "ssi-1", actor: "checker", reason: "test" });
    expect(controller.confirm({} as never)).toEqual({ confirm: {} });
    expect(controller.clearingOptions({} as never)).toEqual({ options: {} });
    expect(controller.resolve({} as never)).toEqual({ resolution: {} });
    expect(controller.submit("ssi-1", { actor: "maker" })).toEqual({
      id: "ssi-1",
      action: "SUBMIT",
      actor: "maker",
    });
    expect(controller.approve("ssi-1", { actor: "checker" })).toEqual({
      id: "ssi-1",
      action: "APPROVE",
      actor: "checker",
    });
    expect(controller.activate("ssi-1", { actor: "checker" })).toEqual({
      id: "ssi-1",
      action: "ACTIVATE",
      actor: "checker",
    });
    expect(controller.audit()).toEqual(["audit"]);
  });
});
