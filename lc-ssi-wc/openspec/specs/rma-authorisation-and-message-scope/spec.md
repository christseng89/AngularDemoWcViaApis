## Purpose

Define RMA as an authorisation gate for the actual receiver and governed message scope, separate from route construction and display-format selection.

## Requirements

### Requirement: Exact RMA Authorisation

**Requirement ID:** RMA-001

The service MUST evaluate RMA against the chosen route's sender, actual receiver, direction, service, governed message profile and effective date, and MUST preserve the selected RMA record and decision identity.

#### Scenario: Exact active authorisation exists

**Scenario ID:** RMA-001-S01

- **WHEN** one active operational RMA record authorises the exact chosen-route context
- **THEN** the service SHALL return an authorised decision with the RMA identity and decision identity

#### Scenario: No exact authorisation

**Scenario ID:** RMA-001-S02

- **WHEN** no active RMA record authorises the actual receiver and exact message context
- **THEN** the service MUST return a non-authorised outcome
- **AND** MUST NOT allow settlement execution

#### Scenario: Ambiguous authorisation

**Scenario ID:** RMA-001-S03

- **WHEN** multiple equally specific active RMA records match
- **THEN** the service MUST return an ambiguous, non-authorised decision

### Requirement: Governed Message-type Scope

**Requirement ID:** RMA-002

RMA maintenance and checking SHALL accept only message types and services admitted by the governed RMA catalogue and SHALL keep QA-only authorisations outside operational eligibility.

#### Scenario: Unsupported message type

**Scenario ID:** RMA-002-S01

- **WHEN** a maintenance command supplies a message type outside the governed catalogue
- **THEN** the service MUST reject the command with an unsupported-scope error

#### Scenario: QA-only authorisation coexists

**Scenario ID:** RMA-002-S02

- **WHEN** operational and QA-only RMA records coexist
- **THEN** operational checking SHALL exclude the QA-only record

### Requirement: Route and Presentation Separation

**Requirement ID:** RMA-003

RMA SHALL authorise a selected route and MUST NOT independently select SSI/Nostro topology, message display format or a fallback execution transport.

#### Scenario: Authorisation check after discovery

**Scenario ID:** RMA-003-S01

- **WHEN** a selected route is submitted for execution
- **THEN** the service SHALL recheck authorisation for that route's actual receiver and governed execution transport
- **AND** a failure MUST leave the route unexecuted
