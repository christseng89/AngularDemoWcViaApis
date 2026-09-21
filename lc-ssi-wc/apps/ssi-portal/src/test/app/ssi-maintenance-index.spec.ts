import {
  buildCounterpartyInbox,
  pageItems,
  queryCounterpartyInbox,
  sortSsiOwnershipRows,
} from "../../app/ssi-maintenance-index";

describe("Counterparty Inbox query model", () => {
  const banks = Array.from({ length: 205 }, (_, index) => ({
    bic: `T${String(index).padStart(3, "0")}USN1`,
    counterpartyId: `T${String(index).padStart(3, "0")}USN1`,
    name: `Demo Bank ${String(index).padStart(3, "0")}`,
    country: index % 2 ? "US" : "GB",
    partyType: "BANK" as const,
  }));
  const ssis = banks.slice(0, 3).map((bank, index) => ({
    counterpartyId: bank.bic,
    ssiCount: 2,
    currencyCount: 2,
    statuses: ["ACTIVE", "DRAFT"],
    lastVerified: `2026-09-0${index + 2}`,
  }));

  it("builds one row per Bank Directory counterparty, including zero coverage", () => {
    const inbox = buildCounterpartyInbox(banks, ssis);
    expect(inbox).toHaveLength(205);
    expect(inbox[0]).toMatchObject({ ssiCount: 2, currencyCount: 2 });
    expect(inbox.at(-1)).toMatchObject({
      ssiCount: 0,
      evidenceSummary: "NO SSI COVERAGE",
    });
  });

  it("exposes SSI coverage so the UI can separate covered and uncovered bank tabs", () => {
    const inbox = buildCounterpartyInbox(banks, ssis);
    expect(inbox.filter((item) => item.ssiCount > 0)).toHaveLength(3);
    expect(inbox.filter((item) => item.ssiCount === 0)).toHaveLength(202);
  });

  it("searches BIC/name/country, sorts, and pages ten without rendering all rows", () => {
    const inbox = buildCounterpartyInbox(banks, ssis);
    expect(
      queryCounterpartyInbox(inbox, "Demo Bank 120", "BIC_NAME"),
    ).toHaveLength(1);
    expect(
      queryCounterpartyInbox(inbox, "GB", "BIC_NAME").every(
        (item) => item.country === "GB",
      ),
    ).toBe(true);
    expect(
      pageItems(queryCounterpartyInbox(inbox, "", "SSI_COUNT", "DESC"), 2),
    ).toHaveLength(10);
    expect(pageItems(inbox, 21)).toHaveLength(5);
  });

  it("sorts inbox text stably, counts numerically, and verification dates chronologically in both directions", () => {
    const items = [
      {
        counterpartyId: "ZZZZGB2X",
        bic: "ZZZZGB2X",
        name: "alpha bank",
        country: "gb",
        partyType: "BANK" as const,
        ssiCount: 10,
        currencyCount: 2,
        statuses: ["ACTIVE"],
        lastVerified: "2026-10-02",
        evidenceSummary: "ACTIVE",
      },
      {
        counterpartyId: "AAAAUSN1",
        bic: "AAAAUSN1",
        name: "Beta Bank",
        country: "US",
        partyType: "BANK" as const,
        ssiCount: 2,
        currencyCount: 11,
        statuses: [],
        lastVerified: "2026-02-12",
        evidenceSummary: "NO SSI COVERAGE",
      },
    ];
    expect(
      queryCounterpartyInbox(items, "", "SSI_COUNT", "ASC").map(
        (item) => item.ssiCount,
      ),
    ).toEqual([2, 10]);
    expect(
      queryCounterpartyInbox(items, "", "CURRENCY_COUNT", "DESC").map(
        (item) => item.currencyCount,
      ),
    ).toEqual([11, 2]);
    expect(
      queryCounterpartyInbox(items, "", "LAST_VERIFIED", "ASC").map(
        (item) => item.bic,
      ),
    ).toEqual(["AAAAUSN1", "ZZZZGB2X"]);
    expect(
      queryCounterpartyInbox(items, "", "BIC_NAME", "DESC").map(
        (item) => item.bic,
      ),
    ).toEqual(["ZZZZGB2X", "AAAAUSN1"]);
  });

  it("supports an internal Customer ID without treating it as a SWIFT BIC", () => {
    const customers = [
      {
        counterpartyId: "CUST-00001",
        name: "Demo Global Trading Ltd.",
        country: "HK",
        partyType: "CUSTOMER" as const,
      },
    ];
    const inbox = buildCounterpartyInbox(customers, [
      {
        counterpartyId: "CUST-00001",
        ssiCount: 1,
        currencyCount: 1,
        statuses: ["ACTIVE"],
        lastVerified: "2026-09-09",
      },
    ]);

    expect(inbox).toEqual([
      expect.objectContaining({
        counterpartyId: "CUST-00001",
        ssiCount: 1,
        currencyCount: 1,
      }),
    ]);
    expect(inbox[0]).not.toHaveProperty("bic");
  });

  it("sorts SSI priorities and versions numerically and effective dates by validTo", () => {
    const rows = [
      {
        id: "b",
        scope: "PAYMENT",
        status: "ACTIVE",
        version: 10,
        route: {
          priority: "10",
          validFrom: "2026-02-01",
          validTo: "2029-12-31",
        },
      },
      {
        id: "a",
        scope: "PAYMENT",
        status: "ACTIVE",
        version: 2,
        route: {
          priority: "2",
          validFrom: "2026-10-01",
          validTo: "2027-12-31",
        },
      },
    ];
    expect(
      sortSsiOwnershipRows(rows, "ROUTE_PRIORITY", "ASC").map((row) => row.id),
    ).toEqual(["a", "b"]);
    expect(
      sortSsiOwnershipRows(rows, "VERSION", "DESC").map((row) => row.version),
    ).toEqual([10, 2]);
    expect(
      sortSsiOwnershipRows(rows, "EFFECTIVE_PERIOD", "ASC").map(
        (row) => row.id,
      ),
    ).toEqual(["a", "b"]);

    const requests = [
      { ...rows[0], id: "suppression", changeType: "SUPPRESSION" as const },
      { ...rows[0], id: "new" },
      {
        ...rows[0],
        id: "revision",
        changeType: "REVISION" as const,
        amendmentOfId: "source",
      },
    ];
    expect(
      sortSsiOwnershipRows(requests, "REQUEST_TYPE", "ASC").map(
        (row) => row.id,
      ),
    ).toEqual(["new", "revision", "suppression"]);
  });

  it("sorts the additive SSI ID index column", () => {
    const rows = [
      {
        id: "2",
        counterpartyId: "CP-ANY-SGD",
        scope: "STANDING",
        status: "ACTIVE",
        version: 1,
        route: {},
      },
      {
        id: "1",
        counterpartyId: "CP-ANY-AUD",
        scope: "STANDING",
        status: "ACTIVE",
        version: 1,
        route: {},
      },
    ];

    expect(
      sortSsiOwnershipRows(rows, "SSI_ID", "ASC").map(
        (row) => row.counterpartyId,
      ),
    ).toEqual(["CP-ANY-AUD", "CP-ANY-SGD"]);
  });

  it("covers every governed SSI ownership sort and its fallback values", () => {
    const rows = [
      {
        id: "fallback",
        scope: "STANDING",
        status: "DRAFT",
        version: 1,
        ownerParty: "OWNER-Z",
        amendmentOfId: "source",
        currentStatus: "DRAFTED" as const,
        route: {
          accountWithBic: "ZZZZGB2X",
          accountId: "ACC-2",
          currency: "USD",
          instructionPurpose: "TREASURY",
          routeType: "DIRECT",
          validTo: "not-a-date",
        },
      },
      {
        id: "explicit",
        counterpartyId: "CP-A",
        scope: "TRANSACTION_ONLY",
        status: "ACTIVE",
        version: 2,
        ownerParty: "OWNER-A",
        changeType: "SUPPRESSION" as const,
        currentStatus: "EMPTY" as const,
        route: {
          bookingEntity: "HK01",
          accountOwner: "ACCOUNT-OWNER",
          accountWithBic: "AAAAUS33",
          accountId: "ACC-1",
          currency: "EUR",
          businessFunction: "PAYMENT",
          instructionPurpose: "CUSTOMER",
          routePreference: "PREFERRED",
          priority: "1",
          validTo: "2027-01-01",
        },
      },
    ];
    const sorts = [
      "SSI_ID",
      "BOOKING_ENTITY",
      "ACCOUNT_SERVICER",
      "ACCOUNT_REF",
      "CURRENCY",
      "USE_CASE",
      "INSTRUCTED_ROUTE",
      "ROUTE_PRIORITY",
      "EFFECTIVE_PERIOD",
      "STATUS",
      "VERSION",
      "REQUEST_TYPE",
      "REVISION_STATUS",
      "SUBMIT",
      "EDIT_REVISE",
      "SUPPRESS",
      "REVOKE_DRAFT",
    ] as const;

    for (const sort of sorts) {
      const asc = sortSsiOwnershipRows(rows, sort, "ASC");
      const desc = sortSsiOwnershipRows(rows, sort, "DESC");
      const reversed = sortSsiOwnershipRows([...rows].reverse(), sort, "ASC");
      expect(asc).toHaveLength(2);
      expect(desc).toHaveLength(2);
      expect(reversed).toHaveLength(2);
      expect(asc).not.toBe(rows);
    }
  });

  it("sorts every counterparty column and handles invalid verification dates", () => {
    const items = [
      {
        counterpartyId: "CUSTOMER-2",
        name: "Zulu Customer",
        country: "GB",
        ssiCount: 1,
        currencyCount: 2,
        statuses: ["ACTIVE"],
        lastVerified: "not-a-date",
        evidenceSummary: "ACTIVE",
      },
      {
        counterpartyId: "BANK-1",
        bic: "AAAAUS33",
        name: "Alpha Bank",
        country: "US",
        ssiCount: 1,
        currencyCount: 1,
        statuses: ["ACTIVE"],
        lastVerified: "also-invalid",
        evidenceSummary: "ACTIVE",
      },
    ];
    for (const sort of [
      "BIC_NAME",
      "COUNTRY",
      "SSI_COUNT",
      "CURRENCY_COUNT",
      "STATUS_EVIDENCE",
      "LAST_VERIFIED",
    ] as const) {
      expect(queryCounterpartyInbox(items, "", sort, "ASC")).toHaveLength(2);
    }
    expect(queryCounterpartyInbox(items, "CUSTOMER", "BIC_NAME")).toHaveLength(1);
  });
});
