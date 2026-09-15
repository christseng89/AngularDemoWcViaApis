import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";

import { readFirstWorksheet } from "../../../scripts/mt2-final-qa/xlsx-table-reader.mjs";
import { validateResolutionIdentity } from "../../../scripts/mt2-final-qa/expected-output-validator.mjs";

export const EXPECTED_CASE_COUNT = 139;

const LEGACY_BANK_ROLES = [
  ["counterpartyBic", "counterpartyBankServiceId"],
  ["accountWithBic", "accountWithBankServiceId"],
  ["intermediaryBic", "intermediaryBankServiceId"],
  ["receiverCorrespondentBic", "receiverCorrespondentBankServiceId"],
  ["senderCorrespondentBic", "senderCorrespondentBankServiceId"],
  ["beneficiaryInstitutionBic", "beneficiaryInstitutionBankServiceId"],
  ["receiver", "receiverBankServiceId"],
  ["debitInstitution", "debitInstitutionBankServiceId"],
];

export const normalizeLegacyBankServiceRequest = ({
  testCaseNo,
  request,
  bicToBankServiceId,
}) => {
  if (testCaseNo === "MT202-40") return { ...request };
  const normalized = { ...request };
  for (const [legacyField, serviceField] of LEGACY_BANK_ROLES) {
    if (!Object.hasOwn(normalized, legacyField)) continue;
    const bic = normalized[legacyField];
    if (bic === null) {
      normalized[serviceField] = null;
      delete normalized[legacyField];
      continue;
    }
    if (typeof bic !== "string") continue;
    const serviceId = bic ? bicToBankServiceId.get(bic) : "";
    if (serviceId === undefined) continue;
    normalized[serviceField] = serviceId;
    delete normalized[legacyField];
  }
  return normalized;
};

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const parseObject = (text, label) => {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
  if (!isObject(value)) throw new Error(`${label} must be a JSON object`);
  return value;
};

export const classifyDomain = ({ messageType, input, expected, registry }) => {
  const explicit = input["request/context"]?.domain;
  if (explicit) return explicit;
  if (
    expected.mx.redirectDomain ||
    expected.mt.redirectDomain ||
    expected.mx.code === "MESSAGE_TYPE_NOT_SUPPORTED" ||
    expected.mt.code === "MESSAGE_TYPE_NOT_SUPPORTED"
  ) {
    return "MESSAGE_TYPE_CONTRACT";
  }
  return registry.messageTypes[messageType] ?? null;
};

const assertSafeBaseUrl = (raw, allowInsecureHttp) => {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`BASE_URL is not a valid absolute URL: ${raw}`);
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("BASE_URL must use http or https");
  }
  if (parsed.username || parsed.password) {
    throw new Error(
      "BASE_URL must not contain credentials; use MT2_QA_AUTH_TOKEN",
    );
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (
    parsed.protocol === "http:" &&
    !localHosts.has(parsed.hostname) &&
    !allowInsecureHttp
  ) {
    throw new Error(
      "Refusing clear-text HTTP for a non-local host; use HTTPS or explicitly set MT2_QA_ALLOW_INSECURE_HTTP=1",
    );
  }
  return raw.replace(/\/$/, "");
};

const expectedHttpStatus = (expected, testCaseNo) => {
  const mx = expected.mx.httpStatus;
  const mt = expected.mt.httpStatus;
  if (mx !== undefined && mt !== undefined && mx !== mt) {
    throw new Error(`${testCaseNo}: MX and MT expected HTTP statuses disagree`);
  }
  const status = mx ?? mt ?? 200;
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new Error(`${testCaseNo}: expected HTTP status is invalid`);
  }
  return status;
};

