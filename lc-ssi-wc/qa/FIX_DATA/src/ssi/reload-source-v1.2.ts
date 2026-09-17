import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { Sha256FileIdentity } from "../governed-data-repair/artifact-io.ts";

interface PinnedArtifact {
  readonly path: string;
  readonly sha256: string;
}

interface Round8ReloadManifest {
  readonly schemaVersion: "1.0";
  readonly sourceId: "SSI-MT1-MT2-DEMO-RELOAD-SOURCE-V1";
  readonly classification: "SYNTHETIC_DEMO_QA_UAT";
  readonly status: "ROUND8_APPLIED_RELOAD_READY";
  readonly approvedSeed: PinnedArtifact & {
    readonly fixtureId: "SSI-DEMO-MT1-MT2-PACS008-PACS009-V1";
    readonly ssiRows: 10637;
    readonly applicabilityRows: 10973;
  };
  readonly gate: PinnedArtifact;
  readonly authorization: PinnedArtifact;
  readonly applyEvidence: PinnedArtifact;
  readonly archivedPreviousSource: PinnedArtifact;
  readonly authorizationState: {
    readonly developmentDbApplied: true;
    readonly reloadAuthorized: true;
    readonly productionUseAuthorized: false;
  };
}

export class Round8SsiReloadSourcePreflight {
  private readonly identity = new Sha256FileIdentity();
  private readonly repositoryRoot: string;

  constructor(repositoryRoot: string) {
    this.repositoryRoot = repositoryRoot;
  }

  verify(manifestPath: string): Readonly<{
    sourceId: string;
    status: string;
    fixtureId: string;
    seedSha256: string;
    verifiedArtifacts: 5;
    reloadAuthorized: true;
    databaseWrites: 0;
  }> {
    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as Round8ReloadManifest;
    if (
      manifest.schemaVersion !== "1.0" ||
      manifest.sourceId !== "SSI-MT1-MT2-DEMO-RELOAD-SOURCE-V1" ||
      manifest.classification !== "SYNTHETIC_DEMO_QA_UAT" ||
      manifest.status !== "ROUND8_APPLIED_RELOAD_READY" ||
      manifest.approvedSeed.fixtureId !==
        "SSI-DEMO-MT1-MT2-PACS008-PACS009-V1" ||
      manifest.approvedSeed.ssiRows !== 10637 ||
      manifest.approvedSeed.applicabilityRows !== 10973 ||
      manifest.authorizationState.developmentDbApplied !== true ||
      manifest.authorizationState.reloadAuthorized !== true ||
      manifest.authorizationState.productionUseAuthorized !== false
    )
      throw new Error("INVALID_ROUND8_SSI_RELOAD_SOURCE_MANIFEST");

    for (const artifact of [
      manifest.approvedSeed,
      manifest.gate,
      manifest.authorization,
      manifest.applyEvidence,
      manifest.archivedPreviousSource,
    ])
      this.identity.assertFile(
        resolve(this.repositoryRoot, artifact.path),
        artifact.sha256,
        "ROUND8_SSI_RELOAD_SOURCE_SHA_MISMATCH",
      );

    return Object.freeze({
      sourceId: manifest.sourceId,
      status: manifest.status,
      fixtureId: manifest.approvedSeed.fixtureId,
      seedSha256: manifest.approvedSeed.sha256,
      verifiedArtifacts: 5,
      reloadAuthorized: true,
      databaseWrites: 0,
    });
  }
}

const isDirectExecution = (process.argv[1] ?? "").endsWith(
  "reload-source-v1.2.ts",
);

if (isDirectExecution) {
  const repositoryRoot = resolve(process.cwd());
  const result = new Round8SsiReloadSourcePreflight(repositoryRoot).verify(
    resolve(
      repositoryRoot,
      "qa/FIX_DATA/ssi/reload-test-data-source.v1.2.json",
    ),
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
