import { of, throwError } from "rxjs";

type TestSignal<T> = (() => T) & {
  set(value: T): void;
  update(updater: (value: T) => T): void;
};

function testSignal<T>(initial: T): TestSignal<T> {
  let value = initial;
  const read = (() => value) as TestSignal<T>;
  read.set = (next) => {
    value = next;
  };
  read.update = (updater) => {
    value = updater(value);
  };
  return read;
}

const rows = [
  { id: 1, action: "UPDATED", actor: "maker", occurred_at: "2026-09-19" },
];
const lifecycle = {
  status: "UP" as const,
  onlineQueryDays: 7,
  archiveAfterDays: 14,
  archiveRetentionDays: 365,
  scheduleIntervalHours: 12,
};
const api = {
  events: jest.fn(() => of(rows)),
  lifecycle: jest.fn(() => of(lifecycle)),
  contract: jest.fn(() =>
    of({ "x-ui-resources": [{ id: "rma", fields: [] }] }),
  ),
};
const session = {
  tab: testSignal<"rma" | "entity" | "nostro" | "ssi">("rma"),
  sortKey: testSignal<"title" | "actor" | "occurredAt">("title"),
  sortDirection: testSignal<"asc" | "desc">("asc"),
  indexSortPath: testSignal<string | null>(null),
};

jest.mock("@angular/core", () => ({
  Injectable: () => (target: unknown) => target,
  computed: <T>(calculation: () => T) => calculation,
  inject: (token: { name: string }) =>
    token.name === "AuditSessionState" ? session : api,
  signal: testSignal,
}));
jest.mock("../../../app/audit-feature/audit-api.service", () => ({ AuditApiService: class {} }));

import { AuditFacade } from "../../../app/audit-feature/audit.facade";

