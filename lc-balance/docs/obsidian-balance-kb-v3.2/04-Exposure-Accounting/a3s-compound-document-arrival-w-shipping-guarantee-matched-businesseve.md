---
knowledge_id: a3s-compound-document-arrival-w-shipping-guarantee-matched-businesseve
title: "A3S 复合式提货文件到单（含 Shipping Guarantee）— 匹配 businessEventId 的净额例外"
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

# A3S 复合式提货文件到单（含 Shipping Guarantee）— 匹配 businessEventId 的净额例外

A3S 会创建两笔共享同一个 businessEventId 的异动：信用证自身的 UTILIZE，以及与之匹配的 SG 自身的 FULL_REDEEM/PARTIAL_REDEEM，后者以 MIN(提单金额, SG 自身的 Available Balance) 为上限，且以 SG 优先的顺序提交。Checker Release 只会真正释放 SG 这一条分支；信用证自身的 UTILIZE 则维持 PENDING 状态（之后由 A4/A6 最终敲定）。这是唯一一种在 Submit 当下（而非等到 Release）就立即以 PENDING 状态净额计入 Off-Balance Exposure 的赎回情形——因为这两条分支永远会一起被释放、或一起被自动回滚，所以把这一对异动当作单一重分类事件处理并不存在跨交易的额度外泄风险。对 Tight Available Balance 的综合净效果永远是下降或持平（绝不会是纯粹的上升），因为赎回这一条分支以 MIN 为上限，绝不可能超过 UTILIZE 自身的 ceilingAmount。

## 来源证据

- `Balance-Figures-Calculation-Logic.txt lines 586-682 (A3S table and its own Tight Available Balance row, including the S02/G02 worked example)`
- `Balance-Figures-Calculation-Logic.txt lines 87-107 (banner: Off-Balance Exposure basis)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
