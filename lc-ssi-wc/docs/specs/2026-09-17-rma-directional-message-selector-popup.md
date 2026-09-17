# RMA Directional Message Type Selector Popup Specification

**Status:** `REVIEW CYCLE 2 — ROUND 1 CANDIDATE`  
**Date:** 2026-09-17  
**Scope:** RMA ADD／EDIT／VIEW Message Types popup only  
**Normative dependencies:** `memory/rma-index-message-scope-memory.md`, `memory/ssi-maintenance-workflow-memory.md`, `memory/mt347-oas-page-parameters-ui-standard-v1.md`  
**Implementation gate:** Do not implement until the authorized data-remediation phase and this specification both receive the required approval.

## 1. Problem statement

The current RMA form binds one Message Types control to the current record direction. An operator editing an OUTBOUND record therefore sees only the OUTBOUND selection and cannot compare or configure the same bank's INBOUND authorization in the approved two-column presentation.

The development API does contain both directions. On the 2026-09-17 development snapshot it returned 88 INBOUND rows (42 ACTIVE) and 5,530 OUTBOUND rows (5,442 ACTIVE); CITIUS33 had six INBOUND and eight OUTBOUND physical rows including history. This is a presentation and governed-workflow problem, not absence of INBOUND test data.

## 2. Goals

1. Allow a Maker to view and select governed Message Types for INBOUND and OUTBOUND in one popup.
2. Render one parameter-driven Message catalogue identically on both sides; only authorization state may differ.
3. Preserve the existing RMA page, physical database model, canonical bank-direction identity, Maker／Checker lifecycle and audit rules.
4. Make ADD／EDIT changes explicit and deterministic for each `Own BIC + Counterparty BIC + Direction` record.
5. Give QA a complete, repeatable acceptance contract covering visual, data, concurrency, validation and audit behavior.

## 3. Non-goals

- Redesigning the complete RMA ADD／EDIT／VIEW page.
- Changing the physical RMA database schema or merging INBOUND and OUTBOUND into one stored row.
- Adding MT5xx values shown in the visual reference; they remain examples only unless governed parameters make them eligible.
- Allowing free-text Message Type entry or maintaining a second UI-only catalogue.
- Performing RMA Submit, Approve or Suppress from inside this popup.
- Changing SSI resolution, transport selection or RMA eligibility semantics.

## 4. Users and user stories

- As a Maker, I want to compare and select INBOUND and OUTBOUND Message Types together so that I do not overlook one direction.
- As a Maker revising an RMA, I want original authorized values pre-checked so that additions and removals are clear before Save Draft.
- As a Checker, I want each bank-direction draft to retain its own `ADDED`／`UNCHANGED`／`SUPPRESSED` delta so that approval remains unambiguous.
- As an Auditor, I want the same popup in read-only mode so that the governed input is understandable without reading raw JSON.

## 5. Approved visual and interaction contract (P0)

### 5.1 Popup boundary

- The existing Message Types control opens a modal popup; the rest of the RMA form remains unchanged.
- The popup has a large, bold standard `×` control at the upper-right.
- The `×` target is at least 48×48 px, uses a large bold glyph, high-contrast border／color, visible keyboard focus, and an accessible `Close` name through the shared maintenance close component.
- `×`, `Esc`, or backdrop close means **Cancel**: discard every popup change and restore both directions to the values present when the popup opened.
- Do not add a separate Cancel button.
- `Reset` restores both direction selections to the opening snapshot; it does not clear all values and does not write data.
- `Save Changes` validates and copies the two selections into the parent RMA form. It does not write the database; the outer `Save Draft` remains the persistence boundary.
- Popup Cancel is local rollback only and never acquires or cancels a server WIP. Parent revision `×`／`Esc` cancels every WIP reservation acquired for the edit; if any server cancellation fails, keep the failure visible, keep the affected lock state, and do not navigate away as if release succeeded.

### 5.2 Categories

- Show exactly three tabs in this order: `Security`, `Trade Finance`, `Payment`.
- Category identity, display name, display order, empty-state text, membership, official description, supported formats, selectability and ordering metadata must come from the governed Message policy returned by the API.
- The UI must not infer category from an MT prefix and must not hard-code descriptions.
- A category with zero governed items remains visible and shows a governed empty state; it must not borrow items from another category.

