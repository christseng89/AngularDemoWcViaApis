import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DeterministicJsonFileWriter,
  Sha256FileIdentity,
} from "../governed-data-repair/artifact-io.ts";
import type { GeneratedMt347DemoDataset } from "./mt347-demo.generator.ts";
import { Mt347CanonicalSeedMapper } from "./mt347-canonical-seed.mapper.ts";

interface BuildOptions {
  readonly sourceSeedPath: string;
  readonly generatedDatasetPath: string;
  readonly outputDirectory: string;
}

export class Mt347SeedCandidateApplication {
  private readonly identity = new Sha256FileIdentity();
  private readonly writer = new DeterministicJsonFileWriter(this.identity);

  execute(options: BuildOptions) {
    const sourceBytes = readFileSync(options.sourceSeedPath);
    const generatedBytes = readFileSync(options.generatedDatasetPath);
    const source = JSON.parse(sourceBytes.toString("utf8")) as Record<
      string,
      unknown
    >;
    const generated = JSON.parse(
      generatedBytes.toString("utf8"),
    ) as GeneratedMt347DemoDataset;
    const result = new Mt347CanonicalSeedMapper().map(source, generated);
    if (result.report.unmatchedSsiOwnedContexts !== 0) {
      throw new Error(
        `UNMATCHED_SSI_OWNED_CONTEXTS:${result.report.unmatchedSsiOwnedContexts}`,
      );
    }
    const candidatePath = join(
      options.outputDirectory,
      "ssi-demo.mt347-oracle-v1.1.mapping-candidate.canonical.seed.json",
    );
    const candidateIdentity = this.writer.write(candidatePath, result.seed);
    const reportPath = join(
      options.outputDirectory,
      "ssi-demo.mt347-oracle-v1.1.mapping-report.json",
    );
    const report = Object.freeze({
      ...result.report,
      sourceSeedPath: resolve(options.sourceSeedPath),
      sourceSeedSha256: this.identity.ofBytes(sourceBytes),
      generatedDatasetPath: resolve(options.generatedDatasetPath),
      generatedDatasetSha256: this.identity.ofBytes(generatedBytes),
      candidatePath: resolve(candidatePath),
      candidateSha256: candidateIdentity.sha256,
      apiDryRunAuthorized: true,
      reloadAuthorized: false,
      activeMutationAuthorized: false,
      databaseApplyAuthorized: false,
    });
    this.writer.write(reportPath, report);
    return Object.freeze({ ...report, reportPath: resolve(reportPath) });
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  const repositoryRoot = resolve(import.meta.dirname, "../../../..");
  const result = new Mt347SeedCandidateApplication().execute({
    sourceSeedPath: resolve(
      repositoryRoot,
      "qa/FIX_DATA/rma/reload-test-data/ssi-demo.v15.8.pacs009-repaired-isolated.canonical.seed.json",
    ),
    generatedDatasetPath: resolve(
      repositoryRoot,
      "qa/FIX_DATA/ssi/generated/mt347-demo-generated.v1.1.json",
    ),
    outputDirectory: resolve(repositoryRoot, "qa/FIX_DATA/ssi/generated"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
