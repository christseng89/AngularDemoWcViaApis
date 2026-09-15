#!/usr/bin/env node
import console from "node:console";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const manifest = JSON.parse(
  fs.readFileSync(path.join(here, "mt2-pareto-selection.json"), "utf8"),
);
const fixedSource = JSON.parse(
  fs.readFileSync(
    path.join(root, "qa/mt2/reports/mt2-139-ui-results.json"),
    "utf8",
  ),
);
const exhaustiveSource = JSON.parse(
  fs.readFileSync(
    path.join(root, "qa/mt2/reports/mt2-resolver-exhaustive-random.json"),
    "utf8",
  ),
);
const preparedFixedManifest = JSON.parse(
  fs.readFileSync(
    path.join(
      root,
      "qa/mt2/reports/mt2-139-ui-evidence/prepared-cases/manifest.json",
    ),
    "utf8",
  ),
);
const fail = (message) => {
  throw new Error(message);
};
const fileSha256 = (file) =>
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex")
    .toUpperCase();
const exactSet = (actual, expected, label) => {
  const missing = [...expected].filter((item) => !actual.has(item));
  const unexpected = [...actual].filter((item) => !expected.has(item));
  if (missing.length || unexpected.length)
    fail(
      `${label} missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}`,
    );
};
if (
  manifest.fixedCaseIds.length !== 24 ||
  new Set(manifest.fixedCaseIds).size !== 24
)
  fail("fixed selection must be 24 unique cases");
if (
  manifest.exhaustiveStableKeys.length !== 28 ||
  new Set(manifest.exhaustiveStableKeys).size !== 28
)
  fail("exhaustive selection must be 28 unique cases");
if (manifest.fixedCaseIds.length + manifest.exhaustiveStableKeys.length !== 52)
  fail("selection must be exactly 52/260 cases");
const v15Path = path.join(root, manifest.v15Contract?.path ?? "");
if (
  manifest.v15Contract?.status !== "APPROVED" ||
  !fs.existsSync(v15Path) ||
  fileSha256(v15Path) !== manifest.v15Contract.sha256
)
  fail("controlled v15 workbook path/hash is not valid");
if (
  manifest.resolverUniverse?.bankCount !== 11 ||
  manifest.resolverUniverse?.pairCount !== 12 ||
  manifest.resolverUniverse?.pairs?.length !== 12 ||
  manifest.resolverUniverse?.ambiguousJourneyCount !== 4 ||
  manifest.resolverUniverse?.uniqueResolvedJourneyCount !== 44
)
  fail("v15 resolver universe counts are incomplete");
const referential = manifest.referentialAudit;
if (referential?.status !== "APPROVED")
  fail("referential audit must be APPROVED");
if (!fs.existsSync(path.join(root, referential.evidence)))
  fail("referential audit evidence file is missing");
for (const [field, expected] of Object.entries({
  activeSsi: 42,
  activeNostro: 159,
  activeSsiExactAccountReferenceMatch: 42,
  activeSsiOrphan: 0,
  activeNostroMissingAccountReference: 69,
  activeNostroMissingAllowedBookingEntities: 68,
  activeNostroMissingBothGovernanceFields: 68,
})) {
  if (referential[field] !== expected)
    fail(`referential audit ${field} must be ${expected}`);
}
if (!referential.joinRule.includes("accountReference"))
  fail("referential join must use exact Nostro.accountReference");
if (!referential.forbiddenJoinInputs.includes("Nostro.maskedAccountRef"))
  fail("maskedAccountRef must be explicitly forbidden as a join input");
const mt20234 = manifest.fixedCasePreconditions?.["MT202-34"];
if (
  manifest.fixedCaseIds.includes("MT202-34") ||
  mt20234?.baselineStatus !== "NOT_EXECUTABLE_DATA_PRECONDITION" ||
  mt20234?.requiredFixture !== "QA-SSI-ORPHAN-001"
)
  fail("MT202-34 baseline precondition is not safely governed");
const tieRiskGate = manifest.tieRiskGate;
if (!tieRiskGate?.requiredBeforeFormalExecution)
  fail("tie-risk gate must remain a formal-execution prerequisite");
