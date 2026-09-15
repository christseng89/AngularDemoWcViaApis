# Change Request — MT347 Complete UI UAT Coverage

## Control

- Request ID: `CR-MT347-UI-001`
- Submitted: `2026-09-13` (Asia/Shanghai)
- Status: `APPROVED TO ENTER DEVELOPMENT — BA APPROVED / QA CONDITIONS INCORPORATED`
- Target environment: `DEVELOPMENT / DEMO`
- Controlled requirements: `MT347_SR2026_SSI_TDD_CONTROLLED_v5.xlsx`
- Knowledge baseline: `memory/swift-mt347-v2.md`
- Reference evidence: `JOINT-BA-QA-MT347-FINAL-REPORT-20260912.md`

## Business reason

MT347 has 362 controlled cases: 152 positive, 208 negative and 2 boundary. The current Trade Finance UI exposes only the default sequence for each message, so 91 positive cases are UI-executable, 61 non-default-sequence positive cases have API evidence only, and no negative, boundary or NVR case has UI execution evidence. BA and QA cannot declare MT347 complete until the governed cases are executable from the browser against the correct positive or isolated-negative fixture and validator.

## Requested change

Add governed Message Sequence, Business Scenario and Test Polarity selection to Trade Finance SSI Resolution in Development/Demo.

1. After selecting an MT message, show only the sequences and positive, negative or boundary scenarios defined by TDD v5 for that message.
2. Selecting a scenario must load its exact controlled `bindingId`; do not infer a different SSI route from display text.
3. Populate currency, booking entity, value date and controlled transaction-context inputs from the selected fixture.
4. Display sequence-qualified 5x results, including resolved values, `NOT_REQUIRED`/omission decisions, ownership, provenance, rule ID and snapshot identity.
5. Prevent stale responses from a previous message, sequence or scenario from replacing the current result.
6. Preserve the existing reference-only boundary: no payment release, accounting entry or FIN message transmission.
7. Keep non-executable or out-of-scope message types absent from the selectable catalogue.
8. Provide a Development/Demo-only controlled UAT mode for negative and boundary cases; production operation must not expose test fixtures.
9. Execute negative fixtures in an isolated transaction/sandbox and roll back after each case; never import negative fixtures into the canonical positive database.
10. Route SSI-owned NVRs to the SSI field-resolution validator and full-FIN NVRs to the actual upstream FIN validator. The UI must show the validation owner and MRG rule key.
11. Before implementing the automated runner, publish a controlled TDD successor or controlled companion adjudication that corrects TDD v5's SSI-side HTTP 422 expectation for the 41 upstream-owned full-FIN NVR cases.
12. In non-Development/Demo environments, do not expose or permit access to the controlled case catalogue, fixture binding, isolated negative runner or Development UAT mode; retain executable rejection evidence.

## Architecture constraints

- Mandatory data flow: `Configuration / DB -> API -> Page parameter model -> Generic UI`.
- The API contract is the single source of truth for message type, sequence, scenario, polarity, field schema, selectable values, validation rules, fixture identity and execution ownership.
- The page layer may only map the API response into a typed parameter/view model; it must not duplicate, reinterpret or infer business rules.
- The UI may only render the parameter model, collect input, submit the typed request and present the returned result/evidence.
- Do not hard-code MT types, sequences, 5x fields, business scenarios, polarity cases, fixture bindings or case-specific conditions in Angular components, templates or client services.
- Adding or correcting a message, sequence, scenario or fixture must require configuration/DB change plus Reload DB only; it must not require an Angular source-code change.
- Reuse the controlled fixture catalogue/API; no duplicate scenario table in the Angular component.
- Separate catalogue retrieval, scenario selection, request construction and result presentation.
- Use typed contracts, Angular Signals/computed state and `OnPush` change detection.
- Shared sequence/scenario logic must be reusable by future MT families.
- Follow OOD/OOP/SOLID and fail closed when a fixture identity is missing, duplicated or inconsistent.
- Canonical positive fixtures remain reloadable; negative fixtures must not be loaded into the normal Development database.

## Acceptance criteria

