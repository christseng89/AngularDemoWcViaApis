# Ten-bank SSI demo data design

## Understanding summary

- Add ten fictional bank SSI examples to the SSI Prototype Demo.
- Cover Trade Finance, Treasury and Central Payment across MT3xx, MT4xx, MT7xx and pacs messages.
- Exercise the BFF APIs and four-eyes lifecycle rather than writing directly to SQLite.
- Keep `samples/` limited to pseudo SWIFT SSI-field subsets; seed master data belongs in `fixtures/`.
- Make repeat runs safe by matching `counterpartyId + currency + sampleSet` before creation.

## Assumptions and non-goals

- The ten records collectively cover the functions; each bank does not support every product.
- All names, BIC-like values and accounts are fictional and are not SwiftRef data.
- RMA, AML, sanctions and SWIFT transport remain outside this fixture's scope.
- NFRs inherit the local Prototype FSD constraints.

## Decision log

1. One reviewed JSON catalogue was chosen over ten unrelated scripts so coverage is versioned atomically.
2. BFF REST calls perform Create, Submit, Checker Approve and Activate. Direct SQLite writes were rejected because they bypass domain controls, audit and outbox events.
3. The script is idempotent for its `sampleSet`; unconditional inserts were rejected because duplicate active records cause ambiguous resolution.
4. Each record has a distinct counterparty/currency key and carries its function/message/tag coverage in the existing string-valued `route` contract.