### 5.3 Direction matrix

- Within every selected category, display two equal-width columns:
  - left: `INBOUND` — messages received from the Counterparty BIC;
  - right: `OUTBOUND` — messages sent to the Counterparty BIC.
- Both columns render the identical Message Type rows and descriptions from the same parameter snapshot.
- Each column has independent checked state.
- The API returns each category's canonical Message Type sequence. The canonical comparator is case-insensitive natural alphanumeric ascending on normalized Message Type, followed by exact normalized Message Type and stable item ID as deterministic tie-breakers. The UI renders this sequence losslessly and asserts that both columns use it; it must not independently re-sort either direction.
- Search filters the shared row set and therefore filters both columns identically without changing checked values.
- Checkbox interaction must be keyboard accessible and expose its checked state to assistive technology.

### 5.4 Selected-state summary

- Outside the popup, show compact direction-aware summaries, for example:
  - `INBOUND · 3 selected`
  - `OUTBOUND · 5 selected`
- The complete list remains in the popup rather than expanding the parent form vertically.
- These staged counts belong only to the parent ADD／EDIT form. They do not replace the RMA Index contract: the Index continues to show the first two Message Types on two lines and shows `...` as a third line only when more values exist.

## 6. Governed parameter and API contract (P0)

The existing `GET /api/rma-authorisations/message-type-policy` response shall be extended additively without removing existing fields. Its OAS schema and shared TypeScript contract must expose an immutable policy identity, the complete governed category set, and one item per Message Type:

```json
{
  "schemaVersion": "1.0.0",
  "catalogueVersion": "SR2026-...",
  "catalogueSha256": "...",
  "categories": [
    {
      "categoryId": "SECURITY",
      "displayName": "Security",
      "displayOrder": 10,
      "emptyStateText": "No governed Security message types are available."
    }
  ],
  "supportedMessageTypes": ["MT103", "pacs.008.001.08"],
  "items": [
    {
      "itemId": "PAYMENT:MT103",
      "messageType": "MT103",
      "description": "Single Customer Credit Transfer",
      "categoryId": "PAYMENT",
      "supportedFormats": ["MT"],
      "selectable": true,
      "directionApplicability": {
        "inbound": { "applicable": true, "reason": null },
        "outbound": { "applicable": true, "reason": null }
      }
    }
  ]
}
```

Rules:

- `schemaVersion` is required by the response, OAS and shared TypeScript contract and is part of the JCS hash input. A missing or unsupported version fails closed.
- `categories` contains exactly the governed `SECURITY`, `TRADE_FINANCE`, and `PAYMENT` identities with unique IDs and display orders. Missing, extra, or duplicate categories fail closed.
- `items` has unique `itemId` and normalized `messageType`; every item references exactly one category. The set of selectable item Message Types must equal `supportedMessageTypes` exactly. Missing, extra, duplicate, or internally inconsistent items fail the whole selector closed rather than being silently hidden.
- `items`, `supportedMessageTypes`, API validation, Load Data, Repair and Audit must resolve the same version and SHA. `catalogueSha256` uses RFC 8785 JSON Canonicalization Scheme (JCS), UTF-8 and SHA-256 over exactly `{schemaVersion,catalogueVersion,categories,supportedMessageTypes,items}`. Before JCS, `categories` are ordered by `displayOrder,categoryId`; `supportedMessageTypes` by normalized Message Type using the comparator in §5.3; `items` by category display order then the same Message Type comparator and `itemId`; `supportedFormats` are lexically sorted; direction keys are `inbound,outbound`; explicit `null` values remain present. Producers and an independent QA implementation must recompute the same SHA; any mismatch fails closed.
- Unsupported values are never displayed as selectable options.
- A missing category, description, version or SHA fails closed and shows an actionable popup error; the UI must not substitute hard-coded content.
- INBOUND and OUTBOUND are authorization states over the same `items`; the API must not publish two independent catalogues.
- Direction applicability is metadata on the same item. An inapplicable item remains in the same row and order on both sides but is disabled for that direction with the governed reason exposed accessibly.

The popup shall load the exact pair with `GET /api/rma-authorisations/pair-state?ownBic={bic}&counterpartyBic={bic}` using canonical BIC11 identities. It must not download all RMA rows or deduplicate thousands of records in the browser. A valid canonical bank pair with no RMA records is a successful HTTP 200 response with both directional states set to `ABSENT`; this is the normal ADD starting state. The OAS／TypeScript response contract contains:

