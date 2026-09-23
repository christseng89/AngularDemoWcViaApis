const { runCase, runAutoFormalIncrease, resolveLogicalContractId, callMicroservice } = require('../server');

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
    it('validates B4 authorization and exact Covered + EXPORT_EXCESS_ASSET = Legal reconciliation', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse(201, { movementId: 'mv-b4', balanceContractId: 'bc-1' }))
        .mockResolvedValueOnce(jsonResponse(200, {
          movement: { movementId: 'mv-b4', status: 'RELEASED' },
          authorization: { claimStatus: 'SUBMITTED', authorizationValidationResult: 'CONFIRMED' },
          assets: [
            { balanceType: 'Due from Issuing Bank', amountOwner: '10000', debtor: 'ISSUING_BANK' },
            { balanceType: 'EXPORT_EXCESS_ASSET', amountOwner: '200', debtor: 'ISSUING_BANK' },
          ],
        }));
      await expect(runCase({ id: 'b4-assets', steps: [
        { type: 'createMovement', label: 'B4', captureAs: 'b4', request: { instrumentType: 'EPLC_CONFIRMATION', movementType: 'HONOUR' } },
        { type: 'release', label: 'release B4', movementRef: 'b4', releasedBy: 'checker1', request: { exportAuthorization: { claimStatus: 'SUBMITTED', authorizationValidationResult: 'CONFIRMED' } }, expectExportAssets: { claimStatus: 'SUBMITTED', authorizationValidationResult: 'CONFIRMED', coveredBalanceType: 'Due from Issuing Bank', covered: '10000', excess: '200', legal: '10200', excessDebtor: 'ISSUING_BANK' } },
      ] })).resolves.toHaveLength(2);
      expect(JSON.parse(global.fetch.mock.calls[1][1].body).exportAuthorization).toEqual({ claimStatus: 'SUBMITTED', authorizationValidationResult: 'CONFIRMED' });
    });

    it('rejects a B4 receipt whose assets do not reconcile to Legal', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse(201, { movementId: 'mv-b4', balanceContractId: 'bc-1' }))
        .mockResolvedValueOnce(jsonResponse(200, { movement: {}, authorization: { claimStatus: 'ABSENT', authorizationValidationResult: 'NOT_CONFIRMED' }, assets: [
          { balanceType: 'Reimbursement Receivable', amountOwner: '10000', debtor: 'ISSUING_BANK' },
          { balanceType: 'EXPORT_EXCESS_ASSET', amountOwner: '199', debtor: 'BENEFICIARY_OR_RECOURSE_PARTY' },
        ] }));
      await expect(runCase({ id: 'bad-b4-assets', steps: [
        { type: 'createMovement', label: 'B4', captureAs: 'b4', request: {} },
        { type: 'release', label: 'release B4', movementRef: 'b4', releasedBy: 'checker1', expectExportAssets: { claimStatus: 'ABSENT', authorizationValidationResult: 'NOT_CONFIRMED', coveredBalanceType: 'Reimbursement Receivable', covered: '10000', excess: '200', legal: '10200', excessDebtor: 'BENEFICIARY_OR_RECOURSE_PARTY' } },
      ] })).rejects.toThrow(/unexpected export asset allocation|reconciliation/);
    });

    it('rejects a B4 receipt missing authorization/assets or returning a different authorization result', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce(jsonResponse(201, { movementId: 'mv-1', balanceContractId: 'bc-1' }))
        .mockResolvedValueOnce(jsonResponse(200, { movement: {} }));
      const steps = [
        { type: 'createMovement', label: 'B4', captureAs: 'b4', request: {} },
        { type: 'release', label: 'release B4', movementRef: 'b4', releasedBy: 'checker1', expectExportAssets: { claimStatus: 'ABSENT', authorizationValidationResult: 'NOT_CONFIRMED', coveredBalanceType: 'Due from Issuing Bank', covered: '10000', excess: '200', legal: '10200', excessDebtor: 'BENEFICIARY_OR_RECOURSE_PARTY' } },
      ];
      await expect(runCase({ id: 'missing-receipt', steps })).rejects.toThrow(/did not return authorization/);

      global.fetch = jest.fn()
        .mockResolvedValueOnce(jsonResponse(201, { movementId: 'mv-1', balanceContractId: 'bc-1' }))
        .mockResolvedValueOnce(jsonResponse(200, { movement: {}, authorization: { claimStatus: 'SUBMITTED', authorizationValidationResult: 'CONFIRMED' }, assets: [
          { balanceType: 'Due from Issuing Bank', amountOwner: '10000', debtor: 'ISSUING_BANK' },
          { balanceType: 'EXPORT_EXCESS_ASSET', amountOwner: '200', debtor: 'BENEFICIARY_OR_RECOURSE_PARTY' },
        ] }));
      await expect(runCase({ id: 'wrong-decision', steps })).rejects.toThrow(/unexpected export authorization decision/);
    });

    it('uses exact decimal reconciliation and rejects a mismatched Legal total', async () => {
      global.fetch = jest.fn()
        .mockResolvedValueOnce(jsonResponse(201, { movementId: 'mv-1', balanceContractId: 'bc-1' }))
        .mockResolvedValueOnce(jsonResponse(200, { movement: {}, authorization: { claimStatus: 'ABSENT', authorizationValidationResult: 'NOT_CONFIRMED' }, assets: [
          { balanceType: 'Due from Issuing Bank', amountOwner: '10000.50', debtor: 'ISSUING_BANK' },
          { balanceType: 'EXPORT_EXCESS_ASSET', amountOwner: '199.50', debtor: 'BENEFICIARY_OR_RECOURSE_PARTY' },
        ] }));
      await expect(runCase({ id: 'bad-legal', steps: [
        { type: 'createMovement', label: 'B4', captureAs: 'b4', request: {} },
        { type: 'release', label: 'release B4', movementRef: 'b4', releasedBy: 'checker1', expectExportAssets: { claimStatus: 'ABSENT', authorizationValidationResult: 'NOT_CONFIRMED', coveredBalanceType: 'Due from Issuing Bank', covered: '10000.50', excess: '199.50', legal: '10201', excessDebtor: 'BENEFICIARY_OR_RECOURSE_PARTY' } },
      ] })).rejects.toThrow(/failed Covered \+ Excess = Legal reconciliation/);
    });

    it('releases A4 through the common ABSENT Checker Approve path without waiver metadata', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse(201, { movementId: 'mv-a4', balanceContractId: 'bc-lc' }))
        .mockResolvedValueOnce(jsonResponse(200, { movementId: 'mv-a4', status: 'RELEASED' }));

      const trace = await runCase({
        id: 'absent-checker-approve-contract',
        steps: [
          { type: 'createMovement', label: 'arrival', captureAs: 'arrival', request: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' } },
          {
            type: 'release', label: 'common Checker Approve', movementRef: 'arrival', releasedBy: 'checker1',
          },
        ],
      });

      expect(trace[1]).toMatchObject({ ok: true, response: { movementId: 'mv-a4', status: 'RELEASED' } });
      expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ releasedBy: 'checker1' });
    });

    it('fails when an expected rejection returns a different business code', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse(201, { movementId: 'mv-a3', balanceContractId: 'bc-lc' }))
        .mockResolvedValueOnce(jsonResponse(409, { code: 'FX_RATE_STALE' }));

      await expect(runCase({
        id: 'exact-error-contract',
        steps: [
          { type: 'createMovement', label: 'arrival', captureAs: 'arrival', request: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE' } },
          {
            type: 'release', label: 'waiver required', movementRef: 'arrival', releasedBy: 'checker1',
            expectError: true, expectedStatus: 409, expectedErrorCode: 'APPLICANT_WAIVER_REQUIRED',
          },
        ],
      })).rejects.toThrow(/expected error APPLICANT_WAIVER_REQUIRED/);
    });
    it('hydrates a compact Maker Excess response so a later runner step can reference its contract', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce(jsonResponse(201, { movementId: 'mv-sg', workflowStatus: 'PENDING', excessAmountOwner: '200' }))
        .mockResolvedValueOnce(jsonResponse(200, { balanceContractId: 'bc-sg', logicalContractId: 'logical-sg' }))
        .mockResolvedValueOnce(jsonResponse(201, { movementId: 'mv-redeem', balanceContractId: 'bc-sg' }));

      const trace = await runCase({
        id: 'compact-excess-response',
        steps: [
          {
            type: 'createMovement', label: 'A8 Excess', captureAs: 'sg',
            request: { instrumentType: 'SHGT', naturalKey: { lcNumber: 'LC1', sgNumber: 'G01' }, movementType: 'ISSUE', amount: '10200' },
          },
          {
            type: 'createMovement', label: 'A9 Redeem', captureAs: 'redeem',
            request: { instrumentType: 'SHGT', balanceContractIdRef: 'sg', movementType: 'FULL_REDEEM', amount: '10200' },
          },
        ],
      });

      expect(JSON.parse(global.fetch.mock.calls[2][1].body)).toMatchObject({ balanceContractId: 'bc-sg' });
      expect(trace[0].response).toMatchObject({ movementId: 'mv-sg', balanceContractId: 'bc-sg', excessAmountOwner: '200' });
    });

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

    it('never auto-creates A2/B2 merely from a negative Tight snapshot', async () => {
      global.fetch = jest.fn(async () => jsonResponse(201, { movementId: 'mv-1', balanceContractId: 'bc-1', tightAvailableBalance: '-1' }));
      const businessCase = {
        id: 'synthetic-no-auto-amend',
        steps: [{ type: 'createMovement', label: 'Approved Excess result', request: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE', amount: '1' } }],
      };
      const trace = await runCase(businessCase);
      expect(trace).toHaveLength(1);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('Business Case Runner only: auto-creates and releases A02 after EXCESS_LIMIT_EXCEEDED, then retries the original A3', async () => {
      global.fetch = jest
        .fn()
        .mockImplementationOnce(async () => jsonResponse(201, { movementId: 'a1-movement', balanceContractId: 'lc-contract' }))
        .mockImplementationOnce(async () => jsonResponse(200, { status: 'APPROVED' }))
        .mockImplementationOnce(async () =>
          jsonResponse(409, {
            code: 'EXCESS_LIMIT_EXCEEDED',
            guidance: { outcome: 'FINITE', minimumRequiredIncreaseOwner: '2000' },
          }),
        )
        .mockImplementationOnce(async (_url, options) => {
          expect(JSON.parse(options.body)).toMatchObject({
            instrumentType: 'IPLC_LC',
            balanceContractId: 'lc-contract',
            movementType: 'AMEND_INCREASE',
            amount: '2000',
            eventSeq: 3,
          });
          return jsonResponse(201, { movementId: 'a02-movement', balanceContractId: 'lc-contract' });
        })
        .mockImplementationOnce(async (url) => {
          expect(url).toMatch(/\/balance-movements\/a02-movement\/release$/);
          return jsonResponse(200, { status: 'APPROVED' });
        })
        .mockImplementationOnce(async (_url, options) => {
          expect(JSON.parse(options.body)).toMatchObject({ movementType: 'UTILIZE', amount: '12000', eventSeq: 4 });
          return jsonResponse(201, { movementId: 'a3-retry', balanceContractId: 'lc-contract' });
        });

      const trace = await runCase({
        id: 'synthetic-runner-auto-a02',
        steps: [
          {
            type: 'createMovement',
            functionCode: 'A1',
            label: 'A1 Issue',
            captureAs: 'lc',
            request: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', eventSeq: 1, amount: '10000', currency: 'USD' },
          },
          { type: 'release', label: 'Release A1', movementRef: 'lc', releasedBy: 'checker1' },
          {
            type: 'createMovement',
            functionCode: 'A3',
            label: 'A3 over allowance',
            captureAs: 'arrival',
            expectError: true,
            autoFormalIncrease: { functionCode: 'A2', contractRef: 'lc' },
            request: {
              instrumentType: 'IPLC_LC',
              balanceContractIdRef: 'lc',
              movementType: 'UTILIZE',
              eventSeq: 2,
              amount: '12000',
              currency: 'USD',
              sourceTransactionRef: 'B01',
              createdBy: 'maker1',
            },
          },
        ],
      });

      expect(global.fetch).toHaveBeenCalledTimes(6);
      expect(trace.map((entry) => entry.type)).toEqual([
        'createMovement',
        'release',
        'createMovement',
        'autoFormalIncrease',
        'autoFormalIncreaseRelease',
        'autoRetry',
      ]);
      expect(trace.at(-1)).toMatchObject({ ok: true, response: { movementId: 'a3-retry' } });
    });

    it('fails the auto-remediation case without creating a Formal Increase for a different rejection code', async () => {
      global.fetch = jest.fn(async () => jsonResponse(409, { code: 'INSUFFICIENT_AVAILABLE_BALANCE' }));

      await expect(runCase({
        id: 'synthetic-runner-no-auto-for-other-error',
        steps: [{
          type: 'createMovement',
          label: 'legacy rejection',
          expectError: true,
          autoFormalIncrease: { functionCode: 'A2', contractRef: 'lc' },
          request: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE', amount: '12000' },
        }],
      })).rejects.toThrow(/expected HTTP 409 EXCESS_LIMIT_EXCEEDED/);

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('fails the auto-remediation case without creating when EXCESS_LIMIT_EXCEEDED uses a non-409 HTTP status', async () => {
      global.fetch = jest.fn(async () => jsonResponse(500, { code: 'EXCESS_LIMIT_EXCEEDED' }));

      await expect(runCase({
        id: 'synthetic-runner-no-auto-for-non-409',
        steps: [{
          type: 'createMovement',
          label: 'invalid transport contract',
          expectError: true,
          autoFormalIncrease: { functionCode: 'A2', contractRef: 'lc' },
          request: { instrumentType: 'IPLC_LC', movementType: 'UTILIZE', amount: '12000' },
        }],
      })).rejects.toThrow(/expected HTTP 409 EXCESS_LIMIT_EXCEEDED/);

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('Business Case Runner only: auto-creates A02 and retries the complete A3S compound command', async () => {
      global.fetch = jest
        .fn()
        .mockImplementationOnce(async () => jsonResponse(201, { movementId: 'a1', balanceContractId: 'lc-contract' }))
        .mockImplementationOnce(async () => jsonResponse(201, { movementId: 'a8', balanceContractId: 'sg-contract' }))
        .mockImplementationOnce(async () => jsonResponse(409, {
          code: 'EXCESS_LIMIT_EXCEEDED',
          guidance: { outcome: 'FINITE', minimumRequiredIncreaseOwner: '5000' },
        }))
        .mockImplementationOnce(async () => jsonResponse(201, { movementId: 'a02', balanceContractId: 'lc-contract' }))
        .mockImplementationOnce(async () => jsonResponse(200, { status: 'APPROVED' }))
        .mockImplementationOnce(async (url, options) => {
          expect(url).toMatch(/\/balance-movements\/compound$/);
          const body = JSON.parse(options.body);
          expect(body.requests).toHaveLength(2);
          expect(body.requests.find((request) => request.instrumentType === 'IPLC_LC').eventSeq).toBe(4);
          expect(body.requests.find((request) => request.instrumentType === 'SHGT').eventSeq).toBe(2);
          return jsonResponse(201, [
            { movementId: 'sg-redeem', balanceContractId: 'sg-contract' },
            { movementId: 'a3s-retry', balanceContractId: 'lc-contract' },
          ]);
        });

      const trace = await runCase({
        id: 'synthetic-runner-auto-a3s',
        steps: [
          { type: 'createMovement', label: 'A1', captureAs: 'lc', request: { instrumentType: 'IPLC_LC', movementType: 'ISSUE', eventSeq: 1, amount: '10000' } },
          { type: 'createMovement', label: 'A8', captureAs: 'sg', request: { instrumentType: 'SHGT', movementType: 'ISSUE', eventSeq: 1, amount: '5000' } },
          {
            type: 'createCompoundMovements',
            functionCode: 'A3S',
            label: 'A3S over allowance',
            captureAs: ['redeem', 'arrival'],
            expectError: true,
            autoFormalIncrease: { functionCode: 'A2', contractRef: 'lc', decisionRequestIndex: 1 },
            requests: [
              { instrumentType: 'SHGT', balanceContractIdRef: 'sg', movementType: 'FULL_REDEEM', eventSeq: 2, amount: '5000' },
              { instrumentType: 'IPLC_LC', balanceContractIdRef: 'lc', movementType: 'UTILIZE', eventSeq: 2, amount: '17000', currency: 'USD', createdBy: 'maker1' },
            ],
          },
        ],
      });

      expect(trace.map((entry) => entry.type)).toEqual([
        'createMovement', 'createMovement', 'createCompoundMovements',
        'autoFormalIncrease', 'autoFormalIncreaseRelease', 'autoRetry',
      ]);
      expect(global.fetch).toHaveBeenCalledTimes(6);
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

  describe('Runner-only automatic Formal Increase failures', () => {
    const baseStep = {
      label: 'over-limit demo',
      functionCode: 'A3',
      autoFormalIncrease: { functionCode: 'A2', contractRef: 'lc' },
    };
    const request = { balanceContractId: 'lc-contract', eventSeq: 2, currency: 'USD', createdBy: 'maker1' };
    const finite = {
      status: 409,
      ok: false,
      body: { code: 'EXCESS_LIMIT_EXCEEDED', guidance: { outcome: 'FINITE', minimumRequiredIncreaseOwner: '100' } },
    };
    const captured = { lc: { response: { balanceContractId: 'lc-contract' } } };

    it('rejects non-finite guidance instead of inventing an amendment amount', async () => {
      await expect(runAutoFormalIncrease(
        baseStep,
        request,
        { status: 409, ok: false, body: { code: 'EXCESS_LIMIT_EXCEEDED', guidance: { outcome: 'INCREASE_ALONE_CANNOT_RESOLVE' } } },
        captured,
        [],
      )).rejects.toThrow(/did not provide a finite Minimum Required Increase/);
    });

    it('rejects an unresolved parent contract and unsupported amendment function', async () => {
      await expect(runAutoFormalIncrease(baseStep, request, finite, {}, [])).rejects.toThrow(/cannot resolve contractRef/);
      await expect(runAutoFormalIncrease(
        { ...baseStep, autoFormalIncrease: { functionCode: 'C2', contractRef: 'lc' } },
        request,
        finite,
        captured,
        [],
      )).rejects.toThrow(/supports only A2 or B2/);
    });

    it.each([
      ['create', [jsonResponse(409, { code: 'CREATE_FAILED' })], /automatic A2 failed/],
      ['release', [jsonResponse(201, { movementId: 'a2' }), jsonResponse(409, { code: 'RELEASE_FAILED' })], /A2 Release failed/],
      ['retry', [jsonResponse(201, { movementId: 'a2' }), jsonResponse(200, {}), jsonResponse(409, { code: 'RETRY_FAILED' })], /retry after automatic A2 failed/],
    ])('surfaces automatic %s failure', async (_stage, responses, expected) => {
      global.fetch = jest.fn();
      responses.forEach((response) => global.fetch.mockImplementationOnce(async () => response));
      await expect(runAutoFormalIncrease(baseStep, request, finite, captured, [])).rejects.toThrow(expected);
    });

    it('builds B02 for a child transaction, uses an explicit checker, and preserves the child retry sequence', async () => {
      global.fetch = jest
        .fn()
        .mockImplementationOnce(async (_url, options) => {
          expect(JSON.parse(options.body)).toMatchObject({ instrumentType: 'EPLC_CONFIRMATION', movementType: 'AMEND', eventSeq: 2 });
          return jsonResponse(201, { movementId: 'b02', balanceContractId: 'conf-contract' });
        })
        .mockImplementationOnce(async (_url, options) => {
          expect(JSON.parse(options.body)).toEqual({ releasedBy: 'checker-demo' });
          return jsonResponse(200, {});
        })
        .mockImplementationOnce(async (_url, options) => {
          expect(JSON.parse(options.body).eventSeq).toBe(1);
          return jsonResponse(201, { movementId: 'b3', balanceContractId: 'b3-contract' });
        });
      const trace = [];

      const result = await runAutoFormalIncrease(
        { label: 'B3 over-limit', autoFormalIncrease: { functionCode: 'B2', contractRef: 'conf', releasedBy: 'checker-demo' } },
        { instrumentType: 'EPLC_EXAMINATION', eventSeq: 1, currency: 'USD', createdBy: 'maker1' },
        finite,
        { conf: { response: { balanceContractId: 'conf-contract' } } },
        trace,
      );

      expect(result.response.movementId).toBe('b3');
      expect(trace.map((entry) => entry.label)).toEqual(expect.arrayContaining([
        expect.stringContaining('B02'),
        expect.stringContaining('B3 over-limit'),
      ]));
    });
  });

  describe('callMicroservice (sanity — already exercised indirectly via runCase/resolveLogicalContractId above)', () => {
    it('is the same function exported from server.js', () => {
      expect(typeof callMicroservice).toBe('function');
    });

    it('adds Idempotency-Key to mutation commands used by OVERDRAWN cases', async () => {
      global.fetch = jest.fn(async () => jsonResponse(201, { movementId: 'mv-1' }));

      await callMicroservice('POST', '/balance-movements', { amount: '10200' });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/balance-movements'),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Content-Type': 'application/json', 'Idempotency-Key': expect.any(String) }),
        }),
      );
    });
  });
});
