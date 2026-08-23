const { runCase, resolveLogicalContractId, callMicroservice, isRetryableCall } = require('../server');

// Direct unit tests against the internal orchestration functions (exported alongside the Express
// `app` as `module.exports = { app, runCase, resolveLogicalContractId, callMicroservice }` —
// Quality-report-balance.md BAL-107 — for exactly this kind of direct testability). These deliberately
// construct minimal synthetic step lists / captured objects rather than going through the real
// businessCases.js registry or HTTP, to close specific branch gaps that the registry-driven
// end-to-end tests in server.test.js can't reach cleanly:
//   1. resolveLogicalContractId's `if (!entry) throw ...` (unknown captureAs key)
//   2. resolveLogicalContractId's cache-hit branch (entry.logicalContractId already set)
//   3. runCase's `if (step.captureAs)` false branch (a createMovement step with no captureAs)
//   4. runCase's `throw new Error('Unknown step type ...')` (a step.type outside note/
//      createMovement/release/makerSubmit/snapshot — never happens via the real businessCases.js
//      registry, whose own step types are exhaustively covered by businessCases.test.js, but is
//      directly reachable via the exported runCase() with a synthetic step, same technique as #1-#3
//      above)
//   5. runCase's makerSubmit step (2026-08-16, Import Case #6's own A4 real-Maker-Submit) — both its
//      happy path and its "skipped" branch (no movementId captured under movementRef), mirroring the
//      existing release-skipped coverage in server.test.js but isolated here as a direct unit test
// (the require.main === module guard remains deliberately uncovered — structurally only true when
// server.js is run directly, never when required by a test; see server.js's own top-level comment.)

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  };
}

