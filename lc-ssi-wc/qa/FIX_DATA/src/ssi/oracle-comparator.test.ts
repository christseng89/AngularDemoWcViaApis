import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { Mt347DemoFixtureGenerator } from "./mt347-demo.generator.ts";
import { Mt347OracleComparator } from "./oracle-comparator.ts";
import { Mt347DemoOracleRepository } from "./oracle.repository.ts";

const oracle = new Mt347DemoOracleRepository({
  oraclePath: fileURLToPath(
    new URL("../../ssi/mt347-demo-closure.v1.1.json", import.meta.url),
  ),
  expectedSha256:
    "A4A24EDDC0C7E55DCDB3F60CBBDFE189408370D372EE1886F0D5BD9EE4F4D382",
}).load();
const dataset = new Mt347DemoFixtureGenerator().generate(oracle);

describe("Mt347OracleComparator", () => {
  it("passes a generated dataset that exactly matches the Oracle", () => {
    const result = new Mt347OracleComparator().compare(oracle, dataset);

    assert.equal(result.passed, true);
    assert.equal(result.mismatchCount, 0);
    assert.equal(result.actual.totalOracleContexts, 3120);
    assert.equal(result.actual.databaseWrites, 0);
  });

  it("reports a changed reason code without mutating the Oracle", () => {
    const first = dataset.contexts[0];
    assert.ok(first);
    const changed = {
      ...dataset,
      contexts: [
        { ...first, reasonCode: "BROKEN_REASON" },
        ...dataset.contexts.slice(1),
      ],
    };

    const result = new Mt347OracleComparator().compare(oracle, changed);

    assert.equal(result.passed, false);
    assert.equal(result.mismatchCount, 1);
    assert.equal(result.mismatches[0]?.field, "reasonCode");
    assert.equal(result.mismatches[0]?.contextKey, first.key);
  });
});
