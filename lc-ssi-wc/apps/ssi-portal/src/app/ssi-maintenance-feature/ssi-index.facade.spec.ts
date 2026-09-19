import { of, Subject, throwError } from "rxjs";

type TestSignal<T> = (() => T) & {
  set(value: T): void;
  update(change: (value: T) => T): void;
};

function testSignal<T>(initial: T): TestSignal<T> {
  let current = initial;
  const read = (() => current) as TestSignal<T>;
  read.set = (value) => {
    current = value;
  };
  read.update = (change) => {
    current = change(current);
  };
  return read;
}

jest.mock("@angular/core", () => ({
  signal: testSignal,
  computed: (read: () => unknown) => read,
}));

import type { SsiMaintenanceApiService } from "../ssi-maintenance-api.service";
import type {
  SsiIndexSummary,
  SsiPage,
  SsiRow,
} from "../ssi-maintenance.types";
import { SsiIndexFacade } from "./ssi-index.facade";

const summary: SsiIndexSummary = {
  currentOwn: 2,
  pendingApproval: 1,
  active: 3,
  archived: 4,
};
const row: SsiRow = {
  id: "SSI-1",
  counterpartyId: "CP-BANK",
  scope: "STANDING",
  status: "ACTIVE",
  maker: "maker.demo",
  route: { currency: "USD" },
  version: 1,
};
const page: SsiPage = {
  items: [row],
  page: 2,
  pageSize: 10,
  totalItems: 11,
  totalPages: 2,
  hasPrevious: true,
  hasNext: false,
  distinctCurrencyCount: 1,
};

