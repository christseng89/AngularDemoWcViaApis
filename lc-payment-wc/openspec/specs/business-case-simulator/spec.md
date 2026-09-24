## Purpose

Define how the demo presents source-traceable Payment Component business cases without overstating unsupported behavior.

## Requirements

### Requirement: Source-traceable Business Cases

The simulator SHALL present implemented Payment Component user functions as PASS, partial classify-only functions as GAP, and confirmed non-user modules as N/A without fabricating unsupported voucher behavior.

#### Scenario: PASS business case

- **WHEN** a user selects a PASS case and enters complete valid legs
- **THEN** the simulator SHALL request a live preview from the Payment Component service
- **AND** SHALL allow an explicit Confirm action that persists the instruction

#### Scenario: GAP business case

- **WHEN** a user selects a GAP case for which source contains classification but no voucher assembly contract
- **THEN** the simulator SHALL provide classification preview only
- **AND** SHALL NOT present a persistence action

### Requirement: Stale-result Prevention

The simulator MUST clear results or errors that no longer represent the current form state.

#### Scenario: Input becomes incomplete

- **WHEN** an edit makes any required leg incomplete or invalid
- **THEN** the prior preview SHALL no longer be presented as current
