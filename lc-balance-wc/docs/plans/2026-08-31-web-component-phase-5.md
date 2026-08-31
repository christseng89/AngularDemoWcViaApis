# Web Component Phase 5 — Testing and Release Engineering

## Test pyramid

- Jest contract/unit tests remain the fast base and cover the native contract plus adapters.
- Angular, React and Vue host bundles are compiled from their real runtimes as integration fixtures.
- Playwright runs a small high-confidence browser suite over ready/load, property config, Promise
  navigation and refresh, typed error events, Shadow DOM/theme behavior and multiple instances.

## Release boundary

`npm run release:prepare` builds the deterministic WC assets, emits adapter JavaScript/declarations,
and writes a SHA-256 asset manifest. `npm run release:verify` validates every export and confirms
React/Vue runtime code is absent from `main.js`. `npm pack --dry-run` verifies the package payload;
it never publishes.

Angular, React and Vue are optional peer dependencies and host-fixture-only dev dependencies.
Backend, authentication, OAS, API paths and Balance business logic are outside Phase 5.
