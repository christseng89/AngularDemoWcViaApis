const { runCase, resolveLogicalContractId, callMicroservice } = require('../server');

// Direct unit tests against the internal orchestration functions (exported for testability
// alongside the Express `app` — see server.js's own module.exports tail). These deliberately
// construct minimal synthetic step lists / captured objects rather than going through the real
// businessCases.js registry or HTTP, to close specific branch gaps that the registry-driven
// end-to-end tests in server.test.js can't reach cleanly:
//   1. resolveLogicalContractId's `if (!entry) throw ...` (unknown captureAs key)
//   2. resolveLogicalContractId's cache-hit branch (entry.logicalContractId already set)
//   3. runCase's `if (step.captureAs)` false branch (a createMovement step with no captureAs)
// ("Unknown step type" and the require.main === module guard are left deliberately uncovered —
// pre-approved, see the task write-up for this suite.)

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

      await expect(resolveLogicalContractId({}, 'missing-ref')).rejects.toThrow(
        /Step references unknown captureAs key "missing-ref"/,
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns the cached logicalContractId on a second call without calling callMicroservice/fetch again', async () => {
      global.fetch = jest.fn(async () =>
        jsonResponse(200, { balanceContractId: 'bc-1', logicalContractId: 'lct-bc-1' }),
      );

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
  });

  describe('callMicroservice (sanity — already exercised indirectly via runCase/resolveLogicalContractId above)', () => {
    it('is the same function exported from server.js', () => {
      expect(typeof callMicroservice).toBe('function');
    });
  });
});
