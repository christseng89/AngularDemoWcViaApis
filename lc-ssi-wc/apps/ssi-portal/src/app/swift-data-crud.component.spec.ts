import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("SWIFT Data canonical SSI entrypoint", () => {
  it("keeps SSI out of the SWIFT Data resource navigation", () => {
    const ids = ["rma", "ssi", "entity", "nostro"];
    expect(ids.filter((id) => id !== "ssi")).toEqual(["rma", "entity", "nostro"]);
  });

  it("delegates HTTP transport to a feature-scoped API service", () => {
    const component = readFileSync(
      join(__dirname, "swift-data-crud.component.ts"),
      "utf8",
    );
    expect(component).not.toContain('from "@angular/common/http"');
    expect(component).not.toContain("inject(HttpClient)");
    expect(component).not.toMatch(/\bthis\.http\.(get|post|request|delete)\(/);
    expect(component).toContain("inject(SwiftDataApiService)");
  });

  it("delegates Excel and JSON document generation to a separate export owner", () => {
    const component = readFileSync(
      join(__dirname, "swift-data-crud.component.ts"),
      "utf8",
    );
    expect(component).not.toContain('import("exceljs")');
    expect(component).not.toContain("inject(DOCUMENT)");
    expect(component).not.toMatch(/\bprivate (addDataSheet|addApplicabilitySheet|addMetadataSheet|download)\(/);
    expect(component).toContain("inject(SwiftDataExportService)");
  });

  it("keeps bank lookup pagination in a narrow picker owner", () => {
    const component = readFileSync(
      join(__dirname, "swift-data-crud.component.ts"),
      "utf8",
    );
    expect(component).not.toMatch(/\bprivate async loadBankPage\(/);
    expect(component).not.toMatch(/\bbankPage = signal/);
    expect(component).toContain("inject(SwiftDataBankPicker)");
  });

  it("keeps RMA opposite-direction selection in its own governed state", () => {
    const component = readFileSync(
      join(__dirname, "swift-data-crud.component.ts"),
      "utf8",
    );
    expect(component).not.toContain("rmaDirectionMessageTypes = new Map");
    expect(component).not.toMatch(/\bprivate preferredRmaRow\(/);
    expect(component).toContain("inject(SwiftDataRmaSelection)");
  });

  it("keeps WIP reservation and concurrent release in one feature session", () => {
    const component = readFileSync(
      join(__dirname, "swift-data-crud.component.ts"),
      "utf8",
    );
    expect(component).not.toContain("pendingDeactivation: Promise<boolean>");
    expect(component).not.toMatch(/\bprivate async releaseRevisionReservation\(/);
    expect(component).toContain("inject(SwiftDataRevisionSession)");
  });

  it("maps governed OAS fields outside the feature host", () => {
    const component = readFileSync(
      join(__dirname, "swift-data-crud.component.ts"),
      "utf8",
    );
    expect(component).not.toMatch(/\bprivate formlyField\(/);
    expect(component).not.toMatch(/\bprivate fieldProps\(/);
    expect(component).not.toMatch(/\bprivate toApiPayload\(/);
    expect(component).toContain("inject(SwiftDataFieldMapper)");
  });

  it("keeps index query, paging and sorting in a feature-scoped index owner", () => {
    const component = readFileSync(
      join(__dirname, "swift-data-crud.component.ts"),
      "utf8",
    );
    expect(component).not.toMatch(/\breadonly rows = signal/);
    expect(component).not.toMatch(/\breadonly sortPath = signal/);
    expect(component).not.toMatch(/\bconst query = new URLSearchParams/);
    expect(component).toContain("inject(SwiftDataIndexStore)");
  });

  it("keeps editor lifecycle operations in a feature-scoped editor owner", () => {
    const component = readFileSync(
      join(__dirname, "swift-data-crud.component.ts"),
      "utf8",
    );
    expect(component).toContain("inject(SwiftDataEditorSession)");
    expect(component).not.toContain("this.api.save(");
    expect(component).not.toContain("this.api.revise(");
    expect(component).not.toContain("this.api.suppress(");
    expect(component).not.toContain("this.api.import(");
  });
});
