import "@angular/compiler";
import { Injector, runInInjectionContext, signal } from "@angular/core";
import { FormGroup } from "@angular/forms";
import { of, throwError } from "rxjs";

jest.mock("@ngx-formly/core", () => ({
  FormlyForm: class {},
}));

import { SwiftDataCrudComponent } from "../../app/swift-data-crud.component";
import { SwiftDataApiService } from "../../app/swift-data-feature/swift-data-api.service";
import { SwiftDataBankPicker } from "../../app/swift-data-feature/swift-data-bank-picker";
import { SwiftDataEditorSession } from "../../app/swift-data-feature/swift-data-editor.session";
import { SwiftDataExportService } from "../../app/swift-data-feature/swift-data-export.service";
import { SwiftDataFieldMapper } from "../../app/swift-data-feature/swift-data-field-mapper";
import { SwiftDataIndexStore } from "../../app/swift-data-feature/swift-data-index.store";
import { SwiftDataRevisionSession } from "../../app/swift-data-feature/swift-data-revision-session";
import { SwiftDataRmaSelection } from "../../app/swift-data-feature/swift-data-rma-selection";
import type {
  OpenApiUiContract,
  Row,
  UiResource,
} from "../../app/swift-data-feature/swift-data.models";

const rma: UiResource = {
  id: "rma",
  label: "RMA",
  endpoint: "rmas",
  importType: "RMA",
  description: "RMA",
  columns: [
    { path: "id", label: "ID" },
    { paths: ["currency", "status"], separator: " / ", label: "Route" },
  ],
  fields: [{ key: "currency", label: "Currency", type: "input" }],
  "x-lifecycle": ["submit", "approve"],
};
const entity: UiResource = {
  ...rma,
  id: "entity",
  label: "Entity",
  endpoint: "entities",
};
const contract: OpenApiUiContract = {
  info: { title: "test", version: "1" },
  "x-standards-baseline": {},
  "x-ui-resources": [
    rma,
    entity,
    { ...rma, id: "ssi", label: "SSI" },
  ],
};
const row = (overrides: Partial<Row> = {}): Row => ({
  id: "ROW-1",
  status: "DRAFT",
  version: 1,
  maker: "maker.one",
  currency: "USD",
  ...overrides,
});

