/**
 * Node.js 中台 — orchestrates the Balance Component microservice per a
 * declarative Business Case Registry (data/businessCases.js). Mirrors
 * lc-payment-wc/backend's role (a thin Express layer the Angular Simulator
 * talks to) but for Balance Component: it sequences one HTTP call per
 * movement (Design doc §7.4 "one movement, one call" — this orchestrator
 * is exactly the "caller" that principle assumes exists upstream), never
 * calls the microservice's DB or domain code directly.
 */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { randomUUID } = require('node:crypto');
const { URLSearchParams } = require('node:url');
const { rateLimit } = require('express-rate-limit');
const { buildRegistry } = require('./data/businessCases');

const app = express();
app.use(helmet());
// Quality-report-balance.md BAL-103: was `cors()` with no options, reflecting/allowing every Origin.
// Explicit allow-list instead — defaults to the Angular dev server's own origin (matches proxy.conf.json's
// own hardcoded :4300 target); override via ALLOWED_ORIGINS (comma-separated) for any other deployment.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:4200').split(',').map((o) => o.trim());
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json());

const BALANCE_SERVICE_URL = process.env.BALANCE_SERVICE_URL || 'http://localhost:4100';

async function callMicroservice(method, path, body) {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (method !== 'GET') headers['Idempotency-Key'] = randomUUID();
  const res = await fetch(`${BALANCE_SERVICE_URL}${path}`, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, body: json };
}

/** Resolves a captured entry's balance-contract logicalContractId via a snapshot call, caching it on first use. */
async function resolveLogicalContractId(captured, ref) {
  const entry = captured[ref];
  if (!entry) throw new Error(`Step references unknown captureAs key "${ref}" — check step ordering in businessCases.js.`);
  // Reviewer-reported 2026-08-26 ("Run All Cases" 500) — the referenced step's own createMovement call
  // can fail (a genuine business rejection, or the microservice's own rate limiter kicking in mid-burst
  // across a full "Run All Cases" pass) without this step ever knowing; `entry.response` is then either
  // absent or an error body with no `balanceContractId`. A bare `entry.response.balanceContractId` threw
  // an opaque TypeError in that case, surfacing as a generic 500 with no indication of the real cause.
  if (!entry.response?.balanceContractId) {
    throw new Error(
      `Step "${ref}" never produced a balanceContractId (its own createMovement call did not succeed) — cannot resolve a parent for a dependent step. Last known response: ${JSON.stringify(entry.response)}`,
    );
  }
  if (entry.logicalContractId) return entry.logicalContractId;
  const snap = await callMicroservice('GET', `/balance-contracts/${entry.response.balanceContractId}/balance`);
  if (!snap.ok) throw new Error(`Could not resolve logicalContractId for "${ref}": ${JSON.stringify(snap.body)}`);
  entry.logicalContractId = snap.body.logicalContractId;
  return entry.logicalContractId;
}

async function resolveMovementRequest(captured, source) {
  const request = { ...source };
  if (request.balanceContractIdRef) {
    const referenced = captured[request.balanceContractIdRef];
    if (!referenced?.response?.balanceContractId)
      throw new Error(`Step references "${request.balanceContractIdRef}" for its own balanceContractId, but that step never produced one.`);
    request.balanceContractId = referenced.response.balanceContractId;
    delete request.balanceContractIdRef;
  }
  if (request.parentLogicalContractIdRef) {
    request.parentLogicalContractId = await resolveLogicalContractId(captured, request.parentLogicalContractIdRef);
    delete request.parentLogicalContractIdRef;
  }
  if (request.referencedTransactionIdRef) {
    const referenced = captured[request.referencedTransactionIdRef];
    if (!referenced?.response?.movementId)
      throw new Error(`Step references "${request.referencedTransactionIdRef}" for its own movementId, but that step never produced one.`);
    request.referencedTransactionId = referenced.response.movementId;
    delete request.referencedTransactionIdRef;
  }
  return request;
}

/**
 * Excess Maker Submit deliberately returns a compact command result rather than the full
 * movement/contract aggregate.  The demo runner still needs the contract id when a later
 * lifecycle step references the captured movement (for example A8 -> A9), so enrich only
 * the runner's private captured/trace value from the authoritative natural-key lookup.
 */
