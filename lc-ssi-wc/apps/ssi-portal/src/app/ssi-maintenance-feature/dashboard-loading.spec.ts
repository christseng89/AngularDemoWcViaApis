import { readFileSync } from "node:fs";

describe("SSI Dashboard loading screen", () => {
  it("uses the shared accessible full-screen spinner only before rows exist", () => {
    const dashboard = readFileSync("apps/ssi-portal/src/app/ssi-maintenance-feature/dashboard-route.component.html", "utf8");
    const shared = readFileSync("apps/ssi-portal/src/app/loading-state.component.ts", "utf8");
    const facade = readFileSync("apps/ssi-portal/src/app/ssi-maintenance-feature/ssi-index.facade.ts", "utf8");
    expect(dashboard).toContain("index.ssiIndexLoading() && index.rows().length === 0");
    expect(dashboard).toContain('<ssi-loading-state label="Loading SSI records…" variant="screen" />');
    expect(dashboard.indexOf("Settlement Instructions")).toBeLessThan(dashboard.indexOf('<ssi-loading-state label="Loading SSI records…" variant="screen" />'));
    expect(shared).toContain('role="status"');
    expect(shared).toContain('aria-live="polite"');
    expect(shared).toContain('readonly variant = input<"inline" | "screen">("inline")');
    expect(facade).toContain("readonly ssiIndexLoading = signal(true)");
  });
});