- canonical Own BIC and Counterparty BIC, `asOf`, policy version／SHA, and DB logical snapshot identity;
- one state for each of INBOUND and OUTBOUND with explicit `ABSENT` or governed lifecycle status, ACTIVE original Message Types, any open revision Message Types, record ID, version, request type, reservation ID, owner, expiry and optimistic concurrency token; identity fields that do not exist for `ABSENT` are explicitly `null` according to the schema;
- explicit `NOT_FOUND`, `POLICY_SNAPSHOT_MISMATCH`, `STALE_VERSION`, `RESERVATION_CONFLICT`, and governed service-unavailable error responses.

Policy and pair state are usable for editing only when their policy identity and logical snapshot contract match. They may be requested concurrently, but the selector becomes editable only after the complete matched pair is validated. During refresh, previously loaded rows may remain visible read-only; mutation stays disabled. If the policy changes while the popup is open or before Save Draft, the server rejects the staged request as stale with zero writes and the client reloads both policy and pair state.

The typed error envelope is `{code,message,correlationId,retryable,expectedIdentity?,actualIdentity?,fieldErrors?}`. Endpoint status mapping is fixed: malformed request `=400`, unauthenticated `=401`, unauthorized `=403`, truly missing or unresolvable canonical resource `NOT_FOUND=404`, `POLICY_SNAPSHOT_MISMATCH=409`, `STALE_VERSION=409`, `RESERVATION_CONFLICT=409`, well-formed but unsupported／tampered selection `=422`, and governed service unavailable `=503`. HTTP 404 must never represent a valid pair whose directional records are merely absent. Every rejected request produces zero business and audit mutation. A refresh failure keeps the last complete rows visible read-only and disables Reset／Save until a complete matched snapshot returns.

OAS schema tests, shared TypeScript contract tests, service contract tests, and BFF lossless-forwarding tests are mandatory for both endpoints, all status mappings and the typed error envelope. Additive fields remain backward compatible; required identity or consistency fields are not optional to this popup capability.

### 6.1 Generic Page Definition control

The capability is exposed through the additive generic Page Definition control `DIRECTIONAL_MATRIX_SELECT`, not through an RMA-specific template or route branch. It inherits the complete common Page Definition field contract, including stable `fieldId`, submission `path`, label, required／readOnly／visibility, displayOrder／section／columnSpan, constraints and evidence metadata; `valuePath` supplements presentation binding and never replaces submission `path`:

- `dataType`: `DIRECTIONAL_SELECTION_SET`;
- `valuePath`: a typed value containing `policyIdentity`, `snapshotIdentity`, and direction entries with original／proposed sets plus record／version／reservation identity;
- `lookup`: contract-provided governed provider ID and action IDs, same-origin endpoint references only, allowed HTTP methods, canonical request identity parameter paths, response identity paths, record／version／reservation token mappings and typed response／error schemas; absolute, cross-origin or UI-selected endpoints are rejected;
- `presentation`: category collection path, item collection path, left／right direction labels, search capability, minimum matrix width, and shared close capability;
- `readOnly`: contract-driven; when true, the renderer exposes no staged action or reservation call;
- `submission`: stages the typed current-direction value only to the parent form; allowed persistence action is the contract-provided outer direction-specific Save Draft operation.

OAS, shared TypeScript contracts and Page Parameters register this control once. The shared Generic UI renderer maps the control to one reusable directional-matrix component without inspecting RMA, Message Type, endpoint name, category name or family. A synthetic non-RMA Page Definition must render, stage and submit two governed sides without an RMA／message-specific template, CSS fork, endpoint switch or description table; this Open／Closed test is mandatory in addition to parameter-only option tests.

## 7. ADD／EDIT／VIEW behavior (P0)

### 7.1 ADD