describe("SsiIndexFacade", () => {
  it("owns Dashboard summary, page and governed row presentation", () => {
    const facade = new SsiIndexFacade({} as SsiMaintenanceApiService);
    facade.ssiSummary.set(summary);
    facade.ssiIndexTotalPages.set(3);
    facade.rows.set([
      { ...row, currentStatus: "EMPTY" },
      { ...row, id: "SSI-DRAFT", status: "DRAFT", changeType: "REVISION" },
    ]);

    expect(facade.activeCount()).toBe(3);
    expect(facade.archivedCount()).toBe(4);
    expect(facade.indexTotalPages()).toBe(3);
    expect(facade.pagedVisibleRows()).toHaveLength(2);
    expect(facade.activeRows()).toHaveLength(1);
    expect(
      facade.isOwnershipActionPresented("REVISE", {
        ...row,
        currentStatus: "EMPTY",
      }),
    ).toBe(true);
    expect(
      facade.isOwnershipActionPresented("REVISE", {
        ...row,
        currentStatus: "IN_PROGRESS",
      }),
    ).toBe(false);
    expect(
      facade.ownershipCurrentStatusLabel({
        ...row,
        currentStatus: "DRAFTED",
      }),
    ).toBe("Drafted");
    expect(facade.requestTypeLabel(row)).toBe("ADD");
    expect(facade.requestTypeLabel({ ...row, changeType: "REVISION" })).toBe(
      "EDIT",
    );
  });

  it("owns Dashboard sort accessibility and direction presentation", () => {
    const facade = new SsiIndexFacade({} as SsiMaintenanceApiService);
    facade.counterpartyInboxSort.set("COUNTRY");
    facade.counterpartyInboxSortDirection.set("ASC");
    expect(facade.counterpartyAriaSort("COUNTRY")).toBe("ascending");
    expect(facade.counterpartySortIndicator("COUNTRY")).toBe("↑");
    expect(facade.counterpartyAriaSort("BIC_NAME")).toBe("none");
    facade.ownershipSort.set("STATUS");
    facade.ownershipSortDirection.set("DESC");
    expect(facade.ownershipAriaSort("STATUS")).toBe("descending");
    expect(facade.ownershipSortIndicator("STATUS")).toBe("↓");
    expect(facade.ownershipAriaSort("CURRENCY")).toBe("none");
  });

  it("owns Suppress/Revoke dialog state and the existing minimum reason gate", () => {
    const facade = new SsiIndexFacade({} as SsiMaintenanceApiService);
    facade.requestDelete(row);
    expect(facade.deleteTarget()).toBe(row);
    expect(facade.canConfirmDelete()).toBe(false);
    facade.deleteReason.set("valid reason");
    expect(facade.canConfirmDelete()).toBe(true);
    facade.closeDeleteDialog();
    expect(facade.deleteTarget()).toBeNull();
    expect(facade.deleteReason()).toBe("");
    facade.requestDraftRevoke(row);
    expect(facade.deleteTarget()).toBeNull();
    facade.requestDraftRevoke({ ...row, status: "DRAFT" });
    expect(facade.deleteTarget()?.status).toBe("DRAFT");
  });
  it("owns Dashboard inbox search, party type, sort and page transitions", () => {
    const facade = new SsiIndexFacade({} as SsiMaintenanceApiService);
    facade.counterpartyDirectory.set([
      {
        counterpartyId: "CP-1",
        name: "Alpha",
        country: "GB",
        partyType: "BANK",
      },
      {
        counterpartyId: "CP-2",
        name: "Beta",
        country: "US",
        partyType: "BANK",
      },
    ]);
    facade.counterpartyPartyType.set("BANK_NO_SSI");
    facade.counterpartyInboxPage.set(2);
    facade.searchCounterpartyInbox("Beta");
    expect(facade.counterpartyInboxSearch()).toBe("Beta");
    expect(facade.counterpartyInboxPage()).toBe(1);
    facade.selectCounterpartyPartyType("CUSTOMER");
    expect(facade.selectedCounterpartyId()).toBe("");
    expect(facade.counterpartyInbox()).toEqual([]);
    facade.sortCounterpartyInbox("COUNTRY");
    expect(facade.counterpartyInboxSort()).toBe("COUNTRY");
    expect(facade.counterpartyInboxSortDirection()).toBe("ASC");
    facade.sortCounterpartyInbox("COUNTRY");
    expect(facade.counterpartyInboxSortDirection()).toBe("DESC");
    facade.moveCounterpartyInboxPage(10);
    expect(facade.counterpartyInboxPage()).toBe(1);
  });

  it("owns SSI index filter and counterparty drill-down state while leaving refresh to caller", () => {
    const facade = new SsiIndexFacade({} as SsiMaintenanceApiService);
    facade.counterpartyDirectory.set([
      {
        counterpartyId: "CP-1",
        name: "Alpha",
        country: "GB",
        partyType: "BANK",
      },
    ]);
    facade.counterpartyPartyType.set("BANK_NO_SSI");
    expect(facade.openCounterpartySsi("CP-1")).toBe(false);
    facade.counterpartyCoverage.set([
      {
        counterpartyId: "CP-1",
        ssiCount: 1,
        currencyCount: 1,
        statuses: ["ACTIVE"],
        lastVerified: "2026-09-18",
      },
    ]);
    facade.counterpartyPartyType.set("BANK_SSI");
    expect(facade.openCounterpartySsi("CP-1")).toBe(true);
    expect(facade.selectedCounterpartyId()).toBe("CP-1");
    expect(facade.ownershipStatus()).toBe("ACTIVE");
    expect(facade.ownershipSort()).toBe("CURRENCY");
    facade.closeCounterpartySsi();
    expect(facade.selectedCounterpartyId()).toBe("");
    facade.selectOwnershipTab("COUNTERPARTY");
    expect(facade.ownershipSort()).toBe("CURRENCY");
    facade.searchOwnershipIndex("bank");
    expect(facade.ownershipSearch()).toBe("bank");
    expect(facade.indexPage()).toBe(1);
  });
  it("loads directory before coverage and projects the current BANK_SSI inbox", async () => {
    const calls: string[] = [];
    const directory = [
      {
        counterpartyId: "CP-1",
        bic: "BARCGB22",
        name: "Barclays",
        country: "GB",
        partyType: "BANK" as const,
      },
    ];
    const coverage = [
      {
        counterpartyId: "BARCGB22",
        ssiCount: 2,
        currencyCount: 1,
        statuses: ["ACTIVE"],
        lastVerified: "2026-09-18",
      },
    ];
    const facade = new SsiIndexFacade({
      lookupCounterparties: () => {
        calls.push("directory");
        return of({ items: directory });
      },
      counterpartyCoverage: () => {
        calls.push("coverage");
        return of(coverage);
      },
    } as unknown as SsiMaintenanceApiService);
    expect(await facade.loadCounterpartyDirectory()).toBe("applied");
    expect(calls).toEqual(["directory", "coverage"]);
    expect(facade.counterpartyInbox()).toEqual([
      expect.objectContaining({ counterpartyId: "CP-1", ssiCount: 2 }),
    ]);
    expect(facade.counterpartyDirectoryLoading()).toBe(false);
  });

  it("fails closed on directory or coverage error and clears stale inbox data", async () => {
    const facade = new SsiIndexFacade({
      lookupCounterparties: () => throwError(() => new Error("offline")),
      counterpartyCoverage: () => of([]),
    } as unknown as SsiMaintenanceApiService);
    facade.counterpartyDirectory.set([
      { counterpartyId: "OLD", name: "Old", country: "GB", partyType: "BANK" },
    ]);
    expect(await facade.loadCounterpartyDirectory()).toBe("error");
    expect(facade.counterpartyDirectory()).toEqual([]);
    expect(facade.counterpartyCoverage()).toEqual([]);
    expect(facade.counterpartyDirectoryLoading()).toBe(false);
  });
  it("owns SSI state-changing action payloads without changing actor selection", async () => {
    const act = jest.fn(() => of({}));
    const revokeDraft = jest.fn(() => of({}));
    const suppress = jest.fn(() => of({}));
    const facade = new SsiIndexFacade({
      act,
      revokeDraft,
      suppress,
    } as unknown as SsiMaintenanceApiService);
    await facade.applyAction(row, "submit");
    await facade.applyAction(row, "approve");
    await facade.revokeOrSuppress({ ...row, status: "DRAFT" }, "reason one");
    await facade.revokeOrSuppress(row, "reason two");
    expect(act.mock.calls).toEqual([
      ["SSI-1", "submit", "maker.demo"],
      ["SSI-1", "approve", "checker.demo"],
    ]);
    expect(revokeDraft).toHaveBeenCalledWith(
      "SSI-1",
      "maker.demo",
      "reason one",
    );
    expect(suppress).toHaveBeenCalledWith(
      "SSI-1",
      "maker.suppression",
      "reason two",
    );
  });
  it("issues the existing list then summary calls and projects the authoritative server page", async () => {
    const calls: string[] = [];
    const list = jest.fn((query: URLSearchParams) => {
      calls.push(`list:${query.toString()}`);
      return of(page);
    });
    const getSummary = jest.fn(() => {
      calls.push("summary");
      return of(summary);
    });
    const facade = new SsiIndexFacade({
      list,
      summary: getSummary,
    } as unknown as SsiMaintenanceApiService);
    facade.ownershipStatus.set("ACTIVE");
    facade.ownershipTab.set("COUNTERPARTY");
    facade.ownershipSort.set("CURRENCY");
    facade.indexPage.set(2);
    facade.selectedCounterpartyId.set("CP-BANK");

    expect(await facade.refresh()).toBe("applied");
    expect(calls).toEqual([
      "list:status=ACTIVE&page=2&pageSize=10&sortBy=CURRENCY&sortDirection=ASC&ownershipType=COUNTERPARTY&counterpartyId=CP-BANK",
      "summary",
    ]);
    expect(facade.rows()).toEqual([row]);
    expect(facade.ssiIndexTotalItems()).toBe(11);
    expect(facade.ssiIndexTotalPages()).toBe(2);
    expect(facade.ssiIndexDistinctCurrencyCount()).toBe(1);
    expect(facade.ssiSummary()).toEqual(summary);
    expect(facade.ssiIndexLoading()).toBe(false);
  });

  it("ignores an older response after a newer list request wins", async () => {
    const older = new Subject<SsiPage>();
    const list = jest
      .fn()
      .mockReturnValueOnce(older)
      .mockReturnValueOnce(of(page));
    const facade = new SsiIndexFacade({
      list,
      summary: () => of(summary),
    } as unknown as SsiMaintenanceApiService);
    const first = facade.refresh();
    const second = facade.refresh();
    expect(await second).toBe("applied");
    older.next({ ...page, items: [], totalItems: 0 });
    older.complete();
    expect(await first).toBe("stale");
    expect(facade.rows()).toEqual([row]);
  });

  it("retains current rows and releases loading on an API error", async () => {
    const facade = new SsiIndexFacade({
      list: () => throwError(() => new Error("offline")),
      summary: () => of(summary),
    } as unknown as SsiMaintenanceApiService);
    facade.rows.set([row]);
    expect(await facade.refresh()).toBe("error");
    expect(facade.rows()).toEqual([row]);
    expect(facade.ssiIndexLoading()).toBe(false);
  });
});
