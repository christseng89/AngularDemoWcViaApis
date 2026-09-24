# Senior BA Trade Finance Review — AI-Assisted

## Review Scope and Limitation

This review applies a senior Business Analyst perspective with Trade Finance domain reasoning to the current Payment Component contracts and the proposed shell/theme/framework change. It is AI-assisted evidence, not an independent human approval or regulatory/legal opinion.

## Business Boundary Review

- **LC vs Payment responsibility:** Import/Export LC tabs demonstrate upstream journal scenarios; the Payment Component Simulator owns payment instruction classification, settlement entries, suspense offsets, and supported payment messages. The change does not move LC lifecycle or exposure ownership into Payment Component.
- **Debit/Credit integrity:** Theme and navigation changes are presentation-only. Angular migration must preserve exact-decimal debit/credit balance validation and atomic rejection of unbalanced instructions.
- **Suspense:** The Payment Component posts its offsetting suspense leg; Charge/Balance components retain their own contra entry responsibility. Theme labels must not imply transfer of accounting ownership.
- **FX:** Transaction currency, account currency, settlement amount, instructed amount, and cross-rate remain distinct. Visual theme must not encode Dr/Cr or balanced/unbalanced solely by color.
- **SWIFT:** Advice/cover compatibility and shared UETR behavior remain server-authoritative. No SR or message-field rule is changed by this proposal.
- **Idempotency:** UI theme persistence is unrelated to banking transaction persistence. Theme changes must not recreate, confirm, or replay Payment Instructions.

## Requirement Quality Review

| Area | Review result | Evidence expectation |
|---|---|---|
| Simulator first/default | Accepted | shell test and rendered navigation order |
| System theme default | Accepted | no-storage and invalid-storage tests |
| Explicit Light/Dark | Accepted | persistence and no-reload state test |
| OS theme response | Accepted | matchMedia change test |
| Angular 20 alignment | Conditionally accepted | supported matrix, full regression, builds, Sonar |
| Dead-code removal | Conditionally accepted | reference proof plus full regression |
| Accounting/API impact | No intended change | contract tests remain byte-for-byte compatible |

## Risks and Controls

- **Framework migration regression:** controlled by staged dependency migration, lockfile review, 664-test baseline, builds, and Sonar.
- **Dark-theme semantic loss:** controlled by semantic tokens, contrast checks, visible text/icons, and non-color status cues.
- **Custom-element styling gaps:** controlled by CSS variables at document root and manual/rendered verification of all three top-level views.
- **False dead-code deletion:** controlled by custom-element registration and side-effect import review before removal.

## BA Recommendation

Proceed with the change because it improves the primary demo journey and accessibility without changing trade-finance calculations or service boundaries. Formal environments should obtain a distinct human Trade Finance Checker countersignature before treating this document as governed BA approval.
