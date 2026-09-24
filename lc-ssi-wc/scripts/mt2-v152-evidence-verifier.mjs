import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const registryPath = resolve(root, "qa/reports/latest/mt2/evidence/v15.2/assertion-registry.json");
const hex64 = /^[0-9a-f]{64}$/i;
const valueAt = (body, key) => body?.[key] ?? body?.mx?.[key] ?? null;

const expectedGeneric = new Map([
  ["GEN-202-01", ["SSI-DEMO-001", 44, "CITIUS33", false]],
  ["GEN-202-02", ["SSI-DEMO-021", 39, "CITIUS33", false]],
  ["OMIT-57A-01", ["SSI-DEMO-024", 19, "CITIUS33", true]],
  ["OMIT-57A-02", ["SSI-DEMO-019", 44, "BKCHCNBJ", true]],
  ["OMIT-57A-03", ["SSI-DEMO-013", 39, "CTBAAU2S", true]],
  ["OMIT-57A-04", ["SSI-DEMO-015", 39, "ROYCCAT2", true]],
  ["OMIT-57A-05", ["SSI-DEMO-021", 39, "CITIUS33", true]],
  ["OMIT-57A-06", ["SSI-DEMO-017", 39, "UBSWCHZH80A", true]],
  ["PROV-00", ["SSI-DEMO-001", 44, "CITIUS33", false]],
  ["PROV-01", ["SSI-DEMO-024", 19, "CITIUS33", false]],
  ["PROV-02", ["SSI-DEMO-019", 44, "BKCHCNBJ", false]],
  ["PROV-03", ["SSI-DEMO-013", 39, "CTBAAU2S", false]],
  ["PROV-04", ["SSI-DEMO-015", 39, "ROYCCAT2", false]],
  ["PROV-05", ["SSI-DEMO-021", 39, "CITIUS33", false]],
  ["PROV-06", ["SSI-DEMO-017", 39, "UBSWCHZH80A", false]],
]);

const sourceIdentityIsBound = (document) => {
  const responseHash = valueAt(document.response, "snapshotHash");
  const responseMethod = valueAt(document.response, "snapshotIdentityMethod");
  return (
    hex64.test(document.source.snapshotSha256) &&
    responseHash?.toUpperCase() === document.source.snapshotSha256.toUpperCase() &&
    responseMethod === "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1" &&
    document.source.snapshotIdentityMethod === responseMethod
  );
};

const evaluateGeneric = (document) => {
  const [ssiCode, version, agent, requireOmission] = expectedGeneric.get(document.caseId);
  const body = document.response ?? {};
  const mx = body.mx ?? {};
  const roles = mx.canonicalRoles ?? {};
  const provenance = mx.roleProvenance ?? {};
  const request = document.request;
  const agentOk =
    body.chosenRoute?.ssiCode === ssiCode &&
    body.chosenRoute?.ssiVersion === version &&
    body.chosenRoute?.currency === request.currency &&
    roles.instructedAgent === agent &&
    roles.creditorAgent === agent &&
    provenance.instructedAgent?.sourceField === "actualReceiverBic" &&
    provenance.creditorAgent?.sourceField === "accountWithBic";
  const sourceOk =
    mx.messageComposerContext?.Cdtr?.value ===
      request.paymentBeneficiaryInstitutionInput &&
    mx.messageComposerContext?.Cdtr?.source === "REQUEST_PASS_THROUGH" &&
    sourceIdentityIsBound(document);
  const omissionOk =
    body.mt?.omitted?.includes("57a") &&
    body.renderingDecisions?.["MT202.57a"]?.outcome === "OMITTED_BY_RULE";
  if (requireOmission) return [agentOk && omissionOk, sourceOk];
  if (document.caseId.startsWith("PROV-") && document.caseId !== "PROV-00")
    return [agentOk, sourceOk];
  return [agentOk && sourceOk];
};

