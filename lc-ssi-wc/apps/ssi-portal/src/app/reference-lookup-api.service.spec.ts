import { of } from "rxjs";

const get = jest.fn((url: string) => of({ url }));

jest.mock("@angular/core", () => ({
  Injectable: () => (target: unknown) => target,
  inject: () => ({ get }),
}));
jest.mock("@angular/common/http", () => ({ HttpClient: class {} }));

import { ReferenceLookupApiService } from "./reference-lookup-api.service";

describe("ReferenceLookupApiService", () => {
  beforeEach(() => get.mockClear());

  it("preserves standing-data lookup URLs and order", () => {
    const api = new ReferenceLookupApiService();
    api.currencies().subscribe();
    api.countries().subscribe();
    api.bookingBranches().subscribe();
    api.clearingSystems().subscribe();
    api.ownNostroAccounts().subscribe();

    expect(get.mock.calls).toEqual([
      ["http://localhost:3100/api/reference/currencies"],
      ["http://localhost:3100/api/reference/countries"],
      ["http://localhost:3100/api/reference/booking-branches"],
      ["http://localhost:3100/api/reference/clearing-systems"],
      ["http://localhost:3100/api/nostro-accounts"],
    ]);
  });

  it("preserves page-by-page bank query including the empty search", () => {
    const api = new ReferenceLookupApiService();
    api.banks(1, 50).subscribe();
    api.banks(2, 50).subscribe();

    expect(get.mock.calls).toEqual([
      ["http://localhost:3100/api/reference/banks?page=1&pageSize=50&query="],
      ["http://localhost:3100/api/reference/banks?page=2&pageSize=50&query="],
    ]);
  });
});
