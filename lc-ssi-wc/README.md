# SSI WC Prototype Demo

An executable, parameter-driven SSI prototype based on the Gate G0 v1.0-rc.4 package and its referenced Prototype FSD.

## Mandatory architecture

The repository-wide runtime flow is `Configuration / DB -> API -> Page parameter model -> Generic UI`. The API is the single source of truth for business behavior; Angular must not hard-code message, sequence, field, scenario, polarity, fixture or case-specific decision tables. This includes MT2, `pacs.009` plain/COV/ADV, MT347 and future message families. See [`docs/architecture/ADR-001-api-driven-ui.md`](docs/architecture/ADR-001-api-driven-ui.md).

## Important scope boundary

The files under `samples/` are **pseudo MT/MX SSI-field subsets**. They demonstrate SSI extraction, resolution and field generation only. They are not complete, network-valid SWIFT messages and do not implement FIN transport, RMA or AML screening.

## Applications

- `ssi-portal`: Angular/Formly demonstration portal.
- `ssi-web-components`: reusable Angular Elements widgets.
- `ssi-bff`: UI-facing NestJS orchestration layer.
- `ssi-service`: SSI domain and persistence API.
- `mock-reference-services`: GET-only Currency, Bank, Account, Nostro and AML JSON APIs.

## Local run

1. Copy `.env.example` to `.env`.

Index pagination is governed centrally by `SSI_INDEX_PAGE_SIZE`. It defaults to
10 rows when unset, accepts positive whole numbers, and caps values above 100.
Both the Payment Message Index and Scenario Index obtain the resolved value from
their API response; browser code must not read the environment or supply its own
fallback page size.
2. Run `npm install`.
3. Run `npm start`.
4. Open `http://localhost:4200`.

SQLite data is created under `data/`. No external database or message broker is required.

## Quality

Run `npm run verify`. Coverage gates are set to 95% for lines, statements, functions and branches. See `docs/plans/2026-09-07-ssi-prototype-demo.md` for architecture and acceptance scope.
