import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("payment message index interaction contract", () => {
  const template = readFileSync(
    join(
      process.cwd(),
      "apps/ssi-portal/src/app/resolution-workbench/page-definition-index-table.component.html",
    ),
    "utf8",
  );

  it("activates count-one and count-many rows through the shared pointer action", () => {
    expect(template).toContain("Search {{ domainLabel() }} Message Index");
    expect(template).toContain('(click)="activateGroup(group, $event)"');
    expect(template).not.toContain('(click)="selectedGroupId.set(group.id)"');
    // A browser double-click emits two click events. Do not add a second
    // dblclick binding, which would open/request the same scenario three times.
    expect(template).not.toContain('(dblclick)="activateGroup(group, $event)"');
    expect(template).toContain(
      '(keydown.enter)="activateGroup(group, $event)"',
    );
    expect(template).toContain('[selection]="selection"');
    expect(template).toContain('(cancelled)="backToScenarios()"');
    expect(template).not.toContain('[query]="selection.query"');
  });

  it("opens a scenario row with one click or keyboard without duplicate double-click requests", () => {
    expect(template).toContain('(click)="openScenario(row)"');
    expect(template).not.toContain('(dblclick)="openScenario(row)"');
    expect(template).toContain('(keydown.enter)="openScenario(row)"');
    expect(template.replace(/\s+/g, " ")).toContain(
      "Click or press Enter to open.",
    );
  });

  it("omits the redundant family column and keeps generated tags separate from inputs", () => {
    expect(template).not.toContain("MESSAGE FAMILY");
    expect(template).toContain("MESSAGE TYPE");
    expect(template).not.toContain("MT TYPE");
    expect(template).not.toContain("group.familyLabel");
    expect(template).toContain('colspan="6"');
    expect(template).toContain("group.profileCount > 1");
    expect(template).not.toContain('group.profileCount === 1 ? "profile"');
    expect(template).toContain("PROFILE / BIZSVC");
    expect(template).toContain("row.profileLabel");
    expect(template).toContain("SSI GENERATED TAGS");
    expect(template).toContain("INPUT FIELDS");
    expect(template).toContain('group.profileSlots.join(" · ")');
    expect(template).toContain('group.inputFields.join(" · ")');
  });

  it("does not render the selected bank again as a lookup candidate", () => {
    const lookupTemplate = readFileSync(
      join(
        process.cwd(),
        "apps/ssi-portal/src/app/resolution-workbench/bank-service-lookup.component.html",
      ),
      "utf8",
    );
    expect(lookupTemplate).toContain('[items]="pickerItems()"');
    expect(lookupTemplate).not.toContain("selected()?.bankServiceId ===");
  });

  it("uses the shared modal instead of expanding lookup results inline", () => {
    const lookupTemplate = readFileSync(
      join(
        process.cwd(),
        "apps/ssi-portal/src/app/resolution-workbench/bank-service-lookup.component.html",
      ),
      "utf8",
    );
    expect(lookupTemplate).toContain("<ssi-bank-service-picker-dialog");
    expect(lookupTemplate).toContain(
      '[disabled]="disabled() || !lookupAvailable()"',
    );
    expect(lookupTemplate).not.toContain("lookup-results");
    expect(lookupTemplate).not.toContain("Find a bank");
    expect(lookupTemplate).toContain("prerequisiteMessage()");
    expect(lookupTemplate).toContain("lookup-prerequisite");
  });

  it("renders every metadata-governed lookup without inferring from its data type", () => {
    const formTemplate = readFileSync(
      join(
        process.cwd(),
        "apps/ssi-portal/src/app/resolution-workbench/generic-parameter-form.component.html",
      ),
      "utf8",
    );
    expect(formTemplate).toContain("} @else if (field.lookup) {");
    expect(formTemplate).not.toContain(
      'field.dataType === "SWIFT_BIC" && field.lookup',
    );
  });

  it("shows API context once in the compact summary and keeps audit collapsed", () => {
    const workbenchTemplate = readFileSync(
      join(
        process.cwd(),
        "apps/ssi-portal/src/app/resolution-workbench/resolution-workbench.component.html",
      ),
      "utf8",
    );
    expect(
      workbenchTemplate.match(/@for \(item of page\.context/g),
    ).toHaveLength(1);
    expect(workbenchTemplate).toContain(
      '<details class="audit-details workbench-audit">',
    );
    expect(workbenchTemplate).not.toContain("<details open");
  });

  it("shows the governed selected scenario above the shared workbench", () => {
    const workbenchTemplate = readFileSync(
      join(
        process.cwd(),
        "apps/ssi-portal/src/app/resolution-workbench/resolution-workbench.component.html",
      ),
      "utf8",
    );
    expect(workbenchTemplate).toContain(
      "SCENARIO · {{ page.selectedScenarioLabel }}",
    );
    expect(workbenchTemplate).not.toContain("STEP 03 · REVIEW AND RESOLVE");
  });

  it("does not expose a second scenario selector that can bypass audience tabs", () => {
    const workbenchTemplate = readFileSync(
      join(
        process.cwd(),
        "apps/ssi-portal/src/app/resolution-workbench/resolution-workbench.component.html",
      ),
      "utf8",
    );
    expect(workbenchTemplate).not.toContain('class="scenario-selector"');
    expect(workbenchTemplate).not.toContain("selectScenario($event)");
  });

  it("routes PAYMENT through the same OAS-driven index and workbench", () => {
    const appTemplate = readFileSync(
      join(process.cwd(), "apps/ssi-portal/src/app/app.component.html"),
      "utf8",
    );
    const routeSource = readFileSync(
      join(process.cwd(), "apps/ssi-portal/src/app/app.routes.ts"),
      "utf8",
    );
    const hostSource = readFileSync(
      join(
        process.cwd(),
        "apps/ssi-portal/src/app/resolution-route.component.ts",
      ),
      "utf8",
    );

    expect(appTemplate).toContain("<router-outlet");
    expect(appTemplate).not.toContain("<ssi-page-definition-index-workspace");
    expect(routeSource).toContain('path: "resolution/payment"');
    expect(routeSource).toContain('data: { businessDomain: "PAYMENT" }');
    expect(routeSource).toContain('import("./resolution-route.component")');
    expect(hostSource).toMatch(
      /<ssi-page-definition-index-workspace\s+\[businessDomain\]="businessDomain"\s*\/>/,
    );
    expect(appTemplate).not.toContain(
      '<table aria-label="Payment Message Index">',
    );
    expect(appTemplate).not.toContain(
      '<table aria-label="Payment Message Scenario Index">',
    );
  });
});
