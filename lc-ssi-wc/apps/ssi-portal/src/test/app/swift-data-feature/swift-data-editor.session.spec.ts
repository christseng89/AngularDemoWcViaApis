import "@angular/compiler";
import { Injector, runInInjectionContext, signal } from "@angular/core";
import { of, throwError } from "rxjs";
import { SwiftDataApiService } from "../../../app/swift-data-feature/swift-data-api.service";
import {
  SwiftDataEditorSession,
  type SwiftDataEditorPorts,
} from "../../../app/swift-data-feature/swift-data-editor.session";
import { SwiftDataFieldMapper } from "../../../app/swift-data-feature/swift-data-field-mapper";
import type {
  Row,
  UiResource,
} from "../../../app/swift-data-feature/swift-data.models";

const resource: UiResource = {
  id: "rma",
  label: "RMA",
  endpoint: "rma-authorisations",
  importType: "RMA",
  description: "RMA",
  columns: [],
  fields: [
    { key: "bank.bic", label: "BIC", type: "input", defaultValue: "BANKUS33" },
    { key: "currency", label: "Currency", type: "input" },
  ],
  "x-lifecycle": [],
};

const row = (overrides: Partial<Row> = {}): Row => ({
  id: "RMA-1",
  status: "ACTIVE",
  version: 1,
  maker: "maker.one",
  bank: { bic: "BANKGB22" },
  currency: "GBP",
  ...overrides,
});