async function hydrateCapturedMovementResponse(request, response) {
  if (!response?.movementId || response.balanceContractId) return response;
  if (request.balanceContractId) return { ...response, balanceContractId: request.balanceContractId };

  const naturalKey = request.naturalKey;
  if (!request.instrumentType || !naturalKey?.lcNumber) return response;

  const params = new URLSearchParams({
    instrumentType: request.instrumentType,
    lcNumber: naturalKey.lcNumber,
  });
  for (const key of ['ibNumber', 'sgNumber', 'legSeq']) {
    if (naturalKey[key]) params.set(key, naturalKey[key]);
  }

  const resolved = await callMicroservice('GET', `/balance-contracts?${params.toString()}`);
  if (!resolved.ok || !resolved.body?.balanceContractId) {
    throw new Error(`Maker Submit succeeded but its compact response could not be resolved to a balance contract: ${JSON.stringify(resolved.body)}`);
  }
  return { ...response, balanceContractId: resolved.body.balanceContractId };
}

function assertExpectedOutcome(step, result) {
  if (step.expectError && result.ok) {
    throw new Error(`Step "${step.label}" expected a business rejection but succeeded with HTTP ${result.status}.`);
  }
  if (!step.expectError && !result.ok) {
    throw new Error(`Step "${step.label}" unexpectedly failed with HTTP ${result.status}: ${JSON.stringify(result.body)}`);
  }
  if (step.expectError && step.expectedStatus !== undefined && result.status !== step.expectedStatus) {
    throw new Error(`Step "${step.label}" expected HTTP ${step.expectedStatus} but received HTTP ${result.status}.`);
  }
  if (step.expectError && step.expectedErrorCode && result.body?.code !== step.expectedErrorCode) {
    throw new Error(`Step "${step.label}" expected error ${step.expectedErrorCode} but received ${result.body?.code || 'no code'}.`);
  }
}

function decimalSum(values) {
  const scale = Math.max(0, ...values.map((value) => String(value).split('.')[1]?.length || 0));
  const sum = values.reduce((total, value) => {
    const [whole, fraction = ''] = String(value).split('.');
    return total + BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
  }, 0n);
  const raw = sum.toString().padStart(scale + 1, '0');
  return scale ? `${raw.slice(0, -scale)}.${raw.slice(-scale)}`.replace(/\.0+$/, '') : raw;
}

function assertExportAssets(step, result) {
  const expected = step.expectExportAssets;
  if (!expected) return;
  const assets = result.body?.assets;
  const authorization = result.body?.authorization;
  if (!Array.isArray(assets) || !authorization) throw new Error(`Step "${step.label}" did not return authorization + assets.`);
  const covered = assets.find((asset) => asset.balanceType === expected.coveredBalanceType);
  const excess = assets.find((asset) => asset.balanceType === 'EXPORT_EXCESS_ASSET');
  if (covered?.amountOwner !== expected.covered || excess?.amountOwner !== expected.excess || excess?.debtor !== expected.excessDebtor) {
    throw new Error(`Step "${step.label}" returned unexpected export asset allocation: ${JSON.stringify(result.body)}`);
  }
  if (authorization.claimStatus !== expected.claimStatus || authorization.authorizationValidationResult !== expected.authorizationValidationResult) {
    throw new Error(`Step "${step.label}" returned unexpected export authorization decision: ${JSON.stringify(authorization)}`);
  }
  if (decimalSum(assets.map((asset) => asset.amountOwner)) !== expected.legal) {
    throw new Error(`Step "${step.label}" failed Covered + Excess = Legal reconciliation.`);
  }
}

/**
 * Demo Business Case Runner remediation only. Production clients continue to receive the original
 * zero-write EXCESS_LIMIT_EXCEEDED response and never get an automatically-created amendment.
 */
