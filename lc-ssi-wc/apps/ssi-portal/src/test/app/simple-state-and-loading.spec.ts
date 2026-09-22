import "@angular/compiler";
import { Injector, runInInjectionContext, signal } from "@angular/core";
import { AuditSessionState } from "../../app/audit-feature/audit-session-state";
import { CheckerSessionState } from "../../app/checker-feature/checker-session-state";
import { LoadingStateComponent } from "../../app/loading-state.component";

describe("simple portal state and loading presentation", () => {
  it("retains audit view choices in signals", () => {
    const state = runInInjectionContext(Injector.create({ providers: [] }), () =>
      new AuditSessionState(),
    );
    expect([
      state.tab(),
      state.sortKey(),
      state.sortDirection(),
      state.indexSortPath(),
    ]).toEqual(["rma", "title", "asc", null]);

    state.tab.set("entity");
    state.sortKey.set("maker");
    state.sortDirection.set("desc");
    state.indexSortPath.set("updatedAt");
    expect([
      state.tab(),
      state.sortKey(),
      state.sortDirection(),
      state.indexSortPath(),
    ]).toEqual(["entity", "maker", "desc", "updatedAt"]);
  });

  it("retains checker view choices in signals", () => {
    const state = runInInjectionContext(Injector.create({ providers: [] }), () =>
      new CheckerSessionState(),
    );
    expect([
      state.tab(),
      state.sortPath(),
      state.sortDirection(),
      state.currentPage(),
    ]).toEqual(["rma", null, "asc", 1]);

    state.tab.set("nostro");
    state.sortPath.set("maker");
    state.sortDirection.set("desc");
    state.currentPage.set(3);
    expect([
      state.tab(),
      state.sortPath(),
      state.sortDirection(),
      state.currentPage(),
    ]).toEqual(["nostro", "maker", "desc", 3]);
  });

  it.each(["inline", "screen"] as const)(
    "projects the %s loading variant through component inputs",
    (variant) => {
      const component = runInInjectionContext(
        Injector.create({ providers: [] }),
        () => new LoadingStateComponent(),
      );
      Object.defineProperties(component, {
        label: { value: signal("Loading governed records") },
        variant: { value: signal(variant) },
      });

      expect(component.label()).toBe("Loading governed records");
      expect(component.variant()).toBe(variant);
    },
  );
});
