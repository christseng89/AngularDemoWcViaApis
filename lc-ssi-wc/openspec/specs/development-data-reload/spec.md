## Purpose

Define the implemented development-data reload lifecycle and its environment, authorisation, mutation-barrier, backup, restore and evidence boundaries. The current OAS does not yet cover the principal reload operations and that gap is recorded separately.

## Requirements

### Requirement: Environment and Authorisation Gate

**Requirement ID:** DDR-001

Development-data reload operations MUST be available only when the server-authoritative runtime environment permits them and MUST require successful server-side authorisation before mutation begins.

#### Scenario: Authorised development reload

**Scenario ID:** DDR-001-S01

- **WHEN** an authorised request is made in a permitted development or demo environment
- **THEN** the service SHALL issue or accept the governed reload authorisation and allow the reload lifecycle to proceed

#### Scenario: Disallowed environment or credentials

**Scenario ID:** DDR-001-S02

- **WHEN** the runtime environment is not permitted or server-side authorisation fails
- **THEN** the service MUST reject the operation
- **AND** MUST NOT expose the configured control secret or begin data mutation

### Requirement: Protected Reload Mutation

**Requirement ID:** DDR-002

Reload SHALL use the process-wide mutation coordinator, wait for in-flight writes, create a logical backup of the active database, apply the server-controlled dataset, and restore the prior database if the reload fails.

#### Scenario: Reload succeeds

**Scenario ID:** DDR-002-S01

- **WHEN** an authorised reload validates and imports successfully
- **THEN** the service SHALL complete the mutation under the maintenance barrier
- **AND** SHALL return the resulting reload status and runtime evidence

#### Scenario: Reload fails

**Scenario ID:** DDR-002-S02

- **WHEN** validation, import or post-import processing fails
- **THEN** the service MUST restore the prior logical database state
- **AND** MUST return a structured failure rather than a success status

### Requirement: Reload Cancellation and Evidence

**Requirement ID:** DDR-003

The service SHALL expose governed reload cancellation and runtime-evidence operations and SHALL record reload lifecycle outcomes for audit without requiring the ordinary Settings view to expose database identity details.

#### Scenario: Cancel an authorised pending reload

**Scenario ID:** DDR-003-S01

- **WHEN** a valid cancellation targets a cancellable reload authorisation or pending lifecycle
- **THEN** the service SHALL cancel it and prevent an unauthorised later mutation

#### Scenario: Request development evidence

**Scenario ID:** DDR-003-S02

- **WHEN** an authorised development evidence request is made
- **THEN** the service SHALL return the controlled runtime evidence projection
- **AND** SHALL keep control secrets out of the response