- The RMA Index identity remains `Own BIC + Counterparty BIC + Direction`; INBOUND and OUTBOUND are created in separate transactions.
- The direction selected by the parent form is editable and starts unchecked unless governed defaults are later approved. The opposite direction is visible read-only and displays its exact existing ACTIVE state.
- The Maker may select multiple Message Types only for the current direction. No selection creates no RMA record.
- Exact pair state is loaded before input. If the current direction already has ACTIVE or an open `WIP`／`DRAFT`／`PENDING_APPROVAL`／`APPROVED` revision, ADD is rejected with `RMA_INDEX_ALREADY_EXISTS` and zero writes; the opposite direction is never included in the command.

### 7.2 EDIT

- Load and pre-check both directions, but only the current Index direction is editable; the opposite direction is contextual read-only evidence.
- Revise acquires one server WIP reservation for the current direction only. The opposite direction is neither reserved nor modified.
- Existing `WIP`, `DRAFT`, `PENDING_APPROVAL`, or `APPROVED` open revisions block another Revise. Show the governed state and, where applicable, reservation owner／expiry; another Maker cannot modify it.
- Only the current changed direction creates or updates a draft. An unchanged current direction produces zero database writes and no new version.
- The current direction retains its original set and independently calculates `UNCHANGED`, `ADDED`, and `SUPPRESSED`.
- Example per direction: `{MT103, MT202, MT734}` → `{MT103, MT202, MT400}` results in `UNCHANGED={MT103,MT202}`, `ADDED={MT400}`, `SUPPRESSED={MT734}`.
- Removing every Message Type from an existing direction is not an ordinary EDIT. The selector directs the Maker to the explicit `SUPPRESSED` workflow, which requires a reason and Checker approval.

### 7.3 VIEW and Audit

- VIEW and Audit use the same popup and the same policy snapshot in read-only mode.
- Both checked and unchecked governed options remain visible.
- No checkbox, Reset or Save Changes mutation is available in read-only mode; `×`／`Esc` closes the popup.
- VIEW uses the record's effective policy identity. Audit uses the policy snapshot recorded by the event, or an immutable archived policy resolved by its recorded SHA. Historical values removed from the current catalogue remain visible, checked, read-only, and labelled as no longer selectable; they must not disappear or become re-enabled.
- VIEW and Audit make zero mutation and reservation calls. Closing either view never acquires, cancels, or changes WIP.
- Raw JSON may remain diagnostic evidence but is not the primary display.

## 8. Persistence and lifecycle contract (P0)

- The stored identity remains `Own BIC + Counterparty BIC + Direction`; FIN／FINPLUS and Message Types remain collections inside that direction record.
- The popup returns one typed local staged value for the current direction containing policy version／SHA, original and proposed sets, record ID, version, reservation ID and optimistic concurrency token. The opposite direction is read-only and absent from the mutation payload. `Save Changes` performs no network write.
- The outer `Save Draft` invokes one governed direction-specific draft command containing the staged value, DB logical snapshot identity, one idempotency key and one correlation ID.
- The service validates policy identity, current-direction authorization, reservation and concurrency token before writing. Any failure produces zero writes and leaves the opposite direction unchanged.
- Revise is the only point that first acquires the current direction WIP. On successful Save Draft, that WIP is converted to `DRAFT`; Save Draft must never create a first WIP. An unchanged reservation is cancelled/released with evidence and produces no row, version, delta, or business audit write.
- The direction command runs in one database transaction. Failure rolls back its row and associated audit writes.
- Replaying an identical payload with the same idempotency key returns the original outcome and identities without duplicate Draft or audit events. Reusing the key with a different payload fails closed.
- Submit and Checker approval remain direction-specific lifecycle decisions unless BA explicitly approves a future combined approval envelope.
- `×`／`Esc` on the parent revision screen releases the current direction WIP reservation. Any cancellation failure stays visible and fail-closed. The configured five-minute inactivity expiry cancels it with audit evidence; an open popup then becomes read-only and must reload before further editing.
- No popup action directly activates, approves or suppresses an RMA.

## 9. Validation and error states (P0)

- Fail closed when the governed Message policy cannot be loaded or its SHA／version is inconsistent.
- Fail the whole selector closed when category／item identities are missing, duplicated or inconsistent, or when selectable `items` and `supportedMessageTypes` are not the same set.
- Surface loading only when no usable catalogue is available; do not hide already loaded rows during refresh.
- Display an empty-state message for a valid category with no selectable items.
- Display field-level errors for invalid selection state and a popup-level retry action for policy or directional-state load failure.
- Disable Reset and Save Changes while policy／pair state is loading, refreshing, inconsistent or stale. `Save Changes` is local-only and has no network saving phase.
- Detect stale record versions and reservation conflicts before any database write.
- Never silently drop a checked value because of search, tab changes or direction changes.
- Server validation rejects a tampered or unsupported submitted Message Type with zero writes even if the browser is compromised.

