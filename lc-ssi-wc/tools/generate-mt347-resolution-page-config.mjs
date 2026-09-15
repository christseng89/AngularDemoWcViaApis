import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const fixtureFiles = [
  ["qa/mt347/fixtures/mt347-positive.v1.json", "CANONICAL"],
  ["qa/mt347/fixtures/mt347-negative.v1.json", "TRANSACTIONAL_NEGATIVE"],
  ["qa/mt347/fixtures/mt347-boundary.v1.json", "BOUNDARY"],
];
const read = (path) => readFileSync(resolve(root, path));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const slug = (value) => String(value ?? "MESSAGE").trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toUpperCase();
const profileId = (record) => ["MT347", record.messageType, record.businessFunction, record.sequence, record.settlementLeg].map(slug).join(":");
const http = (value) => [...new Set(String(value).match(/\b[1-5]\d\d\b/g)?.map(Number) ?? [422])];
const field = (fieldId, label, dataType, defaultValue, values) => ({
  fieldId,
  path: `validationContext.${fieldId.replaceAll(".", "_")}`,
  label,
  control: dataType === "BOOLEAN" ? "CHECKBOX" : values ? "SELECT" : "TEXT",
  dataType,
  required: false,
  ...(defaultValue !== undefined ? { defaultValue } : {}),
  ...(values ? { options: values.map((value) => ({ value, label: value })) } : {}),
  constraints: [],
});

const all = [];
const bindings = [];
for (const [path, isolation] of fixtureFiles) {
  const bytes = read(path);
  const artifact = JSON.parse(bytes.toString("utf8"));
  const artifactSha = sha(bytes);
  for (const record of artifact.records) {
    all.push(record);
    bindings.push({
      bindingId: record.bindingId,
      fixtureSet: record.fixtureSet,
      fixtureVersion: record.bindingId.split("@").at(-1),
      sourceArtifactId: path,
      sourceArtifactSha256: artifactSha,
      isolation,
    });
  }
}

const definitionMap = new Map();
for (const record of all) definitionMap.set(profileId(record), {
  profileId: profileId(record),
  messageType: record.messageType,
  businessFunction: record.businessFunction,
  sequence: record.sequence || "MESSAGE",
  settlementLeg: record.settlementLeg || record.sequence || "MESSAGE",
});

const inputs = new Map();
const constraints = [];
const addInput = (pid, candidate) => inputs.set(`${pid}|${candidate.fieldId}`, { profileId: pid, field: candidate });
const addConstraint = (record, operator, fieldId, reasonCode, extra = {}) => constraints.push({
  constraintId: `CONSTRAINT-${record.testCaseId}-${constraints.filter((item) => item.scenarioId === record.testCaseId).length + 1}`,
  scenarioId: record.testCaseId,
  operator,
  fieldId,
  reasonCode,
  ...extra,
});

