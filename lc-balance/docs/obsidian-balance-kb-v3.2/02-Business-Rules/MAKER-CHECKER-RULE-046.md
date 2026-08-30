---
knowledge_id: MAKER-CHECKER-RULE-046
title: "A4 Maker Submit 关卡（gate）体现在业务案例注册表（Business Case Registry）自身的步骤形态中，且仅限于 Sight 期限的进口单据到单（Import Document Arrival）"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - maker-checker
  - confirmed
---

# MAKER-CHECKER-RULE-046 — A4 Maker Submit 关卡体现在业务案例注册表自身的步骤形态中，且仅限于 Sight 期限的进口单据到单

## 状态
CONFIRMED

## 业务规则
只有当父级 LC 的 tenorType 为 SIGHT（即期）时，单据到单（Document Arrival，IPLC_LC / UTILIZE）才需要在业务案例注册表中，先经过一个真实的 makerSubmit 步骤，才能进入自身的 Checker release。Usance（远期，BUYERS_USANCE / SELLERS_USANCE）期限的单据到单会直接 release，无需经过 makerSubmit 步骤，而是改由 A6 自身独立的、与 Acceptance 关联的复合式（compound）release 来完成结算。这一注册表层面的模式反映了、但本身并不能证明上文已单独验证过的服务器端 BAL-123 强制规则。

## 条件
instrumentType=IPLC_LC，movementType=UTILIZE，父级 LC 的 tenorType='SIGHT'。

## 结果
在注册表中，每一个 Sight 案例都会先有一个指向该 UTILIZE 的 makerSubmit 步骤（movementRef 指向该笔 UTILIZE），随后才是 release 步骤；而 Usance 案例则从创建直接进入 release（createAndRelease，无 makerSubmit）。

## 示例
import-case-1（SIGHT）：create UTILIZE -> makerSubmit -> release。import-case-2（BUYERS_USANCE）：create UTILIZE -> release（createAndRelease，无 makerSubmit）。

## 验证说明
该候选条目自身的 businessRule 文本原本暗示它能独立证明服务器端的这一关卡（"否则微服务会返回 409"），但其自身的 sourceEvidenceImpl 只是后端注册表的编写选择，并非微服务自身的强制执行——这一半内容已由另行合并的 BAL-123 服务器端规则覆盖。此处将 CONFIRMED 范围严格限定为一个关于注册表自身『步骤编写惯例』的事实（即哪些案例包含 makerSubmit），而不再将其重复用作服务器端强制执行的独立证明，以避免两条规则之间的循环互证。

## 来源证据

实现：
- `backend/data/businessCases.js:123-134,297-302,435-439,640-645,1190-1191`

测试：
- `backend/test/server.test.js:100-137`

## 相关知识
- [[Maker Checker Lifecycle]]
- Sight 项下 IPLC_LC/UTILIZE（A4）要求在 Checker Release 前必须有真实的 Maker Submit——服务器端强制执行，按 tenorType 限定范围（BAL-123）
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
