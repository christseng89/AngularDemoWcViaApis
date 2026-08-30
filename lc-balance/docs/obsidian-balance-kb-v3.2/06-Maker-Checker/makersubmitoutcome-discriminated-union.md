---
knowledge_id: makersubmitoutcome-discriminated-union
title: "MakerSubmitOutcome 可辨识联合类型"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# MakerSubmitOutcome 可辨识联合类型

`{kind:'submitted'; result; secondary}` 或 `{kind:'failed'; message; result?; secondary}`。关键约束规则：只有真正提交调用方自身 `req` 的那次调用（绝非 secondary/tertiary 分支）才被允许在 FAILED 结果中仍保留 `result` 字段——每一次主调用（primary call）失败都必须完全省略 `result`（这修复了 desiger-comments.md 中记录的 F-08 问题：此前主调用失败时会把 `result` 设为原始的 HTTP 错误响应体，错误地满足了 `formLocked`（`!!submitResult`）判断，导致表单被当作 Submit 已成功那样锁定）。

## Source Evidence

- `maker-submit.service.ts:186-191, 259-264, 314-318, 325-329 (every primary catchError omits result)`
- `maker-submit.service.ts:40-60 (MakerSubmitSecondary/MakerSubmitOutcome + F-08 doc comment)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
