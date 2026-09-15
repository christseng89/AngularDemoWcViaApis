import fs from "node:fs";
import { QualityGate, failed, passed } from "./quality-gate.mjs";

export class CaseResultGate extends QualityGate {
  constructor(config, inventoryResult) {
    super("MT2_139_EXECUTION_RESULTS");
    this.config = config;
    this.inventoryResult = inventoryResult;
  }

  async execute() {
    if (!fs.existsSync(this.config.resultFile))
      return failed(
        this.id,
        `missing executable-case results: ${this.config.resultFile}`,
      );
    const report = JSON.parse(fs.readFileSync(this.config.resultFile, "utf8"));
    const expected = new Set(this.inventoryResult.evidence.caseIds ?? []);
    const raw = report.results ?? [];
    const counts = raw.reduce(
      (values, item) =>
        values.set(item.testCaseNo, (values.get(item.testCaseNo) ?? 0) + 1),
      new Map(),
    );
    const received = new Map(raw.map((item) => [item.testCaseNo, item]));
    const duplicateIds = [...counts]
      .filter(([, count]) => count > 1)
      .map(([id]) => id);
    const unexpectedIds = [...received.keys()].filter(
      (id) => !expected.has(id),
    );
    const missing = [...expected].filter((id) => !received.has(id));
    const failedCases = [...received.values()]
      .filter((item) => item.status !== "PASS")
      .map((item) => item.testCaseNo);
    if (
      missing.length ||
      failedCases.length ||
      duplicateIds.length ||
      unexpectedIds.length ||
      raw.length !== expected.size ||
      received.size !== expected.size
    ) {
      return failed(this.id, "case execution is incomplete or failed", {
        expected: expected.size,
        received: raw.length,
        uniqueReceived: received.size,
        missing,
        failedCases,
        duplicateIds,
        unexpectedIds,
      });
    }
    return passed(this.id, { total: received.size, passed: received.size });
  }
}
