import assert from "node:assert/strict";
import test from "node:test";

import { Mt1Mt2ApiDryRun } from "./mt1-mt2-api-dry-run.ts";

test("submits only the 49 candidates and proves zero database writes", async () => {
  const calls: Array<{ url: string; body?: Record<string, unknown> }> = [];
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ url, body });
    const payload = url.endsWith("settings/runtime")
      ? { currentSnapshot: { sha256: "SAME", method: "TEST" } }
      : {
          total: 49,
          accepted: 49,
          rejected: 0,
          executionTelemetry: {
            databaseWriteAttempts: 0,
            nostroLookupAttempts: 0,
          },
          results: Array.from({ length: 49 }, (_, index) => ({
            row: index + 1,
            status: "VALIDATED",
          })),
        };
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;
  const report = await new Mt1Mt2ApiDryRun(
    "data/ssi-demo.sqlite",
    "qa/FIX_DATA/ssi/mt1-mt2/repair-rule-table.v1.json",
    "http://test",
    fakeFetch,
  ).run();
  assert.equal(report.status, "PASS");
  assert.equal(report.databaseWrites, 0);
  assert.equal(report.outOfScopeSubmitted, 0);
  assert.equal(report.applicabilityContextsReconciled, 128);
  assert.equal(report.applicabilityMappings.length, 128);
  assert.equal(
    new Set(
      report.applicabilityMappings.map(
        (item) => `${item.sourceId}->${item.successorId}`,
      ),
    ).size,
    128,
  );
  assert.equal(calls.length, 3);
  assert.equal((calls[1].body?.records as unknown[]).length, 49);
});

const telemetryFetch = (
  databaseWriteAttempts: number,
  nostroLookupAttempts: number,
) =>
  (async (input: string | URL | Request) => {
    const payload = String(input).endsWith("settings/runtime")
      ? { currentSnapshot: { sha256: "SAME", method: "TEST" } }
      : {
          total: 49,
          accepted: 49,
          rejected: 0,
          results: [],
          executionTelemetry: {
            databaseWriteAttempts,
            nostroLookupAttempts,
          },
        };
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as typeof fetch;

for (const [writes, nostro, label] of [
  [1, 0, "write attempt"],
  [0, 1, "Nostro lookup"],
] as const) {
  test(`rejects nonzero ${label} telemetry`, async () => {
    const run = new Mt1Mt2ApiDryRun(
      "data/ssi-demo.sqlite",
      "qa/FIX_DATA/ssi/mt1-mt2/repair-rule-table.v1.json",
      "http://test",
      telemetryFetch(writes, nostro),
    ).run();
    await assert.rejects(run, /MT1_MT2_API_DRY_RUN_FAILED/);
  });
}
