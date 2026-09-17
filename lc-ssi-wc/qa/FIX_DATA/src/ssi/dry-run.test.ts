import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { Mt347DemoDryRunApplication } from "./dry-run.ts";

const oraclePath = fileURLToPath(
  new URL("../../ssi/mt347-demo-closure.v1.1.json", import.meta.url),
);
const ORACLE_SHA =
  "A4A24EDDC0C7E55DCDB3F60CBBDFE189408370D372EE1886F0D5BD9EE4F4D382";

describe("Mt347DemoDryRunApplication", () => {
  it("writes deterministic generated data and a zero-write PASS report", () => {
    const firstDirectory = mkdtempSync(join(tmpdir(), "mt347-dry-run-a-"));
    const secondDirectory = mkdtempSync(join(tmpdir(), "mt347-dry-run-b-"));
    const app = new Mt347DemoDryRunApplication({
      oraclePath,
      oracleSha256: ORACLE_SHA,
    });

    const first = app.execute(firstDirectory);
    const second = app.execute(secondDirectory);

    assert.equal(first.passed, true);
    assert.equal(first.mismatchCount, 0);
    assert.equal(first.databaseWrites, 0);
    assert.equal(first.generatedDatasetSha256, second.generatedDatasetSha256);
    assert.equal(
      readFileSync(first.generatedDatasetPath, "utf8"),
      readFileSync(second.generatedDatasetPath, "utf8"),
    );
    assert.equal(
      JSON.parse(readFileSync(first.reportPath, "utf8")).actual
        .totalOracleContexts,
      3120,
    );
  });
});