- [ ] Architecture tests prove the runtime path is `Configuration / DB -> API -> Page parameter model -> Generic UI`, with no client-side duplicate catalogue or case-specific business-rule table.
- [ ] Reloading corrected configuration/DB changes the API-provided page parameters and UI catalogue without an Angular rebuild or source-code change.
- [ ] Static review confirms Angular code contains no hard-coded MT347 message, sequence, 5x-field, scenario, polarity, fixture-binding or test-case decision table.
- [ ] All 25 in-scope MT347 message types expose every governed positive sequence/scenario from TDD v5.
- [ ] Existing 91 UI-executable positive cases remain PASS.
- [ ] The missing 61 positive cases become browser-executable.
- [ ] Browser result is `152/152 PASS`, `0 FAIL`, `0 SKIPPED`, with case-level evidence.
- [ ] All 208 negative and 2 boundary cases are selectable and executed from the Development/Demo UAT UI.
- [ ] The 169 SSI API-owned negative/boundary cases conserve exactly as 74 governed HTTP 422 plus 95 Development/Demo HTTP 409 results and generate no settlement payload.
- [ ] Unit/integration evidence proves the same 95 DATA_QUALITY conditions return structured HTTP 500 outside Development/Demo.
- [ ] All 48 NVR-labelled cases are executed: 7 through the SSI API and 41 through the upstream full-FIN validator.
- [ ] Every NVR result records validation owner, exact MRG rule key, actual validation response and evidence—not a static or inferred PASS.
- [ ] Negative execution leaves the canonical positive database and logical snapshot unchanged.
- [ ] Every one of the 362 unique `testCaseId` values has a complete machine oracle: unique expected HTTP/validator outcome, exact resolved and omitted fields, provenance, rule, owner and `payloadGenerated`; no case may rely on HTTP 200, DOM success or manual adjudication alone.
- [ ] The result ledger contains exactly 362 unique cases with no duplicate or missing identity and proves `152 + 208 + 2 = 362`, `169 + 41 = 210` and `7 + 41 = 48` without double counting the 7 SSI-owned NVR cases.
- [ ] Each isolated negative execution records sandbox/transaction/rollback identity, before/after logical snapshot, and suite-level database hash and row-count conservation.
- [ ] Each upstream NVR case records one correlation chain from UI action to full FIN payload, validator identity/version, request/response hashes, exact MRG rule key and actual rejection.
- [ ] Production-protection tests prove controlled UAT routes and data return a structured refusal outside Development/Demo.
- [ ] Every result records `testCaseId`, `bindingId`, HTTP status, resolved/omitted 5x fields, provenance and logical snapshot hash.
- [ ] Browser and API evidence use the same canonical seed and logical snapshot.
- [ ] Stale/race tests cover rapid message, sequence and scenario changes.
- [ ] Keyboard operation and accessible names are available for all new selectors.
- [ ] Lint, typecheck, production build and unit/integration tests pass.
- [ ] Aggregate executable line coverage remains greater than 95%.
- [ ] The coverage evidence names the tool, included source scope and covered/total line denominator; Sonar new-code coverage is reported as a separate metric.
- [ ] SonarQube Quality Gate is `OK`; Critical = 0; Major = 0; duplication remains below 1%.

## Acceptance boundary

This request includes the 61-case positive UI-entry gap, all controlled negative/boundary UI execution and NVR validation evidence. It does not move full-FIN NVR ownership into the SSI resolver: the UI must invoke and display the upstream validator result for the 41 upstream-owned cases. If that validator is unavailable, those cases remain `BLOCKED` and this change request cannot be finally accepted.

## Required approval

- BA: confirm the message/sequence/scenario catalogue, positive output, negative result and NVR rule semantics against SWIFT MRG and Memory v2; after implementation, execute the governed UI cases with QA.
- Development: confirm implementation ownership and reusable UI/API design.
- QA: confirm the browser evidence schema; jointly with BA execute all 152 positive, 208 negative and 2 boundary cases after deployment to Development, then publish one joint BA/QA report containing executed/pass/fail/blocked counts and case-level evidence.
