## Purpose

Define Payment Component accounting ownership and suspense-bridge boundaries across Trade Finance components.

## Requirements

### Requirement: Settlement Voucher Ownership

The Payment Component SHALL create settlement entries from submitted payment legs and SHALL NOT create upstream Charge or Balance Component contra entries.

#### Scenario: Submitted debit and credit legs

- **WHEN** a valid Payment Instruction is confirmed
- **THEN** each submitted leg SHALL produce a settlement entry using its own account, currency, amount, and direction

### Requirement: Suspense Bridge Offset

A submitted Suspense Bridge entry SHALL create the Payment Component offsetting suspense leg, while the upstream component remains responsible for its own contra posting.

#### Scenario: Foreign-currency suspense entry

- **WHEN** a suspense entry currency differs from transaction currency and contains a valid cross-rate
- **THEN** the service SHALL generate the required self-balancing FX pair according to the implemented debit/credit bucket rules

#### Scenario: Missing foreign-currency rate

- **WHEN** a foreign-currency suspense entry lacks its required cross-rate
- **THEN** the service MUST reject the request and MUST NOT persist partial entries