describe("AuditFacade", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.events.mockImplementation(() => of(rows));
    api.lifecycle.mockImplementation(() => of(lifecycle));
    api.contract.mockImplementation(() =>
      of({ "x-ui-resources": [{ id: "rma", fields: [] }] }),
    );
    session.tab.set("rma");
    session.sortKey.set("title");
    session.sortDirection.set("asc");
    session.indexSortPath.set(null);
  });

  it("loads the three existing sources only after feature entry", async () => {
    const audit = new AuditFacade();
    expect(audit.tab()).toBe("rma");
    expect(api.events).not.toHaveBeenCalled();
    await audit.load();
    expect(api.events).toHaveBeenCalledWith("rma");
    expect(api.lifecycle).toHaveBeenCalledTimes(1);
    expect(api.contract).toHaveBeenCalledTimes(1);
    expect(audit.rows()).toEqual(rows);
    expect(audit.onlineQueryDays()).toBe(7);
    expect(audit.loading()).toBe(false);
  });

  it("changes governed Audit tab and resets paging without retaining stale detail", async () => {
    const audit = new AuditFacade();
    audit.currentPage.set(3);
    await audit.selectTab("entity");
    expect(api.events).toHaveBeenCalledWith("entity");
    expect(audit.tab()).toBe("entity");
    expect(audit.currentPage()).toBe(1);
    expect(audit.detail()).toBeNull();
  });

  it("retains the chosen tab and sort across lazy-route re-entry without retaining rows", async () => {
    const first = new AuditFacade();
    await first.selectTab("entity");
    first.sortBy("actor");
    first.sortIndex("status");
    const second = new AuditFacade();
    expect(second.tab()).toBe("entity");
    expect(second.sortKey()).toBe("actor");
    expect(second.indexSortPath()).toBe("status");
    expect(second.rows()).toEqual([]);
    await second.load();
    expect(api.events).toHaveBeenLastCalledWith("entity");
  });

  it("presents the existing unavailable state on read failure", async () => {
    api.events.mockImplementationOnce(() =>
      throwError(() => new Error("offline")),
    );
    const audit = new AuditFacade();
    await audit.load();
    expect(audit.error()).toBe("AUDIT_SERVICE_UNAVAILABLE");
    expect(audit.loading()).toBe(false);
  });

  it("preserves SSI Audit sorting, paging and governed snapshot handoff", () => {
    const audit = new AuditFacade();
    audit.tab.set("ssi");
    audit.rows.set(
      Array.from({ length: 11 }, (_, index) => ({
        id: index + 1,
        ssi_id: `SSI-${index + 1}`,
        action: index % 2 === 0 ? "UPDATED" : "ACTIVATE",
        actor: `operator.${index + 1}`,
        occurred_at: `2026-09-10T00:${String(index).padStart(2, "0")}:00Z`,
        payload: JSON.stringify({
          id: `SSI-${index + 1}`,
          counterpartyId: `BANK-${index + 1}`,
          scope: "STANDING",
          status: "ACTIVE",
          maker: `operator.${index + 1}`,
          route: { currency: "USD", counterpartyType: "BANK" },
          version: 1,
        }),
      })),
    );
    expect(audit.totalPages()).toBe(2);
    audit.sortBy("actor");
    expect(audit.ariaSort("actor")).toBe("ascending");
    audit.movePage(1);
    expect(audit.currentPage()).toBe(2);
    const detail = audit.pagedRows()[0]!;
    expect(audit.openDetail(detail)?.id).toBe(detail.ssiId);
    expect(audit.detail()).toBeNull();
  });

  it("presents every governed resource label and sort state", () => {
    const audit = new AuditFacade();
    for (const [tab, label] of [
      ["rma", "RMA"],
      ["entity", "Entities"],
      ["nostro", "Nostro"],
      ["ssi", "SSI"],
    ] as const) {
      audit.tab.set(tab);
      expect(audit.resourceLabel()).toBe(label);
    }

    expect(audit.ariaSort("actor")).toBe("none");
    audit.sortBy("actor");
    expect(audit.ariaSort("actor")).toBe("ascending");
    audit.sortBy("actor");
    expect(audit.ariaSort("actor")).toBe("descending");
    audit.sortBy("actor");
    expect(audit.ariaSort("actor")).toBe("ascending");
    audit.sortIndex("status");
    expect(audit.indexSortPath()).toBe("status");
    expect(audit.sortDirection()).toBe("asc");
    audit.sortIndex("status");
    expect(audit.sortDirection()).toBe("desc");
    audit.sortIndex("status");
    expect(audit.sortDirection()).toBe("asc");
  });

  it("maps governed detail and field metadata without inventing defaults", () => {
    const audit = new AuditFacade();
    expect(audit.detailRecord()).toEqual({});
    expect(audit.detailStatus()).toBe("");
    expect(audit.detailVersion()).toBe(0);
    audit.currencyOptions.set([{ code: "JPY", decimals: 0 }]);
    audit.parameterFields.set([
      {
        key: "currency",
        label: "Currency",
        type: "select",
        required: true,
        inputType: "text",
        description: "Governed currency",
        pattern: "^[A-Z]{3}$",
        minLength: 3,
        maxLength: 3,
        minimum: 1,
        maximum: 9,
        optionsSource: "reference/currencies",
      },
      {
        key: "messageTypes",
        label: "Message Types",
        type: "multicheckbox",
        options: ["MT202", "MT202COV"],
      },
    ]);

    expect(audit.detailFields()).toEqual([
      expect.objectContaining({
        key: "currency",
        props: expect.objectContaining({
          required: true,
          options: [{ label: "JPY · 0 decimals", value: "JPY" }],
          type: "text",
          description: "Governed currency",
          pattern: "^[A-Z]{3}$",
          minLength: 3,
          maxLength: 3,
          min: 1,
          max: 9,
        }),
      }),
      expect.objectContaining({
        key: "messageTypes",
        props: expect.objectContaining({
          options: [
            { label: "MT202", value: "MT202" },
            { label: "MT202COV", value: "MT202COV" },
          ],
          description: "受控 Message Types；按 View Message Types 查看完整選擇。",
        }),
      }),
    ]);

    const detail = {
      eventId: "1",
      ssiId: "RMA-1",
      title: "Updated",
      summary: "Updated",
      action: "UPDATED",
      actor: "maker",
      occurredAt: "2026-09-21T00:00:00Z",
      before: null,
      after: {
        status: "ACTIVE",
        version: 2,
        messageTypes: ["MT202", "MT202COV"],
      },
      changedFields: null,
      provenance: null,
      rawPayload: null,
    } as const;
    expect(audit.openDetail(detail)).toBeNull();
    expect(audit.detail()).toBe(detail);
    expect(audit.detailStatus()).toBe("ACTIVE");
    expect(audit.detailVersion()).toBe(2);
    expect(audit.detailModel()["messageTypes"]).toBe("MT202, MT202COV");
    expect(audit.snapshot(detail)).toEqual(detail.after);
    audit.detail.set({ ...detail, after: "not-an-object" });
    expect(audit.detailRecord()).toEqual({});
    expect(audit.detailModel()).toEqual({});
  });

  it("sorts governed records by an index path and projects index cells", () => {
    const audit = new AuditFacade();
    audit.rows.set([
      {
        id: 2,
        action: "UPDATED",
        actor: "zeta",
        occurred_at: "2026-09-21T02:00:00Z",
        payload: JSON.stringify({ after: { status: "SUSPENDED", maker: "zeta", checker: "checker", updatedAt: "2026-09-21" } }),
      },
      {
        id: 1,
        action: "CREATED",
        actor: "alpha",
        occurred_at: "2026-09-21T01:00:00Z",
        payload: JSON.stringify({ after: { status: "ACTIVE", maker: "alpha", createdAt: "2026-09-20" } }),
      },
    ]);
    audit.indexSortPath.set("status");

    expect(audit.sortedRows().map(({ eventId }) => eventId)).toEqual(["1", "2"]);
    expect(audit.indexRows()).toHaveLength(2);
    expect(audit.indexRows()[1]?.trailing).toEqual([
      "zeta",
      "2026-09-21",
      "checker",
      "2026-09-21T02:00:00Z",
    ]);
    audit.sortDirection.set("desc");
    expect(audit.sortedRows().map(({ eventId }) => eventId)).toEqual(["2", "1"]);
    audit.currentPage.set(2);
    audit.movePage(10);
    expect(audit.currentPage()).toBe(1);
    audit.movePage(-10);
    expect(audit.currentPage()).toBe(1);
  });

  it("extracts only valid message-type changes", () => {
    const audit = new AuditFacade();
    const base = {
      eventId: "1",
      ssiId: "RMA-1",
      title: "Updated",
      summary: "Updated",
      action: "UPDATED",
      actor: "maker",
      occurredAt: "2026-09-21",
      before: null,
      after: null,
      provenance: null,
      rawPayload: null,
    };

    expect(audit.messageTypeChanges({ ...base, changedFields: null })).toBeNull();
    expect(audit.messageTypeChanges({ ...base, changedFields: { messageTypes: [] } })).toBeNull();
    expect(
      audit.messageTypeChanges({
        ...base,
        changedFields: {
          messageTypes: {
            unchanged: ["MT202", 1],
            added: ["MT202COV"],
            suppressed: "MT205",
          },
        },
      }),
    ).toEqual({ unchanged: ["MT202"], added: ["MT202COV"], suppressed: [] });
  });

  it("covers empty options, operational issues, and invalid SSI snapshots", () => {
    const audit = new AuditFacade();
    expect(audit.issue()).toBeNull();
    audit.error.set("AUDIT_SERVICE_UNAVAILABLE");
    expect(audit.issue()).not.toBeNull();
    audit.parameterFields.set([{ key: "plain", label: "Plain", type: "input" }]);
    expect(audit.detailFields()[0]?.props?.options).toEqual([]);
    audit.tab.set("ssi");
    const invalid = {
      eventId: "missing",
      ssiId: "missing",
      title: "Missing",
      summary: "Missing",
      action: "UPDATED",
      actor: "maker",
      occurredAt: "2026-09-21",
      before: null,
      after: null,
      changedFields: null,
      provenance: null,
      rawPayload: null,
    };
    expect(audit.openDetail(invalid)).toBeNull();
    expect(audit.detail()).toBe(invalid);
    audit.rows.set([{ id: "missing", action: "UPDATED", payload: null }]);
    audit.indexSortPath.set("status");
    expect(audit.sortedRows()).toHaveLength(1);
  });
});