if (!["PENDING_BA_RECONCILIATION", "APPROVED"].includes(tieRiskGate?.status))
  fail("tie-risk gate status must be pending BA reconciliation or APPROVED");
if (
  tieRiskGate.defaultExpectedBehavior !== "FAIL_CLOSED" ||
  tieRiskGate.defaultExpectedCode !== "SSI_AMBIGUOUS"
)
  fail("pending tie-risk behavior must default to SSI_AMBIGUOUS fail-closed");
exactSet(
  new Set(tieRiskGate.forbiddenTieBreakers ?? []),
  new Set([
    "UUID",
    "rowid",
    "version",
    "ssiCode",
    "createdAt",
    "database order",
  ]),
  "forbidden technical tie-breakers",
);
if (tieRiskGate.status === "PENDING_BA_RECONCILIATION") {
  if (
    tieRiskGate.expectedHttpStatus !== 422 ||
    tieRiskGate.httpStatusStatus !== "PENDING_BA_RECONCILIATION"
  )
    fail("v14 interim ambiguous HTTP expectation must remain 422 pending BA");
}
if (["PENDING_BA_RECONCILIATION", "APPROVED"].includes(tieRiskGate.status)) {
  if (!fs.existsSync(path.join(root, tieRiskGate.evidence)))
    fail("approved tie-risk BA evidence file is missing");
  if (tieRiskGate.approvedExpectedBehavior !== "FAIL_CLOSED")
    fail("tie-risk outcome must be fail-closed");
  exactSet(
    new Set(tieRiskGate.topRankAlternativeSsiCodes ?? []),
    new Set(["SSI-DEMO-003", "SSI-DEMO-022"]),
    "top-rank tie alternatives",
  );
  exactSet(
    new Set(tieRiskGate.lowerRankedEligibleSsiCodes ?? []),
    new Set(["SSI-DEMO-004"]),
    "lower-ranked eligible evidence",
  );
}
const fixedEvidence = fixedSource.results.length
  ? fixedSource.results
  : preparedFixedManifest.cases.map((item) => ({
      ...item,
      expected: JSON.parse(fs.readFileSync(item.expectedFile, "utf8")),
    }));
const fixedById = new Map(fixedEvidence.map((item) => [item.testCaseNo, item]));
const missingFixed = manifest.fixedCaseIds.filter((id) => !fixedById.has(id));
if (missingFixed.length)
  fail("unknown fixed case(s): " + missingFixed.join(", "));
const stableKey = (item) =>
  [
    item.type,
    item.journey.key,
    item.bankServiceId,
    item.currency || "(missing)",
    item.nextCurrency ?? "-",
  ].join("|");
const exhaustiveByKey = new Map(
  exhaustiveSource.results.map((item) => [stableKey(item), item]),
);
const atomicKeys = new Set([
  "ATOMIC_DIRECT_GBP|MT202|BANK-SVC-BARCGB22|GBP|-",
  "ATOMIC_SWITCH|MT202|BANK-SVC-BARCGB22|USD|GBP",
  "ATOMIC_SWITCH|MT202|BANK-SVC-BARCGB22|GBP|USD",
]);
const fixedSelected = manifest.fixedCaseIds.map((id) => fixedById.get(id));
const parseStableKey = (key) => {
  const [type, journeyKey, bankServiceId, currency, nextCurrency] =
    key.split("|");
  return {
    type,
    journey: { key: journeyKey },
    bankServiceId,
    currency: currency === "(missing)" ? "" : currency,
    nextCurrency: nextCurrency === "-" ? undefined : nextCurrency,
  };
};
const exhaustiveSelected = manifest.exhaustiveStableKeys.map(
  (key) => exhaustiveByKey.get(key) ?? parseStableKey(key),
);
for (const atomicKey of atomicKeys) {
  if (!manifest.exhaustiveStableKeys.includes(atomicKey))
    fail(`atomic blocker selection missing: ${atomicKey}`);
}
if (!manifest.baAddendum?.requiredBeforeFormalExecution)
  fail("BA addendum must remain a formal-execution prerequisite");
