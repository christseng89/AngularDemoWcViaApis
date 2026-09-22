# Batch 01 — `app.component.ts` Baseline Evidence

Evidence captured on 2026-09-21 before the P0/P1 focused refactor. The local
SonarQube issue state was read without changing issue status or acceptance.

## Sonar issues

| Severity | Scan line | Finding |
| --- | ---: | --- |
| High | 403 | Reduce Cognitive Complexity from 25 to the allowed 15. |
| Medium | 427 | Extract the nested ternary into an independent statement. |
| Low | 218 | Remove the redundant jump. |
| Low | 425 | Remove the unnecessary conditional expression used for default assignment. |

Line numbers identify the pre-refactor local Sonar scan and can move after
edits. The new scan must prove resolution; issue status will not be changed to
Accepted or Won't Fix to obtain a pass.

## Per-file coverage

Source: `coverage/apps/ssi-portal/coverage-summary.json` after the focused
characterization run.

| Metric | Covered / Total | Percent | Strict `>92%` gate |
| --- | ---: | ---: | --- |
| Statements | 229 / 242 | 94.62% | PASS |
| Branches | 112 / 129 | 86.82% | FAIL |
| Functions | 51 / 58 | 87.93% | FAIL |
| Lines | 219 / 228 | 96.05% | PASS |

## Characterization gaps

The remaining uncovered statements/functions identify these observable paths:

- unknown view fallback in `routePathForView`;
- optional maintenance shell callbacks and detail close behavior;
- subscription cleanup for prior activated-route outputs;
- navigation failure notice with neither denial nor pending guard;
- `loadingSsiDashboard` state combinations;
- overlay close when a detail target exists.

`onRouterEvent()` is already a thin dispatcher and is not a refactor target.
P0 is limited to `handleNavigationEnd()` and `handleNavigationFailure()`; P1 is
limited to the evidenced responsibility concentration in
`onSettingsActivated()` and the redundant conditional in `refresh()`.

## Post-refactor evidence

The unchanged Portal test target completed with 87 suites and 657 tests passing.

| Metric | Percent | Strict `>92%` gate |
| --- | ---: | --- |
| Statements | 97.70% | PASS |
| Branches | 92.62% | PASS |
| Functions | 95.94% | PASS |
| Lines | 98.77% | PASS |

`app-router-event-dispatcher.ts` achieved 100% for all four metrics. Targeted
ESLint and `ssi-portal:typecheck` passed.

The local SonarQube rescan completed successfully with analysis ID
`22bdc0f1-f34e-4a68-85b9-aa9c3e010973` and worktree digest
`05103ef2dc7fc2303dd9c18ab3479c64adfccd7b9abe2e3ec00844c8ec779389`.
All four prior `app.component.ts` issues are absent from the open/confirmed
all-code issue list. The method-level Cognitive Complexity finding changed from
25 to no threshold violation (therefore at most the configured limit of 15).
The scan reported overall duplication of 1.2%.

The scan ran under an amd64-only `sonarsource/sonar-scanner-cli:latest` image on
an aarch64 Docker engine. This is valid but slow (17m27s). A native ARM64 scanner
environment is a separately controlled tooling improvement; the official
`latest` image inspected on 2026-09-21 was a single-platform manifest, so simply
forcing `--platform linux/arm64` is not a valid replacement.
