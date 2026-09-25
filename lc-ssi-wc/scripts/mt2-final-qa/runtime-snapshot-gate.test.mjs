import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyRuntimeBinding,
  fetchRuntimeEvidence,
  validateRuntimeSnapshot,
} from "./runtime-snapshot-gate.mjs";

const expected = {
  snapshotSha256: "A".repeat(64),
  snapshotMethod: "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1",
};

test("runtime snapshot gate accepts the exact controlled logical snapshot", () => {
  assert.deepEqual(
    validateRuntimeSnapshot(expected, {
      currentSnapshot: {
        sha256: "a".repeat(64),
        method: expected.snapshotMethod,
      },
    }),
    [],
  );
});

test("runtime binding captures and verifies one Operational snapshot", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-binding-"));
  const bindingFile = path.join(directory, "snapshot.json");
  const evidence = {
    currentSnapshot: {
      sha256: "c".repeat(64),
      method: expected.snapshotMethod,
    },
  };
  const captured = applyRuntimeBinding({
    mode: "capture",
    bindingFile,
    snapshotMethod: expected.snapshotMethod,
    evidence,
  });
  assert.equal(captured.snapshotSha256, "C".repeat(64));
  assert.deepEqual(
    applyRuntimeBinding({
      mode: "verify",
      bindingFile,
      snapshotMethod: expected.snapshotMethod,
      evidence,
    }),
    captured,
  );
});

test("runtime binding rejects drift and unsupported modes", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "runtime-drift-"));
  const bindingFile = path.join(directory, "snapshot.json");
  const evidence = {
    currentSnapshot: {
      sha256: "d".repeat(64),
      method: expected.snapshotMethod,
    },
  };
  applyRuntimeBinding({
    mode: "capture",
    bindingFile,
    snapshotMethod: expected.snapshotMethod,
    evidence,
  });
  assert.throws(
    () =>
      applyRuntimeBinding({
        mode: "verify",
        bindingFile,
        snapshotMethod: expected.snapshotMethod,
        evidence: {
          currentSnapshot: {
            ...evidence.currentSnapshot,
            sha256: "e".repeat(64),
          },
        },
      }),
    /does not match/,
  );
  assert.throws(
    () =>
      applyRuntimeBinding({
        mode: "other",
        bindingFile,
        snapshotMethod: expected.snapshotMethod,
        evidence,
      }),
    /capture or verify/,
  );
});

test("capture policy validates the governed method without equating runtime data to the seed", () => {
  assert.deepEqual(
    validateRuntimeSnapshot(
      { snapshotMethod: expected.snapshotMethod },
      {
        currentSnapshot: {
          sha256: "b".repeat(64),
          method: expected.snapshotMethod,
        },
      },
    ),
    [],
  );
});

test("runtime snapshot gate rejects SHA or method drift", () => {
  const errors = validateRuntimeSnapshot(expected, {
    currentSnapshot: { sha256: "b".repeat(64), method: "OTHER" },
  });
  assert.equal(errors.length, 2);
});

test("runtime evidence request fails closed without password or HTTP success", async () => {
  await assert.rejects(
    () => fetchRuntimeEvidence({ url: "http://runtime", password: "" }),
    /PASSWORD is required/,
  );
  await assert.rejects(
    () =>
      fetchRuntimeEvidence({
        url: "http://runtime",
        password: "secret",
        fetchImpl: async () => ({ ok: false, status: 503 }),
      }),
    /HTTP 503/,
  );
});