if (manifest.baAddendum?.status !== "APPROVED")
  fail("BA addendum must be APPROVED before formal execution");
if (!fs.existsSync(path.join(root, manifest.baAddendum.evidence)))
  fail("BA addendum evidence file is missing");
const usdExpected = manifest.baAddendum.expectedByCurrency?.USD;
if (
  !usdExpected?.ssiCode ||
  !usdExpected?.ssiVersion ||
  !usdExpected?.accountId
)
  fail("atomic expectation incomplete for USD");
const gbp = manifest.baAddendum.expectedByCurrency.GBP;
if (
  gbp.decision !== "SSI_AMBIGUOUS" ||
  gbp.httpStatus !== 422 ||
  gbp.chosenRoute !== null ||
  gbp.payloadGenerated !== false
)
  fail(
    "GBP interim v14 expectation must be 422 SSI_AMBIGUOUS with no chosen route",
  );
exactSet(
  new Set(gbp.candidateSsiCodes ?? []),
  new Set(["SSI-DEMO-003", "SSI-DEMO-022", "SSI-DEMO-004"]),
  "GBP unordered candidates",
);
const contracts = manifest.responseContracts;
if (
  contracts?.positiveRankTaxonomy?.UNIQUE_TOP_RANK !== "RESOLVED" ||
  contracts?.positiveRankTaxonomy?.TIED_TOP_RANK !== "SSI_AMBIGUOUS" ||
  contracts?.positiveRankTaxonomy?.LOWER_BUSINESS_RANK !== "AUDIT_EVIDENCE_ONLY"
)
  fail("positive rank taxonomy is incomplete");
if (
  JSON.stringify(contracts?.rankOrder) !==
  JSON.stringify(["priority", "routePreference", "specificity"])
)
  fail("positive rank order must be priority → routePreference → specificity");
if (
  contracts?.A2_TIE?.httpStatus !== 422 ||
  contracts?.A2_TIE?.decision !== "SSI_AMBIGUOUS"
)
  fail("A2 must assert v14 HTTP 422 SSI_AMBIGUOUS pending reconciliation");
if (
  contracts?.A3_AMBIGUOUS_SHAPE?.candidateCollection !== "candidates" ||
  contracts?.A3_AMBIGUOUS_SHAPE?.candidateOrder !== "UNORDERED" ||
  contracts?.A3_AMBIGUOUS_SHAPE?.ambiguityReason !==
    "TIED_ON_CONTROLLED_RANK_KEYS" ||
  contracts?.A3_AMBIGUOUS_SHAPE?.payloadGenerated !== false
)
  fail("A3 ambiguous response shape is not governed");
exactSet(
  new Set(contracts.A3_AMBIGUOUS_SHAPE.nullFields ?? []),
  new Set([
    "chosenRoute",
    "canonicalRoles",
    "roleProvenance",
    "messageComposerContext",
  ]),
  "A3 null fields",
);
exactSet(
  new Set(contracts.A3_AMBIGUOUS_SHAPE.tiedOn ?? []),
  new Set(["priority", "routePreference", "specificity"]),
  "EC-RANK-01 tiedOn",
);
if (
  JSON.stringify(contracts.A3_AMBIGUOUS_SHAPE.tiedOn) !==
  JSON.stringify(["priority", "routePreference", "specificity"])
)
  fail("EC-RANK-01 tiedOn order must match v15 exactly");
if (
  contracts?.A4_NOSTRO_JOIN?.exactMatches !== 42 ||
  contracts?.A4_NOSTRO_JOIN?.orphans !== 0 ||
  !contracts?.A4_NOSTRO_JOIN?.joinRule.includes("accountReference")
)
  fail("A4 exact accountReference contract is incomplete");
if (
  manifest.proposedQaSeed?.ssiCode !== "QA-SSI-ORPHAN-001" ||
  manifest.proposedQaSeed?.status !== "PROPOSED_QA_ONLY" ||
  manifest.proposedQaSeed?.executableFixture !== true ||
  manifest.proposedQaSeed?.mustNotExistInBaseline !== true
)
  fail("controlled orphan Proposed QA Seed is not governed");
