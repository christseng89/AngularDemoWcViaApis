import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export const validateRuntimeSnapshot = (expected, evidence) => {
  const actual = evidence?.currentSnapshot;
  const errors = [];
  if (actual?.method !== expected.snapshotMethod)
    errors.push(
      `Runtime snapshot method ${actual?.method ?? "MISSING"} does not match ${expected.snapshotMethod}.`,
    );
  if (
    expected.snapshotSha256 &&
    actual?.sha256?.toUpperCase() !== expected.snapshotSha256
  )
    errors.push(
      `Runtime snapshot SHA-256 ${actual?.sha256 ?? "MISSING"} does not match the controlled snapshot.`,
    );
  return errors;
};

export const fetchRuntimeEvidence = async ({
  url,
  password,
  fetchImpl = fetch,
}) => {
  if (!password) throw new Error("SSI_DEMO_ADMIN_PASSWORD is required");
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok)
    throw new Error(`Runtime evidence API failed with HTTP ${response.status}`);
  return response.json();
};

export const applyRuntimeBinding = ({
  mode,
  bindingFile,
  snapshotMethod,
  evidence,
}) => {
  if (!new Set(["capture", "verify"]).has(mode))
    throw new Error("Runtime snapshot gate mode must be capture or verify");
  const expected =
    mode === "capture"
      ? {
          snapshotMethod,
          snapshotSha256: evidence.currentSnapshot.sha256.toUpperCase(),
        }
      : JSON.parse(readFileSync(bindingFile, "utf8"));
  const errors = validateRuntimeSnapshot(expected, evidence);
  if (errors.length) throw new Error(errors.join("\n"));
  if (mode === "capture") {
    mkdirSync(path.dirname(bindingFile), { recursive: true });
    writeFileSync(bindingFile, `${JSON.stringify(expected, null, 2)}\n`);
  }
  return expected;
};
