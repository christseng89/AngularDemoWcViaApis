import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { resolve } from "node:path";

import {
  SsiDemoCanonicalSeedExporter,
  SsiMt1Mt2DemoApplier,
  restoreSsiDemoDatabase,
  ssiDemoLogicalIdentity,
} from "./mt1-mt2-demo-apply.ts";
import { SsiMt1Mt2CandidateGenerator } from "./mt1-mt2-candidate-generator.ts";

interface Round7Gate {
  readonly artifactId: string;
  readonly scope: string;
  readonly applyTarget: {
    readonly databasePath: string;
    readonly expectedLogicalSha256Before: string;
    readonly servicePortThatMustBeClosed: number;
    readonly backupPath: string;
    readonly evidencePath: string;
    readonly postApplySeedPath: string;
  };
  readonly candidate: { readonly candidateSha256: string };
  readonly pinnedArtifacts: {
    readonly ruleTable: { readonly path: string; readonly sha256: string };
  };
}

interface ApplyAuthorization {
  readonly artifactId: "SSI-MT1-MT2-ROUND7-APPLY-AUTHORIZATION-V1";
  readonly gateSha256: string;
  readonly ba: "APPROVED";
  readonly qa: "APPROVED";
  readonly user: "APPROVED";
  readonly environment: "DEVELOPMENT_DEMO";
}

const sha = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex").toUpperCase();
const fileSha = (path: string): string => sha(readFileSync(resolve(path)));
const jsonSha = (value: unknown): string => sha(JSON.stringify(value));

const assertPortClosed = async (port: number): Promise<void> =>
  await new Promise<void>((resolvePromise, reject) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      reject(new Error(`ROUND7_SERVICE_MUST_BE_QUIESCED:${port}`));
    });
    socket.once("error", () => resolvePromise());
    socket.once("timeout", () => {
      socket.destroy();
      resolvePromise();
    });
  });

export const runWithRound7Rollback = async <T>(options: {
  databasePath: string;
  backupPath: string;
  expectedLogicalIdentity: string;
  partialArtifactPaths: readonly string[];
  operation: () => Promise<T>;
}): Promise<T> => {
  try {
    return await options.operation();
  } catch (error) {
    for (const path of options.partialArtifactPaths) {
      try {
        rmSync(resolve(path), { force: true });
      } catch {
        // Artifact cleanup must never bypass database restoration.
      }
    }
    if (
      existsSync(resolve(options.backupPath)) &&
      ssiDemoLogicalIdentity(options.databasePath) !==
        options.expectedLogicalIdentity
    ) {
      try {
        await restoreSsiDemoDatabase(
          options.databasePath,
          options.backupPath,
          options.expectedLogicalIdentity,
        );
      } catch (restoreError) {
        throw new AggregateError(
          [error, restoreError],
          "ROUND7_ORCHESTRATION_RESTORE_FAILED",
        );
      }
    }
    throw error;
  }
};

