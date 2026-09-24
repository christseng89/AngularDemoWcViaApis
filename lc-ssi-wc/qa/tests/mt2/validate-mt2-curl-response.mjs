#!/usr/bin/env node
import console from "node:console";
import fs from "node:fs";
import process from "node:process";

import { validateCaseResponse } from "./mt2-curl-support.mjs";

const nativePath = (value) =>
  process.platform === "win32" && /^\/[A-Za-z]\//.test(value)
    ? `${value[1]}:/${value.slice(3)}`
    : value;

const [
  metadataFile,
  expectedFile,
  actualFile,
  statusText,
  curlExitText,
  errorFile,
  outputFile,
] = process.argv.slice(2);
if (!outputFile) {
  console.error(
    "Usage: validate-mt2-curl-response.mjs METADATA EXPECTED ACTUAL HTTP_STATUS CURL_EXIT ERROR OUTPUT",
  );
  process.exit(2);
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
try {
  const metadataPath = nativePath(metadataFile);
  const expectedPath = nativePath(expectedFile);
  const actualPath = nativePath(actualFile);
  const errorPath = nativePath(errorFile);
  const resultPath = nativePath(outputFile);
  const actualStatus = /^\d{3}$/.test(statusText) ? Number(statusText) : null;
  const result = validateCaseResponse({
    metadata: readJson(metadataPath),
    expected: readJson(expectedPath),
    actualText: fs.existsSync(actualPath)
      ? fs.readFileSync(actualPath, "utf8")
      : "",
    actualStatus,
    curlExitCode: Number(curlExitText),
    curlError: fs.existsSync(errorPath)
      ? fs.readFileSync(errorPath, "utf8")
      : "",
  });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${result.testCaseNo}\t${result.status}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
