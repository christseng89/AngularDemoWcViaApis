# Acceptance Evidence

## Framework Migration

- Angular 17 latest patch gate: TypeScript, full Jest, and production build passed.
- Angular 18 gate: 354/354 UI tests, TypeScript, and production build passed.
- Angular 19 gate: 354/354 UI tests, TypeScript, and production build passed.
- Angular 20.3 gate: final target aligned to the lc-balance-wc major; official migrations reviewed.

## Final Automated Controls

- UI: 363/363 tests; 100% lines and 95.89% branches.
- Backend adapter: 48/48 tests.
- Payment microservice: 262/262 tests; 100% statements, branches, functions, and lines.
- Angular production build: passed; initial 636.60 kB, estimated transfer 129.80 kB, within budget.
- Web Components: CJS and ESM bundles passed.
- Microservice TypeScript/typecheck and build: passed.
- Strict unused diagnostics: passed with no proven production dead code; side-effect custom-element registration retained intentionally.
- OpenSpec strict validation: 6/6 items passed.
- Local SonarQube Quality Gate: PASSED after remediating all findings introduced by this change.
- SonarQube: 100% new-code coverage; 98.8% overall coverage; 99.8% line coverage; 96.9% branch coverage; 0.0% duplication; 0 bugs, vulnerabilities, security hotspots, new violations, medium issues, or security issues.

## Theme and Accessibility Review

- Light and Dark were compared at the same viewport in the running Angular application.
- Dark-only colour adjustments preserve Light layout and hierarchy.
- WCAG contrast samples: primary/page 17.91:1; secondary/card 10.63:1; muted/card 6.60:1; brand/card 9.01:1; success/soft 7.15:1; input 17.52:1; Confirm CTA 5.25:1.
- Automated tests cover System default, invalid-storage fallback, persistence, operating-system changes, theme selector semantics, and Simulator-first/default behavior.

## Governance

The senior BA review is AI-assisted. A human Trade Finance Checker countersignature remains required if this prototype is promoted into a governed delivery lifecycle.
