# QA repository layout

This Demo prototype keeps only reproducible QA inputs, executable tests, the
current controlled TDD set, and the latest summary evidence in Git.

```text
qa/
├── fixtures/       # Demo and test data required for reproducible execution
├── tests/          # QA, contract, and browser/E2E runners
├── tdd/            # Current controlled test-design artifacts
├── reports/
│   └── latest/     # Latest summary and current gate evidence only
└── README.md
```

## Rules

1. Organize family-specific material below `mt1/`, `mt2/`, or `mt347/` inside
   the applicable approved directory.
2. Do not commit compiled mirrors, caches, raw screenshots, partial reports,
   stdout/stderr logs, migration backups, or superseded runs.
3. QA runners must write transient output under repository-local `tmp/` unless
   a reviewed latest summary is intentionally refreshed.
4. A current fixture, runner, TDD artifact, or latest summary must not be
   removed while production code, scripts, parameters, or tests reference it.
5. Historical controlled evidence must be archived through the governed
   external archival process; it must not be reintroduced as a parallel truth.