## 10. Non-functional requirements

- **Performance:** With at least 6,000 physical RMA rows, the exact bank-pair state query must be server-side and indexed. Acceptance uses a versioned performance profile bound to code, policy and DB logical snapshot: cold means the first request after process／reload; hot means subsequent requests against the same immutable snapshot; at least 30 cold and 100 hot samples are required; report p50, p95, max and maximum payload bytes. The initial development absolute budget is p95 ≤ 1 second and payload ≤ 512 KiB, and p95 may regress no more than 10% from the latest accepted baseline. Both absolute and relative gates must pass. Query-plan／index evidence and proof of zero browser／BFF full-table fetches require DBA／QA sign-off; missing profile, baseline, samples or percentile evidence is `NOT_ACCEPTED`.
- **Reliability:** Directional Save Draft is all-or-nothing and idempotent for a repeated identical request.
- **Security:** Existing Maker／Checker authorization, actor identity and separation-of-duty rules apply. The server trusts no privileged client claim: an unauthorized actor or client-supplied approval／status transition is rejected with zero row and audit mutation.
- **Auditability:** Record policy version／SHA, original and proposed selections, both direction record IDs, correlation ID, actor and timestamp.
- **Accessibility:** Focus enters the popup, remains trapped while open, returns to the opening control on close, and all tabs／checkboxes／actions are keyboard operable.
- **Accessibility:** Tabs expose `tablist`／`tab` roles, `aria-selected`, and arrow-key navigation. Checkbox names contain direction, Message Type and description; errors use an appropriate live region. The 48×48 close target, focus return, 200% zoom, high-contrast and reduced-motion behavior are verified.
- **Responsive layout:** INBOUND remains on the left and OUTBOUND on the right at every supported viewport. The minimum supported viewport is 1024 CSS px; below the matrix minimum width, the popup uses horizontal scrolling rather than vertical stacking.
- **Maintainability:** One shared generic selector component; no Message-family-specific template, CSS fork or hard-coded option list.

## 11. QA acceptance matrix

