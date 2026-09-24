## Context

The Angular shell lazy-loads one standalone LC Payment feature containing the Simulator and legacy Import/Export journal demos. The theme must cover Angular templates and registered custom elements without a new runtime dependency.

## Design Direction

**Trade Operations Console** — industrial/utilitarian, calm, information-dense, and audit-oriented. DFII: 12/15 (impact 3 + fit 5 + feasibility 5 + performance 5 − consistency risk 6). The memorable anchor is a compact three-state theme control integrated into a strong navy/amber operations header, not a generic floating toggle.

Typography uses locally available `Bahnschrift` for display labels and `Aptos` for body text, with practical fallbacks. Color, elevation, borders, focus, status, and surfaces are semantic CSS variables. Motion is limited to a short content entrance and respects reduced motion.

## Theme Architecture

- `ThemeService` owns a `signal<ThemePreference>` with `system | light | dark`.
- Preference persists only in `localStorage`; missing/invalid values resolve to `system`.
- The effective theme is computed from preference plus `matchMedia('(prefers-color-scheme: dark)')`.
- The service applies `data-theme="light|dark"` and `color-scheme` to `document.documentElement`.
- A system media-query listener updates the effective theme only while preference is `system`.
- The shell exposes an accessible radiogroup-like segmented control with System first.

## Navigation

The visible order and initial active state are Simulator, Import LC, Export LC. The three views remain mutually exclusive and keyboard-operable; no route or service contract changes.

## Angular 20 Migration

Use the official Angular update mechanism one major at a time: latest Angular 17 patch, then 18, 19, and 20. At every stage, update Angular core and CLI/build together, apply that major's official migrations, then pass TypeScript, the full UI Jest suite, and a production build before advancing. The final Angular 20 matrix supports the installed Node 22 line and requires TypeScript `>=5.8 <6.0` with supported RxJS. Upgrade Formly to the Angular >=18 line and Jest integration only at the first stage that requires it. Do not introduce signal forms because existing Formly Reactive Forms remain supported and changing form architecture is outside scope.

## Dead-code Control

Candidates require zero production/test references and no side-effect registration, public custom-element contract, compatibility, rollback, or evidence responsibility. Deletion is accepted only after type checks, tests, builds, and Sonar pass.

## Failure and Security Behavior

Storage access is best-effort and contains no sensitive data. Invalid stored values fail closed to System. Browser environments without `matchMedia` or storage retain a deterministic Light effective fallback. Theme changes never alter transaction state.

## Decision Log

- Selected application-level service plus semantic tokens over component-local theme classes.
- Selected Simulator-first and Simulator-default per Product Owner confirmation.
- Selected standard sequential Angular migration (17 latest → 18 → 19 → 20), matching lc-balance-wc and conditional on evidence at every major.
- Rejected third-party theme packages and business-logic refactoring.
- Kept formal human BA approval outside the claim boundary; this package records an AI-assisted expert review.
