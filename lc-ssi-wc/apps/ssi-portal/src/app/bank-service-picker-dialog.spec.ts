import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("shared Bank Service picker contract", () => {
  const template = readFileSync(
    join(
      process.cwd(),
      "apps/ssi-portal/src/app/bank-service-picker-dialog.component.html",
    ),
    "utf8",
  );
  const scenarioTemplate = readFileSync(
    join(
      process.cwd(),
      "apps/ssi-portal/src/app/resolution-workbench/bank-service-lookup.component.html",
    ),
    "utf8",
  );
  const appTemplate = readFileSync(
    join(process.cwd(), "apps/ssi-portal/src/app/app.component.html"),
    "utf8",
  );
  const appSource = readFileSync(
    join(process.cwd(), "apps/ssi-portal/src/app/app.component.ts"),
    "utf8",
  );

  it("is reused by both SSI maintenance and parameter-driven scenarios", () => {
    expect(scenarioTemplate).toContain("<ssi-bank-service-picker-dialog");
    expect(appTemplate).toContain("<ssi-bank-service-picker-dialog");
    expect(appTemplate).not.toContain("bankPage().items; track bank.bic");
  });

  it("supports search, select, cancel, paging, loading, errors and empty results", () => {
    expect(template).toContain(
      '(submit)="$event.preventDefault(); search(searchInput.value)"',
    );
    expect(template).toContain('(click)="selected.emit(bank)"');
    expect(template).toContain('(click)="cancel()"');
    expect(template).toContain('(click)="pageRequested.emit(page() - 1)"');
    expect(template).toContain('(click)="pageRequested.emit(page() + 1)"');
    expect(template).toContain("loading()");
    expect(template).toContain("error()");
    expect(template).toContain("emptyMessage()");
  });

  it("keeps the stable service id out of the visible table", () => {
    expect(template).toContain("track bank.bankServiceId");
    expect(template).not.toContain("{{ bank.bankServiceId }}");
  });

  it("uses the shared index page size and keeps lookup errors in the dialog", () => {
    expect(appSource).toContain("pageSize=${this.indexPageSize}");
    expect(appSource).not.toMatch(/reference\/banks[^`]*pageSize=(?:5|20)/);
    expect(appTemplate).toContain('[error]="bankPickerError()"');
  });
});