| ID          | Given                                                                                              | When                                                           | Then                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| RMA-SEL-001 | A controlled canonical-pair fixture has known independent INBOUND and OUTBOUND states              | Maker opens Message Types                                      | Both columns load their independent checked states from the bound fixture snapshot                                                           |
| RMA-SEL-002 | A governed category is selected                                                                    | Popup renders                                                  | Both columns contain the same sorted Message rows and descriptions                                                                           |
| RMA-SEL-003 | Maker changes the current direction                                                                | Maker selects Save Changes                                     | Parent form shows the current-direction staged summary; database writes remain zero                                                          |
| RMA-SEL-004 | Current-direction selections are staged                                                            | Maker presses parent Save Draft                                | Only the current direction draft is written; the opposite direction is unchanged                                                             |
| RMA-SEL-005 | Current direction has a stale version or conflict                                                  | Save Draft is attempted                                        | Entire command fails and neither direction changes                                                                                           |
| RMA-SEL-006 | Popup selections were changed                                                                      | Maker presses `×`, `Esc`, or backdrop                          | Both directions revert to the opening snapshot; zero mutation／reservation-cancel calls are sent and parent-owned WIPs remain intact         |
| RMA-SEL-007 | Popup selections were changed                                                                      | Maker presses Reset                                            | Both directions revert without closing or writing                                                                                            |
| RMA-SEL-008 | Search or tab changes hide selected rows                                                           | Maker returns to the row                                       | Checked state is preserved                                                                                                                   |
| RMA-SEL-009 | Valid policy omits an unsupported Message Type                                                     | Popup renders                                                  | Unsupported item is absent from both columns; a tampered submission containing it is rejected server-side with zero writes                   |
| RMA-SEL-010 | Policy version／SHA is missing or mismatched                                                       | Popup opens                                                    | Selector fails closed with an actionable error and no editable list                                                                          |
| RMA-SEL-011 | VIEW or Audit opens the selector                                                                   | User inspects either direction                                 | Same matrix is read-only; checked and unchecked values are visible                                                                           |
| RMA-SEL-012 | Another Maker owns an unexpired WIP                                                                | User opens EDIT                                                | Conflict owner／expiry is shown and mutation is disabled                                                                                     |
| RMA-SEL-013 | Popup is open                                                                                      | Keyboard-only user navigates                                   | Tabs, search, checkboxes, Reset, Save Changes and close are operable with visible focus                                                      |
| RMA-SEL-014 | Governed category contains zero items                                                              | Category is selected                                           | Governed empty state appears in both-direction area without an invented option                                                               |
| RMA-SEL-015 | The reference screenshot contains MT5xx samples not in policy                                      | Popup renders                                                  | No sample MT5xx is introduced                                                                                                                |
| RMA-SEL-016 | ADD current direction has no selection or one/more selections                                      | Save Draft is attempted                                        | No selection creates zero records; selections create only the current direction                                                              |
| RMA-SEL-017 | ADD current direction already exists                                                               | Maker attempts Save Draft                                      | Request fails with `RMA_INDEX_ALREADY_EXISTS`; opposite direction remains unchanged                                                          |
| RMA-SEL-018 | EDIT opens for one Index direction                                                                 | Revise begins                                                  | Only that direction's WIP reservation is acquired before input is enabled                                                                    |
| RMA-SEL-019 | Any direction is WIP／DRAFT／PENDING_APPROVAL／APPROVED-open                                       | Another Maker selects Revise                                   | Edit is blocked with governed state; no partial reservation remains                                                                          |
| RMA-SEL-020 | Parent editor owns the current direction WIP                                                       | `×`／`Esc`, cancellation failure, or five-minute expiry occurs | It is released with evidence, or failure remains visible／locked; expiry makes the popup read-only                                           |
| RMA-SEL-021 | EDIT makes no set change                                                                           | Save Draft is attempted                                        | Zero row, version, delta and business-audit writes occur                                                                                     |
| RMA-SEL-022 | EDIT clears an existing direction                                                                  | Maker tries Save Changes／Save Draft                           | Ordinary EDIT is rejected and explicit SUPPRESSED workflow with reason is required                                                           |
| RMA-SEL-023 | Policy and pair state SHA／snapshot differ or change while open                                    | Popup opens／Save Draft occurs                                 | Mutation is disabled or request is rejected stale with zero writes; both resources reload                                                    |
| RMA-SEL-024 | Policy has missing／extra／duplicate category or item, or set mismatch                             | Popup loads                                                    | Entire selector fails closed; no inconsistent partial list is shown                                                                          |
| RMA-SEL-025 | Failure is injected during current-direction persistence                                           | Save Draft runs                                                | Transaction rolls back the current direction row and its audit writes; opposite direction is unchanged                                       |
| RMA-SEL-026 | Same idempotency key is replayed                                                                   | Payload is identical／different                                | Identical replay returns original IDs without duplicates; different payload fails closed                                                     |
| RMA-SEL-027 | Maker and Checker identities are exercised                                                         | Direction draft is submitted／approved                         | Maker ≠ Checker is enforced; Checker sees Request Type and per-direction UNCHANGED／ADDED／SUPPRESSED                                        |
| RMA-SEL-028 | Audit event references an archived policy and retired value                                        | Auditor opens selector                                         | Event policy is resolved by SHA; retired value remains visible, checked and read-only; zero mutation calls occur                             |
| RMA-SEL-029 | A synthetic governed parameter adds or renames an option                                           | Popup renders without UI source changes                        | Both directions render the new governed content in identical canonical order                                                                 |
| RMA-SEL-030 | Popup renders at desktop and 1024 CSS px, 200% zoom and high contrast                              | Visual／accessibility regression runs                          | Columns stay left／right with horizontal scroll if needed; focus, names, live regions and keyboard behavior pass                             |
| RMA-SEL-031 | RMA Index contains two and more-than-two Message Types                                             | Index renders                                                  | Exactly two lines have no ellipsis; more than two shows only first two plus `...` on line three                                              |
| RMA-SEL-032 | Performance profile uses the bound 6k+ row snapshot                                                | Cold／hot samples run                                          | Sample, percentile, payload, absolute／relative budget, query plan and no-full-table gates all pass                                          |
| RMA-SEL-033 | Correlated INBOUND and OUTBOUND drafts await Checker                                               | Checker approves one and rejects／later re-submits the other   | Each direction has independent status and events; sibling status is unchanged and no combined approval side effect occurs                    |
| RMA-SEL-034 | One governed item is applicable only to one direction                                              | Popup renders and staging／tampering is attempted              | Identical row/order remains on both sides; only the inapplicable side is disabled with an accessible reason; it cannot be staged server-side |
| RMA-SEL-035 | Unauthorized actor or client-supplied approval／status is submitted                                | Server handles the request                                     | Authorization／transition is rejected with zero row and audit mutation                                                                       |
| RMA-SEL-036 | Each typed endpoint error is injected, including refresh failure                                   | Policy／pair-state request runs                                | HTTP status and envelope match §6; cached rows remain read-only and Reset／Save stay disabled until a matched snapshot returns               |
| RMA-SEL-037 | Synthetic non-RMA Page Definition uses `DIRECTIONAL_MATRIX_SELECT`                                 | Generic UI renders, stages and submits                         | Capability works without RMA／message-specific template, CSS, endpoint switch, description table or production source branch                 |
| RMA-SEL-038 | Policy SHA is produced and independently recomputed                                                | Canonical fields, arrays, Unicode, number and null cases run   | RFC 8785／JCS SHA matches; any field, order or content mismatch is detected and fails closed                                                 |
| RMA-SEL-039 | Canonical bank pair is valid but neither direction has an RMA record                               | Pair state is requested for ADD                                | HTTP 200 returns INBOUND=`ABSENT` and OUTBOUND=`ABSENT` with schema-defined null record identities; ADD remains available                    |
| RMA-SEL-040 | Canonical resource is missing／unresolvable, actor lacks access, or payload is malformed／tampered | Pair-state or command request runs                             | True missing resource=404, unauthenticated=401, unauthorized=403, malformed=400, unsupported／tampered=422; all failures make zero writes    |
| RMA-SEL-041 | Generic control contract is inspected and a cross-origin lookup is injected                        | Page Definition is validated                                   | Stable `fieldId` and submission `path` are preserved; same-origin provider/action identity mapping passes; cross-origin lookup fails closed  |
| RMA-SEL-042 | Policy response omits or changes `schemaVersion`                                                   | Policy is validated and SHA independently recomputed           | Required version participates in JCS; missing／unsupported version or SHA mismatch fails closed                                              |

