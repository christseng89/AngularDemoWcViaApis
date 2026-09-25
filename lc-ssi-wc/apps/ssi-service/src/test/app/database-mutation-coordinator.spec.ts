import { ServiceUnavailableException } from "@nestjs/common";
import { DatabaseMutationCoordinator } from "../../app/database-mutation-coordinator";

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
});