describe('server.js internals — direct unit tests (not via HTTP/businessCases.js registry)', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  describe('resolveLogicalContractId', () => {
    it('throws when captured has no entry under the requested ref key', async () => {
      global.fetch = jest.fn();

      await expect(resolveLogicalContractId({}, 'missing-ref')).rejects.toThrow(/Step references unknown captureAs key "missing-ref"/);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns the cached logicalContractId on a second call without calling callMicroservice/fetch again', async () => {
      global.fetch = jest.fn(async () => jsonResponse(200, { balanceContractId: 'bc-1', logicalContractId: 'lct-bc-1' }));

      const captured = { lc: { response: { balanceContractId: 'bc-1' } } };

      const first = await resolveLogicalContractId(captured, 'lc');
      expect(first).toBe('lct-bc-1');
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const second = await resolveLogicalContractId(captured, 'lc');
      expect(second).toBe('lct-bc-1');
      // Cache-hit branch: no additional fetch call was made the second time.
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('runCase', () => {
    it('runs a createMovement step with no captureAs without crashing and captures nothing', async () => {
      global.fetch = jest.fn(async () => jsonResponse(201, { movementId: 'mv-1', balanceContractId: 'bc-1' }));

      const businessCase = {
        id: 'synthetic-case',
        steps: [
          {
            type: 'createMovement',
            label: 'Create without captureAs',
            request: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', amount: '1000' },
            // no captureAs
          },
        ],
      };

      const trace = await runCase(businessCase);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(trace).toHaveLength(1);
      expect(trace[0]).toMatchObject({ type: 'createMovement', ok: true, status: 201 });

      // Nothing downstream depends on a captured key here; confirm the step just ran cleanly
      // with no thrown error and no captured-side effect to assert against (captureAs was falsy).
      expect(trace[0].response).toEqual({ movementId: 'mv-1', balanceContractId: 'bc-1' });
    });

    it('throws "Unknown step type" for a step.type outside note/createMovement/release/makerSubmit/snapshot', async () => {
      global.fetch = jest.fn();

      const businessCase = {
        id: 'synthetic-bad-step',
        steps: [{ type: 'bogus-step-type', label: 'Not a real step' }],
      };

      await expect(runCase(businessCase)).rejects.toThrow(/Unknown step type "bogus-step-type"/);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('makerSubmit step: POSTs to .../maker-submit with makerSubmittedBy, distinct from release', async () => {
      const businessCase = {
        id: 'synthetic-maker-submit',
        steps: [
          {
            type: 'createMovement',
            label: 'Document Arrival',
            captureAs: 'utilize',
            request: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE', amount: '1000' },
          },
          { type: 'makerSubmit', label: 'A4 real Maker Submit', movementRef: 'utilize', makerSubmittedBy: 'maker1' },
        ],
      };
      global.fetch = jest
        .fn()
        .mockImplementationOnce(async () => jsonResponse(201, { movementId: 'mv-1', balanceContractId: 'bc-1' }))
        .mockImplementationOnce(async (url, opts) => {
          expect(url).toMatch(/\/balance-movements\/mv-1\/maker-submit$/);
          expect(JSON.parse(opts.body)).toEqual({ makerSubmittedBy: 'maker1' });
          return jsonResponse(200, { status: 'PENDING', makerSubmittedBy: 'maker1' });
        });

      const trace = await runCase(businessCase);

      expect(trace).toHaveLength(2);
      expect(trace[1]).toMatchObject({ type: 'makerSubmit', label: 'A4 real Maker Submit', ok: true, status: 200 });
      expect(trace[1].response).toEqual({ status: 'PENDING', makerSubmittedBy: 'maker1' });
    });

    it('makerSubmit step: marks itself skipped (no fetch call) when the referenced createMovement returned no movementId', async () => {
      global.fetch = jest.fn();

      const businessCase = {
        id: 'synthetic-maker-submit-skipped',
        steps: [{ type: 'makerSubmit', label: 'A4 real Maker Submit', movementRef: 'never-captured', makerSubmittedBy: 'maker1' }],
      };

      const trace = await runCase(businessCase);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(trace).toHaveLength(1);
      expect(trace[0]).toEqual({
        type: 'makerSubmit',
        label: 'A4 real Maker Submit',
        skipped: true,
        reason: expect.stringContaining('No movementId captured under "never-captured"'),
      });
    });
  });

  describe('callMicroservice (sanity — already exercised indirectly via runCase/resolveLogicalContractId above)', () => {
    it('is the same function exported from server.js', () => {
      expect(typeof callMicroservice).toBe('function');
    });
  });

  describe('callMicroservice — non-JSON response body (2026-08-23, diagnosed via manual "Run All 10 Cases" load testing)', () => {
    it('throws a clear, status-naming error for a non-2xx response with a non-JSON body (e.g. express-rate-limit\'s default 429 text/html handler)', async () => {
      global.fetch = jest.fn(async () => ({
        status: 429,
        statusText: 'Too Many Requests',
        ok: false,
        json: () => Promise.reject(new SyntaxError('Unexpected token T in JSON at position 0')),
      }));

      await expect(callMicroservice('POST', '/balance-movements', { instrumentType: 'IPLC_LC' })).rejects.toThrow(
        /Non-JSON response from microservice \(POST \/balance-movements -> 429 Too Many Requests\)/,
      );
    });

    it('a non-2xx/non-JSON failure from an early step surfaces immediately as a thrown error from runCase(), never as a captured null response a later step could crash on dereferencing', async () => {
      const businessCase = {
        id: 'synthetic-rate-limited',
        steps: [
          {
            type: 'createMovement',
            label: 'LC Issue (rate-limited)',
            captureAs: 'lc',
            request: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', amount: '1000' },
          },
          {
            type: 'createMovement',
            label: 'SG Issue under the (rate-limited) parent',
            request: { instrumentType: 'SHGT', movementType: 'ISSUE', amount: '100', parentLogicalContractIdRef: 'lc' },
          },
        ],
      };
      global.fetch = jest.fn(async () => ({
        status: 429,
        statusText: 'Too Many Requests',
        ok: false,
        json: () => Promise.reject(new SyntaxError('Unexpected token T in JSON at position 0')),
      }));

      // Before the fix, this used to reject with the unhelpful "Cannot read properties of null
      // (reading 'balanceContractId')" thrown deep inside resolveLogicalContractId() on the SECOND
      // step, once it tried to dereference the first step's own silently-nulled response. Now it fails
      // fast, on the FIRST step, with a message that actually names the real cause.
      await expect(runCase(businessCase)).rejects.toThrow(/Non-JSON response from microservice \(POST \/balance-movements -> 429/);
    });

    it('a genuinely OK (2xx) response with an unparseable body still falls back to a null body, not a throw — unchanged, existing leniency', async () => {
      global.fetch = jest.fn(async () => ({
        status: 200,
        statusText: 'OK',
        ok: true,
        json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
      }));

      const result = await callMicroservice('GET', '/balance-contracts/bc-1/balance');
      expect(result).toEqual({ status: 200, ok: true, body: null });
    });
  });

  describe('callMicroservice/isRetryableCall — bounded retry on transient connection failures, idempotent calls only (2026-08-23, load-testing follow-up)', () => {
    function connectionError(code) {
      const err = new TypeError('fetch failed');
      err.cause = { code };
      return err;
    }

    it('isRetryableCall: GET is always retryable (read-only)', () => {
      expect(isRetryableCall('GET', '/balance-contracts/bc-1/balance')).toBe(true);
    });

    it("isRetryableCall: POST /balance-movements (createMovement) is retryable — idempotent via its own (balanceContractId, eventSeq) key", () => {
      expect(isRetryableCall('POST', '/balance-movements')).toBe(true);
    });

    it('isRetryableCall: POST .../release is NOT retryable — its status-transition guard fails loudly on a repeat call, not idempotent', () => {
      expect(isRetryableCall('POST', '/balance-movements/mv-1/release')).toBe(false);
    });

    it('isRetryableCall: POST .../maker-submit / .../reject / .../cancel / .../acknowledge are likewise NOT retryable', () => {
      expect(isRetryableCall('POST', '/balance-movements/mv-1/maker-submit')).toBe(false);
      expect(isRetryableCall('POST', '/balance-movements/mv-1/reject')).toBe(false);
      expect(isRetryableCall('POST', '/balance-movements/mv-1/cancel')).toBe(false);
      expect(isRetryableCall('POST', '/balance-movements/mv-1/acknowledge')).toBe(false);
    });

    it('retries a transient ECONNRESET on a retryable call and succeeds on the second attempt (100ms backoff)', async () => {
      let calls = 0;
      global.fetch = jest.fn(async () => {
        calls += 1;
        if (calls === 1) throw connectionError('ECONNRESET');
        return jsonResponse(201, { movementId: 'mv-1', balanceContractId: 'bc-1' });
      });

      const result = await callMicroservice('POST', '/balance-movements', { instrumentType: 'IPLC_LC' });

      expect(calls).toBe(2);
      expect(result).toEqual({ status: 201, ok: true, body: { movementId: 'mv-1', balanceContractId: 'bc-1' } });
    });

    it('exhausts both retries (3 attempts total: 1 original + 2 retries) then throws the final connection error', async () => {
      global.fetch = jest.fn(async () => {
        throw connectionError('ECONNREFUSED');
      });

      await expect(callMicroservice('GET', '/balance-contracts/bc-1/balance')).rejects.toThrow('fetch failed');
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('never retries a non-retryable call (release) even on a transient connection error — a lost response after a real success must never be silently resubmitted', async () => {
      global.fetch = jest.fn(async () => {
        throw connectionError('ECONNRESET');
      });

      await expect(callMicroservice('POST', '/balance-movements/mv-1/release', { releasedBy: 'checker1' })).rejects.toThrow('fetch failed');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('never retries a non-retryable error code (e.g. a plain Error with no matching cause.code) even on an otherwise-retryable call', async () => {
      global.fetch = jest.fn(async () => {
        throw new Error('some unrelated failure');
      });

      await expect(callMicroservice('POST', '/balance-movements', {})).rejects.toThrow('some unrelated failure');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
