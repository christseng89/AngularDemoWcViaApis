import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Checker lazy route view", () => {
  const featureTemplate = () =>
    readFileSync(join(join(process.cwd(), "apps/ssi-portal/src/app/checker-feature"), "checker-route.component.html"), "utf8");
  const parentTemplate = () =>
    readFileSync(join(join(process.cwd(), "apps/ssi-portal/src/app/checker-feature"), "../app.component.html"), "utf8");

  it("owns the four Checker tabs and the shared governed SSI index", () => {
    const html = featureTemplate();
    expect(html).toContain('aria-label="Checker resource"');
    expect(html).toContain("<ssi-swift-data-crud");
    expect(html).toContain("<ssi-governance-index-table");
    expect(html).toContain("checker.indexRows()");
  });

  it("removes the superseded parent Checker deferred block", () => {
    const html = parentTemplate();
    expect(html).not.toContain('@defer (when view() === "checker"');
    expect(html).toContain("<router-outlet");
  });
});
