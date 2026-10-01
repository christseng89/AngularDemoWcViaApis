## Purpose

Define the versioned Page Parameter contract used to describe SSI resolution pages, scenarios, governed lookups, execution and evidence without message-specific UI rules.

## Requirements

### Requirement: Versioned Resolution Definition

**Requirement ID:** RPC-001

The service SHALL return a versioned resolution-page definition containing source identity, profile and display identity, fields, scenario policies, validation rules, fixture binding and execution metadata for a requested governed context.

#### Scenario: Supported definition query

**Scenario ID:** RPC-001-S01

- **WHEN** a client requests a supported standards release, message family, message type, direction and optional business context
- **THEN** the service SHALL return a definition envelope conforming to the typed Page Parameter contract
- **AND** the response SHALL contain the identities required for a later submission

#### Scenario: Unsupported or ambiguous definition query

**Scenario ID:** RPC-001-S02

- **WHEN** the requested context is invalid, unsupported or cannot identify one governed definition
- **THEN** the service MUST reject the query with a structured failure
- **AND** MUST NOT fabricate a fallback definition

### Requirement: Governed Definition Index

**Requirement ID:** RPC-002

The service SHALL expose an index projection of executable and reference-only definitions and SHALL validate any supplied business-domain filter against the typed contract.

#### Scenario: Filter by supported business domain

**Scenario ID:** RPC-002-S01

- **WHEN** a client requests the definition index for a supported business domain
- **THEN** the service SHALL return only the matching governed projection

#### Scenario: Invalid business domain

**Scenario ID:** RPC-002-S02

- **WHEN** a client supplies a business domain outside the supported contract values
- **THEN** the service MUST reject the request with `PAGE_BUSINESS_DOMAIN_INVALID`

### Requirement: Metadata-directed Lookup Contract

**Requirement ID:** RPC-003

Each governed lookup SHALL use the provider, action, endpoint, dependencies, target role and identity metadata declared by the Page Parameter contract, and its response SHALL bind candidates to the submitted context and eligibility snapshot.

#### Scenario: Context-complete lookup

**Scenario ID:** RPC-003-S01

- **WHEN** a client submits the declared lookup dependencies for a supported scenario
- **THEN** the service SHALL return eligible candidates with stable identities and snapshot metadata
- **AND** any default selection SHALL be explicitly identified by the service

#### Scenario: Missing or stale lookup identity

**Scenario ID:** RPC-003-S02

- **WHEN** required dependency or snapshot identity is missing or stale
- **THEN** the service MUST fail closed with a structured reason
- **AND** MUST NOT synthesize a candidate or default