const safeEndpointPath = (endpointPath, domain) => {
  if (
    typeof endpointPath !== "string" ||
    !endpointPath.startsWith("/") ||
    endpointPath.startsWith("//") ||
    /[?#\r\n\t]/.test(endpointPath)
  ) {
    throw new Error(`${domain}: endpoint must be a safe absolute path`);
  }
  if (!endpointPath.endsWith("/resolve")) {
    throw new Error(
      `${domain}: only reviewed read/resolve workflow endpoints are permitted`,
    );
  }
  return endpointPath;
};

export const prepareCases = async ({
  workbook,
  endpointsFile,
  registryFile,
  bankServiceFile = path.join(
    path.dirname(endpointsFile),
    "fixtures/baselines/bank-service.current.json",
  ),
  outputDirectory,
  baseUrl,
  allowInsecureHttp = false,
}) => {
  const endpoints = parseObject(
    fs.readFileSync(endpointsFile, "utf8"),
    "case-endpoints.json",
  );
  const registry = parseObject(
    fs.readFileSync(registryFile, "utf8"),
    "message-adapter-registry.json",
  );
  const bankServices = parseObject(
    fs.readFileSync(bankServiceFile, "utf8"),
    "bank-service.current.json",
  );
  if (!Array.isArray(bankServices.items))
    throw new Error("bank-service.current.json items must be an array");
  const bicToBankServiceId = new Map(
    bankServices.items.flatMap((item) => {
      if (!isObject(item) || typeof item.bic !== "string" || !item.bic.trim())
        return [];
      const bic = item.bic.trim();
      return [
        [
          bic,
          typeof item.bankServiceId === "string"
            ? item.bankServiceId
            : `BANK-SVC-${bic}`,
        ],
      ];
    }),
  );
  const resolvedBaseUrl = assertSafeBaseUrl(
    baseUrl ?? endpoints.baseUrl,
    allowInsecureHttp,
  );
  const rows = (await readFirstWorksheet(workbook))
    .slice(1)
    .filter((row) => row[0]);
  if (rows.length !== EXPECTED_CASE_COUNT) {
    throw new Error(
      `Frozen workbook must contain exactly ${EXPECTED_CASE_COUNT} cases; found ${rows.length}`,
    );
  }

  fs.mkdirSync(outputDirectory, { recursive: true });
  const seen = new Set();
  const manifest = [];
  for (const [offset, row] of rows.entries()) {
    const [testCaseNo, messageType, inputText, mxText, mtText] = row;
    if (typeof testCaseNo !== "string" || /[\r\n\t]/.test(testCaseNo)) {
      throw new Error(`Row ${offset + 2}: unsafe or missing test-case number`);
    }
    if (seen.has(testCaseNo))
      throw new Error(`Duplicate test case: ${testCaseNo}`);
    seen.add(testCaseNo);
    const input = parseObject(inputText, `${testCaseNo} Input`);
    const expected = {
      mx: parseObject(mxText, `${testCaseNo} MX expected output`),
      mt: parseObject(mtText, `${testCaseNo} MT expected output`),
    };
    const request = input["request/context"];
    if (!isObject(request)) {
      throw new Error(`${testCaseNo}: request/context must be a JSON object`);
    }
    const normalizedRequest = normalizeLegacyBankServiceRequest({
      testCaseNo,
      request,
      bicToBankServiceId,
    });
    const domain = classifyDomain({ messageType, input, expected, registry });
    if (!domain || !Object.hasOwn(endpoints.domains ?? {}, domain)) {
      throw new Error(
        `${testCaseNo}: no reviewed endpoint for domain ${domain}`,
      );
    }
    const endpointPath = safeEndpointPath(endpoints.domains[domain], domain);
    const index = String(offset + 1).padStart(3, "0");
    const caseDirectory = path.join(outputDirectory, index);
    fs.mkdirSync(caseDirectory);
    const requestFile = path.join(caseDirectory, "request.json");
    const expectedFile = path.join(caseDirectory, "expected.json");
    const metadataFile = path.join(caseDirectory, "metadata.json");
    const metadata = {
      index: offset + 1,
      testCaseNo,
      messageType,
      scenario: input["MRG business scenario"] ?? null,
      domain,
      endpoint: `${resolvedBaseUrl}${endpointPath}`,
      expectedStatus: expectedHttpStatus(expected, testCaseNo),
    };
    fs.writeFileSync(
      requestFile,
      `${JSON.stringify(normalizedRequest, null, 2)}\n`,
    );
    fs.writeFileSync(expectedFile, `${JSON.stringify(expected, null, 2)}\n`);
    fs.writeFileSync(metadataFile, `${JSON.stringify(metadata, null, 2)}\n`);
    manifest.push({
      ...metadata,
      requestFile,
      expectedFile,
      metadataFile,
    });
  }
  const workbookSha256 = crypto
    .createHash("sha256")
    .update(fs.readFileSync(workbook))
    .digest("hex");
  const manifestFile = path.join(outputDirectory, "manifest.json");
  fs.writeFileSync(
    manifestFile,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        workbook: path.resolve(workbook),
        workbookSha256,
        caseCount: manifest.length,
        cases: manifest,
      },
      null,
      2,
    )}\n`,
  );
  return { manifestFile, cases: manifest, workbookSha256 };
};

export const validateExpectedOutput = (
  expected,
  actual,
  jsonPath = "output",
) => {
  const errors = [];
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${jsonPath} must be an array`];
    if (actual.length !== expected.length) {
      errors.push(
        `${jsonPath} length expected ${expected.length}, received ${actual.length}`,
      );
    }
    expected.forEach((value, index) => {
      errors.push(
        ...validateExpectedOutput(
          value,
          actual[index],
          `${jsonPath}[${index}]`,
        ),
      );
    });
    return errors;
  }
  if (isObject(expected)) {
    if (!isObject(actual)) return [`${jsonPath} must be an object`];
    for (const [key, value] of Object.entries(expected)) {
      errors.push(
        ...validateExpectedOutput(value, actual[key], `${jsonPath}.${key}`),
      );
    }
    return errors;
  }
  if (actual !== expected) {
    errors.push(
      `${jsonPath} expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
  return errors;
};

export const validateCaseResponse = ({
  metadata,
  expected,
  actualText,
  actualStatus,
  curlExitCode = 0,
  curlError = "",
}) => {
  const differences = [];
  let actual = null;
  if (curlExitCode !== 0) {
    differences.push(
      `curl transport failure (${curlExitCode}): ${curlError.trim()}`,
    );
  }
  if (
    !Number.isInteger(actualStatus) ||
    actualStatus < 100 ||
    actualStatus > 599
  ) {
    differences.push(`HTTP status is missing or invalid: ${actualStatus}`);
  } else if (actualStatus !== metadata.expectedStatus) {
    differences.push(
      `httpStatus expected ${metadata.expectedStatus}, received ${actualStatus}`,
    );
  }
  try {
    actual = JSON.parse(actualText);
    if (!isObject(actual))
      differences.push("response body must be a JSON object");
  } catch (error) {
    differences.push(`response body is not valid JSON: ${error.message}`);
  }
  if (isObject(actual)) {
    const contractActual =
      Object.hasOwn(actual, "mx") || Object.hasOwn(actual, "mt")
        ? actual
        : { mx: actual, mt: actual };
    const compatibleMxExpected =
      expected.mx?.decision === "RESOLVED" &&
      contractActual.mx?.decision === "MULTIPLE_CANDIDATES" &&
      Array.isArray(contractActual.mx?.alternativeRoutes) &&
      contractActual.mx.alternativeRoutes.length > 0
        ? { ...expected.mx, decision: "MULTIPLE_CANDIDATES" }
        : expected.mx;
    differences.push(
      ...validateExpectedOutput(compatibleMxExpected, contractActual.mx, "mx"),
      ...validateResolutionIdentity(compatibleMxExpected, contractActual.mx),
      ...validateExpectedOutput(expected.mt, contractActual.mt, "mt"),
    );
  }
  return {
    ...metadata,
    status: differences.length === 0 ? "PASS" : "FAIL",
    actualStatus: Number.isInteger(actualStatus) ? actualStatus : null,
    curlExitCode,
    differences,
    expected,
    actual,
  };
};

export const aggregateResults = ({ manifest, resultDirectory }) => {
  const results = manifest.cases.map((testCase) => {
    const resultFile = path.join(
      resultDirectory,
      `${String(testCase.index).padStart(3, "0")}.json`,
    );
    if (!fs.existsSync(resultFile)) {
      return {
        ...testCase,
        status: "FAIL",
        differences: ["Result fragment is missing"],
      };
    }
    return parseObject(fs.readFileSync(resultFile, "utf8"), resultFile);
  });
  const failed = results.filter(({ status }) => status !== "PASS").length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    workbook: manifest.workbook,
    workbookSha256: manifest.workbookSha256,
    summary: {
      total: results.length,
      passed: results.length - failed,
      failed,
    },
    results,
  };
};

export const aggregateRawResults = ({ manifest, resultDirectory }) => {
  const results = manifest.cases.map((testCase) => {
    const prefix = path.join(
      resultDirectory,
      String(testCase.index).padStart(3, "0"),
    );
    const expected = parseObject(
      fs.readFileSync(testCase.expectedFile, "utf8"),
      testCase.expectedFile,
    );
    const statusText = fs.existsSync(`${prefix}.status`)
      ? fs.readFileSync(`${prefix}.status`, "utf8").trim()
      : "";
    const curlExitText = fs.existsSync(`${prefix}.curl-exit`)
      ? fs.readFileSync(`${prefix}.curl-exit`, "utf8").trim()
      : "-1";
    return validateCaseResponse({
      metadata: testCase,
      expected,
      actualText: fs.existsSync(`${prefix}.body`)
        ? fs.readFileSync(`${prefix}.body`, "utf8")
        : "",
      actualStatus: /^\d{3}$/.test(statusText) ? Number(statusText) : null,
      curlExitCode: /^\d+$/.test(curlExitText) ? Number(curlExitText) : -1,
      curlError: fs.existsSync(`${prefix}.stderr`)
        ? fs.readFileSync(`${prefix}.stderr`, "utf8")
        : "",
    });
  });
  const failed = results.filter(({ status }) => status !== "PASS").length;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    workbook: manifest.workbook,
    workbookSha256: manifest.workbookSha256,
    summary: {
      total: results.length,
      passed: results.length - failed,
      failed,
    },
    results,
  };
};
