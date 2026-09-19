const loadIndex = jest.fn().mockResolvedValue(undefined);

jest.mock("@angular/core", () => ({
  Component: () => (target: unknown) => target,
  ChangeDetectionStrategy: { OnPush: "OnPush" },
  inject: () => ({ snapshot: { data: { businessDomain: "TREASURY" } } }),
  viewChild: () => () => ({ load: loadIndex }),
}));
jest.mock("@angular/router", () => ({ ActivatedRoute: class {} }));
jest.mock(
  "./resolution-workbench/page-definition-index-workspace.component",
  () => ({
    PageDefinitionIndexWorkspaceComponent: class {},
  }),
);

import { ResolutionRouteComponent } from "./resolution-route.component";

describe("ResolutionRouteComponent", () => {
  it("passes governed route domain to the existing ResolutionPageDefinition workspace without HTTP or domain orchestration", () => {
    const route = new ResolutionRouteComponent();
    expect(route.businessDomain).toBe("TREASURY");
    expect("http" in route).toBe(false);
    expect("client" in route).toBe(false);
  });

  it("refreshes only the active ResolutionPageDefinition workspace", async () => {
    const route = new ResolutionRouteComponent();
    await route.refresh();
    expect(loadIndex).toHaveBeenCalledTimes(1);
  });
});
