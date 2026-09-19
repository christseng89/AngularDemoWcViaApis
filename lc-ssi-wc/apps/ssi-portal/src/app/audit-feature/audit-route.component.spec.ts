import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Audit lazy route view", () => {
  const featureTemplate = () =>
    readFileSync(join(__dirname, "audit-route.component.html"), "utf8");
  const parentTemplate = () =>
    readFileSync(join(__dirname, "../app.component.html"), "utf8");

  it("owns the governed Audit tabs, index and read-only event detail", () => {
    const html = featureTemplate();
    expect(html).toContain('aria-label="Audit resource"');
    expect(html).toContain("<ssi-governance-index-table");
    expect(html).toContain("<ssi-governed-record-view");
    expect(html).toContain("audit.indexRows()");
  });

  it("removes the superseded parent Audit deferred block and detail overlay", () => {
    const html = parentTemplate();
    expect(html).not.toContain('@defer (when view() === "audit"');
    expect(html).not.toContain("@if (auditDetail(); as detail)");
    expect(html).toContain("<router-outlet");
  });

  it("exposes Audit-owned refresh without calling SSI Maintenance", () => {
    const route = readFileSync(
      join(__dirname, "audit-route.component.ts"),
      "utf8",
    );
    expect(route).toMatch(
      /refresh\(\): Promise<void>\s*\{\s*return this\.audit\.load\(\);/,
    );
  });
});
