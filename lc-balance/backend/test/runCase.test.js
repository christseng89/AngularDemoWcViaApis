const { runCase, resolveLogicalContractId, callMicroservice } = require('../server');

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
});
