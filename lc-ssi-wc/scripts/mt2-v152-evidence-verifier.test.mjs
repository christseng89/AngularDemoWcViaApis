import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { verifyEvidence } from "./mt2-v152-evidence-verifier.mjs";

const snapshot = "A".repeat(64);
const baseEvidence = () => ({
  schemaVersion: "1.0",
  caseId: "GEN-202-01",
  status: "PASS",
  generatedAt: "2026-09-11T12:00:00.000Z",
  execution: {
    correlationId: "GEN-202-01-CORRELATION",
    tester: "independent-verifier-test",
    executionDate: "2026-09-11",
  },
  source: {
    snapshotSha256: snapshot,
    snapshotIdentityMethod: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
    resolutionToken: "TOKEN",
  },
  request: {
    currency: "USD",
    paymentBeneficiaryInstitutionInput: "CITIUS33",
  },
  response: {
    chosenRoute: { ssiCode: "SSI-DEMO-001", ssiVersion: 44, currency: "USD" },
    snapshotHash: snapshot,
    snapshotIdentityMethod: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
    mx: {
      canonicalRoles: { instructedAgent: "CITIUS33", creditorAgent: "CITIUS33" },
      roleProvenance: {
        instructedAgent: { sourceField: "actualReceiverBic" },
        creditorAgent: { sourceField: "accountWithBic" },
      },
      messageComposerContext: {
        Cdtr: { value: "CITIUS33", source: "REQUEST_PASS_THROUGH" },
      },
    },
  },
  assertions: [{
    id: "ASSERT-GEN-202-01",
    passed: true,
    expected: {},
    actual: {},
  }],
});

const store = async (directory, evidence) => {
  const path = join(directory, "evidence.json");
  const raw = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(path, raw);
  return {
    path,
    digest: createHash("sha256").update(raw).digest("hex").toUpperCase(),
  };
};

test("independently accepts a valid registered assertion", async () => {
  const directory = await mkdtemp(join(tmpdir(), "v152-evidence-"));
  try {
    const { path, digest } = await store(directory, baseEvidence());
    const result = await verifyEvidence("GEN-202-01", path, digest);
    assert.equal(result.independentlyVerified, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects a self-attested PASS after the raw response is made wrong", async () => {
  const directory = await mkdtemp(join(tmpdir(), "v152-evidence-"));
  try {
    const evidence = baseEvidence();
    evidence.response.mx.canonicalRoles.instructedAgent = "WRONGBIC";
    const { path, digest } = await store(directory, evidence);
    await assert.rejects(
      verifyEvidence("GEN-202-01", path, digest),
      /claimed=true recomputed=false/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects content outside evidence schema v1.0", async () => {
  const directory = await mkdtemp(join(tmpdir(), "v152-evidence-"));
  try {
    const evidence = { ...baseEvidence(), unregistered: true };
    const { path, digest } = await store(directory, evidence);
    await assert.rejects(
      verifyEvidence("GEN-202-01", path, digest),
      /unregistered top-level field/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects BOOK-05 when the delayed-race captures use different snapshots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "v152-evidence-"));
  try {
    const event = (sequence, correlationId, snapshotSha256, fulfilledAt) => ({
      sequence,
      requestStartedAt: "2026-09-11T12:00:00.000Z",
      upstreamResponseAt: "2026-09-11T12:00:00.100Z",
      browserFulfilledAt: fulfilledAt,
      request: { correlationId },
      responseStatus: sequence === "A" ? 200 : 422,
      responseBody: { mx: { correlationId, snapshotHash: snapshotSha256 } },
    });
    const evidence = baseEvidence();
    evidence.caseId = "BOOK-05";
    evidence.execution.correlationId = "STALE";
    evidence.request = { stale: { correlationId: "STALE" } };
    evidence.response = {
      stale: {
        before: {
          responseStatus: 200,
          responseBody: { mx: { resolutionToken: "STALE-TOKEN", snapshotHash: snapshot } },
        },
        afterText: "尚未執行 Resolution",
      },
      race: {
        delayMs: 1500,
        networkEvents: [
          event("A", "RACE-A", snapshot, "2026-09-11T12:00:02.000Z"),
          event("B", "RACE-B", "B".repeat(64), "2026-09-11T12:00:00.500Z"),
        ],
        secondCapture: {
          request: { correlationId: "RACE-B" },
          uiText: "B RESULT",
        },
        domAfterB: { capturedAt: "2026-09-11T12:00:00.600Z", text: "B RESULT" },
        domAfterDelayedA: { capturedAt: "2026-09-11T12:00:02.100Z", text: "B RESULT" },
      },
    };
    evidence.assertions = [
      { id: "ASSERT-BOOK-05-STALE", passed: true, expected: {}, actual: {} },
      { id: "ASSERT-BOOK-05-RACE", passed: true, expected: {}, actual: {} },
    ];
    const { path, digest } = await store(directory, evidence);
    await assert.rejects(
      verifyEvidence("BOOK-05", path, digest),
      /claimed=true recomputed=false/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
