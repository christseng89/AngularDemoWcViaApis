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

const ssi = {
  id: "SSI-PENDING-1",
  counterpartyId: "BANK-1",
  scope: "STANDING",
  status: "PENDING_APPROVAL",
  maker: "maker.demo",
  route: { currency: "USD" },
  version: 1,
};
const api = {
  pendingSsi: jest.fn(() => of([ssi])),
  summary: jest.fn(() =>
    of({ currentOwn: 0, pendingApproval: 1, active: 0, archived: 0 }),
  ),
  governedContract: jest.fn(() =>
    of({
      "x-ui-resources": [
        {
          id: "rma",
          label: "RMA",
          endpoint: "rma-authorisations",
          "x-lifecycle": ["approve"],
        },
        {
          id: "ssi",
          label: "SSI",
          endpoint: "ssis",
          "x-lifecycle": ["approve"],
        },
        {
          id: "readonly",
          label: "Read only",
          endpoint: "readonly",
          "x-lifecycle": [],
        },
      ],
    }),
  ),
  governedPending: jest.fn(() =>
    of([
      {
        id: "RMA-1",
        status: "PENDING_APPROVAL",
        maker: "maker.demo",
        version: 1,
      },
    ]),
  ),
  decideSsi: jest.fn(() => of({})),
};
const session = {
  tab: testSignal<"rma" | "entity" | "nostro" | "ssi">("rma"),
  sortPath: testSignal<string | null>(null),
  sortDirection: testSignal<"asc" | "desc">("asc"),
  currentPage: testSignal(1),
};

jest.mock("@angular/core", () => ({
  Injectable: () => (target: unknown) => target,
  computed: <T>(calculation: () => T) => calculation,
  inject: (token: { name: string }) =>
    token.name === "CheckerSessionState" ? session : api,
  signal: testSignal,
}));
jest.mock("./checker-api.service", () => ({ CheckerApiService: class {} }));

import { CheckerFacade } from "./checker.facade";

describe("CheckerFacade", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.pendingSsi.mockImplementation(() => of([ssi]));
    api.governedPending.mockImplementation(() =>
      of([
        {
          id: "RMA-1",
          status: "PENDING_APPROVAL",
          maker: "maker.demo",
          version: 1,
        },
      ]),
    );
    api.decideSsi.mockImplementation(() => of({}));
    session.tab.set("rma");
    session.sortPath.set(null);
    session.sortDirection.set("asc");
    session.currentPage.set(1);
  });

  it("loads the existing SSI and governed queues only on feature entry", async () => {
    const checker = new CheckerFacade();
    expect(api.pendingSsi).not.toHaveBeenCalled();
    await checker.load();
    expect(api.pendingSsi).toHaveBeenCalledTimes(1);
    expect(api.summary).toHaveBeenCalledTimes(1);
    expect(api.governedContract).toHaveBeenCalledTimes(1);
    expect(api.governedPending).toHaveBeenCalledWith("rma-authorisations");
    expect(checker.pending()).toEqual([ssi]);
    expect(checker.count()).toBe(2);
    expect(checker.loading()).toBe(false);
  });

  it("keeps tab/sort choices but not stale queue rows on lazy-route re-entry", async () => {
    const first = new CheckerFacade();
    await first.load();
    first.selectTab("ssi");
    first.sortIndex("status");
    first.currentPage.set(2);
    const second = new CheckerFacade();
    expect(second.tab()).toBe("ssi");
    expect(second.sortPath()).toBe("status");
    expect(second.currentPage()).toBe(2);
    expect(second.rows()).toEqual([]);
    await second.load();
    expect(second.pending()).toHaveLength(1);
  });

  it("fails closed on queue read errors", async () => {
    api.pendingSsi.mockImplementationOnce(() =>
      throwError(() => new Error("offline")),
    );
    const checker = new CheckerFacade();
    await checker.load();
    expect(checker.pending()).toEqual([]);
    expect(checker.warning()).toContain("BFF");
    expect(checker.loading()).toBe(false);
  });

  it("rejects a short reason locally and posts the exact approved decision", async () => {
    const checker = new CheckerFacade();
    expect(await checker.decide(ssi, "reject", "bad")).toBe(false);
    expect(api.decideSsi).not.toHaveBeenCalled();
    expect(await checker.decide(ssi, "reject", "wrong account")).toBe(true);
    expect(api.decideSsi).toHaveBeenCalledWith(
      "SSI-PENDING-1",
      "reject",
      "wrong account",
    );
    expect(api.pendingSsi).toHaveBeenCalledTimes(1);
  });
});
