## Purpose

Define server-generated MT/MX evidence outputs and the non-payment boundary for SSI-resolution-only and FIN-reference-only profiles.

## Requirements

### Requirement: Server-generated Structured Outputs

**Requirement ID:** MRO-001

For a profile that authorises structured output, the service SHALL generate each SWIFT MT or ISO 20022 representation from the confirmed canonical resolution, and the client MUST NOT translate between formats.

#### Scenario: Governed output is produced

**Scenario ID:** MRO-001-S01

- **WHEN** resolution succeeds for a profile that declares a structured representation
- **THEN** each output SHALL identify its format, message identity, media type and server-generated document
- **AND** SHALL remain traceable to the same canonical route and execution evidence

### Requirement: SSI-resolution-only Boundary

**Requirement ID:** MRO-002

An SSI-resolution-only result MUST set `paymentExecutable` to false and MUST NOT create a confirmed payment resolution or repair-queue side effect.

#### Scenario: SSI evidence resolution succeeds

**Scenario ID:** MRO-002-S01

- **WHEN** an SSI-resolution-only scenario returns a resolved route or evidence result
- **THEN** the response SHALL retain `paymentExecutable=false`
- **AND** `confirmedResolutionCreated` and `repairQueueCreated` MUST remain false

### Requirement: FIN-reference-only Boundary

**Requirement ID:** MRO-003

A FIN-reference-only profile SHALL support governed reference resolution while remaining non-payment-executable and outside MT-to-MX conversion scope.

#### Scenario: Reference-only execution

**Scenario ID:** MRO-003-S01

- **WHEN** a supported FIN-reference-only scenario is executed
- **THEN** the service SHALL return a `REFERENCE_ONLY` or equivalent governed evidence outcome
- **AND** MUST NOT create payment payload, confirmed payment resolution, repair-queue side effect or ISO conversion claim
