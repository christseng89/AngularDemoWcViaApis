# FIN MT SSI Field Resolution — Acceptance Evidence

Date: 2026-09-08  
Target: `<repo-root>`

## Scope and authority

- Treasury reference-only field resolution: Category 3 MT300, MT304, MT305, MT306, MT320, MT330, MT340, MT341, MT350, MT360, MT361, MT362, MT364, MT365.
- Trade Finance reference-only field resolution: MT400 and the 17 governed Category 7 messages in the portal index.
- Full local SR2026 MRG source artifacts: `SWIFT/us3ma_20260717.pdf`, `SWIFT/us3mb_20260717.pdf`, `SWIFT/us4m_20260717.pdf`, `SWIFT/us7m_20260717.pdf`.
- Exact profile identity: standards release + message type + sequence + settlement leg + tag + option.
- 86a is deliberately deferred. No 86a rows are present.
- Existing MT2/MX settlement preview and confirmation semantics are unchanged.

## Contract boundaries

- Primary endpoint: `POST /reference/fin-tag-resolutions`.
- Catalogue endpoint: `GET /reference/fin-resolution-catalogue`; its message-level `SSI_RESOLVABLE` / `NO_SSI_RESOLVABLE_FIELDS` marker and tag options are derived from the governed SR catalogue rather than a portal hard-code.
- Result: `resolvedFields` with `resolvedValue`, official field name, scope/resolution status, controlled reason, NVR references and evidence provenance.
- Canonical route normalization is performed by the API before it returns `resolvedFields`. It only collapses consecutive nodes when the caller supplies the same fully-qualified `canonicalRouteNodeId` and owner side; equal BIC text alone is never sufficient.
- A `NOT_REQUIRED / ROUTE_COMPLETE` field is attributed to `ROUTE_RESOLVER / CANONICAL_ROUTE`; the original SSI candidate source and owner remain available as `candidateSource` and `candidateOwnerSide`.
- A settlement tag available elsewhere in the same message/business-function profile but excluded from the selected sequence/leg is returned explicitly as `OUT_OF_SSI_SCOPE / N_A / MESSAGE_PROFILE_EXCLUDED`, so audit rows such as MT300 B1 58A never silently disappear.
- Always reference-only: `paymentExecutable=false`, `confirmationSupported=false`; no payment token, snapshot hash or attempt ID.
- Deprecated adapter: `POST /reference/fin-tag-suggestions`, with `Deprecation: true` and successor link.
- Portal has no active Suggestion entry. It exposes Treasury SSI Resolution, Trade Finance SSI Resolution, and the unchanged Payment SSI Resolution for MT2/MX.
- The user-facing result table hides `OUT_OF_SSI_SCOPE` rows. When a profile has no SSI-resolvable fields it shows one explicit empty state; the complete N/A rows remain in the API response and audit evidence.

## Automated evidence

- `npm run verify`: PASS
  - ESLint: PASS
  - Typecheck: 8/8 projects PASS
  - Unit tests: 5/5 projects PASS
  - Production build: 5/5 projects PASS
- `npx nx test ssi-service --configuration=ci --runInBand`: PASS (11 suites, 89 tests)
  - Exhaustive route-normalization test covers all 25 SSI-related outward MT3/MT4/MT7 messages in the SR2026 catalogue.
  - 53 exact option-A message/sequence/settlement-leg profiles are resolved independently; no resolved route contains a duplicate canonical node for the same owner side.
- FIN resolution coverage gate: PASS (11 suites, 89 tests)
  - `fin-field-resolution.service.ts`: statements 100%, branches 99.05%, functions 100%, lines 100%.
  - `fin-field-resolution.policy.ts`: statements/branches/functions/lines 100%.
  - Jest enforces at least 95% independently for both production files.
- Duplication gate: PASS. The final jscpd scan measured 1.67% duplicated lines overall and 1.37% for TypeScript, both below the required 2% threshold. The service-local support contract is retained because the independently compiled application cannot import domain TypeScript outside its build `rootDir` without breaking the production build.
- Dead-code checks: strict TypeScript `noUnusedLocals`/`noUnusedParameters` PASS; the confirmed orphan `libs/swift-ssi-mapping/src/lib/exports.ts` was removed.
- Sonar-compatible project settings use all generated LCOV reports and exclude test/generated output from CPD. An actual SonarQube server scan has not been uploaded because this environment has no trusted `SONAR_HOST_URL` or `SONAR_TOKEN`; no source-derived analysis was transmitted to an unspecified server.
- The enforced >95% coverage gate applies to the changed FIN Resolution production files above. The full legacy `ssi-service` currently measures statements 50.38%, branches 43.43%, functions 61.18%, and lines 53.18%; raising the entire legacy service above 95% is separate remediation work and is not represented as complete by this acceptance record.
- `node scripts/e2e-fin-field-resolution.mjs`: PASS
  - Primary endpoint and deprecated adapter
  - MT300 duplicate Delivery Agent/Intermediary node normalized to `56A NOT_REQUIRED / ROUTE_COMPLETE`
  - Treasury UI 14/14 messages
  - Trade Finance 18-message index
- `node scripts/e2e-all-outward-mt-ui.mjs`: PASS (21/21 checks)
  - Trade Finance UI 18/18 messages
  - 70 covered counterparty/currency contexts, 210 synthetic candidates
  - result-side candidate switching and provenance refresh
  - no-SSI fail-closed behavior
  - MT760 party-routing isolation
  - MT765 duplicate Intermediary/Account With node preserves the endpoint and omits the redundant intermediary
- `node scripts/e2e-suggestion-resolution-split.mjs`: PASS
  - FIN field resolution remains reference-only
  - deprecated adapter compatibility
  - existing settlement preview and confirm unchanged
- Catalogue integrity: 476 in-scope FIN 5x option rows, 476 unique exact keys, zero duplicate keys, zero missing evidence, zero 86a rows.
- OpenAPI 3.1 copies identical; SHA-256 `3e312e0b052157568f6ccd7b78c2c1dd3d8dc63ca09a0957672e8a8c329e8f01`.

## Visual evidence

- `artifacts/fin-field-resolution.png`
- Manual screenshot review confirms separate Resolution navigation, page-by-page 10 rows, the 18-message Trade Finance index, and the non-misleading `SR2026 5x Profile Slots` heading.

## Dependency audit

- `npm audit --audit-level=high`: PASS (exit code 0).
- High severity: 0.
- Critical severity: 0.
- Moderate severity: 10.
- Residual moderate findings:
  - `qs`, through the `webpack-dev-server` / `body-parser` / `express` dependency chain; an automated fix is available.
  - `uuid < 11.1.1`, through the `exceljs` / `sockjs` / `webpack-dev-server` dependency chain; the audit output showed no available fix.
- `npm audit fix` was deliberately not run. The moderate findings remain documented residual dependency risk and do not fail the configured high-severity acceptance gate.
