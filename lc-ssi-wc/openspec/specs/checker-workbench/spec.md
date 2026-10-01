## Purpose

Define the currently evidenced Checker workbench discovery, pending-record review and SSI decision behaviour. Unified approve/reject execution for every non-SSI resource is not claimed by this baseline.

## Requirements

### Requirement: Governed Checker Queue Discovery

**Requirement ID:** CW-001

The Checker workbench SHALL discover governed resource queues from the available UI contract metadata and SHALL present pending records separately from Maker editing.

#### Scenario: Load configured Checker queues

**Scenario ID:** CW-001-S01

- **WHEN** the workbench loads a supported UI resource contract
- **THEN** it SHALL request and present that resource's configured pending-record projection
- **AND** SHALL preserve the governed resource identity and current status

#### Scenario: Queue request fails

**Scenario ID:** CW-001-S02

- **WHEN** a configured pending-record request fails
- **THEN** the workbench SHALL present a visible non-success state
- **AND** MUST NOT fabricate an empty approved queue or successful decision

### Requirement: SSI Checker Decision

**Requirement ID:** CW-002

For the evidenced SSI Checker contract, the workbench SHALL submit approve or reject decisions to the server and SHALL refresh the pending projection from the server result.

#### Scenario: Approve an eligible SSI draft

**Scenario ID:** CW-002-S01

- **WHEN** an independent Checker approves an eligible submitted SSI draft
- **THEN** the workbench SHALL call the governed approval operation
- **AND** SHALL reflect the server-authoritative resulting status

#### Scenario: Reject an SSI draft

**Scenario ID:** CW-002-S02

- **WHEN** an independent Checker rejects an eligible submitted SSI draft with the required decision input
- **THEN** the workbench SHALL call the governed rejection operation
- **AND** SHALL not display the draft as approved

### Requirement: Checker Read-only Review Boundary

**Requirement ID:** CW-003

The Checker workbench SHALL present governed record details for review and MUST NOT silently edit Maker-owned field values as part of an approval decision.

#### Scenario: Review pending record

**Scenario ID:** CW-003-S01

- **WHEN** a Checker opens a pending governed record
- **THEN** the workbench SHALL present the record and its lifecycle context as review information
- **AND** mutation SHALL occur only through an explicit governed decision operation
