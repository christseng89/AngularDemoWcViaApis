import { DatabaseSync } from "node:sqlite";
import { ResolutionCurrencyStore } from "./resolution-currency-store";

describe("ResolutionCurrencyStore", () => {
  let db: DatabaseSync;
  let store: ResolutionCurrencyStore;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    store = new ResolutionCurrencyStore(db);
  });
  afterEach(() => db.close());

  it("stores sorted active domain currencies and retains inactive inquiry rows", () => {
    db.exec("BEGIN IMMEDIATE");
    store.apply(
      "SR2026",
      [
        {
          standardsRelease: "SR2026",
          businessDomain: "PAYMENT",
          currency: "USD",
        },
        {
          standardsRelease: "SR2026",
          businessDomain: "PAYMENT",
          currency: "EUR",
        },
      ],
      "APPROVAL_DISCOVERY",
      "2026-09-20T00:00:00.000Z",
      "2026-09-15",
    );
    db.exec("COMMIT");
    expect(store.active("SR2026", "PAYMENT")).toEqual(["EUR", "USD"]);

    db.exec("BEGIN IMMEDIATE");
    expect(
      store.apply(
        "SR2026",
        [
          {
            standardsRelease: "SR2026",
            businessDomain: "PAYMENT",
            currency: "USD",
          },
        ],
        "FULL_RESYNC",
        "2026-09-20T01:00:00.000Z",
        "2026-09-15",
      ),
    ).toEqual({
      discovered: 1,
      inserted: 0,
      unchanged: 1,
      activated: 0,
      inactivated: 1,
    });
    db.exec("COMMIT");
    expect(store.active("SR2026", "PAYMENT")).toEqual(["USD"]);
    expect(store.syncState("SR2026")).toEqual({
      initialized: true,
      asOfDate: "2026-09-15",
      lastManualResyncAt: "2026-09-20T01:00:00.000Z",
    });
    expect(
      store
        .inquiry("SR2026")
        .map(({ currency, status }) => ({ currency, status })),
    ).toEqual([
      { currency: "EUR", status: "INACTIVE" },
      { currency: "USD", status: "ACTIVE" },
    ]);
  });

  it("keeps inactive coverage inactive during approval discovery", () => {
    db.exec("BEGIN IMMEDIATE");
    store.apply(
      "SR2026",
      [
        {
          standardsRelease: "SR2026",
          businessDomain: "TREASURY",
          currency: "JPY",
        },
      ],
      "FULL_RESYNC",
      "2026-09-20T00:00:00.000Z",
      "2026-09-15",
    );
    store.apply(
      "SR2026",
      [],
      "FULL_RESYNC",
      "2026-09-20T01:00:00.000Z",
      "2026-09-15",
    );
    expect(
      store.apply(
        "SR2026",
        [
          {
            standardsRelease: "SR2026",
            businessDomain: "TREASURY",
            currency: "JPY",
          },
        ],
        "APPROVAL_DISCOVERY",
        "2026-09-20T02:00:00.000Z",
        "2026-09-15",
      ).inserted,
    ).toBe(0);
    db.exec("COMMIT");
    expect(store.active("SR2026", "TREASURY")).toEqual([]);
  });

  it("records the latest reconciliation as-of date on a subsequent resync", () => {
    db.exec("BEGIN IMMEDIATE");
    store.apply("SR2026", [], "FULL_RESYNC", "2026-09-20T00:00:00.000Z", "2026-09-15");
    store.apply("SR2026", [], "FULL_RESYNC", "2026-09-21T00:00:00.000Z", "2026-09-21");
    db.exec("COMMIT");
    expect(store.syncState("SR2026")?.asOfDate).toBe("2026-09-21");
  });

  it("filters, counts and paginates inquiry in SQLite", () => {
    db.exec("BEGIN IMMEDIATE");
    store.apply("SR2026", [
      { standardsRelease: "SR2026", businessDomain: "PAYMENT", currency: "USD" },
      { standardsRelease: "SR2026", businessDomain: "PAYMENT", currency: "EUR" },
      { standardsRelease: "SR2026", businessDomain: "PAYMENT", currency: "GBP" },
      { standardsRelease: "SR2026", businessDomain: "TREASURY", currency: "USD" },
    ], "FULL_RESYNC", "2026-09-20T00:00:00.000Z", "2026-09-15");
    db.exec("COMMIT");
    expect(store.inquiryPage("SR2026", { businessDomain: "PAYMENT", page: 2, pageSize: 2 }))
      .toMatchObject({ totalItems: 3, totalPages: 2, page: 2, items: [{ currency: "USD" }] });
    expect(store.inquiryPage("SR2026", { search: "GB", page: 1, pageSize: 10 }))
      .toMatchObject({ totalItems: 1, items: [{ businessDomain: "PAYMENT", currency: "GBP" }] });
    expect(store.inquiryPage("SR2026", { businessDomain: "PAYMENT", page: 1, pageSize: 2, sortBy: "currency", sortDirection: "desc" }).items.map(({ currency }) => currency))
      .toEqual(["USD", "GBP"]);
  });
});