const evaluateBook = (document) => {
  const body = document.response ?? {};
  const mx = body.mx ?? {};
  const mt = body.mt ?? {};
  const status = Number(mx.httpStatus ?? body.httpStatus);
  if (document.caseId === "BOOK-02")
    return [status === 422 && mx.code === "OPTION_CONSTRAINT_VIOLATION" &&
      mx.reasonCode === "OWN_ACCOUNT_CURRENCY_MISMATCH" &&
      sourceIdentityIsBound(document)];
  if (document.caseId === "BOOK-03")
    return [status === 422 && mx.code === "OPTION_CONSTRAINT_VIOLATION" &&
      mx.reasonCode === "OWN_ACCOUNT_RECEIVER_MISMATCH" &&
      sourceIdentityIsBound(document)];
  if (document.caseId === "BOOK-04")
    return [status === 200 && mx.counterpartySsiResolution === "SKIPPED" &&
      mx.resolutionTrace?.counterpartySsiQueried === false &&
      !JSON.stringify(body).includes("SSI-DEMO-") && sourceIdentityIsBound(document)];
  if (document.caseId === "BOOK-05") {
    const staleToken = valueAt(body.stale?.before?.responseBody, "resolutionToken");
    const staleCleared =
      body.stale?.before?.responseStatus === 200 &&
      Boolean(staleToken) &&
      typeof body.stale?.afterText === "string" &&
      body.stale.afterText.includes("尚未執行 Resolution") &&
      !body.stale.afterText.includes(staleToken);
    const second = body.race?.secondCapture;
    const events = body.race?.networkEvents ?? [];
    const eventA = events.find((event) => event.sequence === "A");
    const eventB = events.find((event) => event.sequence === "B");
    const snapshot = valueAt(body.stale?.before?.responseBody, "snapshotHash");
    const eventSnapshot = (event) => valueAt(event?.responseBody, "snapshotHash");
    const eventCorrelation = (event) => valueAt(event?.responseBody, "correlationId");
    const raceProtected =
      Number(body.race?.delayMs) >= 1000 &&
      events.length === 2 &&
      Boolean(eventA?.request?.correlationId) &&
      Boolean(eventB?.request?.correlationId) &&
      eventA.request.correlationId !== eventB.request.correlationId &&
      eventCorrelation(eventA) === eventA.request.correlationId &&
      eventCorrelation(eventB) === eventB.request.correlationId &&
      eventB.request.correlationId === second?.request?.correlationId &&
      Date.parse(eventB.browserFulfilledAt) < Date.parse(eventA.browserFulfilledAt) &&
      eventSnapshot(eventA) === snapshot && eventSnapshot(eventB) === snapshot &&
      body.race?.domAfterB?.text === second?.uiText &&
      body.race?.domAfterDelayedA?.text === body.race?.domAfterB?.text &&
      Date.parse(body.race?.domAfterDelayedA?.capturedAt) >=
        Date.parse(eventA.browserFulfilledAt);
    return [staleCleared, raceProtected];
  }
  const debit = mx.messageComposerContext?.DbtrAcct?.value;
  const credit = mx.messageComposerContext?.CdtrAcct?.value;
  return [
    status === 200 && mx.code === "RESOLVED" &&
      mx.resolutionDomain === "OWN_SSI_NOSTRO" &&
      mt.renderingDecisions?.["57A"]?.outcome === "OMITTED_BY_RULE" &&
      mt.omitted?.includes("57A"),
    mx.counterpartySsiResolution === "SKIPPED" && mx.chosenRoute === null &&
      Array.isArray(mx.candidates) && mx.candidates.length === 0,
    mt.tags?.["53B"] === `/${debit}` && mt.renderingDecisions?.["53B"]?.option === "B",
    mt.tags?.["58A"] === `/${credit}\nDEMOHKHH`,
    mx.roleProvenance?.beneficiary?.source === "OWN_ENTITY" &&
      mx.roleProvenance?.debitAccount?.source === "OWN_SSI_NOSTRO" &&
      mx.roleProvenance?.creditAccount?.source === "OWN_SSI_NOSTRO" &&
      mx.resolutionTrace?.counterpartySsiQueried === false,
    Boolean(debit) && Boolean(credit) && debit !== credit,
    mt.tags?.["53B"]?.slice(1) === debit &&
      mx.messageComposerContext?.SttlmAcct?.value === debit &&
      mt.tags?.["58A"]?.split("\n")[0]?.slice(1) === credit &&
      sourceIdentityIsBound(document),
  ];
};

