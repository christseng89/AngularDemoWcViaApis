## Why

The demo currently has no user-selectable theme, opens on Import LC even though the Payment Component Simulator is the primary verification surface, runs an unsupported Angular 17 baseline, and lacks a governed OpenSpec package. These gaps reduce usability, maintainability, and confidence in trade-finance interpretation.

## What Changes

- Add System, Light, and Dark theme preferences; System is the default and follows operating-system changes.
- Make Payment Component Simulator the first and initially selected top-level view.
- Upgrade the Angular application from 17 to 20, matching lc-balance-wc, using the supported Node/TypeScript/RxJS matrix and compatible Formly/Jest tooling.
- Establish the `openspec/` spec-driven structure, current capability specs, this governed change, traceable tasks, and an AI-assisted senior BA trade-finance review.
- Remove only dead code proven unused by reference search, compiler, tests, build, and Sonar.

## Capabilities

### Modified Capabilities

- `application-shell`: theme preference, system resolution, navigation order, initial selection, and accessibility.

### New Governance Capability

- `openspec-governance`: source-controlled current specifications and change lifecycle for Payment Component behavior.

## Impact

- UI: application shell, global semantic tokens, and component styles.
- Tooling: Angular, TypeScript, Formly, zone.js, CLI/build, and Jest compatibility packages.
- Persistence: browser-local theme preference only; no banking or customer data.
- API/accounting: no contract, calculation, posting, or persistence behavior change.
- Rollback: restore the prior dependency lock and shell files; business data requires no migration.

## Non-goals

- No redesign of payment calculations, LC accounting logic, SWIFT rules, or service APIs.
- No claim of independent human BA approval; the included review is AI-assisted and must be replaced or countersigned if formal governance requires a human checker.
