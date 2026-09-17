import { resolve, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  DeterministicJsonFileWriter,
  Sha256FileIdentity,
} from "../governed-data-repair/artifact-io.ts";
import { Mt347DemoFixtureGenerator } from "./mt347-demo.generator.ts";
import { Mt347OracleComparator } from "./oracle-comparator.ts";
import { Mt347DemoOracleRepository } from "./oracle.repository.ts";

export interface Mt347DemoDryRunOptions {
  readonly oraclePath: string;
  readonly oracleSha256: string;
}

export interface Mt347DemoDryRunResult {
  readonly mode: "DRY_RUN_ZERO_WRITES";
  readonly passed: boolean;
  readonly mismatchCount: number;
  readonly databaseWrites: 0;
  readonly oracleSha256: string;
  readonly generatedDatasetSha256: string;
  readonly generatedDatasetPath: string;
  readonly reportPath: string;
  readonly actual: Readonly<Record<string, number>>;
}

export class Mt347DemoDryRunApplication {
  private readonly oraclePath: string;
  private readonly oracleSha256: string;
  private readonly writer: DeterministicJsonFileWriter;

  constructor(options: Mt347DemoDryRunOptions) {
    this.oraclePath = options.oraclePath;
    this.oracleSha256 = options.oracleSha256.toUpperCase();
    this.writer = new DeterministicJsonFileWriter(new Sha256FileIdentity());
  }

  execute(outputDirectory: string): Mt347DemoDryRunResult {
    const oracle = new Mt347DemoOracleRepository({
      oraclePath: this.oraclePath,
      expectedSha256: this.oracleSha256,
    }).load();
    const dataset = new Mt347DemoFixtureGenerator().generate(oracle);
    const comparison = new Mt347OracleComparator().compare(oracle, dataset);
    const generatedDatasetPath = join(
      outputDirectory,
      "mt347-demo-generated.v1.1.json",
    );
    const reportPath = join(outputDirectory, "mt347-demo-dry-run.v1.1.json");
    const datasetIdentity = this.writer.write(generatedDatasetPath, dataset);

    const result: Mt347DemoDryRunResult = Object.freeze({
      mode: "DRY_RUN_ZERO_WRITES",
      passed: comparison.passed,
      mismatchCount: comparison.mismatchCount,
      databaseWrites: 0,
      oracleSha256: this.oracleSha256,
      generatedDatasetSha256: datasetIdentity.sha256,
      generatedDatasetPath,
      reportPath,
      actual: comparison.actual,
    });
    this.writer.write(reportPath, {
      ...result,
      mismatches: comparison.mismatches,
    });
    return result;
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  const oraclePath = fileURLToPath(
    new URL("../../ssi/mt347-demo-closure.v1.1.json", import.meta.url),
  );
  const outputDirectory = fileURLToPath(
    new URL("../../ssi/generated/", import.meta.url),
  );
  const result = new Mt347DemoDryRunApplication({
    oraclePath,
    oracleSha256:
      "A4A24EDDC0C7E55DCDB3F60CBBDFE189408370D372EE1886F0D5BD9EE4F4D382",
  }).execute(outputDirectory);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}
