import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EXPECTED_CASE_COUNT,
  aggregateResults,
  classifyDomain,
  normalizeLegacyBankServiceRequest,
  prepareCases,
  validateCaseResponse,
} from "./mt2-curl-support.mjs";

const workspace = path.resolve(import.meta.dirname, "../../..");
const workbook = path.join(
  workspace,
  "qa/fixtures/mt2/MT2XX_測試案例_SSI與NOSTRO_v6.2_FINAL.xlsx",
);
const endpointsFile = path.join(
  workspace,
  "qa/tests/mt2/final/case-endpoints.json",
);
const registryFile = path.join(
  workspace,
  "qa/tests/mt2/final/message-adapter-registry.json",
);
const bankServiceFile = path.join(
  workspace,
  "qa/fixtures/mt2/baselines/bank-service.current.json",
);

const prepareWith = (outputDirectory, overrides = {}) =>
  prepareCases({
    workbook,
    endpointsFile,
    registryFile,
    bankServiceFile,
    outputDirectory,
    baseUrl: "http://localhost:3100/api",
    ...overrides,
  });

test("prepares exactly 139 unique, reviewed, read-only resolution cases", async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "mt2-curl-test-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const result = await prepareCases({
    workbook,
    endpointsFile,
    registryFile,
    outputDirectory: temporary,
    baseUrl: "http://localhost:3100/api",
  });
  assert.equal(result.cases.length, EXPECTED_CASE_COUNT);
  assert.equal(
    new Set(result.cases.map(({ testCaseNo }) => testCaseNo)).size,
    139,
  );
  assert.ok(
    result.cases.every(({ endpoint }) => endpoint.endsWith("/resolve")),
  );
  assert.ok(
    result.cases.every(({ expectedStatus }) =>
      Number.isInteger(expectedStatus),
    ),
  );
});

test("rejects malformed configuration JSON before preparing cases", async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "mt2-json-test-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const malformed = path.join(temporary, "case-endpoints.json");
  fs.writeFileSync(malformed, "{");

  await assert.rejects(
    prepareWith(path.join(temporary, "output"), {
      endpointsFile: malformed,
    }),
    /case-endpoints\.json is not valid JSON/,
  );

  fs.writeFileSync(malformed, "[]");
  await assert.rejects(
    prepareWith(path.join(temporary, "output"), {
      endpointsFile: malformed,
    }),
    /case-endpoints\.json must be a JSON object/,
  );
});

test("allows only credential-free HTTPS or explicitly approved HTTP base URLs", async (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "mt2-url-test-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const invalidUrls = [
    ["not-an-absolute-url", /not a valid absolute URL/],
    ["file:///tmp/results", /must use http or https/],
    ["https://user:secret@example.test/api", /must not contain credentials/],
    ["http://example.test/api", /Refusing clear-text HTTP/],
  ];

  for (const [baseUrl, expectedError] of invalidUrls) {
    await assert.rejects(
      prepareWith(path.join(temporary, "output"), { baseUrl }),
      expectedError,
    );
  }

  const approved = await prepareWith(path.join(temporary, "approved"), {
    baseUrl: "http://example.test/api/",
    allowInsecureHttp: true,
  });
  assert.ok(
    approved.cases.every(({ endpoint }) =>
      endpoint.startsWith("http://example.test/api/"),
    ),
  );
});

test("rejects unsafe and mutating endpoint mappings", async (t) => {
  const temporary = fs.mkdtempSync(
    path.join(os.tmpdir(), "mt2-endpoint-test-"),
  );
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const original = JSON.parse(fs.readFileSync(endpointsFile, "utf8"));

  for (const [endpoint, expectedError] of [
    ["//outside.example/resolve", /endpoint must be a safe absolute path/],
    ["/settlements/delete", /only reviewed read\/resolve workflow endpoints/],
  ]) {
    const modified = {
      ...original,
      domains: Object.fromEntries(
        Object.keys(original.domains).map((domain) => [domain, endpoint]),
      ),
    };
    const modifiedFile = path.join(
      temporary,
      endpoint.includes("delete") ? "mutating.json" : "unsafe.json",
    );
    fs.writeFileSync(modifiedFile, JSON.stringify(modified));

    await assert.rejects(
      prepareWith(path.join(temporary, "output"), {
        endpointsFile: modifiedFile,
      }),
      expectedError,
    );
  }
});

