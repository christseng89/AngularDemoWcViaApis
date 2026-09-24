#!/usr/bin/env node
import console from "node:console";
import path from "node:path";
import process from "node:process";

import { prepareCases } from "./mt2-curl-support.mjs";

const nativePath = (value) =>
  process.platform === "win32" && /^\/[A-Za-z]\//.test(value)
    ? `${value[1]}:/${value.slice(3)}`
    : value;

const [workbook, endpointsFile, registryFile, outputDirectory, bankServiceFile, baseUrl] =
  process.argv.slice(2);
if (!workbook || !endpointsFile || !registryFile || !outputDirectory) {
  console.error(
    "Usage: generate-mt2-curl-fixtures.mjs WORKBOOK ENDPOINTS REGISTRY OUTPUT_DIR BANK_SERVICES [BASE_URL]",
  );
  process.exit(2);
}

try {
  const result = await prepareCases({
    workbook: path.resolve(nativePath(workbook)),
    endpointsFile: path.resolve(nativePath(endpointsFile)),
    registryFile: path.resolve(nativePath(registryFile)),
    bankServiceFile: bankServiceFile && path.resolve(nativePath(bankServiceFile)),
    outputDirectory: path.resolve(nativePath(outputDirectory)),
    baseUrl,
    allowInsecureHttp: process.env.MT2_QA_ALLOW_INSECURE_HTTP === "1",
  });
  console.log(
    JSON.stringify({
      status: "PREPARED",
      caseCount: result.cases.length,
      workbookSha256: result.workbookSha256,
      manifestFile: result.manifestFile,
    }),
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