describe("SwiftDataCrudComponent behavior", () => {
  let component: SwiftDataCrudComponent;
  let api: Record<string, jest.Mock>;
  let bankPicker: {
    target: ReturnType<typeof signal<unknown>>;
    close: jest.Mock;
    open: jest.Mock;
  };
  let rmaSelection: Record<string, jest.Mock>;
  let revision: {
    reservationId: ReturnType<typeof signal<string | null>>;
    canDeactivate: jest.Mock;
  };
  let exporter: Record<string, jest.Mock>;
  let fieldMapper: Record<string, jest.Mock>;
  let index: Record<string, unknown> & {
    rows: ReturnType<typeof signal<Row[]>>;
    statusFilter: ReturnType<typeof signal<string>>;
    indexSearch: ReturnType<typeof signal<string>>;
    page: ReturnType<typeof signal<number>>;
    pageSize: ReturnType<typeof signal<number>>;
    totalItems: ReturnType<typeof signal<number>>;
    serverTotalPages: ReturnType<typeof signal<number>>;
    sortPath: ReturnType<typeof signal<string | null>>;
    sortDirection: ReturnType<typeof signal<"asc" | "desc">>;
    totalPages: ReturnType<typeof signal<number>>;
    sortedRows: ReturnType<typeof signal<Row[]>>;
    pagedRows: ReturnType<typeof signal<Row[]>>;
    refresh: jest.Mock;
    reset: jest.Mock;
    search: jest.Mock;
    movePage: jest.Mock;
    toggleSort: jest.Mock;
    sortIndicator: jest.Mock;
    sortValue?: (row: Row, path: string) => unknown;
  };
  let editor: {
    form: FormGroup;
    editingId: ReturnType<typeof signal<string | null>>;
    savedDraftId: ReturnType<typeof signal<string | null>>;
    formVisible: ReturnType<typeof signal<boolean>>;
    importResult: ReturnType<typeof signal<unknown>>;
    revokeTarget: ReturnType<typeof signal<Row | null>>;
    revokeReason: ReturnType<typeof signal<string>>;
    checkerRejectReason: ReturnType<typeof signal<string>>;
    model: Record<string, unknown>;
    connect: jest.Mock;
    startCreate: jest.Mock;
    edit: jest.Mock;
    save: jest.Mock;
    act: jest.Mock;
    revise: jest.Mock;
    requestSuppress: jest.Mock;
    requestDraftRevoke: jest.Mock;
    confirmSuppression: jest.Mock;
    upload: jest.Mock;
    rejectFromChecker: jest.Mock;
  };

  const setInput = (name: "initialResourceId" | "initialRecordId" | "checkerMode", value: unknown) => {
    Object.defineProperty(component, name, { value: signal(value), configurable: true });
  };
  const removeResource = () => component.resourceId.set("missing");

  beforeEach(() => {
    api = {
      contract: jest.fn().mockReturnValue(of(contract)),
      currencies: jest.fn().mockReturnValue(of([{ code: "USD", decimals: 2 }])),
      messageTypePolicy: jest.fn().mockReturnValue(of({ supportedMessageTypes: [] })),
    };
    bankPicker = { target: signal(null), close: jest.fn(), open: jest.fn() };
    rmaSelection = {
      forDirection: jest.fn().mockReturnValue(["MT300"]),
      hydrate: jest.fn().mockResolvedValue(true),
    };
    revision = {
      reservationId: signal(null),
      canDeactivate: jest.fn().mockResolvedValue(true),
    };
    exporter = { excel: jest.fn().mockResolvedValue(undefined), json: jest.fn() };
    fieldMapper = {
      getPath: jest.fn((source, path) => source[path]),
      setPath: jest.fn((target, path, value) => { target[path] = value; }),
      toFormValue: jest.fn((value) => value),
      fields: jest.fn().mockReturnValue([{ key: "currency" }]),
    };
    index = {
      rows: signal<Row[]>([]),
      statusFilter: signal("ACTIVE"),
      indexSearch: signal(""),
      page: signal(1),
      pageSize: signal(10),
      totalItems: signal(0),
      serverTotalPages: signal(1),
      sortPath: signal<string | null>(null),
      sortDirection: signal<"asc" | "desc">("asc"),
      totalPages: signal(1),
      sortedRows: signal<Row[]>([]),
      pagedRows: signal<Row[]>([]),
      refresh: jest.fn().mockResolvedValue(undefined),
      reset: jest.fn(),
      search: jest.fn(),
      movePage: jest.fn(),
      toggleSort: jest.fn(),
      sortIndicator: jest.fn().mockReturnValue("▲"),
    };
    editor = {
      form: new FormGroup({}),
      editingId: signal(null),
      savedDraftId: signal(null),
      formVisible: signal(false),
      importResult: signal(null),
      revokeTarget: signal(null),
      revokeReason: signal(""),
      checkerRejectReason: signal(""),
      model: {},
      connect: jest.fn(),
      startCreate: jest.fn(),
      edit: jest.fn().mockResolvedValue(undefined),
      save: jest.fn().mockResolvedValue(undefined),
      act: jest.fn().mockResolvedValue(undefined),
      revise: jest.fn().mockResolvedValue(undefined),
      requestSuppress: jest.fn(),
      requestDraftRevoke: jest.fn(),
      confirmSuppression: jest.fn().mockResolvedValue(undefined),
      upload: jest.fn().mockResolvedValue(undefined),
      rejectFromChecker: jest.fn().mockResolvedValue(undefined),
    };
    const injector = Injector.create({
      providers: [
        { provide: SwiftDataApiService, useValue: api },
        { provide: SwiftDataBankPicker, useValue: bankPicker },
        { provide: SwiftDataRmaSelection, useValue: rmaSelection },
        { provide: SwiftDataRevisionSession, useValue: revision },
        { provide: SwiftDataExportService, useValue: exporter },
        { provide: SwiftDataFieldMapper, useValue: fieldMapper },
        { provide: SwiftDataIndexStore, useValue: index },
        { provide: SwiftDataEditorSession, useValue: editor },
      ],
    });
    component = runInInjectionContext(injector, () => new SwiftDataCrudComponent());
    component.contract.set(contract);
  });

  it("projects resources, fields, detail and notice state", () => {
    expect(component.resources().map(({ id }) => id)).toEqual(["rma", "entity"]);
    expect(component.resource()?.id).toBe("rma");
    expect(component.showRequestTypeColumn()).toBe(true);
    index.statusFilter.set("DRAFT");
    expect(component.showRequestTypeColumn()).toBe(false);
    index.statusFilter.set("ACTIVE");
    expect(component.actionColumns()).toBeDefined();
    expect(component.noticeAlert()).toBeNull();
    for (const [kind, title] of [["error", "操作未完成"], ["warning", "請注意"], ["info", "操作完成"]] as const) {
      component.notice.set({ kind, text: "message" });
      expect(component.noticeAlert()).toEqual({ severity: kind, title, message: "message" });
    }
    expect(component.detailModel()).toEqual({});
    component.detailTarget.set(row());
    expect(component.detailModel()).toEqual({ currency: "USD" });
    component.model = { currency: "EUR" };
    expect(component.model).toEqual({ currency: "EUR" });
    expect(editor.connect).toHaveBeenCalledWith(index, revision);
    expect(index.sortValue?.(row(), "currency")).toBe("USD");
  });

  it("initialises requested checker data and opens a requested row", async () => {
    setInput("checkerMode", true);
    setInput("initialResourceId", "entity");
    setInput("initialRecordId", "ROW-2");
    expect(component.checkerMode()).toBe(true);
    expect(component.initialRecordId()).toBe("ROW-2");
    expect(component.actionColumns()).toEqual([]);
    Object.defineProperty(component, "rows", {
      value: signal([row({ id: "ROW-2" })]),
      configurable: true,
    });
    await component.initialise();
    expect(component.resourceId()).toBe("entity");
    expect(index.statusFilter()).toBe("PENDING_APPROVAL");
    expect(fieldMapper.fields).toHaveBeenCalled();
    expect(index.refresh).toHaveBeenCalled();
  });

  it("keeps defaults for unknown initial resources and handles load failure", async () => {
    setInput("initialResourceId", "unknown");
    setInput("initialRecordId", "missing");
    await component.initialise();
    expect(component.resourceId()).toBe("rma");
    api.contract.mockReturnValueOnce(throwError(() => new Error("offline")));
    await component.initialise();
    expect(component.busy()).toBe(false);
    expect(component.notice()).toEqual(expect.objectContaining({ kind: "error" }));
  });

  it("reacts only to valid changed resource inputs", async () => {
    const choose = jest.spyOn(component, "chooseResource").mockResolvedValue(undefined);
    component.ngOnChanges({});
    setInput("initialResourceId", null);
    component.ngOnChanges({ initialResourceId: {} as never });
    setInput("initialResourceId", "rma");
    component.ngOnChanges({ initialResourceId: {} as never });
    setInput("initialResourceId", "missing");
    component.ngOnChanges({ initialResourceId: {} as never });
    expect(choose).not.toHaveBeenCalled();
    setInput("initialResourceId", "entity");
    component.ngOnChanges({ initialResourceId: {} as never });
    expect(choose).toHaveBeenCalledWith("entity");
  });

  it("switches resources after releasing reservations and stops when release fails", async () => {
    revision.reservationId.set("WIP-1");
    revision.canDeactivate.mockResolvedValueOnce(false);
    await component.chooseResource("entity");
    expect(component.resourceId()).toBe("rma");
    revision.canDeactivate.mockResolvedValueOnce(true);
    await component.chooseResource("entity");
    expect(component.resourceId()).toBe("entity");
    expect(index.reset).toHaveBeenCalled();
    expect(component.detailTarget()).toBeNull();
    expect(fieldMapper.fields).toHaveBeenCalled();
  });

  it("searches and refreshes with success, failure and no resource", async () => {
    component.searchIndex("bank");
    expect(index.search).toHaveBeenCalledWith("bank");
    await component.refresh();
    expect(component.busy()).toBe(false);
    index.refresh.mockRejectedValueOnce(new Error("offline"));
    await component.refresh();
    expect(component.notice()?.text).toContain("API");
    removeResource();
    await component.refresh();
    expect(component.busy()).toBe(false);
  });

  it("starts, closes and releases work through each guard", async () => {
    component.startCreate();
    expect(editor.startCreate).toHaveBeenCalledWith(rma);
    bankPicker.target.set({});
    await component.cancelWork();
    expect(bankPicker.close).toHaveBeenCalled();
    bankPicker.target.set(null);
    revision.reservationId.set("WIP-1");
    revision.canDeactivate.mockResolvedValueOnce(false);
    editor.formVisible.set(true);
    await component.cancelWork();
    expect(editor.formVisible()).toBe(true);
    revision.canDeactivate.mockResolvedValueOnce(true);
    await component.cancelWork();
    expect(editor.formVisible()).toBe(false);
    expect(editor.editingId()).toBeNull();
    removeResource();
    component.startCreate();
    expect(editor.startCreate).toHaveBeenCalledTimes(1);
  });

  it("keeps and clears editor state according to reservation release", async () => {
    expect(await component.canDeactivate()).toBe(true);
    revision.reservationId.set("WIP-1");
    editor.formVisible.set(true);
    editor.editingId.set("ROW-1");
    expect(await component.canDeactivate()).toBe(true);
    expect(editor.formVisible()).toBe(false);
    expect(editor.editingId()).toBeNull();
  });

  it("views rows from supported keyboard activation only", async () => {
    await component.view(row());
    expect(rmaSelection.hydrate).toHaveBeenCalled();
    expect(component.detailTarget()?.id).toBe("ROW-1");
    const preventDefault = jest.fn();
    await component.openRowFromKeyboard({ key: "Escape", preventDefault } as never, row());
    expect(preventDefault).not.toHaveBeenCalled();
    for (const key of ["Enter", " "]) {
      await component.openRowFromKeyboard({ key, preventDefault } as never, row());
    }
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(component.rowLabel(row())).toBe("View RMA ROW-1");
    rma.columns = [];
    expect(component.rowLabel(row())).toBe("View RMA ROW-1");
    rma.columns = [{ path: "id", label: "ID" }];
    removeResource();
    expect(component.rowLabel(row())).toBe("View record ROW-1");
  });

  it("dispatches edit based on suppression, revision and editable status", async () => {
    await component.edit(row({ changeType: "SUPPRESSION" }));
    expect(editor.edit).not.toHaveBeenCalled();
    const revise = jest.spyOn(component, "revise").mockResolvedValue(undefined);
    await component.edit(row({ status: "ACTIVE" }));
    expect(revise).toHaveBeenCalled();
    await component.edit(row({ status: "DRAFT" }));
    expect(editor.edit).toHaveBeenCalled();
    removeResource();
    await component.edit(row({ status: "DRAFT" }));
    expect(editor.edit).toHaveBeenCalledTimes(1);
  });

  it("delegates lifecycle, suppression, upload and checker actions", async () => {
    const target = row();
    await component.save();
    await component.act(target, "submit");
    await component.revise(target);
    component.requestSuppress(target);
    component.requestDraftRevoke(target);
    await component.confirmSuppression();
    const event = {} as Event;
    await component.upload(event, true);
    await component.rejectFromChecker(target);
    expect(editor.save).toHaveBeenCalled();
    expect(editor.act).toHaveBeenCalled();
    expect(editor.revise).toHaveBeenCalled();
    expect(editor.requestSuppress).toHaveBeenCalledWith(target);
    expect(editor.requestDraftRevoke).toHaveBeenCalledWith(target);
    expect(editor.confirmSuppression).toHaveBeenCalled();
    expect(editor.upload).toHaveBeenCalled();
    expect(editor.rejectFromChecker).toHaveBeenCalled();
    const ports = editor.save.mock.calls[0][1];
    ports.notify({ kind: "info", text: "delegated" });
    await ports.refresh();
    await ports.hydrateRmaSelection(target);
    await ports.cancelWork();
    expect(component.notice()?.text).toBe("delegated");
    removeResource();
    await component.save();
    await component.act(target, "approve");
    await component.revise(target);
    await component.confirmSuppression();
    await component.upload(event, false);
    await component.rejectFromChecker(target);
    expect(editor.save).toHaveBeenCalledTimes(1);
  });

  it("evaluates lifecycle permissions", () => {
    expect(component.canAct(row(), "submit")).toBe(true);
    expect(component.canAct(row({ status: "PENDING_APPROVAL" }), "approve")).toBe(true);
    expect(component.canAct(row({ status: "ACTIVE" }), "submit")).toBe(false);
    rma["x-lifecycle"] = [];
    expect(component.canAct(row(), "submit")).toBe(false);
    rma["x-lifecycle"] = ["submit", "approve"];
  });

  it("exports Excel and JSON with success, guards and failures", async () => {
    index.sortedRows.set([row()]);
    await component.exportExcel();
    expect(component.notice()?.text).toContain("Excel");
    const exportContext = exporter.excel.mock.calls[0][0];
    expect(exportContext.value(row(), "currency")).toBe("USD");
    component.exportJson();
    expect(component.notice()?.text).toContain("JSON");
    component.exportBusy.set(true);
    await component.exportExcel();
    component.exportJson();
    expect(exporter.excel).toHaveBeenCalledTimes(1);
    component.exportBusy.set(false);
    const consoleError = jest.spyOn(console, "error").mockImplementation();
    exporter.excel.mockRejectedValueOnce(new Error(" disk full "));
    await component.exportExcel();
    expect(component.notice()?.text).toContain("disk full");
    exporter.json.mockImplementationOnce(() => { throw "failure"; });
    component.exportJson();
    expect(component.notice()?.text).toContain("瀏覽器無法建立下載檔案");
    expect(consoleError).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
    removeResource();
    await component.exportExcel();
    component.exportJson();
  });

  it("formats values, columns, message previews and statuses", () => {
    expect(component.value(row({ status: "PENDING_APPROVAL" }), "status")).toBe("SUBMITTED");
    expect(component.value(row({ status: "WIP" }), "status")).toBe("IN PROGRESS");
    expect(component.value(row({ scope: "REUSABLE" }), "scope")).toBe("STANDING");
    expect(component.value(row({ scope: "TRANSACTION_ONLY" }), "scope")).toBe("TRANSACTION_SPECIFIC");
    expect(component.value(row({ tags: ["A", "B"] }), "tags")).toBe("A, B");
    expect(component.value(row({ missing: null }), "missing")).toBe("—");
    expect(component.columnValue(row(), { path: "currency", label: "Currency" })).toBe("USD");
    expect(component.columnValue(row(), { paths: ["currency", "status"], label: "Both" })).toBe("USD · DRAFT");
    expect(component.columnValue(row(), { paths: ["currency", "status"], separator: " / ", label: "Both" })).toBe("USD / DRAFT");
    expect(component.isRmaMessageColumn({ path: "messageTypes", label: "Messages" })).toBe(true);
    component.resourceId.set("entity");
    expect(component.isRmaMessageColumn({ path: "messageTypes", label: "Messages" })).toBe(false);
    component.resourceId.set("rma");
    expect(component.rmaMessagePreview(row({ messageTypes: "MT300" }))).toEqual(["MT300"]);
    expect(component.rmaMessagePreview(row({ messageTypes: [] }))).toEqual(["—"]);
    expect(component.rmaMessagePreview(row({ messageTypes: ["MT300", "", 4, "MT304"] }))).toEqual(["MT300", "MT304"]);
    expect(component.rmaMessagePreview(row({ messageTypes: ["MT300", "MT304", "MT700"] }))).toEqual(["MT300", "MT304", "..."]);
    expect(component.columnPath({ path: "status", label: "Status" })).toBe("status");
    expect(component.columnPath({ paths: ["currency"], label: "Currency" })).toBe("currency");
    expect(component.columnPath({ label: "Fallback" })).toBe("id");
    expect(component.displayStatus("PENDING_APPROVAL")).toBe("SUBMITTED");
    expect(component.displayStatus("ACTIVE")).toBe("ACTIVE");
    expect(component.currentStatusLabel(row())).toBeDefined();
    expect(component.currentStatusLabel(row({ currentStatus: "IN_PROGRESS" }))).toBe("In Progress");
  });

  it("derives action labels, request types and message changes", () => {
    expect(component.workflowActionLabel(row())).toBe("Submit");
    expect(component.workflowActionLabel(row({ status: "PENDING_APPROVAL" }))).toBe("Approve");
    expect(component.workflowActionLabel(row({ status: "ACTIVE" }))).toBe("");
    expect(component.editActionLabel(row())).toBe("Edit");
    expect(component.editActionLabel(row({ status: "WIP" }))).toBe("Edit");
    expect(component.editActionLabel(row({ changeType: "SUPPRESSION" }))).toBe("");
    expect(component.editActionLabel(row({ status: "ACTIVE", currentStatus: "EMPTY" }))).toBe("Revise");
    expect(component.editActionLabel(row({ status: "ACTIVE", currentStatus: "OPEN_REVISION" }))).toBe("");
    expect(component.canSuppress(row({ status: "ACTIVE", currentStatus: "EMPTY" }))).toBe(true);
    expect(component.canSuppress(row())).toBe(false);
    expect(component.canRevokeDraft(row())).toBe(true);
    expect(component.canRevokeDraft(row({ status: "ACTIVE" }))).toBe(false);
    expect(component.requestTypeLabel(row({ changeType: "SUPPRESSION" }))).toBe("SUPPRESSED");
    expect(component.requestTypeLabel(row({ changeType: "REVISION" }))).toBe("EDIT");
    expect(component.requestTypeLabel(row({ amendmentOfId: "OLD" }))).toBe("EDIT");
    expect(component.requestTypeLabel(row())).toBe("ADD");
    component.resourceId.set("entity");
    expect(component.messageTypeChanges(row())).toBeNull();
    component.resourceId.set("rma");
    for (const value of [null, "bad", []])
      expect(component.messageTypeChanges(row({ messageTypeChanges: value }))).toBeNull();
    expect(component.messageTypeChanges(row({
      messageTypeChanges: { unchanged: ["MT300", 1], added: ["MT304"], suppressed: "bad" },
    }))).toEqual({ unchanged: ["MT300"], added: ["MT304"], suppressed: [] });
  });

  it("sorts every virtual action column and dispatches index controls", () => {
    const target = row({ status: "ACTIVE", currentStatus: "EMPTY" });
    const sortValue = index.sortValue as (row: Row, path: string) => unknown;
    for (const path of ["__requestType", "__openRevisionStatus", "__workflowAction", "__editAction", "__revokeAction", "__revokeDraftAction", "currency"])
      expect(sortValue(target, path)).toBeDefined();
    expect(sortValue(row(), "__revokeAction")).toBe("");
    expect(sortValue(row({ status: "ACTIVE" }), "__revokeDraftAction")).toBe("");
    expect(component.isActionPresented("REVISE", target)).toBe(true);
    index.sortPath.set("__workflowAction");
    component.setStatusFilter("ACTIVE");
    expect(component.page()).toBe(1);
    component.movePage(1);
    component.toggleSort("currency");
    expect(component.sortIndicator("currency")).toBe("▲");
    expect(index.movePage).toHaveBeenCalledWith(1);
    expect(index.toggleSort).toHaveBeenCalledWith("currency");
  });

  it("configures picker callbacks and warns when companion RMA hydration fails", async () => {
    await component.view(row());
    const options = fieldMapper.fields.mock.calls.at(-1)?.[3];
    await component.initialise();
    const callbacks = fieldMapper.fields.mock.calls.at(-1)?.[3];
    expect(callbacks.editingId()).toBeNull();
    expect(callbacks.selectMessageTypes({}, "INBOUND")).toEqual(["MT300"]);
    callbacks.openBankPicker({ key: "bic" });
    expect(bankPicker.open).toHaveBeenCalled();
    expect(options).toBeUndefined();
    rmaSelection.hydrate.mockResolvedValueOnce(false);
    await component.view(row());
    expect(component.notice()).toEqual(expect.objectContaining({ kind: "warning" }));
    removeResource();
    await component.initialise();
  });

  it("invokes initialisation from ngOnInit", () => {
    const initialise = jest.spyOn(component, "initialise").mockResolvedValue(undefined);
    component.ngOnInit();
    expect(initialise).toHaveBeenCalled();
  });
});
