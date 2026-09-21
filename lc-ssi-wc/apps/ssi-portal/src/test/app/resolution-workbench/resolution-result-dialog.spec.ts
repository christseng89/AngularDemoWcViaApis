/** @jest-environment jsdom */

import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("resolution result modal flow", () => {
  const directory = join(
    process.cwd(),
    "apps/ssi-portal/src/app/resolution-workbench",
  );
  const workbench = readFileSync(
    join(directory, "resolution-workbench.component.html"),
    "utf8",
  );
  const dialogTemplate = readFileSync(
    join(directory, "resolution-result-dialog.component.html"),
    "utf8",
  );

  it("opens the successful result in an accessible modal instead of inline", () => {
    const document = new DOMParser().parseFromString(
      dialogTemplate,
      "text/html",
    );
    const dialog = document.querySelector("dialog[open]");

    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.querySelector("ssi-resolution-evidence")).not.toBeNull();
    expect(
      dialog?.querySelectorAll('[aria-label="Cancel resolution result"]'),
    ).toHaveLength(1);
    expect(workbench).toContain("<ssi-resolution-result-dialog");
    expect(workbench).not.toContain("<ssi-resolution-evidence");
  });

  it("keeps the parameter form mounted while the result modal is conditional", () => {
    expect(workbench.indexOf("<ssi-generic-parameter-form")).toBeLessThan(
      workbench.indexOf("@if (result()"),
    );
    expect(workbench).toContain('(closed)="closeResult()"');
  });
});
