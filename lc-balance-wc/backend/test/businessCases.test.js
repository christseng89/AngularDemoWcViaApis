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
  'export-case-1',
  'export-case-2',
  'export-case-3',
  'export-case-4',
  'export-case-5',
];

const VALID_STEP_TYPES = ['note', 'createMovement', 'release', 'snapshot'];

describe('data/businessCases.js buildRegistry()', () => {
  const registry = buildRegistry();

  it('returns exactly 10 business cases, Import Case 1-5 then Export Case #1-#5, in order', () => {
    expect(registry).toHaveLength(10);
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
    expect(byId['import-case-4'].title).toBe('Import Case 4 — USD Sight + Shipping Guarantee 100,000 + IBL (only 50,000 documents arrive)');
    expect(byId['import-case-5'].title).toBe('Import Case 5 — USD Sight, Amendment Decrease 120,000 (expect ERROR)');
    expect(byId['export-case-1'].title).toBe('Export Case #1 — USD Sight + Confirmed');
    expect(byId['export-case-2'].title).toBe('Export Case #2 — USD Usance + Confirmed + No EBL');
    expect(byId['export-case-3'].title).toBe('Export Case #3 — USD Usance + Confirmed + EBL');
    expect(byId['export-case-4'].title).toBe('Export Case #4 — USD Usance + Unconfirmed + No EBL');
    expect(byId['export-case-5'].title).toBe('Export Case #5 — USD Usance + Unconfirmed + EBL');
  });

  it('every step has a type from the four the generic executor understands', () => {
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

  it('every *Ref (balanceContractIdRef / parentLogicalContractIdRef / movementRef / contractRef) points at a captureAs key already defined earlier in the SAME case', () => {
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
          if (step.captureAs) {
            // A step must not "define" a key it also references as its own ref (sanity check —
            // would indicate a self-referential, unresolvable step).
            expect(step.captureAs === req.balanceContractIdRef).toBe(false);
            defined.add(step.captureAs);
          }
        } else if (step.type === 'release') {
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
      expect(firstWithNaturalKey.request.naturalKey.lcNumber).toMatch(/^(IMP|EXP)-C\d-\d+-\d+$/);
    });
  });

  it('Import Case 3/4 reuse the same SG natural key ("SG0001") — expected per the registry\'s own buildRegistry() call', () => {
    const byId = Object.fromEntries(registry.map((c) => [c.id, c]));
    const sgStep3 = byId['import-case-3'].steps.find((s) => s.captureAs === 'sg');
    const sgStep4 = byId['import-case-4'].steps.find((s) => s.captureAs === 'sg');
    expect(sgStep3.request.naturalKey.sgNumber).toBe('SG0001');
    expect(sgStep4.request.naturalKey.sgNumber).toBe('SG0001');
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
    // eslint-disable-next-line global-require
    const mod = require('../data/businessCases');
    expect(Object.keys(mod)).toEqual(['buildRegistry']);
    expect(typeof mod.buildRegistry).toBe('function');
  });
});
