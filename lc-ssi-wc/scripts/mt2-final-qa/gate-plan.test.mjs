import assert from "node:assert/strict";
import test from "node:test";
import { acceptanceGateIds } from "./gate-plan.mjs";

test("operational snapshot verification is the final acceptance gate", () => {
  const ids = acceptanceGateIds([
    "RUNTIME_SNAPSHOT_PRE",
    "PROPOSAL_CASES",
    "RUNTIME_SNAPSHOT_POST",
    "SONAR_CURRENT_ANALYSIS",
  ]);
  assert.deepEqual(ids.slice(-3), [
    "COVERAGE_GT_95",
    "DUPLICATION_LT_1",
    "RUNTIME_SNAPSHOT_POST",
  ]);
});

test("gate plan fails closed without exactly one final snapshot gate", () => {
  assert.throws(() => acceptanceGateIds([]), /exactly once/);
  assert.throws(
    () => acceptanceGateIds(["RUNTIME_SNAPSHOT_POST", "RUNTIME_SNAPSHOT_POST"]),
    /exactly once/,
  );
});
