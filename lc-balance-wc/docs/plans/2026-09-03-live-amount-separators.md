# Live Amount Separators Design

## Understanding summary

- Pure digit Amount input displays thousands separators while the user types.
- Decimal input preserves its fractional text, including an in-progress trailing decimal point.
- Input containing `h/H`, `k/K`, or `m/M` stays unformatted while typing.
- Shorthand expands on blur, then displays the expanded value with separators.
- FormControl, Formly model, validation, calculations, and API payloads always use comma-free decimal strings.
- Protected and system-carried Amount fields keep their current behavior.
- This is a shared reference-UI feature with no API, database, OAS, privacy, or persistence change.

## Assumptions and non-functional requirements

- Formatting is synchronous and local; existing 128-character shorthand input limit remains.
- Caret position is preserved by counting logical characters rather than relying on the number of commas.
- The formatter is registered once as a Formly field type and reused by every editable Amount field.
- Invalid shorthand stays visible for correction and continues to use the existing field-level validation message.
- Existing exact BigInt/decimal-scale parsing and currency minor-unit validation remain authoritative.

## Final design

Create a shared `FormattedAmountFieldComponent` Formly type whose DOM input owns the formatted display while
its FormControl owns the comma-free Angular form value.
Digit-only input is regrouped immediately, with caret restoration based on logical digits before the caret.
Shorthand text is passed through unchanged while typing; blur invokes the existing exact parser, writes the
canonical comma-free decimal string to the FormControl, and renders its grouped display representation.
Pasted grouped numeric text is normalized through the same path. Protected monetary fields do not use the
new field type.

## Error and edge-case behavior

- A trailing decimal point remains visible while editing and is canonicalized on blur.
- Fraction digits are never regrouped.
- Unsupported suffixes, negative values, whitespace, scientific notation, and malformed decimals remain invalid.
- Formatting must never introduce a comma into a Submit request or balance calculation.

## Testing strategy

- Unit-test display grouping and comma stripping independently.
- Component-test live typing, decimal text, paste, shorthand pass-through, shorthand blur expansion, invalid input, and caret restoration.
- Builder-field tests verify every editable Amount uses `formatted-amount` and protected Amount remains unchanged.
- Submit regression verifies API payloads remain comma-free.
- Run full tests, lint, typecheck, documentation validation, and the global 90%+ branch-coverage gate.

## Decision log

1. Use a custom Formly field plus ControlValueAccessor so display and domain values are genuinely separate.
2. Do not place commas in the FormControl and strip them throughout downstream code; that would broaden risk.
3. Do not manipulate Formly-owned DOM from Maker Panel; keep lifecycle ownership inside the field type.
4. Keep shorthand raw while typing and expand only on blur, preserving the accepted shorthand grammar.

## Implementation result

Implemented as an Angular display-only change. No API, database, Balance calculation, or OpenAPI contract was
changed. Full verification: 69 suites / 1,891 tests passed; statements 97.80%, branches 95.06%, functions
96.36%, lines 98.29%. Lint completed with 0 errors, WC typecheck and docs validation passed, and both the
Angular application and Web Component production builds completed successfully.
