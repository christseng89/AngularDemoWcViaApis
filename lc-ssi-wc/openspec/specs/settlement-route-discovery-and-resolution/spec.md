## Purpose

Define the two-stage discovery and resolution contract for complete, version-bound settlement routes.

## Requirements

### Requirement: Complete Route Discovery

**Requirement ID:** SRR-001

The service SHALL discover eligible complete routes for the governed message, scenario, currency, booking entity and value-date context, and each selectable route SHALL atomically bind the applicable SSI, applicability, Nostro and required RMA identities.

#### Scenario: Eligible route candidates exist

**Scenario ID:** SRR-001-S01

- **WHEN** a context-complete route lookup is requested
- **THEN** the service SHALL return only eligible complete route candidates
- **AND** SHALL bind each candidate to a context hash and eligibility snapshot

#### Scenario: Multiple candidates exist

**Scenario ID:** SRR-001-S02

- **WHEN** more than one eligible complete route exists without one authorised default
- **THEN** the service SHALL require selection of one complete route identity
- **AND** MUST NOT let a client combine SSI, Nostro or RMA parts from different candidates

### Requirement: Snapshot-bound Resolution

**Requirement ID:** SRR-002

Resolution MUST revalidate the submitted context, definition, fixture, selected route versions and eligibility snapshot before returning a resolved route.

#### Scenario: Unchanged selected route

**Scenario ID:** SRR-002-S01

- **WHEN** the selected route and all bound identities still match the submitted snapshot and context
- **THEN** the service SHALL return one atomic settlement route and its provenance

#### Scenario: Stale selected route

**Scenario ID:** SRR-002-S02

- **WHEN** a selected identity, version, context hash or snapshot no longer matches
- **THEN** the service MUST return a structured stale outcome
- **AND** MUST NOT substitute another route or create an executable output

### Requirement: Ambiguity and Data-quality Fail Closed

**Requirement ID:** SRR-003

The service MUST fail closed when no eligible route exists, multiple equally ranked routes remain, or required route data is incomplete or inconsistent.

#### Scenario: Ambiguous route

**Scenario ID:** SRR-003-S01

- **WHEN** governed selection leaves multiple equally ranked eligible routes
- **THEN** the service MUST return an ambiguity outcome
- **AND** MUST NOT choose by record order, identifier, version or creation time

#### Scenario: No complete route

**Scenario ID:** SRR-003-S02

- **WHEN** required SSI, applicability, Nostro or authorisation data cannot form a complete eligible route
- **THEN** the service MUST return a structured non-success outcome
- **AND** MUST NOT generate or confirm a settlement instruction
