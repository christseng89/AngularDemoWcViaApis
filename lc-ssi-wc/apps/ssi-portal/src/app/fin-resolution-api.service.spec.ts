import { of } from "rxjs";

const get = jest.fn((url: string) => of({ url }));
const post = jest.fn((url: string, body: unknown) => of({ url, body }));

jest.mock("@angular/core", () => ({
  Injectable: () => (target: unknown) => target,
  inject: () => ({ get, post }),
}));
jest.mock("@angular/common/http", () => ({ HttpClient: class {} }));

import { FinResolutionApiService } from "./fin-resolution-api.service";

describe("FinResolutionApiService", () => {
  beforeEach(() => {
    get.mockClear();
    post.mockClear();
  });

  it("preserves extract and controlled resolution request contracts", () => {
    const api = new FinResolutionApiService();
    const extract = { format: "FIN", content: ":20:REF" };
    const resolve = { messageType: "MT300", currency: "USD" };
    api.extract(extract).subscribe();
    api.controlledResolution(resolve).subscribe();

    expect(post.mock.calls).toEqual([
      ["http://localhost:3100/api/messages/extract", extract],
      [
        "http://localhost:3100/api/reference/fin-controlled-resolutions",
        resolve,
      ],
    ]);
  });

  it("preserves controlled fixture query and catalogue release", () => {
    const api = new FinResolutionApiService();
    const query = new URLSearchParams({
      messageType: "MT300",
      currency: "USD",
    });
    api.controlledFixtures(query).subscribe();
    api.catalogue("SR2026").subscribe();

    expect(get.mock.calls).toEqual([
      [
        "http://localhost:3100/api/reference/fin-controlled-fixtures?messageType=MT300&currency=USD",
      ],
      [
        "http://localhost:3100/api/reference/fin-resolution-catalogue?standardsRelease=SR2026",
      ],
    ]);
  });
});
