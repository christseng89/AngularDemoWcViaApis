## Purpose

Define the evidenced server-authoritative lifecycle, work-in-progress reservation and Four-eyes behaviour shared by governed maintenance resources.

## Requirements

### Requirement: Server-authoritative Revision Reservation

**Requirement ID:** MCC-001

Starting a revision SHALL atomically recheck current lifecycle state and reserve one work-in-progress revision; the service MUST reject an existing draft or unexpired competing reservation.

#### Scenario: Revision is available

**Scenario ID:** MCC-001-S01

- **WHEN** a maker requests revision of an eligible current record with no conflicting draft or reservation
- **THEN** the service SHALL create and return one distinct work-in-progress revision identity

#### Scenario: Concurrent revision exists

**Scenario ID:** MCC-001-S02

- **WHEN** another draft or unexpired work-in-progress reservation already exists
- **THEN** the service MUST reject the competing revision request
- **AND** MUST NOT create a second active edit identity

### Requirement: Close and Save-draft Semantics

**Requirement ID:** MCC-002

Closing an unsaved reserved revision SHALL release its server-side work-in-progress state, while Save Draft SHALL convert the reservation into a lifecycle draft.

#### Scenario: Close unsaved editor

**Scenario ID:** MCC-002-S01

- **WHEN** a user closes or cancels an editor that holds a work-in-progress reservation without saving
- **THEN** the service SHALL release that reservation
- **AND** the client SHALL surface a release failure rather than silently treating it as success

#### Scenario: Save draft

**Scenario ID:** MCC-002-S02

- **WHEN** the reservation owner submits a valid Save Draft command
- **THEN** the service SHALL persist the revision as a draft under its current-status projection

### Requirement: Maker and Checker Separation

**Requirement ID:** MCC-003

A governed approval MUST be performed by a Checker distinct from the Maker, and invalid lifecycle transitions or self-approval MUST be rejected by the service.

#### Scenario: Independent approval

**Scenario ID:** MCC-003-S01

- **WHEN** a distinct authorised Checker approves an eligible submitted draft
- **THEN** the service SHALL transition the governed record according to its lifecycle policy
- **AND** SHALL record the Checker action in audit evidence

#### Scenario: Maker attempts self-approval

**Scenario ID:** MCC-003-S02

- **WHEN** the Maker attempts to approve the Maker's own submitted change
- **THEN** the service MUST reject the transition
- **AND** the governed record MUST remain unapproved
