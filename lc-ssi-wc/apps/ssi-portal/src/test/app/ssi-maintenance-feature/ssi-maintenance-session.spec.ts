type TestSignal<T> = (() => T) & { set(value: T): void };
function testSignal<T>(initial: T): TestSignal<T> {
  let current = initial;
  const read = (() => current) as TestSignal<T>;
  read.set = (value) => {
    current = value;
  };
  return read;
}

jest.mock("@angular/core", () => ({
  signal: testSignal,
  computed: (read: () => unknown) => read,
  InjectionToken: class {},
}));
jest.mock("@angular/forms", () => ({
  FormGroup: class {
    reset = jest.fn();
    get = jest.fn(() => undefined);
  },
}));

import type { SsiMaintenanceApiService } from "../../../app/ssi-maintenance-api.service";
import type { SsiRow } from "../../../app/ssi-maintenance.types";
import type { SsiMaintenanceShellPort } from "../../../app/ssi-maintenance-shell-port";
import { of, Subject } from "rxjs";
import { SsiIndexFacade } from "../../../app/ssi-maintenance-feature/ssi-index.facade";
import { SsiMakerFacade } from "../../../app/ssi-maintenance-feature/ssi-maker.facade";
import { SsiMaintenanceSession } from "../../../app/ssi-maintenance-feature/ssi-maintenance-session";

describe("SSI Maintenance feature session", () => {
  const active: SsiRow = {
    id: "SSI-ACTIVE",
    counterpartyId: "BANK-1",
    scope: "STANDING",
    status: "ACTIVE",
    maker: "maker.demo",
    route: { currency: "USD" },
    version: 1,
  };
  const shell = (navigate = jest.fn(async () => true)) =>
    ({
      checkerCount: jest.fn(() => 0),
      navigate,
      notify: jest.fn(),
      openDetail: jest.fn(async () => undefined),
      closeDetail: jest.fn(),
      acceptCurrencies: jest.fn(),
      acceptCountries: jest.fn(),
      acceptBookingBranches: jest.fn(),
      restoreDashboardAfterReleasedWip: jest.fn(),
    }) satisfies SsiMaintenanceShellPort;

  it("composes one existing Index and Maker facade without constructing API requests", () => {
    const api = {} as SsiMaintenanceApiService;
    const session = new SsiMaintenanceSession(api);
    expect(session.index).toBeInstanceOf(SsiIndexFacade);
    expect(session.maker).toBeInstanceOf(SsiMakerFacade);
    expect(session.index).toBe(session.index);
    expect(session.maker).toBe(session.maker);
  });

  it("loads Dashboard through the existing Index facade without duplicating API orchestration", async () => {
    const session = new SsiMaintenanceSession({} as SsiMaintenanceApiService);
    const refresh = jest
      .spyOn(session.index, "refresh")
      .mockResolvedValue("applied");
    const directory = jest
      .spyOn(session.index, "loadCounterpartyDirectory")
      .mockResolvedValue("applied");
    await session.load("dashboard");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(directory).toHaveBeenCalledTimes(1);
  });

  it("starts a new Maker draft in the shared session without an eager API request", async () => {
    const api = {
      createDraft: jest.fn(),
    } as unknown as SsiMaintenanceApiService;
    const host = shell();
    const session = new SsiMaintenanceSession(api, undefined, host);
    await session.startNew();
    expect(host.navigate).toHaveBeenCalledWith("maker");
    expect(session.maker.editingId()).toBeNull();
    expect(api.createDraft).not.toHaveBeenCalled();
  });

  it("releases a reserved WIP if Maker navigation is denied", async () => {
    const revision = { ...active, id: "SSI-WIP", status: "WIP" };
    const api = {
      reserveRevision: jest.fn(() => of(revision)),
      cancelRevision: jest.fn(() => of({})),
    } as unknown as SsiMaintenanceApiService;
    const host = shell(jest.fn(async () => false));
    const session = new SsiMaintenanceSession(api, undefined, host);
    await session.revise(active);
    expect(api.reserveRevision).toHaveBeenCalledTimes(1);
    expect(api.cancelRevision).toHaveBeenCalledTimes(1);
    expect(session.hasActiveMakerRevision()).toBe(false);
    expect(host.notify).toHaveBeenCalledWith({
      kind: "warning",
      text: "修訂畫面未開啟；已取消伺服器上的 In Progress 鎖定。",
    });
  });

  it("preserves the same WIP across Dashboard to Maker and releases it on exit", async () => {
    const cancelRevision = jest.fn(() => of({}));
    const session = new SsiMaintenanceSession({
      cancelRevision,
    } as unknown as SsiMaintenanceApiService);
    session.activate("dashboard");
    session.maker.beginRevision(
      active,
      { ...active, id: "SSI-WIP", status: "WIP" },
      { maker: "maker.revision" },
    );
    expect(session.hasActiveMakerRevision()).toBe(true);
    expect(await session.canDeactivate("/maker")).toBe(true);
    expect(cancelRevision).not.toHaveBeenCalled();
    session.activate("maker");
    expect(await session.canDeactivate("/settings")).toBe(true);
    expect(cancelRevision).toHaveBeenCalledTimes(1);
    expect(session.hasActiveMakerRevision()).toBe(false);
  });

  it("coalesces concurrent WIP release and fails closed with the existing notice", async () => {
    const pending = new Subject<unknown>();
    const cancelRevision = jest.fn(() => pending);
    const notices: Array<{ kind: "error"; text: string }> = [];
    const session = new SsiMaintenanceSession(
      { cancelRevision } as unknown as SsiMaintenanceApiService,
      (notice) => notices.push(notice),
    );
    session.activate("maker");
    session.maker.beginRevision(
      active,
      { ...active, id: "SSI-WIP", status: "WIP" },
      { maker: "maker.revision" },
    );
    const first = session.canDeactivate("/settings");
    const second = session.canDeactivate("/settings");
    expect(cancelRevision).toHaveBeenCalledTimes(1);
    pending.error(new Error("503"));
    expect(await Promise.all([first, second])).toEqual([false, false]);
    expect(session.hasActiveMakerRevision()).toBe(true);
    expect(notices).toContainEqual({
      kind: "error",
      text: "無法取消修訂；In Progress 鎖定仍保留，請重試。",
    });
  });
});
