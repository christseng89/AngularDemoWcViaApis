import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  DeterministicJsonFileWriter,
  Sha256FileIdentity,
} from "../governed-data-repair/artifact-io.ts";
import { CanonicalSeedRepository } from "./mt347-reload-preflight.ts";

export interface Mt347ReloadSourcePublishOptions {
  readonly candidatePath: string;
  readonly applyEvidencePath: string;
  readonly outputPath: string;
}

export class Mt347ReloadSourcePublisher {
  private readonly identity = new Sha256FileIdentity();
  private readonly writer = new DeterministicJsonFileWriter(this.identity);
  private readonly seeds = new CanonicalSeedRepository();

  publish(options: Mt347ReloadSourcePublishOptions) {
    this.identity.assertFile(
      options.candidatePath,
      "5A7A4FCD0EBB32E90351856DA8D6DCF9A0B6819606D73A958EEA9E0A19027E48",
      "MT347_RELOAD_SOURCE_CANDIDATE_SHA_MISMATCH",
    );
    this.identity.assertFile(
      options.applyEvidencePath,
      "399F98AF94D72609D6A021849BD13A29BCDE42AB6A63FCEB386F670E89AA2169",
      "MT347_RELOAD_SOURCE_APPLY_EVIDENCE_SHA_MISMATCH",
    );
    const evidence = JSON.parse(
      readFileSync(options.applyEvidencePath, "utf8"),
    ) as Record<string, unknown>;
    if (
      evidence["result"] !== "PASS" ||
      evidence["environment"] !== "DEVELOPMENT_RUNTIME_DB_ONLY"
    )
      throw new Error("MT347_RELOAD_SOURCE_APPLY_EVIDENCE_INVALID");

    const candidate = JSON.parse(
      readFileSync(options.candidatePath, "utf8"),
    ) as Record<string, unknown>;
    const source = Object.freeze({
      ...candidate,
      fixtureId: "SSI-DEMO-MT347-V1.1-DEVELOPMENT-RELOAD",
      classification: "SYNTHETIC_DEMO_QA_UAT",
      mappingStatus: "APPROVED_FOR_DEVELOPMENT_RELOAD",
      approvedCandidateSha256:
        "5A7A4FCD0EBB32E90351856DA8D6DCF9A0B6819606D73A958EEA9E0A19027E48",
      developmentApplyEvidenceSha256:
        "399F98AF94D72609D6A021849BD13A29BCDE42AB6A63FCEB386F670E89AA2169",
      authorizationBoundary: Object.freeze({
        developmentReload: true,
        uat: false,
        production: false,
      }),
    });
    const artifact = this.writer.write(options.outputPath, source);
    const logicalSha256 = this.seeds.logicalIdentity(
      this.seeds.load(options.outputPath),
    );
    if (
      logicalSha256 !==
      "d90ef5bfd9c0d59d12fdf8e8a31fcb4271855dce00a4d61eef8cc1d381367867"
    )
      throw new Error("MT347_RELOAD_SOURCE_LOGICAL_SHA_MISMATCH");
    return Object.freeze({ ...artifact, logicalSha256 });
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  const root = resolve(import.meta.dirname, "../../../..");
  const result = new Mt347ReloadSourcePublisher().publish({
    candidatePath: resolve(
      root,
      "qa/FIX_DATA/ssi/generated/ssi-demo.mt347-oracle-v1.1.mapping-candidate.canonical.seed.json",
    ),
    applyEvidencePath: resolve(
      root,
      "qa/FIX_DATA/ssi/generated/ssi-demo.mt347-v1.1.runtime-apply.json",
    ),
    outputPath: resolve(
      root,
      "qa/FIX_DATA/ssi/reload-test-data/ssi-demo.mt347-v1.1.approved.canonical.seed.json",
    ),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