if (
  manifest.impactScan?.recordedAt !== "2026-09-11" ||
  manifest.impactScan?.snapshotSha256 !==
    "7492CC264BCDBC7EE43DC7028CDCDC12385898BFD4BDCCA02798D2B5A3AB4EF3" ||
  manifest.impactScan?.requestGroupCount !== 46 ||
  manifest.impactScan?.hitCount !== 1 ||
  manifest.impactScan?.candidateHitCount !== 3 ||
  manifest.impactScan?.topRankTieMemberCount !== 2 ||
  manifest.impactScan?.affectedSourceMessageJourneys !== 4 ||
  manifest.impactScan?.uniqueResolvedSourceMessageJourneys !== 44
)
  fail("tie impact scan evidence is incomplete");
exactSet(
  new Set(fixedSelected.map((item) => item.messageType.replace(" ", ""))),
  new Set(["MT202", "MT202COV", "MT205", "MT205COV"]),
  "fixed MT coverage",
);
exactSet(
  new Set(exhaustiveSelected.map((item) => item.bankServiceId)),
  new Set(manifest.resolverUniverse.pairs.map((item) => item.bankServiceId)),
  "Bank Service coverage",
);
exactSet(
  new Set(
    exhaustiveSelected
      .filter((item) => item.type === "POSITIVE")
      .map((item) => item.currency),
  ),
  new Set(manifest.resolverUniverse.pairs.map((item) => item.currency)),
  "resolvable currency coverage",
);
exactSet(
  new Set(
    exhaustiveSelected
      .filter((item) => item.type === "POSITIVE")
      .map((item) => `${item.bankServiceId}|${item.currency}`),
  ),
  new Set(
    manifest.resolverUniverse.pairs.map(
      (item) => `${item.bankServiceId}|${item.currency}`,
    ),
  ),
  "resolver Bank Service × currency pair coverage",
);
exactSet(
  new Set(
    exhaustiveSelected
      .filter((item) => item.type === "POSITIVE")
      .map((item) => item.journey.key),
  ),
  new Set([
    "MT202",
    "MT202COV",
    "MT205",
    "MT205COV",
    "BOOK_TRANSFER_SAME_RECEIVER",
    "CREDIT_ONE_OF_SEVERAL_AT_57A",
    "INITIAL_MT200_201_EQUIVALENCE",
    "NO_MT200_201_EQUIVALENCE",
  ]),
  "journey coverage",
);
for (const requiredType of [
  "UNSUPPORTED_CURRENCY",
  "MISSING_CURRENCY",
  "METAMORPHIC",
  "RACE_REGRESSION",
  "ATOMIC_DIRECT_GBP",
  "ATOMIC_SWITCH",
]) {
  if (
    !manifest.exhaustiveStableKeys.some((key) =>
      key.startsWith(requiredType + "|"),
    )
  )
    fail("missing risk type " + requiredType);
}
const errorCodes = new Set(
  fixedSelected
    .flatMap((item) => [item.expected?.mx?.code, item.expected?.mt?.code])
    .filter(Boolean),
);
exactSet(
  errorCodes,
  new Set([
    "OPTION_CONSTRAINT_VIOLATION",
    "MESSAGE_CONTEXT_MISSING",
    "SSI_NOT_FOUND",
    "CURRENCY_NOT_SUPPORTED",
    "MT2_COUNTERPARTY_TYPE_NOT_ACCEPTED",
    "RMA_NOT_AUTHORISED",
    "STALE_RESOLUTION",
    "COUNTERPARTY_PAYMENT_PROFILE_MISMATCH",
    "PROFILE_INCOMPLETE",
  ]),
  "UI error rendering coverage",
);
console.log(
  JSON.stringify(
    {
      status: "PASS",
      sourcePopulation: 260,
      selected: 52,
      percent: 20,
      fixed: 24,
      exhaustive: 28,
      riskCoverage: manifest.riskCoverage,
      formalExecutionGate: tieRiskGate.status,
      formalExecutionReady: tieRiskGate.status === "APPROVED",
    },
    null,
    2,
  ),
);
