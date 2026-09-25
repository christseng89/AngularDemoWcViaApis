import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const endpoint = process.env.MT347_UAT_ENDPOINT ??
  "http://localhost:3100/api/reference/fin-controlled-resolutions";
const fixturePath = resolve(
  "data/qa/mt347/mt347-positive.v1.json",
);
const reportPath = resolve(
  "qa/reports/latest/mt347/controlled-positive-uat.json",
);

const fixture = JSON.parse(await readFile(fixturePath, "utf8"));

function resolvedTagMap(response) {
  return Object.fromEntries(
    (response.resolvedFields ?? [])
      .filter((field) => field.resolutionStatus === "RESOLVED")
      .map((field) => [
        `${field.sequence}.${field.tag}${field.option}`,
        field.resolvedValue,
      ]),
  );
}

async function execute(record) {
  const request = {
    messageType: record.messageType,
    sequence: record.sequence,
    currency: "USD",
    bookingEntity: "HK01",
    valueDate: "2026-09-12",
    bindingId: record.bindingId,
    transactionReference: `UAT-${record.testCaseId}`,
  };
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  const body = await response.json();
  const actualTags = resolvedTagMap(body);
  const discrepancies = [];
  if (response.status !== 200)
    discrepancies.push(`HTTP expected 200, received ${response.status}`);
  if (body.selectedFixture?.bindingId !== record.bindingId)
    discrepancies.push(
      `binding expected ${record.bindingId}, received ${body.selectedFixture?.bindingId ?? "NONE"}`,
    );
  for (const [key, expected] of Object.entries(record.expectedTags)) {
    if (actualTags[key] !== expected)
      discrepancies.push(
        `${key} expected ${expected}, received ${actualTags[key] ?? "OMITTED"}`,
      );
  }
  for (const key of record.expectedPresentTags ?? []) {
    if (!actualTags[key])
      discrepancies.push(`${key} expected to be present, received OMITTED`);
  }
  return {
    testCaseId: record.testCaseId,
    bindingId: record.bindingId,
    httpStatus: response.status,
    snapshotHash: body.snapshotHash ?? null,
    actualTags,
    discrepancies,
    passed: discrepancies.length === 0,
  };
}

const results = [];
for (let index = 0; index < fixture.records.length; index += 12) {
  results.push(
    ...(await Promise.all(fixture.records.slice(index, index + 12).map(execute))),
  );
  console.log(`executed ${Math.min(index + 12, fixture.records.length)}/${fixture.records.length}`);
}
const snapshotHashes = [...new Set(results.map((row) => row.snapshotHash))];
const report = {
  schemaVersion: "1.0",
  sourceFixture: fixturePath,
  sourceWorkbookSha256: fixture.sourceWorkbookSha256,
  endpoint,
  executedAt: new Date().toISOString(),
  summary: {
    total: results.length,
    passed: results.filter((row) => row.passed).length,
    failed: results.filter((row) => !row.passed).length,
    skipped: 0,
    snapshotHashes,
  },
  results,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report.summary, null, 2));
if (report.summary.failed) process.exitCode = 1;
