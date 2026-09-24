## Purpose

Define balance, atomicity, and idempotency controls for Payment Instruction confirmation.

## Requirements

### Requirement: Balanced Payment Instruction

The service MUST reject a Payment Instruction whose authoritative debit and credit totals differ beyond the explicit tolerance, and MUST use exact decimal arithmetic.

#### Scenario: Balanced instruction

- **WHEN** validated debit and credit legs balance at the applicable precision
- **THEN** the service SHALL classify and build the Payment Instruction result

#### Scenario: Unbalanced instruction

- **WHEN** debit and credit totals do not balance
- **THEN** the service MUST reject the whole instruction
- **AND** MUST NOT persist a partial result

### Requirement: Idempotent Confirmation

Confirmation MUST bind the natural request identity to a canonical payload fingerprint.

#### Scenario: Identical replay

- **WHEN** an identical confirmed request is submitted with the same natural identity
- **THEN** the service SHALL return the original result without recomputation

#### Scenario: Conflicting replay

- **WHEN** the same natural identity is submitted with a different canonical payload
- **THEN** the service MUST reject the request as an idempotency conflict
