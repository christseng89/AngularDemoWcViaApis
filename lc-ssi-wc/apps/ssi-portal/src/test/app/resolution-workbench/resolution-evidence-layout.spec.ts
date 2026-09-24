import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("resolution evidence layout", () => {
  const directory = join(
    process.cwd(),
    "apps/ssi-portal/src/app/resolution-workbench",
  );
  const component = readFileSync(
    join(directory, "resolution-evidence.component.ts"),
    "utf8",
  );
  const stylesheet = readFileSync(
    join(directory, "resolution-workbench.css"),
    "utf8",
  );
  const generatedOutputs = readFileSync(
    join(directory, "resolution-generated-outputs.component.ts"),
    "utf8",
  );

  it("places the compact outcome summary above the full-width result table", () => {
    expect(component).toContain('class="outcome-summary"');
    expect(component.indexOf('class="outcome-summary"')).toBeLessThan(
      component.indexOf("<ssi-resolution-result-table"),
    );
    expect(stylesheet).toMatch(
      /\.outcome,\s*\.failure\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(component.indexOf("Payload generated")).toBeGreaterThan(
      component.indexOf("<details"),
    );
  });

  it("contains wide result content without forcing a page-level scrollbar", () => {
    expect(stylesheet).toMatch(
      /\.resolution-results\s*\{[\s\S]*?max-width:\s*100%;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(stylesheet).toMatch(
      /\.resolution-results__scroll\s*\{[\s\S]*?overflow-x:\s*auto;/,
    );
    expect(stylesheet).not.toContain("min-width: 86rem;");
  });

  it("keeps technical booleans out of the primary outcome summary", () => {
    const summaryEnd = component.indexOf("<ssi-resolution-result-table");
    const primarySummary = component.slice(0, summaryEnd);

    expect(primarySummary).not.toContain("Payload generated");
    expect(primarySummary).not.toContain("Resolution created");
    expect(primarySummary).not.toContain("Repair queue created");
  });

  it("renders the independent MT1 SSI applicability and resolution outcome", () => {
    expect(component).toContain("result().ssiApplicability");
    expect(component).toContain("result().resolutionOutcome");
    expect(component).toContain("result().routeBindingId");
  });

  it("avoids repeating the selected sequence in the result table", () => {
    const resultTable = readFileSync(
      join(directory, "resolution-result-table.component.html"),
      "utf8",
    );
    expect(resultTable).not.toContain('<th scope="col">Sequence</th>');
    expect(resultTable).not.toContain("row.sequenceId");
    expect(resultTable).toContain('<th scope="col">Tag + option</th>');
  });

  it("keeps the official field description and business role in separate columns", () => {
    const resultTable = readFileSync(
      join(directory, "resolution-result-table.component.html"),
      "utf8",
    );
    expect(resultTable).toContain(
      '<strong>{{ row.displayFieldName || "—" }}</strong>',
    );
    expect(resultTable).toContain('<th scope="col">Field description</th>');
    expect(resultTable).toContain('<th scope="col">Role</th>');
    expect(resultTable).toContain('{{ row.role || "—" }}');
  });

  it("omits the duplicated rendered value column from the primary table", () => {
    const resultTable = readFileSync(
      join(directory, "resolution-result-table.component.html"),
      "utf8",
    );
    expect(resultTable).not.toContain('<th scope="col">Rendered value</th>');
    expect(resultTable).not.toContain("row.renderedValue");
    expect(resultTable).toContain('<th scope="col">BIC</th>');
  });

  it("labels a single evidence output from its actual MT or MX format", () => {
    expect(generatedOutputs).toContain('singleEvidenceHeading()');
    expect(generatedOutputs).toContain('format === "SWIFT_MT"');
    expect(generatedOutputs).toContain('"MT SSI evidence"');
    expect(generatedOutputs).toContain('"ISO 20022 SSI evidence"');
    expect(generatedOutputs).not.toContain('"ISO 20022 SSI resolution"');
  });
});
