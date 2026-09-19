jest.mock("@angular/router", () => ({ Router: class {} }));

import { AppRouteGuardBridge } from "./app-route-guard";

describe("AppRouteGuardBridge", () => {
  it("allows only the first bootstrap activation without a mounted host", async () => {
    const bridge = new AppRouteGuardBridge(() => 1);
    expect(await bridge.canActivate()).toBe(true);
    expect(await bridge.canActivate()).toBe(false);
  });

  it("delegates to the host and fails closed on denial or thrown cleanup", async () => {
    const bridge = new AppRouteGuardBridge(() => 2);
    const host = {
      canDeactivate: jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockRejectedValueOnce(new Error("cleanup")),
      hasActiveMakerRevision: jest.fn(() => true),
    };
    bridge.register(host);
    expect(await bridge.canActivate()).toBe(false);
    expect(await bridge.canActivate()).toBe(false);
    expect(host.canDeactivate).toHaveBeenCalledTimes(2);
    bridge.unregister(host);
    expect(await bridge.canActivate()).toBe(false);
  });

  it("passes the destination URL to the host for pending Maker WIP decisions", async () => {
    const bridge = new AppRouteGuardBridge(() => 3);
    const host = {
      canDeactivate: jest.fn(async (_targetUrl?: string) => true),
      hasActiveMakerRevision: () => true,
    };
    bridge.register(host);
    expect(await bridge.canActivate("/maker")).toBe(true);
    expect(host.canDeactivate).toHaveBeenCalledWith("/maker");
  });

  it("records only a successfully released Maker WIP for its navigation ID", async () => {
    let navigationId = 5;
    const bridge = new AppRouteGuardBridge(() => navigationId);
    let wip = true;
    const host = {
      canDeactivate: jest.fn(async () => {
        wip = false;
        return true;
      }),
      hasActiveMakerRevision: () => wip,
    };
    bridge.register(host);
    expect(await bridge.canActivate()).toBe(true);
    expect(bridge.consumeReleasedMakerWip(5)).toBe(true);
    expect(bridge.consumeReleasedMakerWip(5)).toBe(false);
    navigationId = 6;
    expect(await bridge.canActivate()).toBe(true);
    expect(bridge.consumeReleasedMakerWip(6)).toBe(false);
  });

  it("attributes deferred cleanup to the original navigation and reports release after cancellation", async () => {
    let navigationId = 21;
    let completeCleanup!: (allowed: boolean) => void;
    const cleanup = new Promise<boolean>((resolve) => {
      completeCleanup = resolve;
    });
    let activeWip = true;
    const host = {
      canDeactivate: jest.fn(() => cleanup),
      hasActiveMakerRevision: () => activeWip,
      onLateMakerWipRelease: jest.fn(),
    };
    const bridge = new AppRouteGuardBridge(() => navigationId);
    bridge.register(host);
    const activation = bridge.canActivate();
    bridge.markNavigationTerminated(21);
    navigationId = 22;
    activeWip = false;
    completeCleanup(true);
    expect(await activation).toBe(true);
    expect(bridge.consumeReleasedMakerWip(21)).toBe(true);
    expect(bridge.consumeReleasedMakerWip(22)).toBe(false);
    expect(host.onLateMakerWipRelease).toHaveBeenCalledWith(21);
  });

  it("does not retain a terminal denial or report a late release when cleanup rejects", async () => {
    let navigationId = 31;
    let failCleanup!: (reason: Error) => void;
    const cleanup = new Promise<boolean>((_resolve, reject) => {
      failCleanup = reject;
    });
    const host = {
      canDeactivate: jest.fn(() => cleanup),
      hasActiveMakerRevision: () => true,
      onLateMakerWipRelease: jest.fn(),
    };
    const bridge = new AppRouteGuardBridge(() => navigationId);
    bridge.register(host);
    const activation = bridge.canActivate();
    bridge.markNavigationTerminated(31);
    navigationId = 32;
    failCleanup(new Error("server rejected"));
    expect(await activation).toBe(false);
    expect(bridge.consumeDenied(31)).toBe(false);
    expect(bridge.consumeDenied(32)).toBe(false);
    expect(host.onLateMakerWipRelease).not.toHaveBeenCalled();
  });

  it("does not retain a denial marker after a pending navigation already terminated", async () => {
    let failCleanup!: (reason: Error) => void;
    const cleanup = new Promise<boolean>((_resolve, reject) => {
      failCleanup = reject;
    });
    const bridge = new AppRouteGuardBridge(() => 36);
    bridge.register({
      canDeactivate: () => cleanup,
      hasActiveMakerRevision: () => true,
    });
    const activation = bridge.canActivate();
    bridge.markNavigationTerminated(36);
    failCleanup(new Error("late rejection"));
    expect(await activation).toBe(false);
    expect(bridge.consumeDenied(36)).toBe(false);
  });

  it("keeps a superseded pending cleanup attributed to its original navigation", async () => {
    let navigationId = 41;
    let finishFirst!: (allowed: boolean) => void;
    const first = new Promise<boolean>((resolve) => {
      finishFirst = resolve;
    });
    let activeWip = true;
    const host = {
      canDeactivate: jest
        .fn()
        .mockReturnValueOnce(first)
        .mockResolvedValueOnce(true),
      hasActiveMakerRevision: () => activeWip,
      onLateMakerWipRelease: jest.fn(),
    };
    const bridge = new AppRouteGuardBridge(() => navigationId);
    bridge.register(host);
    const oldActivation = bridge.canActivate();
    bridge.markNavigationTerminated(41);
    navigationId = 42;
    expect(await bridge.canActivate()).toBe(true);
    activeWip = false;
    finishFirst(true);
    expect(await oldActivation).toBe(true);
    expect(bridge.consumeReleasedMakerWip(42)).toBe(false);
    expect(bridge.consumeReleasedMakerWip(41)).toBe(true);
    expect(host.onLateMakerWipRelease).toHaveBeenCalledWith(41);
  });
});
