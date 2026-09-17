import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import type { GeneratedMt347DemoDataset } from "./mt347-demo.generator.ts";
import { Mt347CanonicalSeedMapper } from "./mt347-canonical-seed.mapper.ts";

const readJson = <T>(relativePath: string): T =>
  JSON.parse(
    readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8"),
  ) as T;

const source = readJson<Record<string, unknown>>(
  "../../rma/reload-test-data/ssi-demo.v15.8.pacs009-repaired-isolated.canonical.seed.json",
);
const generated = readJson<GeneratedMt347DemoDataset>(
  "../../ssi/generated/mt347-demo-generated.v1.1.json",
);

describe("Mt347CanonicalSeedMapper", () => {
  const result = new Mt347CanonicalSeedMapper().map(source, generated);

  it("adds a versioned controlled graph without changing the historical graph", () => {
    assert.equal(result.report.oracleContexts, 3120);
    assert.equal(result.report.mappedSsiContexts, 2580);
    assert.equal(result.report.outOfScopeOracleOnlyContexts, 540);
    assert.equal(result.report.historicalMt347SsiRows, 5385);
    assert.equal(result.report.versionedMt347SsiRows, 4860);
    assert.equal(result.report.physicalMt347SsiRows, 10245);
    assert.equal(result.report.historicalIdCollisions, 0);
    assert.equal(result.report.applicabilityIdCollisions, 0);
    assert.equal(result.report.unmatchedSsiOwnedContexts, 0);
    assert.equal(result.report.databaseWrites, 0);
    assert.equal(result.report.resultingMt347SsiRows, 4860);

    const sourceTables = (source as { tables: Record<string, unknown> }).tables;
    const sourceSsi = sourceTables["ssi"] as { rows: unknown[] };
    const sourceApplicability = sourceTables["ssi_applicability"] as {
      rows: unknown[];
    };
    const assertContainsUnchanged = (
      actual: readonly (readonly unknown[])[],
      expected: readonly unknown[],
    ): void => {
      const rows = new Set(actual.map((row) => JSON.stringify(row)));
      assert.ok(expected.every((row) => rows.has(JSON.stringify(row))));
    };
    assertContainsUnchanged(result.seed.tables["ssi"]!.rows, sourceSsi.rows);
    assertContainsUnchanged(
      result.seed.tables["ssi_applicability"]!.rows,
      sourceApplicability.rows,
    );
  });

  it("does not alter RMA, Nostro, Entity or their audit tables", () => {
    const sourceTables = (source as { tables: Record<string, unknown> }).tables;
    const resultTables = result.seed.tables;
    for (const table of [
      "rma_authorisation",
      "rma_audit_event",
      "nostro_account",
      "nostro_audit_event",
      "booking_branch_entity",
      "booking_branch_entity_audit",
    ]) {
      assert.deepEqual(resultTables[table], sourceTables[table]);
    }
  });

  it("marks retained MT347 negative routes as non-payment reference data", () => {
    const ssi = result.seed.tables["ssi"]!;
    const payloadIndex = ssi.columns.indexOf("payload");
    const negative = ssi.rows
      .map((row) => JSON.parse(String(row[payloadIndex])) as Record<string, unknown>)
      .filter((row) => row["fixtureFamily"] === "MT347-SR2026-SSI")
      .filter(
        (row) => row["fixtureVariantVersion"] === "MT347-DEMO-ORACLE-V1.1",
      )
      .filter(
        (row) =>
          (row["route"] as Record<string, unknown>)["fixtureSet"] ===
          "MT347-NEGATIVE",
      );

    assert.equal(negative.length, 2580);
    assert.ok(
      negative.every((row) => {
        const route = row["route"] as Record<string, unknown>;
        return (
          route["settlementModel"] === "FIN_REFERENCE_ONLY" &&
          route["paymentExecutable"] === "false" &&
          route["oracleBusinessStatus"] === "BA_CONFIRMED"
        );
      }),
    );
  });

  it("maps all positive fixtures to the same controlled reference-only profile", () => {
    const ssi = result.seed.tables["ssi"]!;
    const payloadIndex = ssi.columns.indexOf("payload");
    const positive = ssi.rows
      .map((row) => JSON.parse(String(row[payloadIndex])) as Record<string, unknown>)
      .filter((row) => row["fixtureFamily"] === "MT347-SR2026-SSI")
      .filter(
        (row) => row["fixtureVariantVersion"] === "MT347-DEMO-ORACLE-V1.1",
      )
      .filter((row) => row["usageScope"] === "QA_POSITIVE");

    assert.equal(result.report.mappedPositiveSsiRows, 2280);
    assert.equal(positive.length, 2280);
    assert.ok(
      positive.every((row) => {
        const route = row["route"] as Record<string, unknown>;
        return (
          route["importValidationProfile"] ===
            "MT347_DEMO_FIN_REFERENCE_ONLY_V1" &&
          route["settlementModel"] === "FIN_REFERENCE_ONLY" &&
          route["paymentExecutable"] === "false" &&
          route["clearingSystem"] === undefined &&
          route["settlementMarket"] === undefined
        );
      }),
    );
  });

  it("generates the same versioned IDs for the same business identities", () => {
    const second = new Mt347CanonicalSeedMapper().map(source, generated);
    assert.deepEqual(second.seed.tables["ssi"], result.seed.tables["ssi"]);
    assert.deepEqual(
      second.seed.tables["ssi_applicability"],
      result.seed.tables["ssi_applicability"],
    );
  });
});
