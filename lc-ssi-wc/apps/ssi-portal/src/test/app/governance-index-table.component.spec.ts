import { readFileSync } from "node:fs";

describe("Governance index presentation", () => {
  it("supports an OAS-governed maintenance-style read-only index without changing other index defaults", () => {
    const component = readFileSync("apps/ssi-portal/src/app/governance-index-table.component.ts", "utf8");
    const template = readFileSync("apps/ssi-portal/src/app/governance-index-table.component.html", "utf8");
    const css = readFileSync("apps/ssi-portal/src/styles.css", "utf8");
    expect(component).toContain('readonly appearance = input<"audit" | "maintenance">("audit")');
    expect(template).toContain('class.maintenance-index');
    expect(template).toContain('presentation === \'status\'');
    expect(template).toContain('presentation === \'strong\'');
    expect(css).toContain('.maintenance-index');
    expect(template).toContain("@if (appearance() === 'maintenance')");
    expect(template).toContain('Page {{ currentPage() }} / {{ totalPages() }} · {{ totalRecords() }} {{ recordLabel() }}');
    expect(css).toContain('.maintenance-index .audit-pager');
    expect(css).not.toContain('border: 0;\n  border-radius: 0;\n  background: transparent;\n  box-shadow: none;');
  });
});
