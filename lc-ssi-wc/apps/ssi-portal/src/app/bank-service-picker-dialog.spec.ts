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
  const makerTemplate = readFileSync(
    join(
      process.cwd(),
      "apps/ssi-portal/src/app/ssi-maintenance-feature/maker-route.component.html",
    ),
    "utf8",
  );
  const sessionSource = readFileSync(
    join(process.cwd(), "apps/ssi-portal/src/app/ssi-maintenance-feature/ssi-maintenance-session.ts"),
    "utf8",
  );
  const makerSource = readFileSync(
    join(process.cwd(), "apps/ssi-portal/src/app/ssi-maintenance-feature/ssi-maker.facade.ts"),
    "utf8",
  );
  const apiSource = readFileSync(
    join(process.cwd(), "apps/ssi-portal/src/app/ssi-maintenance-api.service.ts"),
    "utf8",
  );
  const swiftDataTemplate = readFileSync(
    join(
      process.cwd(),
      "apps/ssi-portal/src/app/swift-data-crud.component.html",
    ),
    "utf8",
  );
  const swiftDataContract = JSON.parse(
    readFileSync(
      join(
        process.cwd(),
        "apps/ssi-portal/public/openapi/swift-data-service.v1.json",
      ),
      "utf8",
    ),
  ) as {
    "x-ui-resources": Array<{
      id: string;
      fields: Array<Record<string, unknown>>;
    }>;
  };

  it("is reused by both SSI maintenance and parameter-driven scenarios", () => {
    expect(scenarioTemplate).toContain("<ssi-bank-service-picker-dialog");
    expect(makerTemplate).toContain("<ssi-bank-service-picker-dialog");
    expect(appTemplate).not.toContain("<ssi-bank-service-picker-dialog");
    expect(appTemplate).not.toContain("bankPage().items; track bank.bic");
  });

  it("drives RMA and Nostro BIC fields from Bank Service parameters", () => {
    expect(swiftDataTemplate).toContain("<ssi-bank-service-picker-dialog");
    const fields = swiftDataContract["x-ui-resources"]
      .filter(({ id }) => id === "rma" || id === "nostro")
      .flatMap(({ fields: resourceFields }) => resourceFields)
      .filter(({ key }) =>
        ["ownBic", "counterpartyBic", "accountServicerBic"].includes(
          String(key),
        ),
      );
    expect(fields).toHaveLength(3);
    expect(fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "ownBic",
          type: "bic-input",
          referenceSource: "reference/banks",
        }),
        expect.objectContaining({
          key: "counterpartyBic",
          type: "bic-input",
          referenceSource: "reference/banks",
        }),
        expect.objectContaining({
          key: "accountServicerBic",
          type: "bic-input",
          referenceSource: "reference/banks",
        }),
      ]),
    );
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
    expect(sessionSource).toContain("this.index.indexPageSize");
    expect(makerSource).toContain("this.api.lookupBanks(page, this.bankPageSize, this.bankQuery())");
    expect(apiSource).toContain("pageSize=${pageSize}");
    expect(makerTemplate).toContain('[error]="maker.bankPickerError()"');
  });
});
