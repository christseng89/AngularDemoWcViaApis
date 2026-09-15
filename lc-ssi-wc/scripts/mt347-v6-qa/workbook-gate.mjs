import fs from "node:fs";
import ExcelJS from "exceljs";
import { sha256File } from "./file-utils.mjs";
import { result, Status } from "./result.mjs";

const EXPECTED = Object.freeze({
  cases: 362,
  polarity: { POSITIVE: 152, NEGATIVE: 208, BOUNDARY: 2 },
  taxonomy: {
    NOT_APPLICABLE: 313,
    NETWORK_VALIDATED_RULE: 47,
    FIELD_USAGE_RULE: 2,
  },
  validationRuleOwners: {
    SSI_FIELD_RESOLUTION_API: 7,
    UPSTREAM_FIN_VALIDATOR: 42,
  },
  negativeBoundaryOwners: {
    SSI_FIELD_RESOLUTION_API: 168,
    UPSTREAM_FIN_VALIDATOR: 42,
  },
});

const countBy = (rows, field) =>
  Object.fromEntries(
    [...new Set(rows.map((row) => row[field]))]
      .sort()
      .map((value) => [
        value,
        rows.filter((row) => row[field] === value).length,
      ]),
  );

const equalCounts = (actual, expected) =>
  Object.entries(expected).every(
    ([key, value]) => (actual[key] ?? 0) === value,
  ) && Object.keys(actual).every((key) => key in expected);

export const worksheetRows = (worksheet) => {
  const headers = worksheet.getRow(1).values.slice(1).map(String);
  const cellValue = (cell) =>
    cell.value && typeof cell.value === "object" && "formula" in cell.value
      ? cell.result
      : cell.value;
  return (worksheet.getRows(2, Math.max(worksheet.rowCount - 1, 0)) ?? [])
    .map((row) =>
      Object.fromEntries(
        headers.map((header, index) => [
          header,
          cellValue(row.getCell(index + 1)),
        ]),
      ),
    )
    .filter((row) => row[headers[0]] !== null && row[headers[0]] !== undefined);
};

const caseExpectation = (rows, caseId, taxonomy, owner) => {
  const row = rows.find((candidate) => candidate["Test Case No."] === caseId);
  return Boolean(
    row &&
    row["Rule Taxonomy"] === taxonomy &&
    row["Validation Owner"] === owner,
  );
};

