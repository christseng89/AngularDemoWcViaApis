const request = require('supertest');
const { app } = require('../server');
const { buildRegistry } = require('../data/businessCases');

// server.js is the Node.js 中台 orchestrator (port 4300) — it never talks to a real
// microservice in this suite; global.fetch is mocked per-test. See lc-balance-wc/CLAUDE.md
// for domain background. server.js's own require.main guard means `require('../server')` here
// never binds a real port. server.js exports `{ app, runCase, resolveLogicalContractId,
// callMicroservice }` (Quality-report-balance.md BAL-107) — this suite only needs `app`.

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  };
}

/**
 * A generic mock good enough to drive ANY of the 10 registered business cases to a clean 200,
 * exercising createMovement / release / snapshot against the microservice's real URL shapes.
 * balanceContractId is deterministic per-create-call ordinal so assertions can reference it.
 */
function createGenericFetchMock() {
  let movementCounter = 0;
  return jest.fn(async (url, opts = {}) => {
    const method = opts.method || 'GET';
    if (method === 'POST' && url.endsWith('/balance-movements')) {
      movementCounter += 1;
      return jsonResponse(201, {
        movementId: `mv-${movementCounter}`,
        balanceContractId: `bc-${movementCounter}`,
        status: 'PENDING',
      });
    }
    if (method === 'POST' && /\/balance-movements\/[^/]+\/release$/.test(url)) {
      return jsonResponse(200, { status: 'RELEASED' });
    }
    if (method === 'GET' && /\/balance-contracts\/[^/]+\/balance$/.test(url)) {
      const [, contractId] = url.match(/\/balance-contracts\/([^/]+)\/balance$/);
      return jsonResponse(200, {
        balanceContractId: contractId,
        logicalContractId: `lct-${contractId}`,
        confirmedBalance: '121000',
      });
    }
    return jsonResponse(404, { code: 'NOT_FOUND', message: `unmocked ${method} ${url}` });
  });
}

