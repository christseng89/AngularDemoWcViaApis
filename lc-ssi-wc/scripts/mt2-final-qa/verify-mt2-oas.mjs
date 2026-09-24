import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config-loader.mjs";
import { verifyMt2OasContract } from "./oas-contract-verifier.mjs";

const configPath = process.argv[2] ?? "qa/tests/mt2/final/mt2-final-qa.config.json";
const config = loadConfig(configPath);
const oasArtifact = config.baselineArtifacts.find(
  ({ role }) => role === "CURRENT_OAS",
);
if (!oasArtifact)
  throw new Error("CURRENT_OAS baseline artifact is not configured");

const endpointsPath = path.resolve(
  path.dirname(config.configPath),
  "case-endpoints.json",
);
const oas = JSON.parse(fs.readFileSync(oasArtifact.file, "utf8"));
const endpoints = JSON.parse(fs.readFileSync(endpointsPath, "utf8"));
const result = verifyMt2OasContract({ oas, endpoints });

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (result.status !== "PASS") process.exitCode = 1;
