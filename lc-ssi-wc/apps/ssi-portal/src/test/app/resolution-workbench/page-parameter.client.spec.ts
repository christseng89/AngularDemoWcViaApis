import { firstValueFrom, of } from "rxjs";

const calls: Array<{
  method: string;
  url: string;
  body?: unknown;
  params?: unknown;
}> = [];

const http = {
  get: jest.fn(
    (
      url: string,
      options?: { params?: { values: Readonly<Record<string, string>> } },
    ) => {
      calls.push({ method: "GET", url, params: options?.params?.values });
      return of(
        url.endsWith("/index")
          ? { items: [] }
          : url.endsWith("/lookups/bank-services")
            ? { provider: "BANK_SERVICE", action: "SEARCH", items: [] }
            : { contract: {} },
      );
    },
  ),
  post: jest.fn((url: string, body: unknown) => {
    calls.push({ method: "POST", url, body });
    return of({ outcome: "RESOLVED" });
  }),
};

jest.mock("@angular/core", () => ({
  Injectable: () => (target: unknown) => target,
  InjectionToken: class InjectionToken {},
  inject: () => http,
}));
jest.mock("@angular/common/http", () => ({
  HttpClient: class HttpClient {},
  HttpParams: class TestHttpParams {
    constructor(readonly values: Readonly<Record<string, string>> = {}) {}

    set(key: string, value: string): TestHttpParams {
      return new TestHttpParams({ ...this.values, [key]: value });
    }
  },
}));

import { HttpResolutionPageParameterClient } from "../../../app/resolution-workbench/page-parameter.client";

describe("live ResolutionPageDefinition transport", () => {
  beforeEach(() => {
    calls.length = 0;
    jest.clearAllMocks();
  });

  it("uses index, definition, governed lookup, then one OAS-selected execution request", async () => {
    const client = new HttpResolutionPageParameterClient();
    const query = {
      standardsRelease: "SR2026",
      messageFamily: "MT2",
      messageType: "MT202",
      direction: "OUTGOING",
      businessScenarioId: "SCENARIO-1",
      businessDomain: "PAYMENT",
    } as const;
    const lookup = {
      provider: "BANK_SERVICE",
      action: "SEARCH",
      endpoint: "/api/v1/resolution-page-definitions/lookups/bank-services",
      dependsOnFieldIds: [],
    };
    const execution = {
      endpoint: "/api/v1/resolution-page-definitions/execute",
      method: "POST",
      action: "RESOLVE_SSI",
    };
    const submission = {
      definitionId: "PAYMENT-MT202-SR2026",
      definitionVersion: "1",
      scenarioId: "SCENARIO-1",
      fixtureBindingId: "FIXTURE-1",
      contractSha256: "a".repeat(64),
      values: { "context.currency": "USD" },
    };

    await firstValueFrom(client.loadIndex("PAYMENT"));
    await firstValueFrom(client.load(query));
    await firstValueFrom(client.lookup(lookup as never, { query: "BARC" }));
    await firstValueFrom(
      client.execute(execution as never, submission as never),
    );

    expect(calls).toEqual([
      {
        method: "GET",
        url: "/api/v1/resolution-page-definitions/index",
        params: { businessDomain: "PAYMENT" },
      },
      {
        method: "GET",
        url: "/api/v1/resolution-page-definitions",
        params: {
          standardsRelease: "SR2026",
          messageFamily: "MT2",
          messageType: "MT202",
          direction: "OUTGOING",
          businessScenarioId: "SCENARIO-1",
          businessDomain: "PAYMENT",
        },
      },
      {
        method: "GET",
        url: "/api/v1/resolution-page-definitions/lookups/bank-services",
        params: { query: "BARC" },
      },
      {
        method: "POST",
        url: "/api/v1/resolution-page-definitions/execute",
        body: submission,
      },
    ]);
    expect(calls.every(({ url }) => !url.includes("/settlements/"))).toBe(true);
  });
});
