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

    // Reviewer-reported 2026-08-26 ("Run All Cases" 500) — a referenced step's own createMovement call
    // can fail (a business rejection, or the microservice's own rate limiter mid-burst) without this
    // step ever knowing; `entry.response` is then an error body with no `balanceContractId`. This used
    // to throw an opaque TypeError from a bare `entry.response.balanceContractId`; now throws a clear,
    // diagnosable error instead — same posture as the "unknown captureAs key" test above.
    it('throws a clear error (not an opaque TypeError) when the referenced entry has no balanceContractId', async () => {
      global.fetch = jest.fn();

      const captured = { lc: { response: { code: 'TOO_MANY_REQUESTS', message: 'rate limited' } } };

      await expect(resolveLogicalContractId(captured, 'lc')).rejects.toThrow(/Step "lc" never produced a balanceContractId/);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('throws the same clear error when the referenced entry has no response at all', async () => {
      global.fetch = jest.fn();

      const captured = { lc: {} };

      await expect(resolveLogicalContractId(captured, 'lc')).rejects.toThrow(/Step "lc" never produced a balanceContractId/);
      expect(global.fetch).not.toHaveBeenCalled();
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

    // Reviewer-reported 2026-08-26 ("Run All Cases" 500) — same class of bug as
    // resolveLogicalContractId's own new test above, but for the balanceContractIdRef resolution
    // inlined directly in the createMovement step handler.
    it('throws a clear error (not an opaque TypeError) when a balanceContractIdRef points at a step that never produced a balanceContractId', async () => {
      global.fetch = jest
        .fn()
        // First step's own createMovement "fails" (e.g. rate-limited) — no balanceContractId in the body.
        .mockImplementationOnce(async () => jsonResponse(429, { code: 'TOO_MANY_REQUESTS', message: 'rate limited' }));

      const businessCase = {
        id: 'synthetic-missing-balance-contract-id',
        steps: [
          {
            type: 'createMovement',
            label: 'LC Issue (fails)',
            captureAs: 'lc',
            expectError: true,
            request: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', amount: '1000' },
          },
          {
            type: 'createMovement',
            label: 'Amendment against the (never-issued) LC',
            request: { instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE', balanceContractIdRef: 'lc' },
          },
        ],
      };

      await expect(runCase(businessCase)).rejects.toThrow(/Step references "lc" for its own balanceContractId, but that step never produced one/);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    // Same class of bug, for the referencedTransactionIdRef resolution (Export Case #6/#7's own
    // B3->B4 compound release shape).
    it('throws a clear error (not an opaque TypeError) when a referencedTransactionIdRef points at a step that never produced a movementId', async () => {
      global.fetch = jest.fn().mockImplementationOnce(async () => jsonResponse(429, { code: 'TOO_MANY_REQUESTS', message: 'rate limited' }));

      const businessCase = {
        id: 'synthetic-missing-movement-id',
        steps: [
          {
            type: 'createMovement',
            label: 'Present Docs (fails)',
            captureAs: 'presentDocs',
            expectError: true,
            request: { instrumentType: 'EPLC_EXAMINATION', movementType: 'CREATE', amount: '1000' },
          },
          {
            type: 'createMovement',
            label: 'Honour referencing the (never-created) Present Docs',
            request: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'HONOUR', referencedTransactionIdRef: 'presentDocs' },
          },
        ],
      };

      await expect(runCase(businessCase)).rejects.toThrow(/Step references "presentDocs" for its own movementId, but that step never produced one/);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws "Unknown step type" for a step.type outside note/createMovement/release/makerSubmit/acknowledge/snapshot', async () => {
      global.fetch = jest.fn();

      const businessCase = {
        id: 'synthetic-bad-step',
        steps: [{ type: 'bogus-step-type', label: 'Not a real step' }],
      };

      await expect(runCase(businessCase)).rejects.toThrow(/Unknown step type "bogus-step-type"/);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('fails when an expectError step incorrectly succeeds', async () => {
      global.fetch = jest.fn(async () => jsonResponse(201, { movementId: 'mv-invalid', balanceContractId: 'bc-invalid' }));
      const businessCase = {
        id: 'synthetic-expected-error-succeeded',
        steps: [
          {
            type: 'createMovement',
            label: 'Over-limit transaction',
            captureAs: 'invalid',
            expectError: true,
            request: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE', amount: '1001' },
          },
        ],
      };

      await expect(runCase(businessCase)).rejects.toThrow(/expected a business rejection but succeeded/);
    });

    it('accepts an expectError step only when the API actually rejects it', async () => {
      global.fetch = jest.fn(async () => jsonResponse(409, { code: 'INSUFFICIENT_AVAILABLE_BALANCE' }));
      const businessCase = {
        id: 'synthetic-expected-error-rejected',
        steps: [
          {
            type: 'createMovement',
            label: 'Over-limit transaction',
            captureAs: 'invalid',
            expectError: true,
            request: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE', amount: '1001' },
          },
        ],
      };

      const trace = await runCase(businessCase);
      expect(trace).toHaveLength(1);
      expect(trace[0]).toMatchObject({ ok: false, expectedError: true, status: 409 });
    });

    it('fails immediately when a release-shaped action fails instead of hiding it until a later step', async () => {
      global.fetch = jest
        .fn()
        .mockImplementationOnce(async () => jsonResponse(201, { movementId: 'mv-1', balanceContractId: 'bc-1' }))
        .mockImplementationOnce(async () => jsonResponse(409, { code: 'ILLEGAL_STATE_TRANSITION', message: 'not eligible' }));
      const businessCase = {
        id: 'synthetic-action-failure',
        steps: [
          {
            type: 'createMovement',
            label: 'Document Arrival',
            captureAs: 'utilize',
            request: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE', amount: '1000' },
          },
          { type: 'acknowledge', label: 'Checker acknowledges Document Arrival', movementRef: 'utilize', acknowledgedBy: 'checker1' },
        ],
      };

      await expect(runCase(businessCase)).rejects.toThrow(
        /Step "Checker acknowledges Document Arrival" unexpectedly failed with HTTP 409.*ILLEGAL_STATE_TRANSITION/,
      );
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('automatically creates and releases A02 when an Import test step reports a negative Tight Available Balance', async () => {
      global.fetch = jest
        .fn()
        .mockImplementationOnce(async () => jsonResponse(201, { movementId: 'mv-original', balanceContractId: 'bc-1', currency: 'USD', eventSnapshot: { tightAvailableBalance: '-0.01' } }))
        .mockImplementationOnce(async (_url, opts) => {
          expect(JSON.parse(opts.body)).toMatchObject({ instrumentType: 'IPLC_LC', movementType: 'AMEND_INCREASE', amount: '0.01', sourceTransactionRef: 'A02' });
          return jsonResponse(201, { movementId: 'mv-a02', balanceContractId: 'bc-1' });
        })
        .mockImplementationOnce(async () => jsonResponse(200, { movementId: 'mv-a02', status: 'RELEASED' }))
        .mockImplementationOnce(async () => jsonResponse(200, { balanceContractId: 'bc-1', tightAvailableBalance: '0', currency: 'USD' }));
      const businessCase = {
        id: 'synthetic-negative-tight',
        steps: [
          {
            type: 'createMovement',
            label: 'Invalid successful transaction',
            captureAs: 'invalid',
            request: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE', amount: '1' },
          },
        ],
      };

      const trace = await runCase(businessCase);
      expect(trace.map((step) => step.label)).toEqual([
        'Invalid successful transaction',
        'Auto A02 — restore negative Tight LC Balance',
        'Checker releases automatic A02',
        'Balance after automatic A02',
      ]);
    });

    it('automatically creates and releases B02 when an Export snapshot reports a negative Tight Available Balance', async () => {
      global.fetch = jest
        .fn()
        .mockImplementationOnce(async () => jsonResponse(201, { movementId: 'mv-1', balanceContractId: 'bc-1' }))
        .mockImplementationOnce(async () => jsonResponse(200, { balanceContractId: 'bc-1', tightAvailableBalance: '-1', currency: 'USD' }))
        .mockImplementationOnce(async (_url, opts) => {
          expect(JSON.parse(opts.body)).toMatchObject({ instrumentType: 'EPLC_CONFIRMATION', movementType: 'AMEND', amount: '1', sourceTransactionRef: 'B02' });
          return jsonResponse(201, { movementId: 'mv-b02', balanceContractId: 'bc-1' });
        })
        .mockImplementationOnce(async () => jsonResponse(200, { movementId: 'mv-b02', status: 'RELEASED' }))
        .mockImplementationOnce(async () => jsonResponse(200, { balanceContractId: 'bc-1', tightAvailableBalance: '0', currency: 'USD' }));
      const businessCase = {
        id: 'synthetic-negative-snapshot',
        steps: [
          {
            type: 'createMovement',
            label: 'Valid create',
            captureAs: 'lc',
            request: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'ISSUE', amount: '1000' },
          },
          { type: 'snapshot', label: 'Invalid balance snapshot', contractRef: 'lc' },
        ],
      };

      const trace = await runCase(businessCase);
      expect(trace.at(-3)?.label).toBe('Auto B02 — restore negative Tight LC Balance');
      expect(trace.at(-1)?.response.tightAvailableBalance).toBe('0');
    });

    it.each([
      ['create', [jsonResponse(201, { movementId: 'mv-original', balanceContractId: 'bc-1', currency: 'USD', tightAvailableBalance: '-1' }), jsonResponse(409, { code: 'REJECTED' })], /Automatic A02 failed/],
      ['release', [jsonResponse(201, { movementId: 'mv-original', balanceContractId: 'bc-1', currency: 'USD', tightAvailableBalance: '-1' }), jsonResponse(201, { movementId: 'mv-a02' }), jsonResponse(409, { code: 'REJECTED' })], /Automatic A02 release failed/],
      ['verification', [jsonResponse(201, { movementId: 'mv-original', balanceContractId: 'bc-1', currency: 'USD', tightAvailableBalance: '-1' }), jsonResponse(201, { movementId: 'mv-a02' }), jsonResponse(200, { status: 'RELEASED' }), jsonResponse(500, { code: 'INTERNAL_ERROR' })], /Automatic A02 verification failed/],
      ['still negative', [jsonResponse(201, { movementId: 'mv-original', balanceContractId: 'bc-1', currency: 'USD', tightAvailableBalance: '-1' }), jsonResponse(201, { movementId: 'mv-a02' }), jsonResponse(200, { status: 'RELEASED' }), jsonResponse(200, { tightAvailableBalance: '-0.01' })], /invalid negative Tight Available Balance/],
    ])('reports an automatic A02 %s failure', async (_stage, responses, expected) => {
      global.fetch = jest.fn();
      responses.forEach((response) => global.fetch.mockResolvedValueOnce(response));
      const businessCase = {
        id: 'synthetic-auto-a02-failure',
        steps: [{ type: 'createMovement', label: 'Negative Import result', request: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE', amount: '1' } }],
      };
      await expect(runCase(businessCase)).rejects.toThrow(expected);
    });

    it('rejects a negative Tight result for an instrument without an A02/B02 repair rule', async () => {
      global.fetch = jest.fn(async () => jsonResponse(201, { movementId: 'mv-sg', balanceContractId: 'sg-1', tightAvailableBalance: '-1' }));
      const businessCase = {
        id: 'synthetic-unsupported-auto-amend',
        steps: [{ type: 'createMovement', label: 'Negative SG result', request: { instrumentType: 'SHGT', movementType: 'ISSUE', amount: '1' } }],
      };
      await expect(runCase(businessCase)).rejects.toThrow(/invalid negative Tight Available Balance/);
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

    // RESTORED 2026-08-28 — see RELEASE_SHAPED_STEP_TYPES's own doc comment in server.js: this dispatch
    // table entry existed once (BAL-131) but was dropped 2026-08-18 when B3 stopped needing it, then the
    // /acknowledge endpoint itself came back 2026-08-20 for A3/A3S without this table being updated to
    // match — a real, live-reproduced gap (Import Case 7/8 silently 409'd on every A6 release step once
    // v1.29.0's own Maker-Submit gate widened to Usance) closed by re-adding it. Same shape/coverage
    // pattern as the makerSubmit tests immediately above.
    it('acknowledge step: POSTs to .../acknowledge with acknowledgedBy, distinct from release/makerSubmit', async () => {
      const businessCase = {
        id: 'synthetic-acknowledge',
        steps: [
          {
            type: 'createMovement',
            label: 'Document Arrival',
            captureAs: 'utilize',
            request: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE', amount: '1000' },
          },
          { type: 'acknowledge', label: 'Checker acknowledges Document Arrival (A3)', movementRef: 'utilize', acknowledgedBy: 'checker1' },
        ],
      };
      global.fetch = jest
        .fn()
        .mockImplementationOnce(async () => jsonResponse(201, { movementId: 'mv-1', balanceContractId: 'bc-1' }))
        .mockImplementationOnce(async (url, opts) => {
          expect(url).toMatch(/\/balance-movements\/mv-1\/acknowledge$/);
          expect(JSON.parse(opts.body)).toEqual({ acknowledgedBy: 'checker1' });
          return jsonResponse(200, { status: 'PENDING', acknowledgedBy: 'checker1' });
        });

      const trace = await runCase(businessCase);

      expect(trace).toHaveLength(2);
      expect(trace[1]).toMatchObject({ type: 'acknowledge', label: 'Checker acknowledges Document Arrival (A3)', ok: true, status: 200 });
      expect(trace[1].response).toEqual({ status: 'PENDING', acknowledgedBy: 'checker1' });
    });

    it('acknowledge step: marks itself skipped (no fetch call) when the referenced createMovement returned no movementId', async () => {
      global.fetch = jest.fn();

      const businessCase = {
        id: 'synthetic-acknowledge-skipped',
        steps: [{ type: 'acknowledge', label: 'Checker acknowledges Document Arrival (A3)', movementRef: 'never-captured', acknowledgedBy: 'checker1' }],
      };

      const trace = await runCase(businessCase);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(trace).toHaveLength(1);
      expect(trace[0]).toEqual({
        type: 'acknowledge',
        label: 'Checker acknowledges Document Arrival (A3)',
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