export class SsiMt1Mt2Round7ApplyRunner {
  async run(options: {
    gatePath: string;
    gateSha256: string;
    authorizationPath: string;
    authorizationSha256: string;
    confirmation: string;
  }): Promise<Record<string, unknown>> {
    if (options.confirmation !== "APPLY_TO_DEVELOPMENT_DEMO_DB")
      throw new Error("ROUND7_EXPLICIT_CONFIRMATION_REQUIRED");
    const gatePath = resolve(options.gatePath);
    const actualGateSha = fileSha(gatePath);
    if (actualGateSha !== options.gateSha256)
      throw new Error("ROUND7_GATE_SHA_MISMATCH");
    const gate = JSON.parse(readFileSync(gatePath, "utf8")) as Round7Gate;
    if (
      gate.artifactId !== "SSI-MT1-MT2-ROUND7-DEVELOPMENT-DB-APPLY-GATE-V1" ||
      gate.scope !== "SYNTHETIC_DEMO_PROTOTYPE_DEVELOPMENT_DB_ONLY"
    )
      throw new Error("ROUND7_INVALID_GATE");

    const authorizationPath = resolve(options.authorizationPath);
    if (fileSha(authorizationPath) !== options.authorizationSha256)
      throw new Error("ROUND7_AUTHORIZATION_SHA_MISMATCH");
    const authorization = JSON.parse(
      readFileSync(authorizationPath, "utf8"),
    ) as ApplyAuthorization;
    if (
      authorization.artifactId !==
        "SSI-MT1-MT2-ROUND7-APPLY-AUTHORIZATION-V1" ||
      authorization.gateSha256 !== actualGateSha ||
      authorization.ba !== "APPROVED" ||
      authorization.qa !== "APPROVED" ||
      authorization.user !== "APPROVED" ||
      authorization.environment !== "DEVELOPMENT_DEMO"
    )
      throw new Error("ROUND7_APPLY_NOT_AUTHORIZED");

    const databasePath = resolve(gate.applyTarget.databasePath);
    if (databasePath !== resolve("data/ssi-demo.sqlite"))
      throw new Error("ROUND7_TARGET_DATABASE_MISMATCH");
    const logicalShaBefore = ssiDemoLogicalIdentity(databasePath);
    if (logicalShaBefore !== gate.applyTarget.expectedLogicalSha256Before)
      throw new Error("ROUND7_PRE_APPLY_LOGICAL_IDENTITY_MISMATCH");
    if (fileSha(gate.pinnedArtifacts.ruleTable.path) !== gate.pinnedArtifacts.ruleTable.sha256)
      throw new Error("ROUND7_RULE_TABLE_SHA_MISMATCH");
    const candidates = new SsiMt1Mt2CandidateGenerator(
      databasePath,
      gate.pinnedArtifacts.ruleTable.path,
    ).generate();
    if (jsonSha(candidates) !== gate.candidate.candidateSha256)
      throw new Error("ROUND7_CANDIDATE_SHA_MISMATCH");
    await assertPortClosed(gate.applyTarget.servicePortThatMustBeClosed);

    return runWithRound7Rollback({
      databasePath,
      backupPath: gate.applyTarget.backupPath,
      expectedLogicalIdentity: logicalShaBefore,
      partialArtifactPaths: [
        gate.applyTarget.evidencePath,
        gate.applyTarget.postApplySeedPath,
      ],
      operation: async () => {
        const report = await new SsiMt1Mt2DemoApplier(
          databasePath,
          gate.pinnedArtifacts.ruleTable.path,
        ).apply(gate.applyTarget.backupPath);
        const seed = new SsiDemoCanonicalSeedExporter().export(
          databasePath,
          gate.applyTarget.postApplySeedPath,
        );
        const evidence = {
          artifactId: "SSI-MT1-MT2-ROUND7-APPLY-EVIDENCE-V1",
          gateSha256: actualGateSha,
          authorizationSha256: options.authorizationSha256,
          targetDatabase: gate.applyTarget.databasePath,
          candidateSha256: gate.candidate.candidateSha256,
          ...report,
          postApplySeed: seed,
        };
        writeFileSync(
          resolve(gate.applyTarget.evidencePath),
          `${JSON.stringify(evidence, null, 2)}\n`,
          "utf8",
        );
        return evidence;
      },
    });
  }
}

const argument = (name: string): string => {
  const prefix = `--${name}=`;
  const found = process.argv.find((item) => item.startsWith(prefix));
  if (!found) throw new Error(`ROUND7_MISSING_ARGUMENT:${name}`);
  return found.slice(prefix.length);
};

if ((process.argv[1] ?? "").endsWith("mt1-mt2-round7-apply-runner.ts")) {
  new SsiMt1Mt2Round7ApplyRunner()
    .run({
      gatePath: argument("gate"),
      gateSha256: argument("gate-sha"),
      authorizationPath: argument("authorization"),
      authorizationSha256: argument("authorization-sha"),
      confirmation: argument("confirm"),
    })
    .then((report) => console.log(JSON.stringify(report, null, 2)))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