async function runAutoFormalIncrease(step, rejectedRequest, rejectedResult, captured, trace, retryCommand) {
  const config = step.autoFormalIncrease;
  if (!config) return null;
  if (rejectedResult.ok !== false || rejectedResult.status !== 409 || rejectedResult.body?.code !== 'EXCESS_LIMIT_EXCEEDED') {
    throw new Error(
      `Step "${step.label}" auto-remediation expected HTTP 409 EXCESS_LIMIT_EXCEEDED but received HTTP ${rejectedResult.status}: ${JSON.stringify(rejectedResult.body)}`,
    );
  }

  const guidance = rejectedResult.body?.guidance;
  if (guidance?.outcome !== 'FINITE' || !guidance.minimumRequiredIncreaseOwner) {
    throw new Error(`Step "${step.label}" requested Runner auto-remediation, but EXCESS_LIMIT_EXCEEDED did not provide a finite Minimum Required Increase.`);
  }

  const parent = captured[config.contractRef];
  if (!parent?.response?.balanceContractId) {
    throw new Error(`Runner auto-remediation for "${step.label}" cannot resolve contractRef "${config.contractRef}".`);
  }

  const isImport = config.functionCode === 'A2';
  if (!isImport && config.functionCode !== 'B2') {
    throw new Error(`Runner auto-remediation supports only A2 or B2, not "${config.functionCode}".`);
  }
  const formalFunction = isImport ? 'A02' : 'B02';

  const increaseRequest = {
    instrumentType: isImport ? 'IPLC_LC' : 'EPLC_CONFIRMATION',
    balanceContractId: parent.response.balanceContractId,
    movementType: isImport ? 'AMEND_INCREASE' : 'AMEND',
    eventSeq: Number(rejectedRequest.eventSeq) + 1,
    amount: String(guidance.minimumRequiredIncreaseOwner),
    currency: rejectedRequest.currency,
    sourceTransactionRef: `AUTO-${formalFunction}`,
    createdBy: rejectedRequest.createdBy,
  };
  const increase = await callMicroservice('POST', '/balance-movements', increaseRequest);
  if (!increase.ok) {
    throw new Error(`Runner automatic ${config.functionCode} failed with HTTP ${increase.status}: ${JSON.stringify(increase.body)}`);
  }
  trace.push({
    type: 'autoFormalIncrease',
    functionCode: config.functionCode,
    label: `Runner auto-creates ${formalFunction} from Minimum Required Increase`,
    request: increaseRequest,
    status: increase.status,
    ok: true,
    response: increase.body,
  });

  const release = await callMicroservice('POST', `/balance-movements/${increase.body?.movementId}/release`, {
    releasedBy: config.releasedBy || 'checker1',
  });
  if (!release.ok) {
    throw new Error(`Runner automatic ${config.functionCode} Release failed with HTTP ${release.status}: ${JSON.stringify(release.body)}`);
  }
  trace.push({
    type: 'autoFormalIncreaseRelease',
    functionCode: config.functionCode,
    label: `Runner releases automatic ${formalFunction}`,
    status: release.status,
    ok: true,
    response: release.body,
  });

  const retryRequest = retryCommand?.body || {
    ...rejectedRequest,
    // A3 updates the same parent contract, so A02 occupies the next sequence. A8/B3 are child
    // contracts whose rejected initial Submit was zero-write; their fresh retry remains event 1.
    eventSeq: rejectedRequest.balanceContractId ? Number(rejectedRequest.eventSeq) + 2 : rejectedRequest.eventSeq,
  };
  const retry = await callMicroservice('POST', retryCommand?.path || '/balance-movements', retryRequest);
  if (!retry.ok) {
    throw new Error(`Runner retry after automatic ${config.functionCode} failed with HTTP ${retry.status}: ${JSON.stringify(retry.body)}`);
  }
  const retryResponse = retryCommand ? retry.body : await hydrateCapturedMovementResponse(retryRequest, retry.body);
  trace.push({
    type: 'autoRetry',
    functionCode: step.functionCode,
    label: `Runner retries ${step.functionCode || step.label} after ${formalFunction}`,
    request: retryRequest,
    status: retry.status,
    ok: true,
    response: retryResponse,
  });
  return { response: retryResponse, request: retryRequest };
}

