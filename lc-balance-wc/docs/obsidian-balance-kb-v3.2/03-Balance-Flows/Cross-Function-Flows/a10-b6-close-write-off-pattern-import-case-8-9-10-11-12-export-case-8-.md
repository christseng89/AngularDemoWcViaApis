---
knowledge_id: a10-b6-close-write-off-pattern-import-case-8-9-10-11-12-export-case-8-
title: "A10 / B6 Close 核销模式（import-case-8/9/10/11/12，export-case-8/9/11）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# A10 / B6 Close 核销模式（import-case-8/9/10/11/12，export-case-8/9/11）

每个 Close 用例都遵循以下流程：先将每一条子级账目（SG/Acceptance/Present-Docs 提示单）推进到各自的终态，快照母合约剩余的 Confirmed Balance，然后提交一笔金额精确等于该剩余余额的 CLOSE movement，最后再 release。反例用例（import-case-11：SG outstanding 未清零；import-case-12：Acceptance outstanding 未清零；export-case-11：Acceptance outstanding 未清零）会在某条子级账目仍非零时提交 CLOSE，并断言产生 409 资格错误，同时以快照证明合约/状态/余额此后完全未发生变化——从而确认 Close 在原子性上是全有或全无，绝不存在部分核销。

## 证据来源

- `backend/data/businessCases.js:2007-2102,2317-2412`
- `backend/data/businessCases.js:839-1027,1029-1135,1137-1362`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
