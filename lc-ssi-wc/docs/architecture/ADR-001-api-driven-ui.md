# ADR-001: API-Driven Parameterized UI

## Status

Accepted — mandatory for the entire `lc-ssi-wc` repository.

## Context

`lc-ssi-wc` supports multiple SWIFT message families, sequences, business scenarios, positive and negative fixtures, and environment-specific validation behavior. Duplicating those rules in Angular creates multiple sources of truth, requires source changes for configuration changes, and violates the repository's OOD/OOP/SOLID requirements.

## Decision

The only permitted runtime data flow is:

`Controlled SWIFT/ISO source -> Controlled OAS/Typed Contract + Parameters/DB -> Domain Policy/API -> Page Definition -> Generic UI -> Execution -> Structured Result`

1. Controlled OAS and typed contracts define the exchange structure and capabilities. Controlled parameters and database records define versioned message/scenario content, selectable values, fixture identities and source evidence.
2. Domain policy and the API adjudicate applicability, ownership, eligibility, defaults, ranking, in-scope SSI-tag NVRs and execution behavior, then return a versioned Page Definition.
3. The page layer performs a mechanical mapping from the API contract to a typed parameter/view model. It must not infer or recreate business rules.
4. The UI renders the parameter model, collects user input, follows metadata-declared lookup/execution endpoints, submits a typed request and presents the structured result and evidence.
5. A configuration or test-data correction is deployed by updating controlled parameters/data and reloading the database. It must not require an Angular source change or rebuild.

ISO 20022, CBPR+ Usage Guidelines and mapping sources apply only to an approved MT-to-MX family. MT347 records them as `N/A` with a reason. MT347 remains executable for SSI reference resolution while `paymentExecutable=false`; it does not create payment, MT/MX, confirmed-resolution or Repair Queue side effects.

This decision applies to MT2, `pacs.009` plain/COV/ADV profiles, MT347 and every future message family in `lc-ssi-wc`. For MT2-to-MX processing, the API contract selects the profile from governed business context and BAH `BizSvc`; the UI must not infer a profile from an MT code or `MsgDefIdr`.

## Prohibited implementations

- Hard-coded message-type, sequence, tag/field, scenario or polarity catalogues in Angular components, templates or client services.
- Case-specific `if`, `switch`, lookup tables or fixture bindings in the UI.
- Client-side copies of API/DB business rules, eligibility rules, validation rules or expected outcomes.
- Treating display text, DOM state or HTTP success alone as a business oracle.
- Loading isolated negative fixtures into the canonical positive database.

Static presentation concerns such as labels, layout, colour tokens and accessibility text may remain in the UI. They must not determine SSI business behavior.

## OOD/OOP/SOLID boundaries

- Catalogue repository/client: retrieves the versioned API contract.
- Parameter-model mapper: converts the contract without business inference.
- Generic form renderer: renders schema-defined controls.
- Resolution runner: submits typed requests to the owner selected by the API.
- Evidence presenter/collector: displays and records returned results without re-adjudication.

Each responsibility has one reason to change. Message-family extensions must use the same abstractions rather than add parallel components or duplicated decision tables.

## Acceptance and enforcement

- Contract tests prove configuration/DB values are exposed unchanged through the API.
- Component tests prove arbitrary API-provided messages, sequences and fields render without adding client constants.
- Architecture/static tests reject client-side MT/sequence/scenario/fixture decision tables.
- Reload tests prove corrected configuration changes the API-provided page parameters and UI without an Angular source change or rebuild.
- Browser tests execute governed positive, negative, boundary and NVR cases using API-provided identities and machine oracles.
- Lint, typecheck, build, coverage and SonarQube gates remain mandatory.

## Trade-offs

- The API contract becomes broader and must be versioned carefully.
- The generic renderer and contract tests require initial engineering effort.
- UI behavior depends on API metadata quality.

These costs are accepted because they preserve a single source of truth, make Reload DB meaningful, prevent drift, and allow future message families to be added without duplicating UI code.

## Revisit trigger

Revisit only if a documented regulatory, security or accessibility requirement cannot be represented by the typed API contract. Any exception requires a new ADR and BA/architecture approval; it must not be introduced as an ad hoc UI condition.
