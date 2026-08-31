---
knowledge_id: declarative-business-case-registry-businesscases-js
title: "声明式 Business Case 登记表（businessCases.js）"
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

# 声明式 Business Case 登记表（businessCases.js）

backend/data/businessCases.js 导出 buildRegistry()，这是一个纯函数，返回 23 个 Business Case 对象（12 个 Import、11 个 Export），每个都是一个 {id, title, description, steps[]} 结构。每个用例都被表达为一份由单一通用执行器（server.js 的 runCase()）解释的声明式步骤对象列表——没有任何用例带有专属代码。登记表在每次 /run 调用时都会重新构建（生成新的 lcNumberFor() 自然键），以便同一用例可以针对同一个数据库反复重新执行，而不会出现自然键或幂等键冲突。

## 证据来源

- `backend/data/businessCases.js:1-66,2414-2444`
- `backend/test/businessCases.test.js:36-42`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]

## 2026-08-26 更新——登记表规模已增长至 29 个用例，审计确认未过期

截至 2026-08-26,`backend/data/businessCases.js` 的 `buildRegistry()` 实际返回 **29** 个 Business Case（**15** 个 Import Case、**14** 个 Export Case），而非本文原先记录的 23 个（12 Import / 11 Export）。新增的 Import Case 8-15、Export Case 8-14 覆盖：Sellers Usance / Buyer's Usance 全生命周期到 Close（A10/B6）、Sight LC 的 SG + Document Arrival 各自终结后再 Close、多个 Close/Reopen 资格闸门的负向（expect ERROR）用例、standalone B2 Amendment 增加后减少至超过 Tight Available 的负向用例、Close(A10/B6) -> Reopen(A11/B7) 链路，以及 §9.7 path B 的 AUTO EXPIRY -> AUTO CLOSE -> Reopen 链路（还原原始 Expire 金额而非后续 Close 的零值）。

一次内部审计（2026-08-24 前后，"post-Business-Case-Runner-inventory"）逐条核对了当时的 23 个用例，结论是登记表本身并未过期——0 个用例存在真正的业务逻辑错误。唯一记录在案的偏差是 `import-case-4`/`import-case-6`：两者都会调用 SHGT 的 `PARTIAL_REDEEM`（部分赎回）。这在微服务 API 层至今仍完全合法，但 Angular Transaction Builder 已于 2026-08-21 将 A9（Shipping Guarantee Redemption）锁定为仅支持 Full Redeem（金额字段被 PROTECTED，恒等于 SG 自身的 Available Balance）——因此一个真实用户点击当前 UI 已经无法触发 Partial Redeem。源码自身的注释（`businessCases.js` 中两处 "Note (2026-08-24, post-Business-Case-Runner-inventory)"）明确将其记录为"有意保留的 API-vs-UI 范围差异，非 Bug"，不是需要修复的问题。

补充说明：微服务 `app.ts` 中 2026-08-26 的限流修复注释（见 [[rate-limiter-false-positive-artifact-when-business-cases-are-run-back-]]）称登记表"现有 27 个用例"——这本身在写下时可能是准确的快照，但截至本次核实（同日晚些时候）实际已增至 29 个；记录于此以避免与本文冲突，也提醒后续读者两处数字出现分歧时以 `businessCases.js`/`businessCases.test.js` 的实测结果为准。

### 证据来源（本次更新）
- `backend/data/businessCases.js:77-2913`（29 个 `id:` 条目，逐一核对）
- `backend/test/businessCases.test.js:8-47`（`EXPECTED_IDS` 长度 29，断言 "returns exactly 29 business cases, Import Case 1-15 then Export Case #1-#14, in order"）
- `backend/data/businessCases.js:335-360`（import-case-4 的 PARTIAL_REDEEM/A9 UI 范围注释）
- `backend/data/businessCases.js:515-530`（import-case-6 的相同注释）
