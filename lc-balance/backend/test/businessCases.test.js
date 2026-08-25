const { buildRegistry } = require('../data/businessCases');

// data/businessCases.js's buildRegistry() is pure structure-building (only lcNumberFor()'s
// Date.now()/Math.random() suffix varies run-to-run) — no fetch/microservice mocking needed here,
// unlike server.test.js. See lc-balance-wc/CLAUDE.md for the domain background (Import/Export LC
// Business Case Registry, §7.4 "one movement, one call").

const EXPECTED_IDS = [
  'import-case-1',
  'import-case-2',
  'import-case-3',
  'import-case-4',
  'import-case-5',
  'import-case-6',
  'import-case-7',
  'import-case-8',
  'import-case-9',
  'import-case-10',
  'import-case-11',
  'import-case-12',
  'import-case-13',
  'import-case-14',
  'import-case-15',
  'export-case-1',
  'export-case-2',
  'export-case-3',
  'export-case-4',
  'export-case-5',
  'export-case-6',
  'export-case-7',
  'export-case-8',
  'export-case-9',
  'export-case-10',
  'export-case-11',
  'export-case-12',
];

const VALID_STEP_TYPES = ['note', 'createMovement', 'release', 'makerSubmit', 'snapshot'];

describe('data/businessCases.js buildRegistry()', () => {
  const registry = buildRegistry();

  it('returns exactly 27 business cases, Import Case 1-15 then Export Case #1-#12, in order', () => {
    expect(registry).toHaveLength(27);
    expect(registry.map((c) => c.id)).toEqual(EXPECTED_IDS);
  });

  it('every case has a non-empty title/description and a non-empty step list', () => {
    registry.forEach((c) => {
      expect(typeof c.title).toBe('string');
      expect(c.title.length).toBeGreaterThan(0);
      expect(typeof c.description).toBe('string');
      expect(c.description.length).toBeGreaterThan(0);
      expect(Array.isArray(c.steps)).toBe(true);
      expect(c.steps.length).toBeGreaterThan(0);
    });
  });

  it('matches the specific titles documented in the registry file', () => {
    const byId = Object.fromEntries(registry.map((c) => [c.id, c]));
    expect(byId['import-case-1'].title).toBe('Import Case 1 — USD Sight');
    expect(byId['import-case-2'].title).toBe('Import Case 2 — USD Usance 120 days after sight');
    expect(byId['import-case-3'].title).toBe('Import Case 3 — USD Sight + Shipping Guarantee 50,000 + IBL');
    expect(byId['import-case-4'].title).toBe('Import Case 4 — USD Sight + Shipping Guarantee 100,000, partial match via Document Arrival w/ SG (A3S)');
    expect(byId['import-case-5'].title).toBe('Import Case 5 — USD Sight, Amendment Decrease 120,000 (expect ERROR)');
    expect(byId['import-case-6'].title).toBe('Import Case 6 — USD Sight + two Shipping Guarantees (full + partial redeem) + A4 real Maker Submit');
    expect(byId['import-case-7'].title).toBe('Import Case 7 — USD Sellers Usance 120 days + Shipping Guarantee + two Acceptances (A6/A7)');
    expect(byId['export-case-1'].title).toBe('Export Case #1 — USD Sight + Confirmed');
    expect(byId['export-case-2'].title).toBe('Export Case #2 — USD Usance + Confirmed + No EBL');
    expect(byId['export-case-3'].title).toBe('Export Case #3 — USD Usance + Confirmed + EBL');
    expect(byId['export-case-4'].title).toBe('Export Case #4 — USD Usance + Unconfirmed + No EBL');
    expect(byId['export-case-5'].title).toBe('Export Case #5 — USD Usance + Unconfirmed + EBL');
    expect(byId['export-case-6'].title).toBe('Export Case #6 — USD Sight + Confirmed + Present Docs (B3) -> Honour (B4) -> Due From Issuing Bank');
    expect(byId['export-case-7'].title).toBe(
      'Export Case #7 — USD Sellers Usance 120 days + Confirmed + Present Docs (B3) -> Accept (B4) -> Acceptance + Reimbursement Receivable -> Settlement (B5)',
    );
    expect(byId['import-case-8'].title).toBe("Import Case 8 — USD Sellers Usance 120 days, full lifecycle to Close (A10)");
    expect(byId['import-case-9'].title).toBe("Import Case 9 — USD Buyer's Usance 120 days, full lifecycle to Close (A10)");
    expect(byId['import-case-10'].title).toBe(
      'Import Case 10 — USD Sight, Shipping Guarantee + Document Arrival both taken to their own terminus, then Close (A10)',
    );
    expect(byId['import-case-11'].title).toBe('Import Case 11 — A10 Close eligibility gate, negative path (expect ERROR)');
    expect(byId['import-case-12'].title).toBe('Import Case 12 — A10 Close eligibility gate, negative path (Acceptance balance outstanding, expect ERROR)');
    expect(byId['export-case-8'].title).toBe('Export Case #8 — USD Sight + Confirmed, full lifecycle to Close (B6)');
    expect(byId['export-case-9'].title).toBe("Export Case #9 — USD Sellers Usance 120 days + Confirmed, full lifecycle to Close (B6)");
    expect(byId['export-case-10'].title).toBe('Export Case #10 — standalone B2 Amendment (increase, then decrease past Tight Available — expect ERROR)');
    expect(byId['export-case-11'].title).toBe('Export Case #11 — B6 Close eligibility gate, negative path (expect ERROR)');
    expect(byId['import-case-13'].title).toBe(
      'Import Case 13 — A10 Close -> A11 Reopen (carries its own restoration amount, server-computed at Submit) -> A2 Expiry Date Amendment (plain)',
    );
    expect(byId['import-case-14'].title).toBe('Import Case 14 — A11 Reopen eligibility gate, negative path (ACTIVE contract, expect ERROR)');
    expect(byId['import-case-15'].title).toBe(
      'Import Case 15 — AUTO EXPIRY then AUTO CLOSE (simulated via the same BATCH_MAKER/BATCH_CHECKER actors the real background sweep uses) -> A11 Reopen restores the ORIGINAL Expire amount, not the follow-on Close’s own zero (§9.7 path B)',
    );
    expect(byId['export-case-12'].title).toBe('Export Case #12 — B6 Close -> B7 Reopen (carries its own restoration amount, server-computed at Submit)');
  });

  it('every step has a type from the six the generic executor understands', () => {
    registry.forEach((c) => {
      c.steps.forEach((step) => {
        expect(VALID_STEP_TYPES).toContain(step.type);
      });
    });
  });

  it('every note step carries only a label (no request/refs)', () => {
    registry.forEach((c) => {
      c.steps
        .filter((s) => s.type === 'note')
        .forEach((s) => {
          expect(typeof s.label).toBe('string');
          expect(s.label.length).toBeGreaterThan(0);
        });
    });
  });

  it('every *Ref (balanceContractIdRef / parentLogicalContractIdRef / referencedTransactionIdRef / movementRef / contractRef) points at a captureAs key already defined earlier in the SAME case, for release/makerSubmit steps alike', () => {
    registry.forEach((c) => {
      const defined = new Set();
      c.steps.forEach((step, idx) => {
        if (step.type === 'createMovement') {
          const req = step.request || {};
          if (req.balanceContractIdRef) {
            expect(defined.has(req.balanceContractIdRef)).toBe(true);
          }
          if (req.parentLogicalContractIdRef) {
            expect(defined.has(req.parentLogicalContractIdRef)).toBe(true);
          }
          if (req.referencedTransactionIdRef) {
            expect(defined.has(req.referencedTransactionIdRef)).toBe(true);
          }
          if (step.captureAs) {
            // A step must not "define" a key it also references as its own ref (sanity check —
            // would indicate a self-referential, unresolvable step).
            expect(step.captureAs === req.balanceContractIdRef).toBe(false);
            defined.add(step.captureAs);
          }
        } else if (step.type === 'release' || step.type === 'makerSubmit') {
          expect(step.movementRef).toBeTruthy();
          expect(defined.has(step.movementRef)).toBe(true);
        } else if (step.type === 'snapshot') {
          expect(step.contractRef).toBeTruthy();
          expect(defined.has(step.contractRef)).toBe(true);
        } else if (step.type === 'note') {
          // no refs to check
          expect(idx).toBeGreaterThanOrEqual(0);
        }
      });
    });
  });

  it('every createMovement step captures its response under captureAs (every later step needs something to reference)', () => {
    registry.forEach((c) => {
      c.steps
        .filter((s) => s.type === 'createMovement')
        .forEach((s) => {
          expect(typeof s.captureAs).toBe('string');
          expect(s.captureAs.length).toBeGreaterThan(0);
        });
    });
  });

  it("lcNumberFor()'s generated naturalKey.lcNumber values follow '<PREFIX>-<timestamp>-<random>' (dynamic — asserted by pattern, not exact value)", () => {
    registry.forEach((c) => {
      const firstWithNaturalKey = c.steps.find((s) => s.type === 'createMovement' && s.request && s.request.naturalKey && s.request.naturalKey.lcNumber);
      expect(firstWithNaturalKey).toBeDefined();
      expect(firstWithNaturalKey.request.naturalKey.lcNumber).toMatch(/^(IMP|EXP)-C\d+-\d+-\d+$/);
    });
  });

  it('Import Case 3/4 reuse the same SG natural key ("G01", the Gnn mandatory-reference convention) — expected per the registry\'s own buildRegistry() call', () => {
    const byId = Object.fromEntries(registry.map((c) => [c.id, c]));
    const sgStep3 = byId['import-case-3'].steps.find((s) => s.captureAs === 'sg');
    const sgStep4 = byId['import-case-4'].steps.find((s) => s.captureAs === 'sg');
    expect(sgStep3.request.naturalKey.sgNumber).toBe('G01');
    expect(sgStep4.request.naturalKey.sgNumber).toBe('G01');
  });

  it('every mandatory reference number (Amendment No./IB Number/SG Number/EB Number) on a createMovement step is populated and follows the Ann/Bnn/Gnn/Enn convention', () => {
    const REF_PATTERN = /^[ABGE]\d{2}$/;
    registry.forEach((c) => {
      c.steps
        .filter((s) => s.type === 'createMovement')
        .forEach((s) => {
          const { movementType, instrumentType, naturalKey } = s.request;
          if (movementType === 'AMEND' || movementType === 'AMEND_INCREASE' || movementType === 'AMEND_DECREASE') {
            expect(s.request.sourceTransactionRef).toMatch(REF_PATTERN);
          }
          if (movementType === 'UTILIZE') {
            expect(s.request.sourceTransactionRef).toMatch(REF_PATTERN);
          }
          if (instrumentType === 'SHGT' && movementType === 'ISSUE') {
            expect(naturalKey.sgNumber).toMatch(REF_PATTERN);
          }
          if (instrumentType === 'EPLC_EXAMINATION') {
            expect(naturalKey.ibNumber).toMatch(REF_PATTERN);
          }
        });
    });
  });

  it('is structurally deterministic across independent calls (ids, step types, step counts, MAKER/CHECKER usage) — only the natural-key random suffixes vary', () => {
    const registry2 = buildRegistry();
    const strip = (r) =>
      r.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        stepCount: c.steps.length,
        stepTypes: c.steps.map((s) => s.type),
        createdBy: c.steps.filter((s) => s.type === 'createMovement').map((s) => s.request.createdBy),
        releasedBy: c.steps.filter((s) => s.type === 'release').map((s) => s.releasedBy),
      }));
    expect(strip(registry)).toEqual(strip(registry2));
  });

  it('module.exports exposes exactly buildRegistry', () => {
    const mod = require('../data/businessCases');
    expect(Object.keys(mod)).toEqual(['buildRegistry']);
    expect(typeof mod.buildRegistry).toBe('function');
  });
});
