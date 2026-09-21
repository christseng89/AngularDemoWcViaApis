import { of } from "rxjs";

const get = jest.fn((url: string) => of({ url }));

jest.mock("@angular/core", () => ({
  Injectable: () => (target: unknown) => target,
  inject: () => ({ get }),
}));
jest.mock("@angular/common/http", () => ({ HttpClient: class {} }));

import { AuditApiService } from "../../../app/audit-feature/audit-api.service";

describe("AuditApiService", () => {
  beforeEach(() => get.mockClear());

  it("performs only the existing three read-only requests in order", () => {
    const api = new AuditApiService();
    api.events("rma").subscribe();
    api.lifecycle().subscribe();
    api.contract().subscribe();
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:3100/api/rma-authorisations/audit/events",
      "http://localhost:3100/api/health/audit-retention",
      "/openapi/swift-data-service.v1.json",
    ]);
  });

  it.each([
    ["entity", "booking-branch-entities/audit/events"],
    ["nostro", "nostro-accounts/audit/events"],
    ["ssi", "audit"],
  ] as const)("uses the governed %s audit endpoint", (tab, endpoint) => {
    const api = new AuditApiService();
    api.events(tab).subscribe();
    expect(get).toHaveBeenCalledWith(`http://localhost:3100/api/${endpoint}`);
  });
});
