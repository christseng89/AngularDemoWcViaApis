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
  const res = await fetch(`${BALANCE_SERVICE_URL}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
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

function assertExpectedOutcome(step, result) {
  if (step.expectError && result.ok) {
    throw new Error(`Step "${step.label}" expected a business rejection but succeeded with HTTP ${result.status}.`);
  }
  if (!step.expectError && !result.ok) {
    throw new Error(`Step "${step.label}" unexpectedly failed with HTTP ${result.status}: ${JSON.stringify(result.body)}`);
  }
}

function assertNonNegativeTightAvailable(label, response) {
  const value = response?.eventSnapshot?.tightAvailableBalance ?? response?.tightAvailableBalance;
  if (value !== null && value !== undefined && Number(value) < 0) {
    throw new Error(`Step "${label}" produced an invalid negative Tight Available Balance (${value}).`);
  }
}

/** Test-runner safety net: repair an unexpected negative Tight balance with A02/B02. */
async function autoAmendNegativeTightAvailable({ label, response, balanceContractId, instrumentType, trace }) {
  const value = response?.eventSnapshot?.tightAvailableBalance ?? response?.tightAvailableBalance;
  if (value === null || value === undefined || Number(value) >= 0) return;

  const isImport = instrumentType === 'IPLC_LC';
  const isExport = instrumentType === 'EPLC_CONFIRMATION' || instrumentType === 'EPLC_LC';
  if (!isImport && !isExport) assertNonNegativeTightAvailable(label, response);

  const functionCode = isImport ? 'A2' : 'B2';
  const sourceTransactionRef = isImport ? 'A02' : 'B02';
  const amendment = {
    instrumentType,
    balanceContractId,
    movementType: isImport ? 'AMEND_INCREASE' : 'AMEND',
    eventSeq: Date.now(),
    amount: String(value).replace(/^-/, ''),
    currency: response.currency,
    sourceTransactionRef,
    createdBy: 'maker1',
  };
  const created = await callMicroservice('POST', '/balance-movements', amendment);
  if (!created.ok) throw new Error(`Automatic ${sourceTransactionRef} failed with HTTP ${created.status}: ${JSON.stringify(created.body)}`);
  trace.push({ type: 'createMovement', functionCode, label: `Auto ${sourceTransactionRef} — restore negative Tight LC Balance`, request: amendment, status: created.status, ok: true, response: created.body });

  const released = await callMicroservice('POST', `/balance-movements/${created.body.movementId}/release`, { releasedBy: 'checker1' });
  if (!released.ok) throw new Error(`Automatic ${sourceTransactionRef} release failed with HTTP ${released.status}: ${JSON.stringify(released.body)}`);
  trace.push({ type: 'release', functionCode, label: `Checker releases automatic ${sourceTransactionRef}`, status: released.status, ok: true, response: released.body });

  const repaired = await callMicroservice('GET', `/balance-contracts/${balanceContractId}/balance`);
  if (!repaired.ok) throw new Error(`Automatic ${sourceTransactionRef} verification failed with HTTP ${repaired.status}: ${JSON.stringify(repaired.body)}`);
  assertNonNegativeTightAvailable(`Automatic ${sourceTransactionRef}`, repaired.body);
  trace.push({ type: 'snapshot', functionCode, label: `Balance after automatic ${sourceTransactionRef}`, status: repaired.status, ok: true, response: repaired.body });
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

/** Runs one business case's step list against the microservice, returning a full trace for the UI. */
async function runCase(businessCase) {
  const captured = {}; // captureAs key -> { response, logicalContractId? }
  const trace = [];

  for (const step of businessCase.steps) {
    if (step.type === 'note') {
      trace.push({ type: 'note', label: step.label });
      continue;
    }

    if (step.type === 'createMovement') {
      const request = await resolveMovementRequest(captured, step.request);
      const result = await callMicroservice('POST', '/balance-movements', request);
      assertExpectedOutcome(step, result);
      if (step.captureAs) captured[step.captureAs] = { response: result.body, request };
      trace.push({
        type: 'createMovement',
        functionCode: step.functionCode,
        label: step.label,
        request,
        status: result.status,
        ok: result.ok,
        expectedError: Boolean(step.expectError),
        response: result.body,
      });
      if (result.ok) {
        await autoAmendNegativeTightAvailable({
          label: step.label,
          response: result.body,
          balanceContractId: result.body.balanceContractId,
          instrumentType: request.instrumentType,
          trace,
        });
      }
      continue;
    }

    if (step.type === 'createCompoundMovements') {
      const requests = [];
      for (const request of step.requests) requests.push(await resolveMovementRequest(captured, request));
      const result = await callMicroservice('POST', '/balance-movements/compound', { requests });
      assertExpectedOutcome(step, result);
      if (result.ok) {
        step.captureAs.forEach((key, index) => {
          captured[key] = { response: result.body[index], request: requests[index] };
        });
      }
      trace.push({
        type: step.type,
        functionCode: step.functionCode,
        label: step.label,
        requests,
        status: result.status,
        ok: result.ok,
        response: result.body,
      });
      continue;
    }

    if (step.type === 'compoundActions') {
      const actions = step.actions.map(({ kind, movementRef }) => ({ kind, movementId: captured[movementRef]?.response?.movementId }));
      if (actions.some((action) => !action.movementId)) throw new Error(`Compound action "${step.label}" references a movement that was not created.`);
      const result = await callMicroservice('POST', '/balance-movements/compound-actions', { actions, actor: step.actor });
      assertExpectedOutcome(step, result);
      trace.push({ type: step.type, functionCode: step.functionCode, label: step.label, status: result.status, ok: result.ok, response: result.body });
      continue;
    }

    if (RELEASE_SHAPED_STEP_TYPES[step.type]) {
      const { subPath, bodyKey } = RELEASE_SHAPED_STEP_TYPES[step.type];
      const movementId = captured[step.movementRef]?.response?.movementId;
      if (!movementId) {
        trace.push({
          type: step.type,
          label: step.label,
          skipped: true,
          reason: `No movementId captured under "${step.movementRef}" (likely because that createMovement step returned an expected error).`,
        });
        continue;
      }
      const result = await callMicroservice('POST', `/balance-movements/${movementId}/${subPath}`, { [bodyKey]: step[bodyKey] });
      assertExpectedOutcome(step, result);
      trace.push({ type: step.type, functionCode: step.functionCode, label: step.label, status: result.status, ok: result.ok, response: result.body });
      const capturedEntry = captured[step.movementRef];
      await autoAmendNegativeTightAvailable({
        label: step.label,
        response: result.body,
        balanceContractId: capturedEntry?.response?.balanceContractId,
        instrumentType: capturedEntry?.request?.instrumentType,
        trace,
      });
      continue;
    }

    if (step.type === 'snapshot') {
      const balanceContractId = captured[step.contractRef]?.response?.balanceContractId;
      const result = await callMicroservice('GET', `/balance-contracts/${balanceContractId}/balance`);
      if (!result.ok) throw new Error(`Snapshot step "${step.label}" unexpectedly failed with HTTP ${result.status}: ${JSON.stringify(result.body)}`);
      trace.push({ type: 'snapshot', label: step.label, status: result.status, ok: result.ok, response: result.body });
      await autoAmendNegativeTightAvailable({
        label: step.label,
        response: result.body,
        balanceContractId,
        instrumentType: captured[step.contractRef]?.request?.instrumentType,
        trace,
      });
      continue;
    }

    throw new Error(`Unknown step type "${step.type}"`);
  }

  return trace;
}

app.get('/api/business-cases', (_req, res) => {
  res.json(buildRegistry().map(({ id, title, description, steps }) => ({ id, title, description, stepCount: steps.length })));
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
if (require.main === module) {
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
module.exports = { app, runCase, resolveLogicalContractId, callMicroservice, handleListenError, shutdown };
