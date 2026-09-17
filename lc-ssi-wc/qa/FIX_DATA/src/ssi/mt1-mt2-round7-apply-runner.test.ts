import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  SsiMt1Mt2DemoApplier,
  ssiDemoLogicalIdentity,
} from "./mt1-mt2-demo-apply.ts";
import {
  SsiMt1Mt2Round7ApplyRunner,
  runWithRound7Rollback,
} from "./mt1-mt2-round7-apply-runner.ts";

const gatePath =
  "qa/FIX_DATA/ssi/mt1-mt2/round7-development-db-apply-gate.v1.json";
const sha = (value: string | Buffer): string =>
  createHash("sha256").update(value).digest("hex").toUpperCase();

test("fails before reading artifacts without exact user confirmation", async () => {
  const before = ssiDemoLogicalIdentity("data/ssi-demo.sqlite");
  await assert.rejects(
    new SsiMt1Mt2Round7ApplyRunner().run({
      gatePath,
      gateSha256: "A".repeat(64),
      authorizationPath: "missing.json",
      authorizationSha256: "B".repeat(64),
      confirmation: "NO",
    }),
    /ROUND7_EXPLICIT_CONFIRMATION_REQUIRED/,
  );
  assert.equal(ssiDemoLogicalIdentity("data/ssi-demo.sqlite"), before);
});

test("restores after an injected post-commit artifact failure", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ssi-round7-artifact-failure-"));
  const databasePath = join(directory, "ssi.sqlite");
  const backupPath = join(directory, "before.sqlite");
  const source = new DatabaseSync(
    "qa/_ARCHIVE/ssi/ssi-demo.pre-round7-apply.sqlite",
    { readOnly: true },
  );
  try {
    await backup(source, databasePath);
  } finally {
    source.close();
  }
  try {
    const before = ssiDemoLogicalIdentity(databasePath);
    await assert.rejects(
      runWithRound7Rollback({
        databasePath,
        backupPath,
        expectedLogicalIdentity: before,
        partialArtifactPaths: [join(directory, "partial-evidence.json")],
        operation: async () => {
          await new SsiMt1Mt2DemoApplier(
            databasePath,
            "qa/FIX_DATA/ssi/mt1-mt2/repair-rule-table.v1.json",
          ).apply(backupPath);
          throw new Error("INJECTED_POST_COMMIT_ARTIFACT_FAILURE");
        },
      }),
      /INJECTED_POST_COMMIT_ARTIFACT_FAILURE/,
    );
    assert.equal(ssiDemoLogicalIdentity(databasePath), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fails before authorization or writes when the gate SHA is not exact", async () => {
  const before = ssiDemoLogicalIdentity("data/ssi-demo.sqlite");
  await assert.rejects(
    new SsiMt1Mt2Round7ApplyRunner().run({
      gatePath,
      gateSha256: "A".repeat(64),
      authorizationPath: "missing.json",
      authorizationSha256: "B".repeat(64),
      confirmation: "APPLY_TO_DEVELOPMENT_DEMO_DB",
    }),
    /ROUND7_GATE_SHA_MISMATCH/,
  );
  assert.equal(ssiDemoLogicalIdentity("data/ssi-demo.sqlite"), before);
});

test("validates exact authorization, rule and candidate before requiring quiescence", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ssi-round7-valid-preflight-"));
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const gate = JSON.parse(readFileSync(gatePath, "utf8")) as {
      applyTarget: {
        servicePortThatMustBeClosed: number;
        expectedLogicalSha256Before: string;
      };
    };
    gate.applyTarget.servicePortThatMustBeClosed = address.port;
    gate.applyTarget.expectedLogicalSha256Before = ssiDemoLogicalIdentity(
      "data/ssi-demo.sqlite",
    );
    const localGatePath = join(directory, "gate.json");
    const gateContent = `${JSON.stringify(gate, null, 2)}\n`;
    writeFileSync(localGatePath, gateContent, "utf8");
    const gateSha = sha(gateContent);
    const authorization = {
      artifactId: "SSI-MT1-MT2-ROUND7-APPLY-AUTHORIZATION-V1",
      gateSha256: gateSha,
      ba: "APPROVED",
      qa: "APPROVED",
      user: "APPROVED",
      environment: "DEVELOPMENT_DEMO",
    };
    const authorizationPath = join(directory, "authorization.json");
    const authorizationContent = `${JSON.stringify(authorization, null, 2)}\n`;
    writeFileSync(authorizationPath, authorizationContent, "utf8");
    const before = ssiDemoLogicalIdentity("data/ssi-demo.sqlite");
    await assert.rejects(
      new SsiMt1Mt2Round7ApplyRunner().run({
        gatePath: localGatePath,
        gateSha256: gateSha,
        authorizationPath,
        authorizationSha256: sha(authorizationContent),
        confirmation: "APPLY_TO_DEVELOPMENT_DEMO_DB",
      }),
      /ROUND7_SERVICE_MUST_BE_QUIESCED/,
    );
    assert.equal(ssiDemoLogicalIdentity("data/ssi-demo.sqlite"), before);
  } finally {
    server.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
