import { of } from "rxjs";

const get = jest.fn((url: string) => of({ url }));
const post = jest.fn((url: string, body: unknown) => of({ url, body }));
const put = jest.fn((url: string, body: unknown) => of({ url, body }));
const remove = jest.fn((url: string, options: unknown) => of({ url, options }));

jest.mock("@angular/core", () => ({
  Injectable: () => (target: unknown) => target,
  inject: () => ({ get, post, put, delete: remove }),
}));
jest.mock("@angular/common/http", () => ({ HttpClient: class {} }));

import { SsiMaintenanceApiService } from "./ssi-maintenance-api.service";

describe("SsiMaintenanceApiService", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
    put.mockClear();
    remove.mockClear();
  });

  it("preserves the current list and summary GET contracts", () => {
    const api = new SsiMaintenanceApiService();
    const query = new URLSearchParams({
      status: "ACTIVE",
      page: "2",
      pageSize: "10",
      sortBy: "STATUS",
      sortDirection: "ASC",
      ownershipType: "OWN",
      search: "bank",
    });
    api.list(query).subscribe();
    api.summary().subscribe();
    api.counterpartyCoverage().subscribe();
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      `http://localhost:3100/api/ssis?${query.toString()}`,
      "http://localhost:3100/api/ssis/summary",
      "http://localhost:3100/api/ssis/counterparty-coverage?status=ACTIVE",
    ]);
  });

  it("preserves Maker draft, submit and Checker action transport", () => {
    const api = new SsiMaintenanceApiService();
    const model = { maker: "maker.demo", scope: "STANDING" };
    api.createDraft(model).subscribe();
    api.updateDraft("SSI-1", model).subscribe();
    api.act("SSI-1", "submit", "maker.demo").subscribe();
    api.act("SSI-2", "approve", "checker.demo").subscribe();
    expect(post.mock.calls).toEqual([
      ["http://localhost:3100/api/ssis", model],
      ["http://localhost:3100/api/ssis/SSI-1/submit", { actor: "maker.demo" }],
      [
        "http://localhost:3100/api/ssis/SSI-2/approve",
        { actor: "checker.demo" },
      ],
    ]);
    expect(put.mock.calls).toEqual([
      ["http://localhost:3100/api/ssis/SSI-1", model],
    ]);
  });

  it("preserves WIP reservation, cancellation and suppression payloads", () => {
    const api = new SsiMaintenanceApiService();
    api.reserveRevision("SSI-1", "maker.revision").subscribe();
    api.cancelRevision("SSI-REV-1", "maker.revision").subscribe();
    api.revokeDraft("SSI-DRAFT-1", "maker.demo", "duplicate draft").subscribe();
    api.suppress("SSI-1", "maker.suppression", "account closed").subscribe();
    expect(post.mock.calls).toEqual([
      [
        "http://localhost:3100/api/ssis/SSI-1/revise",
        { maker: "maker.revision" },
      ],
      [
        "http://localhost:3100/api/ssis/SSI-REV-1/cancel-revision",
        { actor: "maker.revision" },
      ],
      [
        "http://localhost:3100/api/ssis/SSI-1/suppress",
        { maker: "maker.suppression", reason: "account closed" },
      ],
    ]);
    expect(remove.mock.calls).toEqual([
      [
        "http://localhost:3100/api/ssis/SSI-DRAFT-1",
        { body: { actor: "maker.demo", reason: "duplicate draft" } },
      ],
    ]);
  });

  it("preserves Maker Bank and Customer picker query URLs", () => {
    const api = new SsiMaintenanceApiService();
    api.lookupBanks(2, 10, "A B").subscribe();
    api.lookupCustomers(3, "C D").subscribe();
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:3100/api/reference/banks?page=2&pageSize=10&query=A%20B",
      "http://localhost:3100/api/reference/customers?page=3&pageSize=5&query=C%20D",
    ]);
  });

  it("preserves the Dashboard counterparty directory lookup URL", () => {
    const api = new SsiMaintenanceApiService();
    api.lookupCounterparties().subscribe();
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:3100/api/reference/counterparties",
    ]);
  });
});