// Quality-report-balance.md BAL-124 (2026-08-17, found while fixing BAL-131): 'release' and
// 'makerSubmit' (Import Case #6's own A4 real Maker Submit) are the identical shape — POST to a
// per-movement sub-path with one body key, same "skipped" handling when the referenced createMovement
// step never captured a movementId. Consolidated into one dispatch table + shared handler in runCase()
// below instead of separate near-copies.
//
// 'acknowledge' (added 2026-08-17 BAL-131 for B3's own former Present-Docs Checker acknowledgment) was
// REMOVED 2026-08-18 ("所有交易要RELEASE過後 才能根據流程走下一個交易" — every transaction must
// genuinely RELEASE before the next step in the flow can act on it) — B3 now uses the standard 'release'
// step type directly, same as every other function; see businessCases.js's own Export Case #6/#7 for that
// updated step sequence.
//
// RESTORED 2026-08-28 — the /acknowledge endpoint itself came back 2026-08-20, RE-PURPOSED for A3/A3S's
// own Checker acknowledgment on IPLC_LC/UTILIZE (business instruction, "A3 A3S 交易 Approve 過後
// 不要再顯示"), but this dispatch table was never updated to match, leaving no orchestrator-level way to
// reach it. That gap only became a REAL, live failure once A6's own createMovement()/release() cascade
// (analysis/balance-component-api.yaml v1.29.0) started REQUIRING the referenced UTILIZE's own
// `acknowledgedAt` before it will set `makerSubmittedAt`/allow Release — found live 2026-08-28 running
// Import Case 7/8 (Usance A6/A7), which never acknowledge their own Document Arrivals and had silently
// been failing every A6-related release step with 409 ILLEGAL_STATE_TRANSITION ever since v1.29.0 shipped.
// Same single-bodyKey shape as release/makerSubmit, so it fits this table unchanged.
const RELEASE_SHAPED_STEP_TYPES = {
  release: { subPath: 'release', bodyKey: 'releasedBy' },
  makerSubmit: { subPath: 'maker-submit', bodyKey: 'makerSubmittedBy' },
  acknowledge: { subPath: 'acknowledge', bodyKey: 'acknowledgedBy' },
};

async function runCreateMovementStep(step, captured, trace) {
  const request = await resolveMovementRequest(captured, step.request);
  const result = await callMicroservice('POST', '/balance-movements', request);
  assertExpectedOutcome(step, result);
  assertExportAssets(step, result);
  const response = result.ok ? await hydrateCapturedMovementResponse(request, result.body) : result.body;
  if (step.captureAs) captured[step.captureAs] = { response, request };
  trace.push({
    type: 'createMovement',
    functionCode: step.functionCode,
    label: step.label,
    request,
    status: result.status,
    ok: result.ok,
    expectedError: Boolean(step.expectError),
    response,
  });
  const remediated = await runAutoFormalIncrease(step, request, result, captured, trace);
  if (remediated && step.captureAs) captured[step.captureAs] = remediated;
}

function captureCompoundResponses(step, captured, responses, requests) {
  step.captureAs.forEach((key, index) => {
    captured[key] = { response: responses[index], request: requests[index] };
  });
}

async function runCompoundMovementStep(step, captured, trace) {
  const requests = [];
  for (const request of step.requests) requests.push(await resolveMovementRequest(captured, request));
  const result = await callMicroservice('POST', '/balance-movements/compound', { requests });
  assertExpectedOutcome(step, result);
  if (result.ok) captureCompoundResponses(step, captured, result.body, requests);
  trace.push({
    type: step.type,
    functionCode: step.functionCode,
    label: step.label,
    requests,
    status: result.status,
    ok: result.ok,
    response: result.body,
  });
  if (!step.autoFormalIncrease) return;

  const decisionIndex = step.autoFormalIncrease.decisionRequestIndex;
  const decisionRequest = requests[decisionIndex];
  const retryRequests = requests.map((request, index) => (index === decisionIndex ? { ...request, eventSeq: Number(request.eventSeq) + 2 } : request));
  const remediated = await runAutoFormalIncrease(step, decisionRequest, result, captured, trace, {
    path: '/balance-movements/compound',
    body: { requests: retryRequests },
  });
  if (remediated) captureCompoundResponses(step, captured, remediated.response, retryRequests);
}

async function runCompoundActionsStep(step, captured, trace) {
  const actions = step.actions.map(({ kind, movementRef }) => ({ kind, movementId: captured[movementRef]?.response?.movementId }));
  if (actions.some((action) => !action.movementId)) {
    throw new Error(`Compound action "${step.label}" references a movement that was not created.`);
  }
  const result = await callMicroservice('POST', '/balance-movements/compound-actions', { actions, actor: step.actor });
  assertExpectedOutcome(step, result);
  trace.push({ type: step.type, functionCode: step.functionCode, label: step.label, status: result.status, ok: result.ok, response: result.body });
}

