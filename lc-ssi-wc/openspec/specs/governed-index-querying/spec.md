## Purpose

Define the currently evidenced server-side query contract for governed maintenance and resolution-definition indexes. Checker, Audit and SWIFT-data client-side pagination/sorting are outside this proven baseline and are recorded as discrepancies.

## Requirements

### Requirement: Validated Page Request

**Requirement ID:** GIQ-001

An index implemented through the governed server-page contract SHALL validate page, page size, search and sort inputs and SHALL return page metadata with only the selected page projection.

#### Scenario: Valid server-page query

**Scenario ID:** GIQ-001-S01

- **WHEN** a client requests a supported governed index with valid page, page-size, search and sort values
- **THEN** the service SHALL return the selected page and its page, page-size, total-items, total-pages and navigation metadata

#### Scenario: Invalid page or sort input

**Scenario ID:** GIQ-001-S02

- **WHEN** a page, page-size, sort field or sort direction is outside the allow-listed contract
- **THEN** the service MUST reject or normalise the request according to the shared pagination policy
- **AND** MUST NOT interpolate an arbitrary sort expression into database queries

### Requirement: Stable Server Ordering

**Requirement ID:** GIQ-002

For indexes using the governed server-page contract, server ordering SHALL use an allow-listed business field and direction plus a deterministic unique tie-breaker.

#### Scenario: Equal primary sort values

**Scenario ID:** GIQ-002-S01

- **WHEN** two records have the same selected primary sort value
- **THEN** the server SHALL apply the governed unique tie-breaker
- **AND** repeated requests against an unchanged snapshot SHALL preserve cross-page order

### Requirement: Resolution-definition Index Projection

**Requirement ID:** GIQ-003

The resolution-definition index SHALL return a typed projection for the requested standards release and optional supported business domain and MUST reject an invalid domain filter.

#### Scenario: Definition-index query

**Scenario ID:** GIQ-003-S01

- **WHEN** a client requests the definition index with a supported filter
- **THEN** the service SHALL return the governed index envelope without requiring full page definitions
