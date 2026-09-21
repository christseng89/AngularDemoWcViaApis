import { of } from "rxjs";

const get = jest.fn((url: string) => of({ url }));
const post = jest.fn((url: string, body: unknown) => of({ url, body }));

jest.mock("@angular/core", () => ({
  Injectable: () => (target: unknown) => target,
  inject: () => ({ get, post }),
}));
jest.mock("@angular/common/http", () => ({ HttpClient: class {} }));

import { CheckerApiService } from "../../../app/checker-feature/checker-api.service";

describe("CheckerApiService", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
  });

  it("performs the existing SSI queue, summary and governed contract GETs", () => {
    const api = new CheckerApiService();
    api.pendingSsi().subscribe();
    api.summary().subscribe();
    api.governedContract().subscribe();
    expect(get.mock.calls.map(([url]) => url)).toEqual([
      "http://localhost:3100/api/ssis?status=PENDING_APPROVAL&page=1&pageSize=100&sortBy=STATUS&sortDirection=ASC",
      "http://localhost:3100/api/ssis/summary",
      "/openapi/swift-data-service.v1.json",
    ]);
  });

  it("queries only the governed endpoint and preserves approval payloads", () => {
    const api = new CheckerApiService();
    api.governedPending("rma-authorisations").subscribe();
    api.decideSsi("SSI-1", "approve").subscribe();
    api.decideSsi("SSI-2", "reject", "wrong account").subscribe();
    expect(get).toHaveBeenCalledWith(
      "http://localhost:3100/api/rma-authorisations?status=PENDING_APPROVAL",
    );
    expect(post.mock.calls).toEqual([
      [
        "http://localhost:3100/api/ssis/SSI-1/approve",
        { actor: "checker.demo" },
      ],
      [
        "http://localhost:3100/api/ssis/SSI-2/reject",
        { actor: "checker.demo", reason: "wrong account" },
      ],
    ]);
  });
});