async function runReleaseShapedStep(step, captured, trace) {
  const { subPath, bodyKey } = RELEASE_SHAPED_STEP_TYPES[step.type];
  const movementId = captured[step.movementRef]?.response?.movementId;
  if (!movementId) {
    trace.push({
      type: step.type,
      label: step.label,
      skipped: true,
      reason: `No movementId captured under "${step.movementRef}" (likely because that createMovement step returned an expected error).`,
    });
    return;
  }
  const result = await callMicroservice('POST', `/balance-movements/${movementId}/${subPath}`, {
    [bodyKey]: step[bodyKey],
    ...step.request,
  });
  assertExpectedOutcome(step, result);
  assertExportAssets(step, result);
  trace.push({
    type: step.type,
    functionCode: step.functionCode,
    label: step.label,
    status: result.status,
    ok: result.ok,
    expectedError: Boolean(step.expectError),
    response: result.body,
  });
}

async function runSnapshotStep(step, captured, trace) {
  const balanceContractId = captured[step.contractRef]?.response?.balanceContractId;
  const result = await callMicroservice('GET', `/balance-contracts/${balanceContractId}/balance`);
  if (!result.ok) {
    throw new Error(`Snapshot step "${step.label}" unexpectedly failed with HTTP ${result.status}: ${JSON.stringify(result.body)}`);
  }
  trace.push({ type: 'snapshot', label: step.label, status: result.status, ok: result.ok, response: result.body });
}

/** Runs one business case's step list against the microservice, returning a full trace for the UI. */
async function runCase(businessCase) {
  const captured = {}; // captureAs key -> { response, logicalContractId? }
  const trace = [];

  for (const step of businessCase.steps) {
    if (step.type === 'note') trace.push({ type: 'note', label: step.label });
    else if (step.type === 'createMovement') await runCreateMovementStep(step, captured, trace);
    else if (step.type === 'createCompoundMovements') await runCompoundMovementStep(step, captured, trace);
    else if (step.type === 'compoundActions') await runCompoundActionsStep(step, captured, trace);
    else if (RELEASE_SHAPED_STEP_TYPES[step.type]) await runReleaseShapedStep(step, captured, trace);
    else if (step.type === 'snapshot') await runSnapshotStep(step, captured, trace);
    else throw new Error(`Unknown step type "${step.type}"`);
  }

  return trace;
}

app.get('/api/business-cases', (_req, res) => {
  res.json(
    buildRegistry().map(({ id, title, description, steps, requiredPolicy }) => ({
      id,
      title,
      description,
      stepCount: steps.length,
      ...(requiredPolicy ? { requiredPolicy } : {}),
    })),
  );
});

// Quality-report-balance.md BAL-118: this is the orchestrator's own highest-amplification endpoint —
// one incoming request can fan out into a multi-step cascade of downstream microservice calls (see
// runCase() above) — so it gets its own rate limit, mirroring the microservice's own scoped limiter on
// /balance-movements (same window/limit shape, same "basic abuse protection, not a throughput cap on
// normal use" posture).
const runLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });

app.post('/api/business-cases/:id/run', runLimiter, async (req, res) => {
  const registry = buildRegistry(); // fresh natural keys each run — re-runnable against the same DB
  const businessCase = registry.find((c) => c.id === req.params.id);
  if (!businessCase) {
    res.status(404).json({ code: 'NOT_FOUND', message: `No business case "${req.params.id}"` });
    return;
  }
  try {
    const trace = await runCase(businessCase);
    res.json({ id: businessCase.id, title: businessCase.title, description: businessCase.description, trace });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    // Quality-report-balance.md BAL-117: was echoing `detail` straight into the response body — any
    // caller (this endpoint has no authentication) could read back internal error detail (e.g. a
    // downstream microservice's own raw error body, re-serialized into this message by
    // resolveLogicalContractId()). Log the detail server-side, return a generic message to the client.
    console.error(`[business-cases/run] orchestration error for "${req.params.id}":`, detail);
    res.status(500).json({ code: 'ORCHESTRATION_ERROR', message: 'An internal error occurred while running this business case.' });
  }
});

