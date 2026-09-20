import { ResolutionCurrencyInquiryPolicy } from "./resolution-currency-inquiry.policy";

describe("ResolutionCurrencyInquiryPolicy", () => {
  it("freezes Settings title, initial sort and page size from environment", () => {
    const policy = new ResolutionCurrencyInquiryPolicy({
      SSI_RESOLUTION_CURRENCY_INQUIRY_TITLE: "Business Currency Coverage",
      SSI_RESOLUTION_CURRENCY_INQUIRY_SORT: "currency:desc",
      SSI_INDEX_PAGE_SIZE: "15",
    });
    expect(policy.contract).toEqual({ title: "Business Currency Coverage", sortBy: "currency", sortDirection: "desc", pageSize: 15 });
  });

  it("uses safe defaults and rejects invalid configuration", () => {
    expect(new ResolutionCurrencyInquiryPolicy({}).contract).toEqual({
      title: "Inquire Business Currency Index", sortBy: "businessDomain", sortDirection: "asc", pageSize: 10,
    });
    expect(() => new ResolutionCurrencyInquiryPolicy({ SSI_RESOLUTION_CURRENCY_INQUIRY_SORT: "sql:desc" })).toThrow();
    expect(() => new ResolutionCurrencyInquiryPolicy({ SSI_INDEX_PAGE_SIZE: "0" })).toThrow();
  });
});
