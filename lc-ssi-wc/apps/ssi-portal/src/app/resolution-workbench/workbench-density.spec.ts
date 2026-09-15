import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("resolution workbench desktop density", () => {
  const stylesheet = readFileSync(
    join(
      process.cwd(),
      "apps/ssi-portal/src/app/resolution-workbench/resolution-workbench.css",
    ),
    "utf8",
  );

  it("keeps the detail header, sections, and controls compact without zoom hacks", () => {
    expect(stylesheet).toContain("gap: 0.85rem;");
    expect(stylesheet).toContain("min-height: var(--control-height);");
    expect(stylesheet).toContain("font-family: var(--font-ui);");
    expect(stylesheet).toContain("padding: clamp(0.8rem, 1.4vw, 1.15rem);");
    expect(stylesheet).not.toMatch(/zoom\s*:/);
  });
});
