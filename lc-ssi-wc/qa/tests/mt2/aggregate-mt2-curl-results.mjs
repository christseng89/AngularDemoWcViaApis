#!/usr/bin/env node
import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { aggregateRawResults } from "./mt2-curl-support.mjs";

const nativePath = (value) =>
  process.platform === "win32" && /^\/[A-Za-z]\//.test(value)
    ? `${value[1]}:/${value.slice(3)}`
    : value;

const [manifestFile, resultDirectory, outputFile] = process.argv.slice(2);
if (!outputFile) {
  console.error(
    "Usage: aggregate-mt2-curl-results.mjs MANIFEST RESULT_DIR OUTPUT",
  );
  process.exit(2);
}
try {
  const manifestPath = nativePath(manifestFile);
  const resultsPath = nativePath(resultDirectory);
  const reportPath = nativePath(outputFile);
  const report = aggregateRawResults({
    manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")),
    resultDirectory: resultsPath,
  });
  fs.mkdirSync(path.dirname(path.resolve(reportPath)), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.summary));
  if (report.summary.failed > 0) process.exitCode = 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
