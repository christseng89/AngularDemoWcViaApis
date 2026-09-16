import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { JsonRepairReportWriter } from "./json-report.writer.ts";
import {
  DomainRepairReport,
  GovernedDataRepairReport,
} from "./repair-contracts.ts";

describe("JsonRepairReportWriter", () => {
  it("writes the immutable zero-write report", async () => {
    const output = resolve("tmp/governed-data-repair-writer-test.json");
    const report = new GovernedDataRepairReport({
      generatedAt: "2026-09-17T00:00:00.000Z",
      parameterSnapshotId: "PARAMETERS-1",
      domains: {
        ENTITY: new DomainRepairReport({
          domain: "ENTITY",
          recordCount: 0,
          issues: [],
        }),
        NOSTRO: new DomainRepairReport({
          domain: "NOSTRO",
          recordCount: 0,
          issues: [],
        }),
        SSI: new DomainRepairReport({
          domain: "SSI",
          recordCount: 0,
          issues: [],
        }),
        RMA: new DomainRepairReport({
          domain: "RMA",
          recordCount: 0,
          issues: [],
          groups: [],
        }),
      },
    });

    await new JsonRepairReportWriter(output).write(report);

    const written = JSON.parse(await readFile(output, "utf8")) as {
      mode: string;
      metrics: { databaseWrites: number };
    };
    assert.equal(written.mode, "DRY_RUN_ZERO_WRITES");
    assert.equal(written.metrics.databaseWrites, 0);
  });
});
