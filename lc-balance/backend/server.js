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
    throw new Error(`Step "${ref}" never produced a balanceContractId (its own createMovement call did not succeed) — cannot resolve a parent for a dependent step. Last known response: ${JSON.stringify(entry.response)}`);
  }
  if (entry.logicalContractId) return entry.logicalContractId;
  const snap = await callMicroservice('GET', `/balance-contracts/${entry.response.balanceContractId}/balance`);
  if (!snap.ok) throw new Error(`Could not resolve logicalContractId for "${ref}": ${JSON.stringify(snap.body)}`);
  entry.logicalContractId = snap.body.logicalContractId;
  return entry.logicalContractId;
}

// Quality-report-balance.md BAL-124 (2026-08-17, found while fixing BAL-131): 'release' and
// 'makerSubmit' (Import Case #6's own A4 real Maker Submit) are the identical shape — POST to a
// per-movement sub-path with one body key, same "skipped" handling when the referenced createMovement
// step never captured a movementId. Consolidated into one dispatch table + shared handler in runCase()
// below instead of separate near-copies.
//
// 'acknowledge' (added 2026-08-17 BAL-131 for B3's own former Present-Docs Checker acknowledgment) was
// REMOVED 2026-08-18 ("所有交易要RELEASE過後 才能根據流程走下一個交易" — every transaction must
// genuinely RELEASE before the next step in the flow can act on it) — the /acknowledge endpoint itself
// no longer exists server-side; B3 now uses the standard 'release' step type directly, same as every
// other function. See businessCases.js's own Export Case #6/#7 for the updated step sequence.
const RELEASE_SHAPED_STEP_TYPES = {
  release: { subPath: 'release', bodyKey: 'releasedBy' },
  makerSubmit: { subPath: 'maker-submit', bodyKey: 'makerSubmittedBy' },
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
      const request = { ...step.request };
      if (request.balanceContractIdRef) {
        // See resolveLogicalContractId()'s own doc comment on why the full chain must be optional —
        // a referenced step's own createMovement call can fail without this step knowing.
        const referenced = captured[request.balanceContractIdRef];
        if (!referenced?.response?.balanceContractId) {
          throw new Error(
            `Step references "${request.balanceContractIdRef}" for its own balanceContractId, but that step never produced one (its own createMovement call did not succeed). Last known response: ${JSON.stringify(referenced?.response)}`,
          );
        }
        request.balanceContractId = referenced.response.balanceContractId;
        delete request.balanceContractIdRef;
      }
      if (request.parentLogicalContractIdRef) {
        request.parentLogicalContractId = await resolveLogicalContractId(captured, request.parentLogicalContractIdRef);
        delete request.parentLogicalContractIdRef;
      }
      // Export Case #6/#7 (2026-08-16, B3->B4 compound release shape — see types.ts's own
      // BalanceMovement.referencedTransactionId doc comment): resolves to the REAL movementId of an
      // earlier captureAs step, only known once that step's own createMovement response comes back —
      // same resolution pattern as balanceContractIdRef above, just targeting movementId instead.
      if (request.referencedTransactionIdRef) {
        const entry = captured[request.referencedTransactionIdRef];
        if (!entry) throw new Error(`Step references unknown captureAs key "${request.referencedTransactionIdRef}" — check step ordering in businessCases.js.`);
        if (!entry.response?.movementId) {
          throw new Error(
            `Step references "${request.referencedTransactionIdRef}" for its own movementId, but that step never produced one (its own createMovement call did not succeed). Last known response: ${JSON.stringify(entry.response)}`,
          );
        }
        request.referencedTransactionId = entry.response.movementId;
        delete request.referencedTransactionIdRef;
      }
      const result = await callMicroservice('POST', '/balance-movements', request);
      if (step.captureAs) captured[step.captureAs] = { response: result.body };
      trace.push({
        type: 'createMovement',
        label: step.label,
        request,
        status: result.status,
        ok: result.ok,
        expectedError: Boolean(step.expectError),
        response: result.body,
      });
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
      trace.push({ type: step.type, label: step.label, status: result.status, ok: result.ok, response: result.body });
      continue;
    }

    if (step.type === 'snapshot') {
      const balanceContractId = captured[step.contractRef]?.response?.balanceContractId;
      const result = await callMicroservice('GET', `/balance-contracts/${balanceContractId}/balance`);
      trace.push({ type: 'snapshot', label: step.label, status: result.status, ok: result.ok, response: result.body });
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

app.get('/healthz', (_req, res) => res.json({ status: 'ok', balanceServiceUrl: BALANCE_SERVICE_URL }));

// Was 4200 — collided with `ng serve`'s own default dev-server port, so
// `npm run dev:all` (backend + ng serve started together) could never bind
// both. proxy.conf.json's "/api" target must stay in sync with this.
const PORT = process.env.PORT || 4300;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`balance-component-backend (中台) listening on :${PORT} -> ${BALANCE_SERVICE_URL}`);
  });
}

// Quality-report-balance.md BAL-107: was `module.exports = app; module.exports.runCase = runCase; ...`
// (attaching test-only internals directly onto the Express app object). A plain object keeps the HTTP
// handler's own public surface (`app`) separate from the test-only seam (`runCase`/
// `resolveLogicalContractId`/`callMicroservice`, exported purely so runCase.test.js can unit-test them
// directly — see that file's own doc comment for why).
module.exports = { app, runCase, resolveLogicalContractId, callMicroservice };
