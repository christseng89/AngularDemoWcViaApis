# Balance Component Web Component Phase 3 Implementation Record

**Goal:** Isolate the reusable Angular UI runtime and design system from React/Vue host styles while preserving the Phase 1–2 contract.

**Scope:** `lc-balance-wc` Angular/Web Component only. Backend, orchestrator, microservice, authentication, Balance rules, HTTP API and both OAS files remain unchanged.

## Confirmed design

- Use Angular `ViewEncapsulation.ShadowDom` on the Web Component shell.
- Resolve the co-located, stable `styles.css` asset from the WC `main.js` script URL and load it inside each shadow root.
- Keep Bootstrap and existing global SCSS available inside the WC without requiring or leaking a host-global stylesheet.
- Extend `config` additively with `theme: 'system' | 'light' | 'dark'`; keep contract version `1` backward compatible.
- Resolve theme per element instance and never mutate the host document root.
- Publish only stable `--balance-*` custom properties; internal `.tb-*` classes remain private implementation details.
- Preserve dialog/overlay fixed positioning and native composed keyboard/pointer behavior inside the shadow boundary.

## Validation

- Shadow boundary/host collision, theme token, per-instance theme and build asset contract tests.
- Existing contract, navigation, refresh and multi-instance tests.
- Full Angular test/coverage, app and WC typechecks, lint, scoped format check and high-severity audit.
- Angular application and WC production builds.
- Static router isolation and OAS no-difference checks.
