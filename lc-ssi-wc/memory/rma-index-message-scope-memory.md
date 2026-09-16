# RMA Index and Supported Message Scope — Persistent Decision Record

**Status:** Normative project memory  
**Latest confirmation:** 2026-09-17
**Read before:** answering RMA questions or changing RMA UI, API, OAS/page parameters, load-data processing, repositories, SQL, indexes, fixtures, audit, or tests.

## RMA business index

- The operational RMA index is distinct by the governed bank relationship identity and direction. Within the current Own BIC context, use **Counterparty BIC + INBOUND／OUTBOUND** as the visible distinct key.
- A bank normally appears at most once for `INBOUND` and once for `OUTBOUND`; do not create duplicate index rows merely because it has FIN, FINPLUS, multiple MTs, or multiple MX message types.
- FIN／FINPLUS and all selected MT／MX Message Types are collections within the relevant bank-direction record.
- Preserve the existing physical DB model unless an independently reviewed migration is explicitly approved. The distinct index may be a query／projection over existing rows.
- Perform filtering, grouping, distinct selection, sorting, and pagination in the database／repository layer. Do not download every RMA row into the SSI index or deduplicate thousands of records in the browser.
- RMA status filters use `Active`, `Draft`, `Suppressed`, and `All`. Checker approval directly activates the approved version; no separate Activate button is required.

## Governed supported Message Types

- The governed parameter source is authoritative for supported RMA Message Types. The UI must not maintain an independent hard-coded catalogue.
- The FIN catalogue covers only SSI-supported items from the governed `MT1xx`, `MT2xx`, `MT3xx`, `MT4xx`, and `MT7xx` families. Inclusion of a family does not mean every message in that family is automatically supported.
- The ISO 20022／MX catalogue contains only governed SSI-supported MX message types.
- Unsupported MT／MX values must not be displayed as selectable options.
- Load Data validates every Message Type against the same governed parameter snapshot. Unsupported values are ignored, counted／reported in load evidence, and must not create index duplicates or executable authorization.
- UI, API validation, Load Data, QA fixtures, and audit must use the same versioned supported-type parameter snapshot.
- The current governed SSI scope is assembled from `parameters/payment-message-index.json`, `parameters/ssi-mappings.sr2026.manifest.json`, plus the approved MT103／pacs.008 Phase-1 profile. MT101 is explicitly out of SSI scope and must not be offered or loaded.
- The governed MT1／pacs.008 operational profile is `MT103` plus `pacs.008.001.08`. Earlier positive demo data used `pacs.008.001.12` because it was derived from generic ISO 20022 material without the governed SWIFT／CBPR+ profile source. Controlled Load Data／Repair converts only eligible positive Operational／Draft occurrences to `.001.08` and records the conversion; manual ADD／EDIT still rejects `.001.12`. Immutable audit history and isolated negative／legacy fixtures are not rewritten, and unknown eligibility, source, lifecycle, or conversion scope fails closed without conversion or mutation.
- The supported list is exposed through `GET /api/rma-authorisations/message-types`; the BFF, service, UI selector, Load Data, and repair audit must resolve the same set.
- Load Data filters out-of-scope values before creating or revising an RMA record. It records them as `IGNORED_OUT_OF_SSI_SCOPE`; it must not write them into the RMA Message Types collection.
- The standard repair path is `npm run demo:audit:governed-data` followed, only after review and explicit authorization, by `npm run demo:repair:governed-data`. Repair may create or update Drafts, but must not Submit or Approve them.

## Message Type selector

- Preserve the current RMA ADD／EDIT／VIEW page and workflow. The approved visual reference changes only the Message Types selection Popup; it is not an instruction to redesign the complete page.
- Use one searchable, categorized, multi-select Popup rather than free-text syntax.
- The Popup has exactly three parameter-driven tabs: `Security`, `Trade Finance`, and `Payment`.
- Within every tab, show a two-column checkbox matrix: `INBOUND` on the left and `OUTBOUND` on the right. Do not replace it with a direction dropdown and do not stack the directions vertically.
- The left and right columns render the same current governed Message parameter set with the same categories, Message Types, and Descriptions. They are not separate catalogues; only the checked authorization state differs by direction. Any future direction applicability restriction remains metadata on the same parameter item rather than a second hard-coded list.
- Every option displays governed Message Type and official Description. Category, Description, direction applicability, and selectable status come from the same governed policy metadata as API validation, Load Data, Audit, and Repair; the UI must not hard-code them.
- Within each category, sort options alphabetically by Message Type in ascending order. INBOUND and OUTBOUND must render the identical sorted sequence; ordering is not maintained as two direction-specific lists.
- The visual reference's sample MT5xx values are layout examples only. They must not be introduced unless a future governed SSI parameter snapshot explicitly makes them eligible.
- ADD and EDIT use the same selector. ADD may check multiple values in both directions. EDIT pre-checks the original approved values and produces `ADDED`／`SUPPRESSED` deltas separately for each canonical bank-direction record.
- VIEW uses the same Popup in read-only mode, showing checked and unchecked options without permitting mutation.
- Display the selected set compactly in the index; open the Popup for the complete governed selection.
- Implement this Popup only after data repair has passed BA／QA review and its authorized remediation phase is complete. UI work must not broaden or delay the data-repair safety gates.

## ADD／EDIT／SUPPRESSED set semantics

- One bank-direction relationship has one governed ADD／EDIT／SUPPRESSED workflow at a time.
- ADD may add multiple governed Message Types in one request.
- SUPPRESSED may suppress multiple governed Message Types in one request.
- EDIT retains the original approved set for comparison and may produce multiple additions and multiple suppressions atomically.
- Example: original `{MT103, MT202, MT734}` changed to `{MT103, MT202, MT400}` means `MT734 = SUPPRESSED`, `MT400 = ADDED`, and `MT103／MT202 = UNCHANGED`.
- ADD must be rejected when the same governed bank-direction identity already has an Active record or an open Draft／WIP request. The server must enforce uniqueness atomically.
- Request Type is explicitly shown as `ADD`, `EDIT`, or `SUPPRESSED` in Maker, Checker, index, and audit presentation.

## Four-eyes and audit

- ADD, EDIT, and SUPPRESSED follow the same Maker → Submit to Checker → Approve／Reject workflow.
- Maker and Checker must be different users.
- A SUPPRESSED request does not need an Edit action. Checker must be able to identify it as SUPPRESSED before deciding.
- Audit RMA display uses the same governed transaction-input／View screen and field layout, read-only. Raw JSON is optional diagnostic evidence, not the primary audit display.
- For EDIT audit, show `UNCHANGED`, `ADDED`, and `SUPPRESSED` Message Type deltas explicitly.

## Related product-wide maintenance rule

- `×` or `Esc` equals Cancel for RMA and all other SSI-related maintenance functions. Do not add a separate Cancel button.
- When Revise has acquired a WIP reservation, Cancel releases it on the server. The environment-configured WIP timeout is currently 5 minutes.
