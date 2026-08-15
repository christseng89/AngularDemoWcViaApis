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
const { buildRegistry } = require('./data/businessCases');

const app = express();
app.use(cors());
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
  if (entry.logicalContractId) return entry.logicalContractId;
  const snap = await callMicroservice('GET', `/balance-contracts/${entry.response.balanceContractId}/balance`);
  if (!snap.ok) throw new Error(`Could not resolve logicalContractId for "${ref}": ${JSON.stringify(snap.body)}`);
  entry.logicalContractId = snap.body.logicalContractId;
  return entry.logicalContractId;
}

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

    if (step.type === 'release') {
      const movementId = captured[step.movementRef]?.response?.movementId;
      if (!movementId) {
        trace.push({ type: 'release', label: step.label, skipped: true, reason: `No movementId captured under "${step.movementRef}" (likely because that createMovement step returned an expected error).` });
        continue;
      }
      const result = await callMicroservice('POST', `/balance-movements/${movementId}/release`, { releasedBy: step.releasedBy });
      trace.push({ type: 'release', label: step.label, status: result.status, ok: result.ok, response: result.body });
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

app.post('/api/business-cases/:id/run', async (req, res) => {
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
    res.status(500).json({ code: 'ORCHESTRATION_ERROR', message: err instanceof Error ? err.message : String(err) });
  }
});

app.get('/healthz', (_req, res) => res.json({ status: 'ok', balanceServiceUrl: BALANCE_SERVICE_URL }));

// Was 4200 — collided with `ng serve`'s own default dev-server port, so
// `npm run dev:all` (backend + ng serve started together) could never bind
// both. proxy.conf.json's "/api" target must stay in sync with this.
const PORT = process.env.PORT || 4300;
app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`balance-component-backend (中台) listening on :${PORT} -> ${BALANCE_SERVICE_URL}`);
});
