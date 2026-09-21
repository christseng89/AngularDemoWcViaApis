import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("shared lifecycle status filters", () => {
  it.each([
    "swift-data-crud.component.html",
    "app.component.html",
  ])("does not expose the legacy Activate step in %s", (template) => {
    const source = readFileSync(join(join(process.cwd(), "apps/ssi-portal/src/app"), template), "utf8");

    expect(source).not.toContain('{ value: "APPROVED", label: "Activate" }');
    expect(source).not.toContain(">Activate<");
    expect(source).not.toContain('label: "Workflow"');
  });
});