QA evidence must preserve the UI screenshot, code／OAS／TypeScript contract／policy／fixture／browser build／DB logical snapshot SHAs, exact directional-state response, before／after DB snapshot SHA, request correlation ID and audit-event IDs. Development counts in §1 are illustrative only; acceptance uses controlled fixtures with immutable identities.

## 12. Success metrics

- 100% of supported policy items have one governed category and official description.
- 100% parity between INBOUND and OUTBOUND rendered catalogues for the same policy SHA.
- Zero browser-side full-table RMA downloads for popup initialization.
- Zero partial two-direction writes under injected validation, stale-version and concurrency failures.
- Zero unsupported Message Types displayed or persisted.
- 100% pass for the QA acceptance matrix above before release.

## 13. BA／QA blocking confirmations

The completed first review cycle and Product Owner authorization to begin a new three-round cycle are recorded below. This Cycle 2 Round 1 candidate incorporates the three unresolved BA contract points. BA and QA must confirm the same artifact SHA.

| Decision                                                                     | Governed ruling                                                                                                                                                                        | BA Cycle 2 | QA Cycle 2 |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------- |
| Category metadata source and assignment for every currently supported MT／MX | Add governed `categories[]`, item `categoryId`, description, formats, applicability and deterministic order to the shared policy; never infer in UI                                    | `PENDING`  | `PENDING`  |
| Two-direction Save Draft consistency                                         | Atomically reserve editable existing directions at Revise; use one idempotent transactional pair command; any direction failure rolls back both; Save Draft only converts WIP to DRAFT | `PENDING`  | `PENDING`  |
| EDIT removing every Message Type from an existing direction                  | Reject ordinary EDIT and require explicit SUPPRESSED workflow with reason and Checker approval                                                                                         | `PENDING`  | `PENDING`  |
| Checker approval granularity                                                 | Preserve separate approval per canonical bank-direction record; shared correlation is evidence only                                                                                    | `PENDING`  | `PENDING`  |
| Implementation start gate                                                    | Start only after data-remediation Gate 2 and this exact spec SHA receive BA／QA PASS                                                                                                   | `PENDING`  | `PENDING`  |
| Generic field identity and lookup boundary                                   | Inherit stable `fieldId` and submission `path`; use same-origin governed provider／action lookup with canonical identity mapping                                                       | `PENDING`  | `PENDING`  |
| Catalogue schema identity                                                    | Require `schemaVersion` in response／OAS／TS contract and include it in the reproducible JCS input                                                                                     | `PENDING`  | `PENDING`  |
| Empty ADD pair and HTTP semantics                                            | Valid empty pair returns 200 with two `ABSENT` states; reserve 404 for missing resource and use governed 400／401／403／409／422／503 mappings                                         | `PENDING`  | `PENDING`  |

