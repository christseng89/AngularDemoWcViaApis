## Purpose

Define advice, cover, UETR, and cross-currency controls for supported outbound payment messages.

## Requirements

### Requirement: Advice and Cover Consistency

The service MUST validate the supported relationship between Payment Advice and Payment Cover message types for each credit leg.

#### Scenario: Valid cover combination

- **WHEN** a credit leg requests MT202COV or PACS009COV with MT103 or PACS008 advice
- **THEN** the service SHALL accept the combination and SHALL share one UETR across that leg's advice and cover messages

#### Scenario: Cover without compatible advice

- **WHEN** a cover message requires advice and the compatible advice is absent
- **THEN** the service MUST reject the instruction with a business validation error

### Requirement: Cross-currency Amount Meaning

Advice message settlement amount and instructed amount SHALL retain their distinct currencies and values for cross-currency payment legs.

#### Scenario: Cross-currency advice

- **WHEN** a payment leg settles in a currency different from the transaction currency
- **THEN** the message SHALL expose the account-currency settlement amount separately from the transaction-currency instructed amount
