import { of } from "rxjs";

const get = jest.fn((url: string) => of({ url }));
const post = jest.fn((url: string, body: unknown) => of({ url, body }));

jest.mock("@angular/core", () => ({
  Injectable: () => (target: unknown) => target,
  inject: () => ({ get, post }),
}));
jest.mock("@angular/common/http", () => ({ HttpClient: class {} }));

import { PaymentSettlementApiService } from "./payment-settlement-api.service";

describe("PaymentSettlementApiService", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
  });

  it("preserves the Payment index and clearing-options request contracts", () => {
    const api = new PaymentSettlementApiService();
    const context = { currency: "USD", paymentLeg: "RECEIVER" };
    api.messageIndex().subscribe();
    api.clearingOptions(context).subscribe();

    expect(get.mock.calls).toEqual([
      ["http://localhost:3100/api/settlements/message-index"],
    ]);
    expect(post.mock.calls).toEqual([
      ["http://localhost:3100/api/settlements/clearing-options", context],
    ]);
  });

  it("preserves resolve and confirm URL, body and call order", () => {
    const api = new PaymentSettlementApiService();
    const request = { correlationId: "CORR-1", currency: "USD" };
    const confirmation = {
      selectedSsiId: "SSI-1",
      actor: "maker.demo",
      overrideReason: "USER_SELECTED_ALTERNATIVE_ROUTE",
    };
    api.resolve(request).subscribe();
    api.confirm("ATTEMPT-1", confirmation).subscribe();

    expect(post.mock.calls).toEqual([
      ["http://localhost:3100/api/settlements/resolve", request],
      ["http://localhost:3100/api/settlements/ATTEMPT-1/confirm", confirmation],
    ]);
  });
});
