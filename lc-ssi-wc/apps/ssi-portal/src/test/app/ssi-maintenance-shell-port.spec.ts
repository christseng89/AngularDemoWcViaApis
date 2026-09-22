import "@angular/compiler";
import { SsiMaintenanceShellBridge } from "../../app/ssi-maintenance-shell-port";

describe("SSI maintenance shell bridge", () => {
  const createPort = () => ({
    checkerCount: jest.fn(() => 4),
    navigate: jest.fn(async () => true),
    notify: jest.fn(),
    openDetail: jest.fn(async () => undefined),
    closeDetail: jest.fn(),
    acceptCurrencies: jest.fn(),
    acceptPendingApprovalCount: jest.fn(),
    restoreDashboardAfterReleasedWip: jest.fn(),
  });

  it("is inert before attachment and after matching detachment", async () => {
    const bridge = new SsiMaintenanceShellBridge();
    expect(bridge.checkerCount()).toBe(0);
    expect(await bridge.navigate("dashboard")).toBe(false);
    await expect(bridge.openDetail({} as never)).resolves.toBeUndefined();
    bridge.notify(null);
    bridge.closeDetail();
    bridge.acceptCurrencies([]);
    bridge.restoreDashboardAfterReleasedWip({ kind: "error", text: "released" });

    const port = createPort();
    bridge.attach(port);
    bridge.detach(createPort());
    expect(bridge.checkerCount()).toBe(4);
    bridge.detach(port);
    expect(bridge.checkerCount()).toBe(0);
  });

  it("delegates presentation operations and owns the count signal", async () => {
    const bridge = new SsiMaintenanceShellBridge();
    const port = createPort();
    const row = { id: "SSI-1" } as never;
    bridge.attach(port);

    expect(await bridge.navigate("maker")).toBe(true);
    bridge.notify({ kind: "info", text: "ready" });
    await bridge.openDetail(row);
    bridge.closeDetail();
    bridge.acceptCurrencies([{ code: "USD", decimals: 2, standard: "ISO4217" }]);
    bridge.acceptPendingApprovalCount(7);
    bridge.restoreDashboardAfterReleasedWip({ kind: "error", text: "released" });

    expect(port.navigate).toHaveBeenCalledWith("maker");
    expect(port.openDetail).toHaveBeenCalledWith(row);
    expect(port.closeDetail).toHaveBeenCalled();
    expect(port.acceptCurrencies).toHaveBeenCalled();
    expect(port.restoreDashboardAfterReleasedWip).toHaveBeenCalled();
    expect(bridge.pendingApprovalCount()).toBe(7);
  });
});