describe("SwiftDataEditorSession", () => {
  let session: SwiftDataEditorSession;
  let api: {
    save: jest.Mock;
    act: jest.Mock;
    revise: jest.Mock;
    delete: jest.Mock;
    suppress: jest.Mock;
    import: jest.Mock;
    reject: jest.Mock;
  };
  let mapper: {
    setPath: jest.Mock;
    getPath: jest.Mock;
    toFormValue: jest.Mock;
    toApiPayload: jest.Mock;
  };
  let index: {
    statusFilter: ReturnType<typeof signal<string>>;
    indexSearch: ReturnType<typeof signal<string>>;
    page: ReturnType<typeof signal<number>>;
  };
  let revision: { reservationId: ReturnType<typeof signal<string | null>> };
  let ports: SwiftDataEditorPorts & {
    notify: jest.Mock;
    refresh: jest.Mock;
    hydrateRmaSelection: jest.Mock;
    cancelWork: jest.Mock;
  };

  beforeEach(() => {
    api = {
      save: jest.fn(),
      act: jest.fn(),
      revise: jest.fn(),
      delete: jest.fn(),
      suppress: jest.fn(),
      import: jest.fn(),
      reject: jest.fn(),
    };
    mapper = {
      setPath: jest.fn((model, path, value) => {
        model[path] = value;
      }),
      getPath: jest.fn((source, path) => source[path]),
      toFormValue: jest.fn((value) => value),
      toApiPayload: jest.fn((_resource, model) => ({ ...model })),
    };
    const injector = Injector.create({
      providers: [
        { provide: SwiftDataApiService, useValue: api },
        { provide: SwiftDataFieldMapper, useValue: mapper },
      ],
    });
    session = runInInjectionContext(injector, () => new SwiftDataEditorSession());
    index = {
      statusFilter: signal("ALL"),
      indexSearch: signal("query"),
      page: signal(9),
    };
    revision = { reservationId: signal("WIP-1") };
    session.connect(index as never, revision as never);
    ports = {
      busy: signal(false),
      notify: jest.fn(),
      refresh: jest.fn().mockResolvedValue(undefined),
      hydrateRmaSelection: jest.fn().mockResolvedValue(undefined),
      cancelWork: jest.fn().mockResolvedValue(undefined),
    };
  });

  it("starts and edits forms while rejecting suppression rows", async () => {
    session.startCreate(resource);
    expect(session.model).toEqual({ "bank.bic": "BANKUS33" });
    expect(session.editingId()).toBeNull();
    expect(session.formVisible()).toBe(true);

    await session.edit(row({ changeType: "SUPPRESSION" }), resource, ports);
    expect(ports.hydrateRmaSelection).not.toHaveBeenCalled();

    await session.edit(row(), resource, ports);
    expect(ports.hydrateRmaSelection).toHaveBeenCalled();
    expect(mapper.setPath).toHaveBeenCalledTimes(3);
    expect(session.editingId()).toBe("RMA-1");
  });

  it("blocks invalid saves before transport", async () => {
    jest.spyOn(session.form, "invalid", "get").mockReturnValue(true);
    const touched = jest.spyOn(session.form, "markAllAsTouched");
    await session.save(resource, ports);
    expect(touched).toHaveBeenCalled();
    expect(api.save).not.toHaveBeenCalled();
    expect(ports.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "warning" }));
  });

  it.each([
    [null, "建立"],
    ["RMA-1", "更新"],
  ])("saves a valid draft for editing id %p", async (editingId, actionLabel) => {
    session.model = { currency: "USD" };
    session.editingId.set(editingId);
    api.save.mockReturnValue(of({ id: "DRAFT-2" }));
    await session.save(resource, ports);
    expect(api.save).toHaveBeenCalledWith(resource.endpoint, editingId, { currency: "USD" });
    expect(ports.notify).toHaveBeenCalledWith(expect.objectContaining({
      kind: "info",
      text: expect.stringContaining(actionLabel),
    }));
    expect(session.savedDraftId()).toBe("DRAFT-2");
    expect(revision.reservationId()).toBeNull();
    expect(session.editingId()).toBeNull();
    expect(session.formVisible()).toBe(false);
    expect(index.statusFilter()).toBe("DRAFT");
    expect(index.indexSearch()).toBe("");
    expect(index.page()).toBe(1);
    expect(ports.busy()).toBe(false);
    expect(ports.refresh).toHaveBeenCalled();
  });

  it.each([
    [{ error: { message: "RMA_INDEX_ALREADY_EXISTS" } }, "已有 ACTIVE"],
    [new Error("network"), "儲存被拒絕"],
    [null, "儲存被拒絕"],
  ])("reports save failures without leaking busy state", async (error, expectedText) => {
    api.save.mockReturnValue(throwError(() => error));
    await session.save(resource, ports);
    expect(ports.notify).toHaveBeenCalledWith(expect.objectContaining({
      kind: "error",
      text: expect.stringContaining(expectedText),
    }));
    expect(ports.busy()).toBe(false);
  });

  it.each([
    ["submit", "maker.one", "已提交審批", 0],
    ["approve", "checker.demo", "核准並啟用", 1],
    ["activate", "checker.demo", "已啟用", 0],
  ] as const)("executes %s and preserves its notification", async (action, actor, text, cancelCount) => {
    api.act.mockReturnValue(of({}));
    await session.act(resource, row(), action as "submit", ports);
    expect(api.act).toHaveBeenCalledWith(resource.endpoint, "RMA-1", action, actor);
    expect(ports.notify).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining(text) }));
    expect(ports.refresh).toHaveBeenCalled();
    expect(ports.cancelWork).toHaveBeenCalledTimes(cancelCount);
  });

  it("reports rejected lifecycle actions", async () => {
    api.act.mockReturnValue(throwError(() => new Error("rejected")));
    await session.act(resource, row(), "submit", ports);
    expect(ports.notify).toHaveBeenCalledWith({
      kind: "error",
      text: "submit 被生命週期／四眼控制拒絕。",
    });
  });

  it("opens a revision and reports revision failure", async () => {
    const revised = row({ id: "RMA-REV-1", status: "WIP" });
    api.revise.mockReturnValueOnce(of(revised));
    await session.revise(resource, row(), ports);
    expect(revision.reservationId()).toBe("RMA-REV-1");
    expect(session.editingId()).toBe("RMA-REV-1");

    api.revise.mockReturnValueOnce(throwError(() => new Error("conflict")));
    await session.revise(resource, row(), ports);
    expect(ports.notify).toHaveBeenLastCalledWith(expect.objectContaining({ kind: "error" }));
  });

  it("guards and records suppression or draft-revoke requests", () => {
    session.requestSuppress(row());
    expect(session.revokeTarget()?.id).toBe("RMA-1");
    expect(session.revokeReason()).toBe("");
    session.revokeTarget.set(null);
    session.requestDraftRevoke(row());
    expect(session.revokeTarget()).toBeNull();
    session.requestDraftRevoke(row({ status: "DRAFT" }));
    expect(session.revokeTarget()?.status).toBe("DRAFT");
  });

  it("guards incomplete suppression requests", async () => {
    await session.confirmSuppression(resource, ports);
    session.revokeTarget.set(row());
    session.revokeReason.set(" no ");
    await session.confirmSuppression(resource, ports);
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.suppress).not.toHaveBeenCalled();
  });

  it.each([
    ["DRAFT", "delete", "ACTIVE"],
    ["ACTIVE", "suppress", "DRAFT"],
  ])("confirms %s suppression through %s", async (status, method, expectedFilter) => {
    const target = row({ status });
    session.revokeTarget.set(target);
    session.revokeReason.set(" duplicate record ");
    api[method as "delete"].mockReturnValue(of({}));
    await session.confirmSuppression(resource, ports);
    expect(api[method as "delete"]).toHaveBeenCalled();
    expect(session.revokeTarget()).toBeNull();
    expect(session.revokeReason()).toBe("");
    expect(index.statusFilter()).toBe(expectedFilter);
    expect(index.page()).toBe(1);
    expect(ports.refresh).toHaveBeenCalled();
  });

  it("refreshes and reports suppression conflicts", async () => {
    session.revokeTarget.set(row());
    session.revokeReason.set("duplicate record");
    api.suppress.mockReturnValue(throwError(() => new Error("conflict")));
    await session.confirmSuppression(resource, ports);
    expect(ports.refresh).toHaveBeenCalled();
    expect(ports.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));
  });

  it("ignores uploads without an import type or file", async () => {
    const input = { files: [] as File[], value: "selected" };
    await session.upload({ ...resource, importType: undefined }, { target: input } as never, true, ports);
    await session.upload(resource, { target: input } as never, true, ports);
    expect(api.import).not.toHaveBeenCalled();
    expect(input.value).toBe("selected");
  });

  it.each([
    [[row()], true, 0, "dry-run"],
    [{ records: [row()] }, false, 1, "DRAFT"],
  ])("imports governed records from %p", async (payload, dryRun, refreshCount, noticeText) => {
    const file = {
      name: "records.json",
      lastModified: 123,
      text: jest.fn().mockResolvedValue(JSON.stringify(payload)),
    };
    const input = { files: [file], value: "selected" };
    api.import.mockReturnValue(of({ accepted: 1 }));
    await session.upload(resource, { target: input } as never, dryRun, ports);
    expect(session.importResult()).toEqual({ accepted: 1 });
    expect(api.import).toHaveBeenCalledWith(
      "RMA",
      "records.json",
      dryRun,
      expect.stringContaining(`-${dryRun}`),
      expect.any(Array),
    );
    expect(ports.refresh).toHaveBeenCalledTimes(refreshCount);
    expect(ports.notify).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining(noticeText) }));
    expect(input.value).toBe("");
  });

  it.each(["{}", "not-json"])("rejects invalid import payload %s", async (contents) => {
    const input = {
      files: [{ name: "bad.json", lastModified: 1, text: jest.fn().mockResolvedValue(contents) }],
      value: "selected",
    };
    await session.upload(resource, { target: input } as never, true, ports);
    expect(ports.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));
    expect(input.value).toBe("");
  });

  it("guards checker rejection by mode and reason", async () => {
    session.checkerRejectReason.set("valid reason");
    await session.rejectFromChecker(resource, row(), false, ports);
    session.checkerRejectReason.set("no");
    await session.rejectFromChecker(resource, row(), true, ports);
    expect(api.reject).not.toHaveBeenCalled();
  });

  it("rejects from checker and clears workflow state", async () => {
    session.checkerRejectReason.set("invalid evidence");
    api.reject.mockReturnValue(of({}));
    await session.rejectFromChecker(resource, row(), true, ports);
    expect(api.reject).toHaveBeenCalledWith(
      resource.endpoint,
      "RMA-1",
      "checker.demo",
      "invalid evidence",
    );
    expect(session.checkerRejectReason()).toBe("");
    expect(ports.cancelWork).toHaveBeenCalled();
    expect(ports.refresh).toHaveBeenCalled();
    expect(ports.busy()).toBe(false);
  });

  it("reports checker rejection conflicts and releases busy state", async () => {
    session.checkerRejectReason.set("invalid evidence");
    api.reject.mockReturnValue(throwError(() => new Error("conflict")));
    await session.rejectFromChecker(resource, row(), true, ports);
    expect(ports.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "error" }));
    expect(ports.busy()).toBe(false);
  });
});