## 14. Decision log

| Decision                                                          | Alternatives considered                       | Reason                                                                            |
| ----------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| Preserve the current RMA page and change only Message Types popup | Full RMA page redesign                        | Previously confirmed scope and lower regression risk                              |
| Fixed INBOUND-left／OUTBOUND-right matrix                         | Direction dropdown; vertically stacked panels | Direct comparison and previously approved visual contract                         |
| One shared governed catalogue                                     | Separate direction lists; UI inference        | Prevents drift and enforces parameter-driven behavior                             |
| Parent Save Draft remains persistence boundary                    | Save directly from popup                      | Preserves Maker workflow and prevents accidental writes                           |
| Physical rows remain direction-specific                           | Merge directions into one DB row              | Existing canonical index and no approved schema migration                         |
| Exact server-side bank-pair query                                 | Download and browser filtering                | Performance, determinism and data-governance requirement                          |
| API-owned canonical ordering                                      | Independent browser sorting                   | One deterministic sequence shared by both directions and all consumers            |
| Atomic pre-edit WIP reservations                                  | First reservation at Save Draft               | Enforces the existing multi-user maintenance Memory and prevents concurrent edits |
| Historical Audit policy by recorded SHA                           | Reinterpret with current policy               | Preserves governed evidence and retired values                                    |

## 15. Review log

| Round | Reviewed artifact                                                      | Required Memory read by participants                                                       | BA outcome         | QA outcome         | Disposition                                                                                                                                                                                      |
| ----- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Initial 2026-09-17 Draft                                               | RMA Index／Message Scope; SSI Maintenance Workflow; MT347 OAS／Page Parameters UI Standard | `CHANGES_REQUIRED` | `CHANGES_REQUIRED` | WIP lifecycle, governed categories／contracts, snapshot consistency, audit history, idempotency, accessibility, responsive, performance and QA cases incorporated into Round 2 candidate         |
| 2     | SHA `86AD7A7B951412FD63D05FE7520DD7B88CF7AA189210AFDF6472520937421439` | Same three current Memory files                                                            | `PASS`             | `CHANGES_REQUIRED` | Generic Page Definition control, reproducible SHA, independent Checker outcomes, direction applicability, popup-cancel calls, HTTP error envelope, and authorization tampering added for Round 3 |
| 3     | SHA `BF1220C13AE0943F2BB2A34BCC7E44915C272348B5006F0192EF7E73252FEC3A` | Same three current Memory files                                                            | `CHANGES_REQUIRED` | `PASS`             | First cycle closed at its three-round limit; unresolved field contract, schemaVersion／JCS and empty-pair HTTP semantics recorded for Product Owner                                              |

## 16. Review Cycle 2 log

| Round | Reviewed artifact                                          | Required Memory read by participants | BA outcome | QA outcome | Disposition      |
| ----- | ---------------------------------------------------------- | ------------------------------------ | ---------- | ---------- | ---------------- |
| 1     | Exact SHA recorded in the adjacent Cycle 2 Round 1 sidecar | Same three current Memory files      | `PENDING`  | `PENDING`  | Do not implement |

Every reviewer must review the identical Cycle 2 artifact SHA. Any content change requires the next numbered round. If Cycle 2 Round 3 does not receive PASS, stop and escalate unresolved questions to the Product Owner.
