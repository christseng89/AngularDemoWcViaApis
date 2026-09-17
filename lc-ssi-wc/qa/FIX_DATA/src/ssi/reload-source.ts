import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Sha256FileIdentity } from "../governed-data-repair/artifact-io.ts";

interface PinnedArtifact {
  readonly path: string;
  readonly sha256: string;
}

interface SsiReloadSourceManifest {
  readonly schemaVersion: "1.0";
  readonly sourceId: "SSI-MT347-DEMO-RELOAD-SOURCE-V1.1";
  readonly status: "MT347_VERSIONED_INSERT_API_DRY_RUN_PASS_PREFLIGHT_AUTHORIZED_DB_APPLY_NOT_AUTHORIZED";
  readonly oracle: PinnedArtifact;
  readonly generatedSource: PinnedArtifact & {
    readonly groups: 208;
    readonly contexts: 3120;
    readonly ssiOwnedContexts: 2580;
    readonly outOfScopeContexts: 540;
  };
  readonly gate1Evidence: PinnedArtifact & {
    readonly qaResult: "PASS";
    readonly mismatchCount: 0;
    readonly databaseWrites: 0;
  };
  readonly sourceFixture: PinnedArtifact & { readonly mutation: "NONE" };
  readonly mappingCandidate: PinnedArtifact & {
    readonly mappedPositiveSsiRows: 2280;
    readonly mappedSsiContexts: 2580;
    readonly outOfScopeOracleOnlyContexts: 540;
    readonly resultingMt347SsiRows: 4860;
    readonly historicalMt347SsiRows: 5385;
    readonly physicalMt347SsiRows: 10245;
    readonly historicalIdCollisions: 0;
    readonly applicabilityIdCollisions: 0;
    readonly databaseWrites: 0;
  };
  readonly mappingEvidence: PinnedArtifact & {
    readonly unmatchedSsiOwnedContexts: 0;
    readonly databaseWrites: 0;
  };
  readonly apiDryRunEvidence: PinnedArtifact & {
    readonly zeroWriteVerified: true;
    readonly total: 18395;
    readonly validated: 10069;
    readonly rejected: 8326;
    readonly mt347Result: "PASS";
    readonly positiveAccepted: 2280;
    readonly negativeReasonMatched: 2580;
    readonly outOfScopeSubmitted: 0;
    readonly unexpectedMt347Outcomes: 0;
  };
  readonly authorization: {
    readonly sourceReferenceUpdated: true;
    readonly mappingAuthorized: true;
    readonly apiDryRunAuthorized: true;
    readonly apiDryRunExecuted: true;
    readonly versionedInsertStrategyApproved: true;
    readonly reloadPreflightAuthorized: true;
    readonly reloadAuthorized: false;
    readonly activeMutationAuthorized: false;
    readonly databaseApplyAuthorized: false;
  };
}

export class SsiReloadSourcePreflight {
  private readonly repositoryRoot: string;
  private readonly identity: Sha256FileIdentity;

  constructor(repositoryRoot: string) {
    this.repositoryRoot = repositoryRoot;
    this.identity = new Sha256FileIdentity();
  }

  verify(manifestPath: string): Readonly<{
    sourceId: string;
    status: string;
    verifiedArtifacts: number;
    reloadAuthorized: false;
    databaseWrites: 0;
  }> {
    const manifest = JSON.parse(
      readFileSync(manifestPath, "utf8"),
    ) as SsiReloadSourceManifest;
    this.assertManifest(manifest);
    for (const artifact of [
      manifest.oracle,
      manifest.generatedSource,
      manifest.gate1Evidence,
      manifest.sourceFixture,
      manifest.mappingCandidate,
      manifest.mappingEvidence,
      manifest.apiDryRunEvidence,
    ]) {
      this.identity.assertFile(
        resolve(this.repositoryRoot, artifact.path),
        artifact.sha256,
        "SSI_RELOAD_SOURCE_SHA_MISMATCH",
      );
    }
    return Object.freeze({
      sourceId: manifest.sourceId,
      status: manifest.status,
      verifiedArtifacts: 7,
      reloadAuthorized: false,
      databaseWrites: 0,
    });
  }

  private assertManifest(manifest: SsiReloadSourceManifest): void {
    if (
      manifest.schemaVersion !== "1.0" ||
      manifest.sourceId !== "SSI-MT347-DEMO-RELOAD-SOURCE-V1.1" ||
      manifest.status !==
        "MT347_VERSIONED_INSERT_API_DRY_RUN_PASS_PREFLIGHT_AUTHORIZED_DB_APPLY_NOT_AUTHORIZED" ||
      manifest.generatedSource.groups !== 208 ||
      manifest.generatedSource.contexts !== 3120 ||
      manifest.generatedSource.ssiOwnedContexts !== 2580 ||
      manifest.generatedSource.outOfScopeContexts !== 540 ||
      manifest.gate1Evidence.qaResult !== "PASS" ||
      manifest.gate1Evidence.mismatchCount !== 0 ||
      manifest.gate1Evidence.databaseWrites !== 0 ||
      manifest.sourceFixture.mutation !== "NONE" ||
      manifest.mappingCandidate.mappedPositiveSsiRows !== 2280 ||
      manifest.mappingCandidate.mappedSsiContexts !== 2580 ||
      manifest.mappingCandidate.outOfScopeOracleOnlyContexts !== 540 ||
      manifest.mappingCandidate.resultingMt347SsiRows !== 4860 ||
      manifest.mappingCandidate.historicalMt347SsiRows !== 5385 ||
      manifest.mappingCandidate.physicalMt347SsiRows !== 10245 ||
      manifest.mappingCandidate.historicalIdCollisions !== 0 ||
      manifest.mappingCandidate.applicabilityIdCollisions !== 0 ||
      manifest.mappingCandidate.databaseWrites !== 0 ||
      manifest.mappingEvidence.unmatchedSsiOwnedContexts !== 0 ||
      manifest.mappingEvidence.databaseWrites !== 0 ||
      manifest.apiDryRunEvidence.zeroWriteVerified !== true ||
      manifest.apiDryRunEvidence.mt347Result !== "PASS" ||
      manifest.apiDryRunEvidence.positiveAccepted !== 2280 ||
      manifest.apiDryRunEvidence.negativeReasonMatched !== 2580 ||
      manifest.apiDryRunEvidence.outOfScopeSubmitted !== 0 ||
      manifest.apiDryRunEvidence.unexpectedMt347Outcomes !== 0 ||
      manifest.authorization.mappingAuthorized !== true ||
      manifest.authorization.apiDryRunAuthorized !== true ||
      manifest.authorization.apiDryRunExecuted !== true ||
      manifest.authorization.versionedInsertStrategyApproved !== true ||
      manifest.authorization.reloadPreflightAuthorized !== true ||
      manifest.authorization.reloadAuthorized !== false ||
      manifest.authorization.activeMutationAuthorized !== false ||
      manifest.authorization.databaseApplyAuthorized !== false
    ) {
      throw new Error("INVALID_SSI_RELOAD_SOURCE_MANIFEST");
    }
  }
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectExecution) {
  const repositoryRoot = resolve(import.meta.dirname, "../../../..");
  const result = new SsiReloadSourcePreflight(repositoryRoot).verify(
    resolve(
      repositoryRoot,
      "qa/FIX_DATA/ssi/reload-test-data-source.v1.1.json",
    ),
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
