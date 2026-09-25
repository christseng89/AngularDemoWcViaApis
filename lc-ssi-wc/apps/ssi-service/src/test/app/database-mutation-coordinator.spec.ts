import { ServiceUnavailableException } from "@nestjs/common";
import { of } from "rxjs";
import {
  DatabaseMutationCoordinator,
  DatabaseMutationInterceptor,
} from "../../app/database-mutation-coordinator";

describe("DatabaseMutationCoordinator", () => {
  it("waits for an active maintenance write before granting Reload exclusivity", async () => {
    const coordinator = new DatabaseMutationCoordinator();
    const finishWrite = coordinator.beginMutation();
    let granted = false;

    const releaseReload = coordinator.beginReload().then((release) => {
      granted = true;
      return release;
    });
    await Promise.resolve();
    expect(granted).toBe(false);
    expect(() => coordinator.beginMutation()).toThrow(
      ServiceUnavailableException,
    );

    finishWrite();
    const finishReload = await releaseReload;
    expect(granted).toBe(true);
    finishReload();
    expect(() => coordinator.beginMutation()).not.toThrow();
  });

  it("counts GET requests because reads may expire WIP and write SQLite", () => {
    const coordinator = new DatabaseMutationCoordinator();
    const beginMutation = jest.spyOn(coordinator, "beginMutation");
    const interceptor = new DatabaseMutationInterceptor(coordinator);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ method: "GET", url: "/ssi" }),
      }),
    };

    interceptor
      .intercept(context as never, { handle: () => of({ ok: true }) })
      .subscribe();

    expect(beginMutation).toHaveBeenCalledTimes(1);
  });

  it("keeps the Reload endpoint outside its own mutation barrier", () => {
    const coordinator = new DatabaseMutationCoordinator();
    const beginMutation = jest.spyOn(coordinator, "beginMutation");
    const interceptor = new DatabaseMutationInterceptor(coordinator);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: "POST",
          url: "/settings/development-data/reload",
        }),
      }),
    };

    interceptor
      .intercept(context as never, { handle: () => of({ ok: true }) })
      .subscribe();

    expect(beginMutation).not.toHaveBeenCalled();
  });
});
