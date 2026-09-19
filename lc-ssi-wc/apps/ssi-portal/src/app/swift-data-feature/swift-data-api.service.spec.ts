import { of } from "rxjs";

const mockHttp = {
  get: jest.fn(() => of(null)),
  post: jest.fn(() => of(null)),
  request: jest.fn(() => of(null)),
  delete: jest.fn(() => of(null)),
};

jest.mock("@angular/common/http", () => ({ HttpClient: class {} }));
jest.mock("@angular/core", () => ({
  Injectable: () => (target: unknown) => target,
  inject: () => mockHttp,
}));

import { SwiftDataApiService } from "./swift-data-api.service";

describe("SWIFT Data HTTP-only API", () => {
  beforeEach(() => jest.clearAllMocks());

  it("preserves governed contract and lookup endpoints", () => {
    const api = new SwiftDataApiService();
    api.contract();
    api.currencies();
    api.messageTypePolicy();
    api.bankPage(2, 8, "A B");
    api.pairState(new URLSearchParams({ ownBic: "OWN", counterpartyBic: "BANK" }));
    expect(mockHttp.get.mock.calls.map(([url]) => url)).toEqual([
      "/openapi/swift-data-service.v1.json",
      "http://localhost:3100/api/reference/currencies",
      "http://localhost:3100/api/rma-authorisations/message-type-policy",
      "http://localhost:3100/api/reference/banks?page=2&pageSize=8&query=A%20B",
      "http://localhost:3100/api/rma-authorisations/pair-state?ownBic=OWN&counterpartyBic=BANK",
    ]);
  });

  it("preserves page query, lifecycle methods and payloads", () => {
    const api = new SwiftDataApiService();
    api.rows("rma-authorisations", new URLSearchParams({ page: "2", pageSize: "8", status: "DRAFT" }));
    api.save("rma-authorisations", null, { code: "A" });
    api.save("rma-authorisations", "R-1", { code: "B" });
    api.act("rma-authorisations", "R-1", "submit", "maker.demo");
    api.revise("rma-authorisations", "R-1", "maker.revision");
    api.suppress("rma-authorisations", "R-1", "maker.suppression", "not needed");
    api.delete("rma-authorisations", "R-WIP", { actor: "maker.revision", reason: "Revision cancelled before Save Draft" });
    api.reject("rma-authorisations", "R-1", "checker.demo", "wrong details");
    api.import("RMA", "rma.json", true, "portal-rma-rma.json-1-true", [{ id: "R-1" }]);

    expect(mockHttp.get).toHaveBeenCalledWith("http://localhost:3100/api/rma-authorisations?page=2&pageSize=8&status=DRAFT");
    expect(mockHttp.request.mock.calls).toEqual([
      ["POST", "http://localhost:3100/api/rma-authorisations", { body: { code: "A" } }],
      ["PUT", "http://localhost:3100/api/rma-authorisations/R-1", { body: { code: "B" } }],
    ]);
    expect(mockHttp.post.mock.calls).toEqual([
      ["http://localhost:3100/api/rma-authorisations/R-1/submit", { actor: "maker.demo" }],
      ["http://localhost:3100/api/rma-authorisations/R-1/revise", { maker: "maker.revision" }],
      ["http://localhost:3100/api/rma-authorisations/R-1/suppress", { maker: "maker.suppression", reason: "not needed" }],
      ["http://localhost:3100/api/rma-authorisations/R-1/reject", { actor: "checker.demo", reason: "wrong details" }],
      ["http://localhost:3100/api/swift-data/imports", { dataType: "RMA", fileName: "rma.json", dryRun: true, idempotencyKey: "portal-rma-rma.json-1-true", records: [{ id: "R-1" }] }],
    ]);
    expect(mockHttp.delete).toHaveBeenCalledWith("http://localhost:3100/api/rma-authorisations/R-WIP", {
      body: { actor: "maker.revision", reason: "Revision cancelled before Save Draft" },
    });
  });
});