// Dev-only — Business Case Runner's "Cleanup Database Tables" button. Standalone: proxies straight
// through to the microservice's own /admin/reset-database, same as every other route here, no change to
// callMicroservice()/runCase() themselves.
app.post('/api/admin/reset-database', async (_req, res) => {
  const result = await callMicroservice('POST', '/admin/reset-database');
  res.status(result.status).json(result.body);
});

// Thin read-only proxy used by the transaction builder. All validation, FX controls and exact
// allowance arithmetic stay authoritative in the Balance Component.
app.post('/api/excess-preview', async (req, res, next) => {
  try {
    const result = await callMicroservice('POST', '/balance-movements/excess-preview', req.body);
    res.status(result.status).json(result.body);
  } catch (error) {
    next(error);
  }
});

app.get('/healthz', (_req, res) => res.json({ status: 'ok', balanceServiceUrl: BALANCE_SERVICE_URL }));

// Was 4200 — collided with `ng serve`'s own default dev-server port, so
// `npm run dev:all` (backend + ng serve started together) could never bind
// both. proxy.conf.json's "/api" target must stay in sync with this.
// Fix Backend Restart / EADDRINUSE (user-directed, 2026-08-29) — `npm run dev`/`dev:all` runs this
// under `node --watch`, which kills and re-execs the whole process on every save; that's a hard kill of
// the OLD process, not a request the old HTTP server ever sees, so it never got the chance to release
// :4300 before the new instance tried to bind it — the actual EADDRINUSE root cause, not a genuinely
// different process squatting on the port. SIGINT/SIGTERM handlers below let a NORMAL shutdown (Ctrl+C,
// or `--watch`'s own restart signal on platforms where it sends one) close the server first. Explicit
// EADDRINUSE handling makes a real port conflict (e.g. two backends started at once — see this file's
// own dev-setup doc comment) fail loudly with a clear message instead of an unhandled exception.
// Both extracted to named functions (rather than inline in the `require.main === module` block below) so
// server.test.js can unit-test them directly with a mock server/error — same test-only-seam convention
// `runCase`/`resolveLogicalContractId`/`callMicroservice` already use, see BAL-107's own doc comment below.
function handleListenError(err, port) {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use — is another backend instance already running?`);
    process.exit(1);
    return;
  }
  throw err;
}

function shutdown(server, signal) {
  console.log(`${signal} received. Closing server...`);
  server.close((err) => {
    if (err) {
      console.error('Failed to close server:', err);
      process.exit(1);
      return;
    }
    console.log('Server closed.');
    process.exit(0);
  });
}

const PORT = process.env.PORT || 4300;
/* istanbul ignore next -- thin bootstrap wiring (app.listen()/signal handlers); only runs when this
   file is executed directly, never when `require('../server')`'d by a test (see this file's own
   `require.main === module` guard) — same "nothing meaningful to unit-test at this stage" rationale
   microservices/balance-component/src/server.ts's own jest.config.js exclusion already documents.
   handleListenError()/shutdown() themselves are real unit-tested logic, not excluded here. */
if (require.main?.filename === process.argv[1]) {
  const server = app.listen(PORT, () => {
    console.log(`balance-component-backend (中台) listening on :${PORT} -> ${BALANCE_SERVICE_URL}`);
  });

  server.on('error', (err) => handleListenError(err, PORT));
  process.on('SIGINT', () => shutdown(server, 'SIGINT'));
  process.on('SIGTERM', () => shutdown(server, 'SIGTERM'));
}

// Quality-report-balance.md BAL-107: was `module.exports = app; module.exports.runCase = runCase; ...`
// (attaching test-only internals directly onto the Express app object). A plain object keeps the HTTP
// handler's own public surface (`app`) separate from the test-only seam (`runCase`/
// `resolveLogicalContractId`/`callMicroservice`/`handleListenError`/`shutdown`, exported purely so
// runCase.test.js/server.test.js can unit-test them directly — see each file's own doc comment for why).
module.exports = { app, runCase, runAutoFormalIncrease, resolveLogicalContractId, callMicroservice, handleListenError, shutdown };
