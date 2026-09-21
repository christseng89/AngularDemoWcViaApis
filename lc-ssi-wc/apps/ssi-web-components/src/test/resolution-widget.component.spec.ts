import { of, throwError } from "rxjs";

const mockPost = jest.fn();

jest.mock("@angular/core", () => ({
  ChangeDetectionStrategy: { OnPush: "OnPush" },
  Component: () => (target: unknown) => target,
  inject: () => ({ post: mockPost }),
  input: (initial: string) => () => initial,
  signal: (initial: string) => {
    let value = initial;
    const accessor = () => value;
    accessor.set = (next: string) => {
      value = next;
    };
    return accessor;
  },
}));

jest.mock("@angular/common/http", () => ({ HttpClient: class HttpClient {} }));

import { ResolutionWidgetComponent } from "../resolution-widget.component";

describe("ResolutionWidgetComponent", () => {
  beforeEach(() => mockPost.mockReset());

  it("submits its configured resolution context and renders the result", async () => {
    mockPost.mockReturnValue(of({ decision: "RESOLVED", routeId: "R-1" }));
    const widget = new ResolutionWidgetComponent();

    await widget.resolve();

    expect(mockPost).toHaveBeenCalledWith(
      "http://localhost:3100/api/resolve",
      expect.objectContaining({
        counterpartyId: "BANK-001",
        currency: "USD",
        businessFunction: "REIMBURSEMENT_CLAIM",
        transactionReference: expect.stringMatching(/^WC-\d+$/),
      }),
    );
    expect(widget.result()).toContain('"decision": "RESOLVED"');
  });

  it("fails closed without exposing an upstream error payload", async () => {
    mockPost.mockReturnValue(
      throwError(() => new Error("sensitive upstream details")),
    );
    const widget = new ResolutionWidgetComponent();

    await widget.resolve();

    expect(widget.result()).toBe("Resolution failed closed.");
    expect(widget.result()).not.toContain("sensitive upstream details");
  });
});
