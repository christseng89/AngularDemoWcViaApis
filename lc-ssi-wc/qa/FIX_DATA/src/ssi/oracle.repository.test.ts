import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { Mt347DemoOracleRepository } from "./oracle.repository.ts";

const oraclePath = fileURLToPath(
  new URL("../../ssi/mt347-demo-closure.v1.1.json", import.meta.url),
);

const ORACLE_SHA =
  "A4A24EDDC0C7E55DCDB3F60CBBDFE189408370D372EE1886F0D5BD9EE4F4D382";

describe("Mt347DemoOracleRepository", () => {
  it("loads the frozen v1.1 Oracle only when its SHA matches", () => {
    const oracle = new Mt347DemoOracleRepository({
      oraclePath,
      expectedSha256: ORACLE_SHA,
    }).load();

    assert.equal(oracle.documentId, "MT347-DEMO-CLOSURE-V1.1");
    assert.equal(oracle.groups.length, 208);
    assert.equal(oracle.reconciliation.actual.totalOracleContexts, 3120);
  });

  it("fails closed when the expected SHA is wrong", () => {
    assert.throws(
      () =>
        new Mt347DemoOracleRepository({
          oraclePath,
          expectedSha256: "0".repeat(64),
        }).load(),
      /ORACLE_SHA_MISMATCH/,
    );
  });
});
