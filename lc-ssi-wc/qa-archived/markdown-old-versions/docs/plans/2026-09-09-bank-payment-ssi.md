# Bank Payment SSI — Minimal SR2026 Design

## Understanding

- Add Payment SSI coverage to existing bank counterparties.
- Preserve Treasury, Trade Finance, and Customer Payment test data.
- Model FI-to-FI Payment as `INTERBANK_TRANSFER` / `INTERBANK_SETTLEMENT`.
- Use canonical `pacs.009.001.12` and render MT as MT202 when requested.
- Do not enable MT202 COV / pacs.009 COV until a separate cover-payment leg exists.
- Keep SSI existence separate from booking-entity Nostro eligibility and RMA.

## Non-functional assumptions

- Seed transformation is deterministic and idempotent.
- No additional network or licensed SWIFT data is introduced.
- Exact bank BIC remains the counterparty identity.
- Existing fail-closed Resolution, RMA, and Nostro controls remain authoritative.
- The implementation reuses one pure policy function and adds focused tests.

## Decision log

1. Reuse existing exact-bank SSI routes instead of duplicating Payment-only records.
2. Add an exact Central Payment applicability row and pacs.009 Core message support.
3. Exclude Customer SSI and `ANY` generic fallbacks from this transformation.
4. Treat UI currency coverage as SSI-record existence; booking entity is evaluated later by Resolution/Nostro controls.
5. Defer cover-payment variants until the domain models customer and cover legs separately.

