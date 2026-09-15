import assert from "node:assert/strict";
import fs from "node:fs";
import { readJson, stableJson } from "./file-utils.mjs";
import { result, Status } from "./result.mjs";

const requiredIdentity = (trace) =>
  Boolean(
    trace.contractVersion &&
    trace.correlationId &&
    trace.sourceIdentity?.kind &&
    trace.sourceIdentity?.value,
  );

export const compareParameterPayloads = (trace) => {
  const errors = [];
  if (!requiredIdentity(trace))
    errors.push(
      "contractVersion, correlationId and sourceIdentity(kind/value) are required",
    );
  for (const stage of ["api", "pageModel", "uiRenderInput"])
    if (!trace[stage] || !("parameterPayload" in trace[stage]))
      errors.push(`${stage}.parameterPayload is required`);
  if (errors.length > 0) return errors;
  try {
    assert.deepStrictEqual(
      stableJson(trace.pageModel.parameterPayload),
      stableJson(trace.api.parameterPayload),
    );
  } catch {
    errors.push("Page model changed the API parameter payload");
  }
  try {
    assert.deepStrictEqual(
      stableJson(trace.uiRenderInput.parameterPayload),
      stableJson(trace.api.parameterPayload),
    );
  } catch {
    errors.push("UI render input changed the API parameter payload");
  }
  return errors;
};

export const evaluateContractTrace = (traceFile) => {
  if (!traceFile || !fs.existsSync(traceFile))
    return result(
      "API_PAGE_MODEL_UI_PASS_THROUGH",
      Status.NOT_EXECUTED,
      { traceFile: traceFile ?? null, acceptanceClaim: false },
      "A runtime API -> page model -> UI render trace was not supplied",
    );
  const trace = readJson(traceFile);
  const errors = compareParameterPayloads(trace);
  return result(
    "API_PAGE_MODEL_UI_PASS_THROUGH",
    errors.length === 0 ? Status.PASS : Status.FAIL,
    {
      traceFile,
      contractVersion: trace.contractVersion ?? null,
      correlationId: trace.correlationId ?? null,
      sourceIdentity: trace.sourceIdentity ?? null,
      errors,
    },
    errors.length === 0
      ? undefined
      : "API-driven page-parameter pass-through is not lossless",
  );
};
