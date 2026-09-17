import assert from "node:assert/strict";
import test from "node:test";

import { SsiMt1Mt2Preflight } from "./mt1-mt2-preflight.ts";

const run = () =>
  new SsiMt1Mt2Preflight(
    "qa/_ARCHIVE/ssi/ssi-demo.pre-round7-apply.sqlite",
    "qa/FIX_DATA/ssi/mt1-mt2/repair-rule-table.v1.json",
    "qa/FIX_DATA/ssi/mt1-mt2/round4-partition-ruling.v1.json",
  ).run();

test("passes the zero-write Round 6 preflight", () => {
  const report = run();
  assert.equal(report.status, "PASS");
  assert.equal(
    report.candidateSha256,
    "1EF6B1DB11B5AE981673B15B88620F73FA67F7A9854759794F2DEE1AE330D3DC",
  );
  assert.equal(report.databaseShaBefore, report.databaseShaAfter);
  // SQLite may rewrite/checkpoint the physical file when the service restarts.
  // This zero-write preflight must prove identity within the run; the API dry-run
  // evidence separately binds authoritative write-attempt telemetry to zero.
  assert.match(report.databaseShaAfter, /^[A-F0-9]{64}$/);
  assert.equal(Object.values(report.invariants).every(Boolean), true);
});

test("projects one exact insert and an idempotent repeated apply", () => {
  const { counts } = run();
  assert.deepEqual(
    {
      firstSsi: counts.firstPassSsiInsert,
      firstApps: counts.firstPassApplicabilityInsert,
      secondSsi: counts.secondPassSsiInsert,
      secondApps: counts.secondPassApplicabilityInsert,
      ssiCollision: counts.ssiIdCollision,
      appCollision: counts.applicabilityIdCollision,
      oos: counts.outOfScopeCandidate,
    },
    {
      firstSsi: 49,
      firstApps: 128,
      secondSsi: 0,
      secondApps: 0,
      ssiCollision: 0,
      appCollision: 0,
      oos: 0,
    },
  );
});
