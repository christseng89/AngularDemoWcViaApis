import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { Mt347DemoFixtureGenerator } from "./mt347-demo.generator.ts";
import { Mt347DemoOracleRepository } from "./oracle.repository.ts";

const oracle = new Mt347DemoOracleRepository({
  oraclePath: fileURLToPath(
    new URL("../../ssi/mt347-demo-closure.v1.1.json", import.meta.url),
  ),
  expectedSha256:
    "A4A24EDDC0C7E55DCDB3F60CBBDFE189408370D372EE1886F0D5BD9EE4F4D382",
}).load();

describe("Mt347DemoFixtureGenerator", () => {
  const dataset = new Mt347DemoFixtureGenerator().generate(oracle);

  it("generates the exact frozen Oracle cardinalities", () => {
    assert.equal(dataset.groupCount, 208);
    assert.equal(dataset.contexts.length, 3120);
    assert.equal(dataset.ssiOwnedContextCount, 2580);
    assert.equal(dataset.outOfScopeContextCount, 540);
    assert.equal(new Set(dataset.contexts.map((row) => row.key)).size, 3120);
  });

  it("never performs SSI lookup or creates route candidates for OOS groups", () => {
    const outOfScope = dataset.contexts.filter(
      (row) => row.businessStatus === "OUT_OF_SCOPE_CLOSED",
    );

    assert.equal(outOfScope.length, 540);
    assert.ok(outOfScope.every((row) => row.ssiLookup === "NOT_PERFORMED"));
    assert.ok(outOfScope.every((row) => row.routeCandidateExpected === false));
    assert.ok(
      outOfScope.every(
        (row) => row.ssiRouteCandidateKey === "NOT_APPLICABLE",
      ),
    );
  });

  it("preserves fail-closed outcomes and zero side effects", () => {
    const ssiOwned = dataset.contexts.filter(
      (row) => row.businessStatus === "BA_CONFIRMED",
    );

    assert.ok(
      ssiOwned.every(
        (row) => row.resolverOutcome === "FAIL_CLOSED_NO_SSI_OUTPUT",
      ),
    );
    assert.ok(dataset.contexts.every((row) => row.sideEffects.total === 0));
    assert.equal(dataset.databaseWrites, 0);
  });
});