describe('lc-balance-wc backend (Node.js 中台 orchestrator)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('GET /api/business-cases', () => {
    it('lists all 10 registered business cases with id/title/description/stepCount, and never calls the microservice', async () => {
      global.fetch = jest.fn();

      const res = await request(app).get('/api/business-cases');

      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(10);

      const registry = buildRegistry();
      res.body.forEach((c, i) => {
        expect(c).toEqual({
          id: registry[i].id,
          title: registry[i].title,
          description: registry[i].description,
          stepCount: registry[i].steps.length,
        });
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/business-cases/:id/run — unknown id', () => {
    it('returns 404 NOT_FOUND and never calls the microservice', async () => {
      global.fetch = jest.fn();

      const res = await request(app).post('/api/business-cases/does-not-exist/run').send({});

      expect(res.status).toBe(404);
      expect(res.body).toEqual({ code: 'NOT_FOUND', message: expect.stringContaining('does-not-exist') });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/business-cases/import-case-1/run — full success path', () => {
    it('runs createMovement/release/snapshot steps end to end, substituting balanceContractIdRef inline', async () => {
      global.fetch = createGenericFetchMock();

      const res = await request(app).post('/api/business-cases/import-case-1/run').send({});

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('import-case-1');
      expect(typeof res.body.title).toBe('string');
      expect(typeof res.body.description).toBe('string');
      expect(res.body.trace).toHaveLength(8);

      const [issue, releaseIssue, amend, releaseAmend, snap1, utilize, releaseUtilize, snap2] = res.body.trace;

      expect(issue).toMatchObject({ type: 'createMovement', status: 201, ok: true, expectedError: false });
      expect(issue.request.balanceContractIdRef).toBeUndefined();

      expect(releaseIssue).toMatchObject({ type: 'release', ok: true, status: 200 });

      expect(amend.type).toBe('createMovement');
      expect(amend.request.balanceContractId).toBe('bc-1'); // substituted from captured 'lc'
      expect(amend.request.balanceContractIdRef).toBeUndefined(); // deleted after substitution

      expect(releaseAmend).toMatchObject({ type: 'release', ok: true });
      expect(snap1).toMatchObject({ type: 'snapshot', ok: true });
      expect(snap1.response.balanceContractId).toBe('bc-1');

      expect(utilize.request.balanceContractId).toBe('bc-1');
      expect(releaseUtilize).toMatchObject({ type: 'release', ok: true });
      expect(snap2).toMatchObject({ type: 'snapshot', ok: true });

      expect(global.fetch).toHaveBeenCalledTimes(8);
    });
  });

  describe('POST /api/business-cases/import-case-2/run — parentLogicalContractIdRef resolution', () => {
    it('resolves logicalContractId via an extra GET .../balance call before creating the linked Acceptance', async () => {
      global.fetch = createGenericFetchMock();

      const res = await request(app).post('/api/business-cases/import-case-2/run').send({});

      expect(res.status).toBe(200);

      const acceptanceCreate = res.body.trace.find(
        (t) => t.type === 'createMovement' && t.label.startsWith('Create Acceptance'),
      );
      expect(acceptanceCreate).toBeDefined();
      expect(acceptanceCreate.request.parentLogicalContractId).toMatch(/^lct-bc-/);
      expect(acceptanceCreate.request.parentLogicalContractIdRef).toBeUndefined();

      const case2 = buildRegistry().find((c) => c.id === 'import-case-2');
      // +1 for the extra snapshot GET used purely to resolve logicalContractId.
      expect(global.fetch).toHaveBeenCalledTimes(case2.steps.length + 1);
    });
  });

  describe('POST /api/business-cases/import-case-3/run — note steps produce no fetch call', () => {
    it('includes note trace entries with only {type, label}, and does not call fetch for them', async () => {
      global.fetch = createGenericFetchMock();

      const res = await request(app).post('/api/business-cases/import-case-3/run').send({});

      expect(res.status).toBe(200);

      const notes = res.body.trace.filter((t) => t.type === 'note');
      expect(notes.length).toBeGreaterThan(0);
      notes.forEach((n) => {
        expect(n).toEqual({ type: 'note', label: expect.any(String) });
      });

      const case3 = buildRegistry().find((c) => c.id === 'import-case-3');
      const fetchableSteps = case3.steps.filter((s) => s.type !== 'note').length;
      // +1: the SG createMovement step also carries its own parentLogicalContractIdRef ('lc'),
      // which triggers one extra GET .../balance call to resolve logicalContractId.
      expect(global.fetch).toHaveBeenCalledTimes(fetchableSteps + 1);
    });
  });

  describe('POST /api/business-cases/import-case-1/run — release "skipped" branch', () => {
    it('marks a release step skipped (no fetch call) when the preceding createMovement returned no movementId, and keeps running the rest of the case', async () => {
      let call = 0;
      global.fetch = jest.fn(async (url, opts = {}) => {
        call += 1;
        const method = opts.method || 'GET';

        if (call === 1) {
          // Simulate a rejected LC Issue (e.g. a 409 business error) — no movementId comes back,
          // but balanceContractId is still present so downstream balanceContractIdRef substitution
          // (steps 3/6) keeps working, same as the real ORCHESTRATION flow would see.
          return jsonResponse(409, { code: 'SOME_ERROR', balanceContractId: 'bc-lc' });
        }
        if (method === 'POST' && url.endsWith('/balance-movements')) {
          return jsonResponse(201, { movementId: `mv-${call}`, balanceContractId: 'bc-lc' });
        }
        if (method === 'POST' && /\/balance-movements\/[^/]+\/release$/.test(url)) {
          return jsonResponse(200, { status: 'RELEASED' });
        }
        if (method === 'GET' && /\/balance-contracts\/[^/]+\/balance$/.test(url)) {
          return jsonResponse(200, { balanceContractId: 'bc-lc', logicalContractId: 'lct-bc-lc' });
        }
        return jsonResponse(404, {});
      });

      const res = await request(app).post('/api/business-cases/import-case-1/run').send({});

      expect(res.status).toBe(200);
      expect(res.body.trace).toHaveLength(8);

      const skippedRelease = res.body.trace.find((t) => t.type === 'release' && t.skipped);
      expect(skippedRelease).toBeDefined();
      expect(skippedRelease.reason).toMatch(/No movementId captured under "lc"/);

      // The skipped release itself made no fetch call: 8 steps - 1 skipped = 7 real invocations.
      expect(global.fetch).toHaveBeenCalledTimes(7);

      // Downstream steps still completed normally off the error response's own balanceContractId.
      const amend = res.body.trace.find((t) => t.type === 'createMovement' && t.label.startsWith('LC Amendment'));
      expect(amend.request.balanceContractId).toBe('bc-lc');
      expect(amend.ok).toBe(true);
    });
  });

  describe('POST /api/business-cases/import-case-1/run — microservice response body fails to parse as JSON', () => {
    it("falls back to a null response body via callMicroservice's res.json().catch(() => null)", async () => {
      let call = 0;
      global.fetch = jest.fn(async (url, opts = {}) => {
        call += 1;
        const method = opts.method || 'GET';

        if (call === 8) {
          // The final snapshot's response body is not valid JSON.
          return { status: 200, ok: true, json: () => Promise.reject(new Error('invalid json')) };
        }
        if (method === 'POST' && url.endsWith('/balance-movements')) {
          return jsonResponse(201, { movementId: `mv-${call}`, balanceContractId: `bc-${call}` });
        }
        if (method === 'POST' && /\/balance-movements\/[^/]+\/release$/.test(url)) {
          return jsonResponse(200, { status: 'RELEASED' });
        }
        if (method === 'GET' && /\/balance-contracts\/[^/]+\/balance$/.test(url)) {
          const [, contractId] = url.match(/\/balance-contracts\/([^/]+)\/balance$/);
          return jsonResponse(200, { balanceContractId: contractId });
        }
        return jsonResponse(404, {});
      });

      const res = await request(app).post('/api/business-cases/import-case-1/run').send({});

      expect(res.status).toBe(200);
      expect(res.body.trace).toHaveLength(8);
      expect(res.body.trace[7]).toMatchObject({ type: 'snapshot', ok: true, response: null });
    });
  });

  describe('POST /api/business-cases/import-case-2/run — resolveLogicalContractId failure path', () => {
    it('throws (-> 500 ORCHESTRATION_ERROR) when the snapshot GET used to resolve logicalContractId is not ok — the detailed message is logged server-side (BAL-117), not echoed to the client', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      global.fetch = jest.fn(async (url, opts = {}) => {
        const method = opts.method || 'GET';
        if (method === 'POST' && url.endsWith('/balance-movements')) {
          return jsonResponse(201, { movementId: 'mv-1', balanceContractId: 'bc-1' });
        }
        if (method === 'POST' && /\/balance-movements\/[^/]+\/release$/.test(url)) {
          return jsonResponse(200, { status: 'RELEASED' });
        }
        if (method === 'GET' && /\/balance-contracts\/[^/]+\/balance$/.test(url)) {
          // Simulate the microservice failing to resolve the snapshot needed for logicalContractId.
          return jsonResponse(500, { code: 'INTERNAL_ERROR' });
        }
        return jsonResponse(404, {});
      });

      const res = await request(app).post('/api/business-cases/import-case-2/run').send({});

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ code: 'ORCHESTRATION_ERROR', message: 'An internal error occurred while running this business case.' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('import-case-2'),
        expect.stringMatching(/Could not resolve logicalContractId for "lc"/),
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('POST /api/business-cases/:id/run — orchestration failure (outer try/catch -> 500)', () => {
    it('returns a generic 500 ORCHESTRATION_ERROR (BAL-117: never the thrown Error\'s own raw message) and logs the detail server-side', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      global.fetch = jest.fn(() => Promise.reject(new Error('microservice unreachable')));

      const res = await request(app).post('/api/business-cases/import-case-1/run').send({});

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ code: 'ORCHESTRATION_ERROR', message: 'An internal error occurred while running this business case.' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('import-case-1'), 'microservice unreachable');
      consoleErrorSpy.mockRestore();
    });

    it('stringifies a thrown non-Error value (err instanceof Error is false) for the server-side log, still returns the generic client message', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      global.fetch = jest.fn(() => Promise.reject('boom'));

      const res = await request(app).post('/api/business-cases/import-case-1/run').send({});

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ code: 'ORCHESTRATION_ERROR', message: 'An internal error occurred while running this business case.' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('import-case-1'), 'boom');
      consoleErrorSpy.mockRestore();
    });
  });

  describe('GET /healthz', () => {
    it('reports ok status and the configured balance service URL, without calling fetch', async () => {
      global.fetch = jest.fn();

      const res = await request(app).get('/healthz');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(typeof res.body.balanceServiceUrl).toBe('string');
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/business-cases/:id/run — rate limiting (Quality-report-balance.md BAL-118)', () => {
    it('carries standard RateLimit-* response headers, confirming the limiter is actually wired to this route', async () => {
      global.fetch = createGenericFetchMock();

      const res = await request(app).post('/api/business-cases/import-case-1/run').send({});

      expect(res.status).toBe(200);
      expect(res.headers['ratelimit-limit']).toBe('120');
      expect(res.headers).not.toHaveProperty('x-ratelimit-limit'); // legacyHeaders: false
    });
  });
});