test("domain classification honors explicit domain then redirect then registry", () => {
  const registry = { messageTypes: { MT200: "OWN_SSI_NOSTRO" } };
  assert.equal(
    classifyDomain({
      messageType: "MT200",
      input: { "request/context": { domain: "NOTIFICATION" } },
      expected: { mx: {}, mt: {} },
      registry,
    }),
    "NOTIFICATION",
  );
  assert.equal(
    classifyDomain({
      messageType: "MT200",
      input: { "request/context": {} },
      expected: { mx: { redirectDomain: "OWN_SSI_NOSTRO" }, mt: {} },
      registry,
    }),
    "MESSAGE_TYPE_CONTRACT",
  );
  assert.equal(
    classifyDomain({
      messageType: "MT200",
      input: { "request/context": {} },
      expected: { mx: {}, mt: {} },
      registry,
    }),
    "OWN_SSI_NOSTRO",
  );
});

test("normalizes only legacy bank identities and preserves the raw-BIC negative case", () => {
  const bicToBankServiceId = new Map([["CITIUS33", "BANK-SVC-CITIUS33"]]);
  assert.deepEqual(
    normalizeLegacyBankServiceRequest({
      testCaseNo: "MT200-02",
      request: { receiver: "CITIUS33", amount: "1" },
      bicToBankServiceId,
    }),
    { receiverBankServiceId: "BANK-SVC-CITIUS33", amount: "1" },
  );
  assert.deepEqual(
    normalizeLegacyBankServiceRequest({
      testCaseNo: "MT202-40",
      request: { counterpartyBic: "CITIUS33" },
      bicToBankServiceId,
    }),
    { counterpartyBic: "CITIUS33" },
  );
  assert.deepEqual(
    normalizeLegacyBankServiceRequest({
      testCaseNo: "MT202-25",
      request: { accountWithBic: null },
      bicToBankServiceId,
    }),
    { accountWithBankServiceId: null },
  );
});

test("response validation checks status and both MX and MT structures", () => {
  const metadata = { testCaseNo: "T-1", expectedStatus: 200 };
  const expected = {
    mx: { decision: "RESOLVED", nested: { code: "OK" } },
    mt: { tags: ["57A"] },
  };
  const pass = validateCaseResponse({
    metadata,
    expected,
    actualText: JSON.stringify(expected),
    actualStatus: 200,
  });
  assert.equal(pass.status, "PASS");
  const fail = validateCaseResponse({
    metadata,
    expected,
    actualText: JSON.stringify({ mx: expected.mx, mt: { tags: [] } }),
    actualStatus: 422,
  });
  assert.equal(fail.status, "FAIL");
  assert.ok(
    fail.differences.some((difference) => difference.includes("httpStatus")),
  );
  assert.ok(
    fail.differences.some((difference) => difference.includes("mt.tags")),
  );
});

test("transport and malformed JSON errors fail closed", () => {
  const result = validateCaseResponse({
    metadata: { testCaseNo: "T-2", expectedStatus: 503 },
    expected: { mx: {}, mt: {} },
    actualText: "not-json",
    actualStatus: null,
    curlExitCode: 7,
    curlError: "connection refused",
  });
  assert.equal(result.status, "FAIL");
  assert.equal(result.differences.length, 3);
});

test("accepts a governed multi-candidate decision in place of legacy RESOLVED", () => {
  const result = validateCaseResponse({
    metadata: { testCaseNo: "T-MULTI", expectedStatus: 200 },
    expected: { mx: { decision: "RESOLVED" }, mt: {} },
    actualText: JSON.stringify({
      mx: {
        decision: "MULTIPLE_CANDIDATES",
        chosenRoute: { ssiCode: "SSI-DEMO-022" },
        alternativeRoutes: [{ ssiCode: "SSI-DEMO-003" }],
      },
      mt: {},
    }),
    actualStatus: 200,
  });
  assert.equal(result.status, "PASS");
});

test("aggregation treats a missing case fragment as failure", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "mt2-curl-result-"));
  try {
    const report = aggregateResults({
      manifest: {
        workbook: workbook,
        workbookSha256: "abc",
        cases: [{ index: 1, testCaseNo: "T-1" }],
      },
      resultDirectory: temporary,
    });
    assert.deepEqual(report.summary, { total: 1, passed: 0, failed: 1 });
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("aggregation preserves a completed case fragment", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "mt2-result-test-"));
  try {
    fs.writeFileSync(
      path.join(temporary, "001.json"),
      JSON.stringify({ index: 1, testCaseNo: "T-1", status: "PASS" }),
    );
    const report = aggregateResults({
      manifest: {
        workbook,
        workbookSha256: "abc",
        cases: [{ index: 1, testCaseNo: "T-1" }],
      },
      resultDirectory: temporary,
    });

    assert.deepEqual(report.summary, { total: 1, passed: 1, failed: 0 });
    assert.equal(report.results[0].status, "PASS");
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
