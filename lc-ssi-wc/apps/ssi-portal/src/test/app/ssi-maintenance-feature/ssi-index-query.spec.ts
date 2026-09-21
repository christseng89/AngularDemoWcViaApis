import { buildSsiIndexQuery } from "../../../app/ssi-maintenance-feature/ssi-index-query";

describe("SSI Maintenance index query", () => {
  it("preserves governed ownership, status, search, sort and page parameter order", () => {
    const query = buildSsiIndexQuery({
      status: "DRAFT",
      page: 3,
      pageSize: 10,
      sortBy: "STATUS",
      sortDirection: "DESC",
      ownershipType: "COUNTERPARTY",
      search: "  bank  ",
      counterpartyId: "CP-CITIUS33",
    });
    expect(query.toString()).toBe(
      "status=DRAFT&page=3&pageSize=10&sortBy=STATUS&sortDirection=DESC&ownershipType=COUNTERPARTY&search=bank&counterpartyId=CP-CITIUS33",
    );
  });

  it("omits empty optional filters without changing the required parameter set", () => {
    const query = buildSsiIndexQuery({
      status: "ACTIVE",
      page: 1,
      pageSize: 10,
      sortBy: "BOOKING_ENTITY",
      sortDirection: "ASC",
      ownershipType: "OWN",
      search: "  ",
      counterpartyId: "",
    });
    expect(query.toString()).toBe(
      "status=ACTIVE&page=1&pageSize=10&sortBy=BOOKING_ENTITY&sortDirection=ASC&ownershipType=OWN",
    );
  });
});
