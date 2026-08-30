---
knowledge_id: a4-maker-submit-gate-is-sight-tenor-scoped-reflected-in-registry-step-
title: "A4 的 Maker Submit 关卡仅限定于 Sight tenor 范围，体现在 registry 的 step 形态之中"
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

# A4 的 Maker Submit 关卡仅限定于 Sight tenor 范围，体现在 registry 的 step 形态之中

凡信用证声明 tenorType: SIGHT 的 Import 用例，都会在其 Document Arrival（UTILIZE）的 Checker release 之前紧接插入一个 makerSubmit step——例如 import-case-1/3/4/6/10。而所有 Usance tenor 用例（import-case-2/7/9，BUYERS_USANCE 或 SELLERS_USANCE）则直接通过 createAndRelease 来 release 对应的 UTILIZE，完全不设 makerSubmit step，而是改由 A6 自身与 Acceptance 关联的复合式（compound）release 来完成落地。这与 CLAUDE.md 中记载的服务端 BAL-123 规则一致（release() 会对没有先行 Maker Submit 的 Sight UTILIZE 返回 409，其作用范围限定为 tenorType==='SIGHT'）；import-case-1 自身的行内注释说明，该用例之所以被重写，正是因为如今真实存在的 tenorType 使这道关卡变得可以被触达，而以往（tenorType 未设置时）是被豁免的。

## 证据来源

- `backend/data/businessCases.js:123-134,297-302,435-439,1190-1191`
- `backend/test/server.test.js:100-137,186-206`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