export const evaluateWorkbook = async ({
  workbook,
  sidecar,
  expectedSha256,
}) => {
  const errors = [];
  if (!fs.existsSync(workbook))
    return result(
      "MT347_TDD_V6_CONTROL",
      Status.FAIL,
      { workbook },
      "Controlled workbook is missing",
    );

  const actualSha256 = sha256File(workbook).toUpperCase();
  const sidecarText = fs.existsSync(sidecar)
    ? fs.readFileSync(sidecar, "utf8").trim()
    : "";
  const sidecarSha256 = sidecarText.split(/\s+/)[0]?.toUpperCase();
  if (actualSha256 !== expectedSha256.toUpperCase())
    errors.push("Workbook SHA-256 does not match the controlled identity");
  if (sidecarSha256 !== actualSha256)
    errors.push("Workbook SHA-256 does not match its sidecar");

  const source = new ExcelJS.Workbook();
  await source.xlsx.readFile(workbook);
  const casesSheet = source.getWorksheet("TDD Cases");
  const ledgerSheet = source.getWorksheet("Coverage Ledger");
  if (!casesSheet) errors.push("TDD Cases sheet is missing");
  if (!ledgerSheet) errors.push("Coverage Ledger sheet is missing");
  if (errors.length > 0)
    return result(
      "MT347_TDD_V6_CONTROL",
      Status.FAIL,
      { actualSha256, errors },
      "Controlled workbook identity or required sheets are invalid",
    );

  const rows = worksheetRows(casesSheet);
  const caseIds = rows.map((row) => row["Test Case No."]);
  const uniqueCaseIds = new Set(caseIds);
  const polarity = countBy(rows, "Polarity");
  const taxonomy = countBy(rows, "Rule Taxonomy");
  const execution = countBy(rows, "Execution status");
  const validationRules = rows.filter(
    (row) => row["Rule Taxonomy"] !== "NOT_APPLICABLE",
  );
  const negativeBoundary = rows.filter((row) =>
    ["NEGATIVE", "BOUNDARY"].includes(row.Polarity),
  );
  const validationRuleOwners = countBy(validationRules, "Validation Owner");
  const negativeBoundaryOwners = countBy(negativeBoundary, "Validation Owner");
  const upstreamCases = validationRules.filter(
    (row) => row["Validation Owner"] === "UPSTREAM_FIN_VALIDATOR",
  );
  const ledgerRows = worksheetRows(ledgerSheet);

  if (rows.length !== EXPECTED.cases) errors.push("Case count must be 362");
  if (uniqueCaseIds.size !== rows.length)
    errors.push("Case IDs must be unique");
  if (!equalCounts(polarity, EXPECTED.polarity))
    errors.push("Polarity conservation failed");
  if (!equalCounts(taxonomy, EXPECTED.taxonomy))
    errors.push("NVR/Usage taxonomy conservation failed");
  if (!equalCounts(validationRuleOwners, EXPECTED.validationRuleOwners))
    errors.push("Validation-rule owner conservation failed");
  if (!equalCounts(negativeBoundaryOwners, EXPECTED.negativeBoundaryOwners))
    errors.push("Negative/boundary owner conservation failed");
  if (
    (execution.NOT_EXECUTED ?? 0) !== EXPECTED.cases ||
    Object.keys(execution).some((status) => status !== "NOT_EXECUTED")
  )
    errors.push(
      "Controlled v6 cases must remain NOT_EXECUTED before evidence exists",
    );
  if (
    !caseExpectation(
      rows,
      "MT742-007",
      "FIELD_USAGE_RULE",
      "SSI_FIELD_RESOLUTION_API",
    )
  )
    errors.push("MT742-007 taxonomy/owner drifted");
  if (
    !caseExpectation(
      rows,
      "MT742-010",
      "NETWORK_VALIDATED_RULE",
      "UPSTREAM_FIN_VALIDATOR",
    )
  )
    errors.push("MT742-010 taxonomy/owner drifted");
  if (
    !caseExpectation(
      rows,
      "MT756-011",
      "FIELD_USAGE_RULE",
      "UPSTREAM_FIN_VALIDATOR",
    )
  )
    errors.push("MT756-011 taxonomy/owner drifted");

  const invalidUpstreamClaims = upstreamCases.filter(
    (row) =>
      row["Execution status"] !== "NOT_EXECUTED" ||
      row["Actual result"] ||
      row["Evidence path / SHA-256"],
  );
  if (invalidUpstreamClaims.length > 0)
    errors.push(
      "Upstream-owned cases contain execution claims without a supplied validator evidence set",
    );
  const ledgerDefects = ledgerRows.filter(
    (row) => row.Calculated !== row.Expected || row.Difference !== 0,
  );
  if (ledgerDefects.length > 0)
    errors.push("Coverage Ledger cached formula results are inconsistent");

  const evidence = {
    workbook,
    actualSha256,
    cases: rows.length,
    uniqueCaseIds: uniqueCaseIds.size,
    polarity,
    taxonomy,
    execution,
    validationRuleOwners,
    negativeBoundaryOwners,
    upstreamValidator: {
      caseCount: upstreamCases.length,
      caseIds: upstreamCases.map((row) => row["Test Case No."]),
      executionStatus: "NOT_EXECUTED",
      acceptanceClaim: false,
    },
    ledgerRows: ledgerRows.map((row) => ({
      metric: row.Metric,
      calculated: row.Calculated,
      expected: row.Expected,
      difference: row.Difference,
    })),
    errors,
  };
  return result(
    "MT347_TDD_V6_CONTROL",
    errors.length === 0 ? Status.PASS : Status.FAIL,
    evidence,
    errors.length === 0 ? undefined : "Controlled TDD conservation failed",
  );
};

export const controlledExpectations = EXPECTED;
