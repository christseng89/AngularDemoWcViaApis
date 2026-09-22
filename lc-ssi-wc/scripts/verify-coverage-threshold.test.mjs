import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateCoverage,
  formatCoverageEvidence,
} from "./verify-coverage-threshold.mjs";

const metric = (covered, total) => ({ covered, total });
const fileCoverage = ({ statements, branches, functions, lines }) => ({
  statements,
  branches,
  functions,
  lines,
});

describe("coverage threshold verification", () => {
  it("accepts files and weighted totals strictly above the threshold", () => {
    const result = evaluateCoverage(
      {
        "coverage/apps/example/coverage-summary.json": {
          total: fileCoverage({
            statements: metric(94, 100),
            branches: metric(93, 100),
            functions: metric(95, 100),
            lines: metric(96, 100),
          }),
          "apps/example/src/example.ts": fileCoverage({
            statements: metric(94, 100),
            branches: metric(93, 100),
            functions: metric(95, 100),
            lines: metric(96, 100),
          }),
        },
      },
      92,
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.failures, []);
  });

  it("rejects a file at or below the strict threshold", () => {
    const result = evaluateCoverage(
      {
        "coverage/apps/example/coverage-summary.json": {
          total: fileCoverage({
            statements: metric(100, 100),
            branches: metric(100, 100),
            functions: metric(100, 100),
            lines: metric(100, 100),
          }),
          "apps/example/src/example.ts": fileCoverage({
            statements: metric(93, 100),
            branches: metric(92, 100),
            functions: metric(100, 100),
            lines: metric(100, 100),
          }),
        },
      },
      92,
    );

    assert.equal(result.ok, false);
    assert.deepEqual(result.failures, [
      {
        scope: "apps/example/src/example.ts",
        metric: "branches",
        covered: 92,
        total: 100,
        percentage: 92,
      },
    ]);
  });

  it("treats a metric with no executable items as not applicable", () => {
    const result = evaluateCoverage(
      {
        "coverage/libs/example/coverage-summary.json": {
          total: fileCoverage({
            statements: metric(1, 1),
            branches: metric(0, 0),
            functions: metric(1, 1),
            lines: metric(1, 1),
          }),
          "libs/example/src/token.ts": fileCoverage({
            statements: metric(1, 1),
            branches: metric(0, 0),
            functions: metric(1, 1),
            lines: metric(1, 1),
          }),
        },
      },
      92,
    );

    assert.equal(result.ok, true);
  });

  it("rejects missing coverage reports", () => {
    assert.throws(
      () => evaluateCoverage({}, 92),
      /No coverage summaries were provided/,
    );
  });

  it("formats deterministic machine-readable per-file evidence", () => {
    const result = evaluateCoverage(
      {
        "coverage/apps/example/coverage-summary.json": {
          total: fileCoverage({
            statements: metric(93, 100),
            branches: metric(91, 100),
            functions: metric(95, 100),
            lines: metric(94, 100),
          }),
          "apps/example/src/zeta.ts": fileCoverage({
            statements: metric(93, 100),
            branches: metric(91, 100),
            functions: metric(95, 100),
            lines: metric(94, 100),
          }),
          "apps/example/src/alpha.ts": fileCoverage({
            statements: metric(91, 100),
            branches: metric(93, 100),
            functions: metric(95, 100),
            lines: metric(94, 100),
          }),
        },
      },
      92,
    );

    assert.deepEqual(formatCoverageEvidence(result), {
      ok: false,
      threshold: 92,
      totals: {
        statements: { covered: 93, total: 100, percentage: 93 },
        branches: { covered: 91, total: 100, percentage: 91 },
        functions: { covered: 95, total: 100, percentage: 95 },
        lines: { covered: 94, total: 100, percentage: 94 },
      },
      failures: [
        {
          scope: "apps/example/src/alpha.ts",
          metric: "statements",
          covered: 91,
          total: 100,
          percentage: 91,
        },
        {
          scope: "apps/example/src/zeta.ts",
          metric: "branches",
          covered: 91,
          total: 100,
          percentage: 91,
        },
        {
          scope: "WORKSPACE_TOTAL",
          metric: "branches",
          covered: 91,
          total: 100,
          percentage: 91,
        },
      ],
    });
  });
});
