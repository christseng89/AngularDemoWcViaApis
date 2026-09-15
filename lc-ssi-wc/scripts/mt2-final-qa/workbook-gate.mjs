import { QualityGate, failed, passed } from "./quality-gate.mjs";
import { readFirstWorksheet } from "./xlsx-table-reader.mjs";

const HEADERS = [
  "Test Case No.",
  "Message Type",
  "Input",
  "MX expected Output",
  "MT expected Output",
];

const validateJsonFields = (caseNo, fields, errors) => {
  for (const [name, value] of fields) {
    try {
      JSON.parse(value);
    } catch {
      errors.push(`${caseNo} invalid ${name} JSON`);
    }
  }
};

const inspectCaseRows = (rows) => {
  const ids = new Set();
  const counts = {};
  const errors = [];
  for (const row of rows.slice(1)) {
    const [caseNo, messageType, input, mx, mt] = row.slice(0, 5);
    if (!caseNo && !messageType) continue;
    if (ids.has(caseNo)) errors.push(`duplicate ${caseNo}`);
    ids.add(caseNo);
    counts[messageType] = (counts[messageType] ?? 0) + 1;
    validateJsonFields(
      caseNo,
      [
        ["Input", input],
        ["MX", mx],
        ["MT", mt],
      ],
      errors,
    );
  }
  return { ids, counts, errors };
};

export const evaluateInventory = (gateId, rows, expectedCaseCount) => {
  const headers = rows[0]?.slice(0, 5);
  if (JSON.stringify(headers) !== JSON.stringify(HEADERS))
    return failed(gateId, "required columns do not match", { headers });
  const { ids, counts, errors } = inspectCaseRows(rows);
  if (ids.size !== expectedCaseCount)
    errors.push(`expected ${expectedCaseCount}, found ${ids.size}`);
  return errors.length
    ? failed(gateId, errors.join("; "), { counts })
    : passed(gateId, { total: ids.size, counts, caseIds: [...ids] });
};

export class WorkbookGate extends QualityGate {
  constructor(config) {
    super("MT2_CASE_INVENTORY");
    this.config = config;
  }

  async execute() {
    try {
      const rows = await readFirstWorksheet(this.config.workbook);
      return evaluateInventory(this.id, rows, this.config.expectedCaseCount);
    } catch (error) {
      return failed(
        this.id,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