for (const record of all) {
  const pid = profileId(record);
  const contract = String(record.inputContract ?? "");
  const seq = record.sequence || "MESSAGE";
  if (/86a present;56a absent/i.test(contract)) {
    const id = `context.${seq}.field86Present`;
    addInput(pid, field(id, `${seq} Field 86 present`, "BOOLEAN", true));
    addConstraint(record, "REQUIRES", id, "FIELD_86_REQUIRES_56A", { comparedFieldId: `${seq}.56` });
  }
  if (/53a\/56a present;57a absent/i.test(contract)) {
    addConstraint(record, "REQUIRES", `${seq}.53`, "FIELD_53_56_REQUIRE_57A", { comparedFieldId: `${seq}.57` });
    addConstraint(record, "REQUIRES", `${seq}.56`, "FIELD_53_56_REQUIRE_57A", { comparedFieldId: `${seq}.57` });
  }
  if (/57a present;53a or54a missing/i.test(contract)) {
    const id = `context.${seq}.senderCorrespondentPresent`;
    addInput(pid, field(id, `${seq} Sender correspondent present`, "BOOLEAN", false));
    addConstraint(record, "REQUIRES", `${seq}.57`, "FIELD_57_REQUIRES_53A_OR_54A", { comparedFieldId: id });
  }
  if (/NET with two blocks or GROSS with four blocks/i.test(contract)) {
    addInput(pid, field(`context.${seq}.occurrenceMode`, `${seq} occurrence mode`, "STRING", "NET", ["NET", "GROSS"]));
    addInput(pid, field(`context.${seq}.occurrenceCount`, `${seq} occurrence count`, "STRING", "2", ["1", "2", "3", "4"]));
    addConstraint(record, "ONE_OF", `context.${seq}.occurrenceCount`, "OCCURRENCE_LIMIT_VIOLATION", { values: ["1", "3"] });
  }
  if (/25\+57a or32D\+57a/i.test(contract)) {
    addInput(pid, field(`context.${seq}.field25Present`, `${seq} Field 25 present`, "BOOLEAN", true));
    addInput(pid, field(`context.${seq}.field32DPresent`, `${seq} Field 32D present`, "BOOLEAN", false));
    addConstraint(record, "ABSENT", `context.${seq}.field25Present`, "C77_C78_FIELD_COMBINATION_INVALID");
    addConstraint(record, "ABSENT", `context.${seq}.field32DPresent`, "C77_C78_FIELD_COMBINATION_INVALID");
  }
  if (/receiverDirectlyServicesBeneficiaryBranchAccount=true/i.test(contract)) {
    addInput(pid, field(`context.${seq}.receiverDirectlyServicesBeneficiaryBranchAccount`, "Receiver directly services beneficiary branch account", "BOOLEAN", true));
    addInput(pid, field(`context.${seq}.field57Requested`, `${seq} Field 57 requested`, "BOOLEAN", true));
    addConstraint(record, "ABSENT", `context.${seq}.field57Requested`, "CONDITIONAL_57A_USAGE_RULE_VIOLATION");
  }
  if (/unregistered\/non-FI BIC/i.test(contract)) {
    const id = `context.${seq}.bicDirectoryOutcome`;
    addInput(pid, field(id, `${seq} BIC directory outcome`, "STRING", "UNREGISTERED", ["REGISTERED_FI", "UNREGISTERED", "NON_FI"]));
    addConstraint(record, "ONE_OF", id, "BIC_DIRECTORY_VALIDATION_FAILED", { values: ["REGISTERED_FI"] });
  }
  if (/53a\+57a/i.test(contract))
    addConstraint(record, "ABSENT", `${seq}.57`, "C14_FIELD_COMBINATION_INVALID");
  if (/\/RCB\//i.test(contract)) {
    const id = `context.${seq}.field72ZInstruction`;
    addInput(pid, field(id, `${seq} Field 72Z instruction`, "STRING", "/RCB/"));
    addConstraint(record, "NOT_EQUALS", id, "RCB_USAGE_RULE_VIOLATION", { value: "/RCB/" });
  }
}

const scenarioConfig = {
  schemaVersion: "1.0",
  catalogueVersion: "MT347-SR2026-RESOLUTION-PAGE-v1",
  standardsRelease: "SR2026",
  messageFamily: "MT347",
  definitions: [...definitionMap.values()].sort((a, b) => a.profileId.localeCompare(b.profileId)),
  scenarios: all.map((record) => ({
    scenarioId: record.testCaseId,
    testCaseId: record.testCaseId,
    profileId: profileId(record),
    label: record.businessScenario,
    polarity: record.polarity,
    fixtureBindingId: record.bindingId,
    expectedHttp: http(record.expectedHttp),
  })),
  inputs: [...inputs.values()].sort((a, b) => `${a.profileId}|${a.field.fieldId}`.localeCompare(`${b.profileId}|${b.field.fieldId}`)),
  crossTagConstraints: constraints,
};

const mappingsPath = resolve(root, "parameters/ssi-mappings.sr2026.json");
const mappings = JSON.parse(readFileSync(mappingsPath, "utf8"));
for (const mapping of mappings.mappings) {
  if (/^MT[347]\d{2}$/.test(mapping.messageType)) mapping.pageProfileId = [
    "MT347", mapping.messageType, mapping.businessFunction, mapping.sequence || "MESSAGE", mapping.settlementLeg || mapping.sequence || "MESSAGE",
  ].map(slug).join(":");
  delete mapping.pageDefinition;
  delete mapping.pageInputs;
}
throw new Error(
  "OBSOLETE GENERATOR: use the QA-reviewed staging builder and versioned scenario/fixture manifest artifacts; runtime configuration is never generated from this file.",
);
