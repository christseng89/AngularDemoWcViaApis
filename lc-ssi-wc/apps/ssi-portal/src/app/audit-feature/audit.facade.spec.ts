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

jest.mock("@angular/core", () => ({
  Injectable: () => (target: unknown) => target,
  computed: <T>(calculation: () => T) => calculation,
  inject: () => api,
  signal: testSignal,
}));
jest.mock("./audit-api.service", () => ({ AuditApiService: class {} }));

import { AuditFacade } from "./audit.facade";

describe("AuditFacade", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.events.mockImplementation(() => of(rows));
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
});