const assertDocumentShape = (document) => {
  const allowed = new Set([
    "schemaVersion", "caseId", "status", "generatedAt", "execution",
    "source", "request", "response", "assertions",
  ]);
  if (!document || typeof document !== "object" || Array.isArray(document))
    throw new Error("evidence must be an object");
  if (Object.keys(document).some((key) => !allowed.has(key)))
    throw new Error("evidence contains an unregistered top-level field");
  if (document.schemaVersion !== "1.0") throw new Error("schemaVersion must be 1.0");
  if (!["PASS", "FAIL"].includes(document.status)) throw new Error("invalid status");
  if (!Number.isFinite(Date.parse(document.generatedAt))) throw new Error("invalid generatedAt");
  if (!document.execution?.correlationId || !document.execution?.tester ||
      !/^\d{4}-\d{2}-\d{2}$/.test(document.execution?.executionDate ?? ""))
    throw new Error("invalid execution identity");
  if (!hex64.test(document.source?.snapshotSha256 ?? ""))
    throw new Error("invalid snapshot SHA-256");
  if (document.source?.snapshotIdentityMethod !== "SQLITE_WAL_AWARE_LOGICAL_SNAPSHOT_V1")
    throw new Error("invalid snapshot identity method");
  if (!document.request || typeof document.request !== "object") throw new Error("request required");
  if (!document.response || typeof document.response !== "object") throw new Error("response required");
  if (!Array.isArray(document.assertions) || !document.assertions.length)
    throw new Error("assertions required");
};

export async function verifyEvidence(caseId, evidencePath, expectedSha256) {
  const raw = await readFile(evidencePath);
  const actualSha256 = createHash("sha256").update(raw).digest("hex").toUpperCase();
  if (!hex64.test(expectedSha256) || actualSha256 !== expectedSha256.toUpperCase())
    throw new Error(`ASSERT-EVIDENCE-HASH failed: expected=${expectedSha256} actual=${actualSha256}`);
  const document = JSON.parse(raw.toString("utf8"));
  assertDocumentShape(document);
  if (document.caseId !== caseId) throw new Error("case ID does not match evidence");

  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const allIds = registry.cases.flatMap((entry) => entry.assertionIds);
  if (new Set(allIds).size !== allIds.length) throw new Error("registry assertion IDs are not globally unique");
  const entry = registry.cases.find((item) => item.caseId === caseId);
  if (!entry) throw new Error(`unregistered case: ${caseId}`);
  const claimedIds = document.assertions.map((item) => item.id);
  if (new Set(claimedIds).size !== claimedIds.length) throw new Error("duplicate assertion ID");
  if (JSON.stringify(claimedIds) !== JSON.stringify(entry.assertionIds))
    throw new Error("assertion IDs differ from registry order");

  const recomputed = caseId.startsWith("BOOK-")
    ? evaluateBook(document)
    : evaluateGeneric(document);
  if (recomputed.length !== entry.assertionIds.length)
    throw new Error("independent assertion count differs from registry");
  document.assertions.forEach((claim, index) => {
    if (claim.passed !== recomputed[index])
      throw new Error(`${claim.id}: claimed=${claim.passed} recomputed=${recomputed[index]}`);
  });
  const recomputedStatus = recomputed.every(Boolean) ? "PASS" : "FAIL";
  if (document.status !== recomputedStatus)
    throw new Error(`status=${document.status} recomputed=${recomputedStatus}`);
  return { caseId, status: recomputedStatus, sha256: actualSha256, independentlyVerified: true };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const result = await verifyEvidence(process.argv[2], resolve(root, process.argv[3]), process.argv[4]);
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error(JSON.stringify({ status: "FAIL", error: error.message }));
    process.exitCode = 1;
  }
}
