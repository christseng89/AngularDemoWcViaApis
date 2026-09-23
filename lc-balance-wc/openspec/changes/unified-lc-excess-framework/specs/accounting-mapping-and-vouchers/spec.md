## ADDED Requirements

### Requirement: Covered and Export Excess Assets Use Separate Mappings

`balance-account-mappings.json` SHALL preserve the existing Sight `Due from Issuing Bank` and Usance `Reimbursement Receivable` balance types for Covered Amount. It SHALL add a distinct canonical `EXPORT_EXCESS_ASSET` mapping for Export Excess. The Excess mapping MUST remain distinct even when debtor attribution is Issuing Bank and MUST NOT rename either existing Covered mapping to the generic term `Issuing Bank Asset`.

#### Scenario: Sight Asset Mapping

- **GIVEN** Legal Amount 10,200、Covered 10,000、Excess 200
- **WHEN** Sight B4 accounting vouchers are built
- **THEN** `Due from Issuing Bank` SHALL post 10,000 and `EXPORT_EXCESS_ASSET` SHALL post 200
- **AND** Total Asset SHALL equal Legal Amount 10,200

#### Scenario: Usance Asset Mapping

- **GIVEN** Legal Amount 10,200、Covered 10,000、Excess 200
- **WHEN** Usance B4 accounting vouchers are built
- **THEN** `Reimbursement Receivable` SHALL post 10,000 and `EXPORT_EXCESS_ASSET` SHALL post 200
- **AND** Total Asset SHALL equal Legal Amount 10,200

### Requirement: Excess Asset Debtor Is Attribution, Not Balance Type

`EXPORT_EXCESS_ASSET` SHALL store debtor attribution separately from balance type. A fully valid and Checker-confirmed authorization assigns `ISSUING_BANK`; absent、partial、currency-mismatched or non-confirmed authorization assigns `BENEFICIARY_OR_RECOURSE_PARTY`. Debtor assignment SHALL NOT select or merge the Covered Asset mapping.

#### Scenario: Fully Authorized Excess

- **WHEN** the complete Excess is validly authorized and Checker-confirmed
- **THEN** Excess Asset SHALL remain `EXPORT_EXCESS_ASSET` with debtor `ISSUING_BANK`
- **AND** Covered Asset SHALL remain the existing Sight／Usance balance type

#### Scenario: Partial Authorization

- **WHEN** authorizedAmount is less than Excess Amount
- **THEN** the complete Excess Asset SHALL use debtor `BENEFICIARY_OR_RECOURSE_PARTY`
- **AND** no 100／100 partial asset split SHALL be generated

### Requirement: Voucher Generation Is Atomic and Reconciles to Legal Amount

Covered Asset voucher、Excess Asset voucher、authorization attribution、source B3 consumption and linked B4 movement facts SHALL commit in one unit of work. The voucher projection MUST expose mapping key／version、amount、currency、debtor attribution and shared business event identity. A failure in any leg SHALL roll back every leg.

#### Scenario: Accounting Mapping Is Missing

- **WHEN** `EXPORT_EXCESS_ASSET` or required Covered mapping is unavailable／ambiguous at B4 posting time
- **THEN** B4 SHALL fail closed before partial persistence
- **AND** B3 earmark、Approved Excess and all accounting legs SHALL remain unchanged

#### Scenario: Voucher Total Reconciliation

- **WHEN** both asset legs are successfully generated
- **THEN** exact-decimal `coveredAsset + excessAsset` SHALL equal the source Legal Amount
- **AND** a mismatch SHALL fail the transaction rather than rounding、netting or merging the Excess leg
