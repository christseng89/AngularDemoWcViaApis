class RouterEvent {
  constructor(
    readonly id: number,
    readonly url: string,
  ) {}
}

class NavigationStart extends RouterEvent {}

class NavigationEnd extends RouterEvent {
  constructor(
    id: number,
    url: string,
    readonly urlAfterRedirects: string,
  ) {
    super(id, url);
  }
}

class NavigationSkipped extends RouterEvent {}
class NavigationCancel extends RouterEvent {}
class NavigationError extends RouterEvent {
  constructor(
    id: number,
    url: string,
    readonly error: unknown,
  ) {
    super(id, url);
  }
}

jest.doMock("@angular/router", () => ({
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
}));

describe("app router event dispatcher", () => {
  it.each([
    [new NavigationStart(1, "/settings"), "start"],
    [new NavigationEnd(2, "/settings", "/settings"), "end"],
    [new NavigationSkipped(3, "/settings"), "skipped"],
    [new NavigationCancel(4, "/settings"), "failure"],
    [new NavigationError(5, "/settings", new Error("failed")), "failure"],
  ] as const)("dispatches %s to only the %s handler", async (event, expected) => {
    const { dispatchRouterEvent } = await import(
      "../../app/app-router-event-dispatcher"
    );
    const handlers = {
      start: jest.fn(),
      end: jest.fn(),
      skipped: jest.fn(),
      failure: jest.fn(),
    };

    dispatchRouterEvent(event, handlers);

    expect(handlers[expected]).toHaveBeenCalledWith(event);
    expect(
      Object.entries(handlers)
        .filter(([name]) => name !== expected)
        .every(([, handler]) => handler.mock.calls.length === 0),
    ).toBe(true);
  });

  it("ignores events outside the navigation lifecycle", async () => {
    const { dispatchRouterEvent } = await import(
      "../../app/app-router-event-dispatcher"
    );
    const handlers = {
      start: jest.fn(),
      end: jest.fn(),
      skipped: jest.fn(),
      failure: jest.fn(),
    };

    dispatchRouterEvent({ type: "unrelated" }, handlers);

    expect(Object.values(handlers).every((handler) => handler.mock.calls.length === 0)).toBe(
      true,
    );
  });
});
