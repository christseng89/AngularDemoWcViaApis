---
knowledge_id: makersubmitservice
title: "MakerSubmitService"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-31
tags:
  - balance
  - domain-concept
---

# MakerSubmitService

一个 `providedIn: 'root'` 的 Angular 服务，从 God Component（BAL-003）中拆分出来，只负责 5 种 Maker 提交形态的 API 调用编排，最终解析为一个 `MakerSubmitOutcome`，而不直接修改任何组件状态。`validateSubmit()`/`buildSubmitRequest()` 刻意保留在组件内（与 `model`/`naturalKey`/`selectedParent` 耦合过深，不适合抽离）。该服务只依赖 `MakerSubmitContext`（对调用方状态的一个接口隔离、只读视图）以及 API client。

`submit()` 以 RxJS `defer` 包覆 dispatch，因此单筆与 compound shape 的同步例外也会成为保留 raw cause 的 `failed` outcome。A1-A11／B1-B7、Angular host 与 Web Component host 共用同一 error boundary；HTTP 4xx business rejection 不再被 UI 误标为 `BAL-UI-UNEXPECTED`。

## Source Evidence

- `maker-submit.service.ts (submit() error boundary and dispatcher)`
- `maker-submit.service.ts:9-23 (class doc comment)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
