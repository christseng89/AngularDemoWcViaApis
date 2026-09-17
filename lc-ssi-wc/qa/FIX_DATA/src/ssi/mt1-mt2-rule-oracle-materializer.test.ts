import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  NoInferenceContractValidator,
  type ContractArtifactSet,
} from "./mt1-mt2-contract-validator.ts";
import { SsiRuleOracleMaterializer } from "./mt1-mt2-rule-oracle-materializer.ts";

const artifactRoot = resolve("qa/FIX_DATA/ssi/mt1-mt2");
const readJson = (name: string) =>
  JSON.parse(readFileSync(resolve(artifactRoot, name), "utf8"));

test("materializes the approved Round 4 partition without DB or Nostro effects", () => {
  const materialized = new SsiRuleOracleMaterializer(
    "data/ssi-demo.sqlite",
    artifactRoot,
  ).build();
  const rules = materialized.ruleTable.rows as Record<string, unknown>[];
  const oracle = materialized.oracle.rows as Record<string, unknown>[];
  const partitions = materialized.partitionManifest.partitions as Record<
    string,
    unknown[]
  >;

  assert.equal(rules.length, 67);
  assert.equal(oracle.length, 67);
  assert.equal(partitions.CONVERT.length, 30);
  assert.equal(partitions.REMOVE_SOURCE_TOKEN.length, 32);
  assert.equal(partitions.OUT_OF_SCOPE.length, 5);
  assert.equal(partitions.HOLD_DEPENDENCY.length, 0);
  for (const [rows, key] of [
    [materialized.executionContexts.contexts, "contextId"],
    [materialized.derivationCatalogue.tuples, "derivationRuleId"],
    [materialized.selectedIdentityManifest.pairs, "scope"],
  ] as [Record<string, unknown>[], string][]) {
    assert.equal(
      new Set(rows.map((row) => String(row[key]))).size,
      rows.length,
    );
  }

  assert.equal(
    rules.reduce((sum, row) => sum + Number(row.expectedSsiRowDelta), 0),
    49,
  );
  assert.equal(
    rules.reduce(
      (sum, row) => sum + Number(row.expectedApplicabilityRowDelta),
      0,
    ),
    128,
  );
  assert.equal(
    rules.reduce((sum, row) => sum + Number(row.expectedStubCallCount), 0),
    0,
  );
  assert.equal(
    rules.reduce((sum, row) => sum + Number(row.expectedDbWriteCount), 0),
    0,
  );
  const executable = rules.filter((row) =>
    ["CONVERT", "REMOVE_SOURCE_TOKEN"].includes(
      String(row.mutationDisposition),
    ),
  );
  assert.equal(executable.length, 62);
  assert.equal(
    executable.every(
      (row) =>
        row.amendmentOfId ===
        (row.inputCondition as Record<string, unknown>).sourceRecordId,
    ),
    true,
  );
  assert.equal(
    rules
      .filter((row) => row.mutationDisposition === "OUT_OF_SCOPE")
      .every((row) => row.amendmentOfId === "NOT_APPLICABLE"),
    true,
  );

  const pacs009 = rules.filter(
    (row) =>
      (row.inputCondition as Record<string, unknown>).family === "pacs.009",
  );
  assert.equal(pacs009.length, 43);
  assert.equal(
    pacs009.every((row) =>
      String(
        (row.inputCondition as Record<string, unknown>).targetToken,
      ) === "pacs.009.001.08",
    ),
    true,
  );
  assert.equal(
    pacs009.some(
      (row) =>
        String((row.inputCondition as Record<string, unknown>).targetToken) ===
        "pacs.009.001.12",
    ),
    false,
  );

  const artifacts: ContractArtifactSet = {
    schema: readJson("rule-oracle.schema.v1.json"),
    payloads: readJson("schema-meta-test-payloads.v1.json"),
    vectors: readJson("schema-meta-test-vectors.v1.json"),
    apiCatalogue: readJson("api-execution-contract-catalogue.v1.json"),
    derivationCatalogue:
      materialized.derivationCatalogue as ContractArtifactSet["derivationCatalogue"],
    selectedIdentityManifest:
      materialized.selectedIdentityManifest as ContractArtifactSet["selectedIdentityManifest"],
    baEvidenceRegistry: readJson("ba-ruling-evidence-registry.v1.json"),
    oosCatalogue: readJson("out-of-scope-message-catalogue.v1.json"),
    controlledSourceRegistry: readJson(
      "controlled-source-evidence-registry.v1.json",
    ),
    qaEvidenceRegistry: readJson("qa-invariant-evidence-registry.v1.json"),
    productPolicyRegistry: readJson("product-policy-evidence-registry.v1.json"),
    ruleTable: materialized.ruleTable as ContractArtifactSet["ruleTable"],
    oracle: materialized.oracle as ContractArtifactSet["oracle"],
    partitionManifest: materialized.partitionManifest,
    partitionRuling: readJson("round4-partition-ruling.v1.json"),
    partitionRulingSha256:
      "8EE334403C8CC94CF34B0470C7F7D4F2032C0E33645D065F0BB1110DE5B6FCA6",
    executionContexts: materialized.executionContexts,
    canonicalGroupManifest: materialized.canonicalGroupManifest,
    activeInventory: readJson("active-inventory.v1.json"),
  };
  const closure = new NoInferenceContractValidator(
    artifacts,
  ).validateClosureArtifacts();

  const badLineage = structuredClone(artifacts);
  badLineage.ruleTable.rows[0].amendmentOfId = "NOT_APPLICABLE";
  const badLineageClosure = new NoInferenceContractValidator(
    badLineage,
  ).validateClosureArtifacts();
  assert.ok(badLineageClosure.nestedReferenceErrors > 0);

  assert.deepEqual(
    {
      schemaErrors: closure.schemaErrors,
      closureErrors: closure.closureErrors,
      aliasMultiplicityErrors: closure.aliasMultiplicityErrors,
      aliasInventoryErrors: closure.aliasInventoryErrors,
      ruleOracleJoinErrors: closure.ruleOracleJoinErrors,
      nestedReferenceErrors: closure.nestedReferenceErrors,
    },
    {
      schemaErrors: 0,
      closureErrors: 0,
      aliasMultiplicityErrors: 0,
      aliasInventoryErrors: 0,
      ruleOracleJoinErrors: 0,
      nestedReferenceErrors: 0,
    },
  );
});
