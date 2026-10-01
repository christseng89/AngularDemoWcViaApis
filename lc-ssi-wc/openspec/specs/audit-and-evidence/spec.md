## Purpose

Define observable audit-event, retention-health and resolution-evidence contracts without asserting an unresolved retention schedule or server-side paging contract for the current Audit UI.

## Requirements

### Requirement: Resource Audit Events

**Requirement ID:** AE-001

The service SHALL expose recorded lifecycle events for governed resources, and the Audit workbench SHALL present event identity, resource context, action and available actor/timestamp details without rewriting the event payload.

#### Scenario: Audit events exist

**Scenario ID:** AE-001-S01

- **WHEN** a user requests audit events for a supported governed resource
- **THEN** the service SHALL return the recorded event projections
- **AND** the workbench SHALL allow the event details to be inspected

#### Scenario: Audit request fails

**Scenario ID:** AE-001-S02

- **WHEN** the audit endpoint is unavailable or returns an error
- **THEN** the workbench SHALL present a visible failure state
- **AND** MUST NOT represent missing events as proof that no lifecycle activity occurred

### Requirement: Audit Retention Health

**Requirement ID:** AE-002

The service SHALL expose audit-retention health describing the current lifecycle state and MUST report a failed retention operation as non-healthy evidence.

#### Scenario: Retention health is requested

**Scenario ID:** AE-002-S01

- **WHEN** a client requests audit-retention health
- **THEN** the service SHALL return the current controlled health projection
- **AND** SHALL distinguish successful, failed or unavailable lifecycle evidence

### Requirement: Resolution Execution Evidence

**Requirement ID:** AE-003

Every resolution-page execution result SHALL include evidence binding the definition/scenario context, correlation identity, validation owner/action, executor identity, request and response hashes, applied rule identities and selected governed identities when applicable.

#### Scenario: Resolution execution completes

**Scenario ID:** AE-003-S01

- **WHEN** a resolution-page execution returns a success or structured non-success result
- **THEN** the response SHALL contain the execution evidence required by the typed contract
- **AND** the workbench SHALL present evidence separately from generated output and business outcome
