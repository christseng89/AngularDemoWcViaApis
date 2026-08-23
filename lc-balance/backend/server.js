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

// 2026-08-23, follow-up to the load-testing investigation above — transient connection-level failures
// (fetch() itself throwing before any Response ever comes back: ECONNRESET/ECONNREFUSED/ETIMEDOUT/EPIPE/
// undici's own UND_ERR_CONNECT_TIMEOUT/UND_ERR_SOCKET) are retried a bounded number of times with a short
// backoff. Deliberately NOT applied to a received-but-rejected HTTP response (a 429/409/500 etc. is not a
// connection failure — retrying INTO an active rate limit would make it worse, not better; that case is
// handled entirely by the JSON-parse-failure branch below instead, which throws immediately, no retry).
const RETRYABLE_ERROR_CODES = new Set(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET']);
const RETRY_DELAYS_MS = [100, 200]; // 2 retries (3 attempts total) — first retry after 100ms, second after 200ms.

/**
 * Whether a transient connection failure on this call is safe to retry — i.e. whether the call itself is
 * idempotent. GET is always safe (read-only). The ONE mutating call that's also safe is
 * `POST /balance-movements` (createMovement): Design doc §8's own (balanceContractId, eventSeq) key is
 * enforced server-side via a UNIQUE constraint, so a resubmission after a lost response returns the
 * EXISTING record (200), never a duplicate — see routes/balanceMovements.ts's own `result.created ? 201 :
 * 200` branch. Every OTHER mutating call this orchestrator makes (release/reject/cancel/maker-submit/
 * acknowledge, all POST .../{movementId}/...) acts on an EXISTING movement through a status-transition
 * guard that explicitly fails loudly on a repeat call (statusTransition.ts's own "never a silent no-op
 * success on an illegal transition" design, e.g. RELEASE on an already-RELEASED movement) — retrying one
 * of those after the ORIGINAL call actually succeeded server-side but its response was lost in transit
 * would turn a real success into a spurious 409 the caller has no way to tell apart from a genuine
 * illegal-transition rejection. None of those are idempotent by this service's own design, so none of
 * them are retried here.
 */
function isRetryableCall(method, path) {
  if (method === 'GET') return true;
  return method === 'POST' && path === '/balance-movements';
}

async function fetchWithRetry(method, path, init) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fetch(`${BALANCE_SERVICE_URL}${path}`, init);
    } catch (err) {
      const code = err.cause?.code ?? err.code;
      if (!isRetryableCall(method, path) || !RETRYABLE_ERROR_CODES.has(code) || attempt >= RETRY_DELAYS_MS.length) {
        throw err;
      }
      const delayMs = RETRY_DELAYS_MS[attempt];
      console.warn(`[callMicroservice] ${method} ${path} failed (${code}); retry ${attempt + 1}/${RETRY_DELAYS_MS.length} in ${delayMs}ms.`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function callMicroservice(method, path, body) {
  const res = await fetchWithRetry(method, path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch((err) => {
    // 2026-08-23, diagnosed via manual "Run All 10 Cases" load testing — a non-2xx response whose body
    // isn't JSON never came from this microservice's own API (every one of its own routes, success or
    // ApiError, always answers with a JSON body — see errors.ts's own toBody()); it came from something
    // IN FRONT of the API instead, e.g. its express-rate-limit default 429 handler, which answers
    // "Too many requests, please try again later." as text/html, not JSON. Silently falling back to
    // `body: null` here used to let some LATER step crash several calls downstream with a useless
    // "Cannot read properties of null (reading 'balanceContractId')" once it dereferenced this response
    // (see resolveLogicalContractId()'s own doc comment) — reproduced by running enough business cases
    // back-to-back to exceed the microservice's 120-req/60s limit on /balance-movements. Throwing here
    // immediately, naming the real status, turns that into an error that actually says what happened.
    // A genuinely OK (2xx) response with an unparseable body is left as the existing lenient `null`
    // fallback below — rare, and (so far) only ever hit by a trailing `snapshot` step whose own result
    // is never dereferenced by anything downstream, so failing the whole run over it would be overkill.
    if (!res.ok) {
      throw new Error(`Non-JSON response from microservice (${method} ${path} -> ${res.status} ${res.statusText}): ${err.message}`);
    }
    return null;
  });
  return { status: res.status, ok: res.ok, body: json };
}

/** Resolves a captured entry's balance-contract logicalContractId via a snapshot call, caching it on first use. */
async function resolveLogicalContractId(captured, ref) {
  const entry = captured[ref];
  if (!entry) throw new Error(`Step references unknown captureAs key "${ref}" — check step ordering in businessCases.js.`);
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
        request.balanceContractId = captured[request.balanceContractIdRef]?.response.balanceContractId;
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
    const detail = err instanceof Error ? `${err.message}${err.cause ? ` (cause: ${err.cause})` : ''}` : String(err);
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
module.exports = { app, runCase, resolveLogicalContractId, callMicroservice, isRetryableCall };
