import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const METRICS = ["statements", "branches", "functions", "lines"];

function percentage(covered, total) {
  return total === 0 ? null : Math.floor((covered / total) * 10_000) / 100;
}

function failure(scope, metric, value, threshold) {
  const pct = percentage(value.covered, value.total);
  if (pct === null || pct > threshold) return undefined;
  return {
    scope,
    metric,
    covered: value.covered,
    total: value.total,
    percentage: pct,
  };
}

export function evaluateCoverage(summaries, threshold = 92) {
  const reports = Object.entries(summaries);
  if (reports.length === 0) {
    throw new Error("No coverage summaries were provided");
  }

  const failures = [];
  const totals = Object.fromEntries(
    METRICS.map((metric) => [metric, { covered: 0, total: 0 }]),
  );

  for (const [, summary] of reports) {
    if (!summary.total) throw new Error("Coverage summary is missing total");
    for (const metric of METRICS) {
      totals[metric].covered += summary.total[metric].covered;
      totals[metric].total += summary.total[metric].total;
    }
    for (const [scope, values] of Object.entries(summary)) {
      if (scope === "total") continue;
      for (const metric of METRICS) {
        const problem = failure(scope, metric, values[metric], threshold);
        if (problem) failures.push(problem);
      }
    }
  }

  for (const metric of METRICS) {
    const problem = failure("WORKSPACE_TOTAL", metric, totals[metric], threshold);
    if (problem) failures.push(problem);
  }

  return { ok: failures.length === 0, threshold, totals, failures };
}

function findSummaries(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return findSummaries(path);
    return entry.name === "coverage-summary.json" ? [path] : [];
  });
}

export function readCoverageSummaries(directory) {
  return Object.fromEntries(
    findSummaries(directory).map((path) => [
      path,
      JSON.parse(readFileSync(path, "utf8")),
    ]),
  );
}

function run() {
  const threshold = Number(process.argv[2] ?? 92);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold >= 100) {
    throw new Error(`Invalid coverage threshold: ${process.argv[2] ?? ""}`);
  }
  const result = evaluateCoverage(
    readCoverageSummaries(resolve(process.cwd(), "coverage")),
    threshold,
  );

  for (const metric of METRICS) {
    const value = result.totals[metric];
    const pct = percentage(value.covered, value.total);
    console.log(
      `${metric}: ${pct ?? "N/A"}% (${value.covered}/${value.total})`,
    );
  }
  if (!result.ok) {
    for (const item of result.failures) {
      console.error(
        `${item.scope}: ${item.metric} ${item.percentage}% (${item.covered}/${item.total})`,
      );
    }
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  run();
}
