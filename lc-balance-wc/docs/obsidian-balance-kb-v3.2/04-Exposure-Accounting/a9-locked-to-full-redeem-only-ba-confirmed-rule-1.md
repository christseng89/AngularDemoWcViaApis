---
knowledge_id: a9-locked-to-full-redeem-only-ba-confirmed-rule-1
title: "A9 锁定为仅可全额赎回 — BA 已确认规则 #1"
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

# A9 锁定为仅可全额赎回 — BA 已确认规则 #1

BA 已于 2026-08-21 针对 TF_Balance_Component_Mapping 自身的规则 #1（"SG 的解除以金融工具为基础，而非以金额为基础"）确认：A9 的金额字段现已受保护／被禁用，其值取自 SG 自身当下的 Available Balance，因此 ceilingAmount 永远是全部尚未清偿的金额，PARTIAL_REDEEM 已无法再透过 A9 触达。这是一项仅限参考客户端（Angular）范畴内的变更——微服务自身的 PARTIAL_REDEEM movementType 与 checkRedeemSufficiency() 并未改变，仍然接受来自任何其他直接 API 调用方的 Partial Redeem，是一项已披露但尚未完全收敛的范畴限制。A3S 自身匹配的 SG 赎回分支不受影响——那是一条独立的代码路径，真正以 MIN(提单金额, SG Available Balance) 为上限，并透过 businessEventId 与一笔真实的 Document Arrival 绑定，而非一个独立输入的金额。

## 来源证据

- `Balance-Figures-Calculation-Logic.txt lines 143-152 (banner: A9 locked to Full Redeem only)`
- `Balance-Figures-Calculation-Logic.txt lines 848-887 (A9's own section)`
- `TF_Balance_Component_Mapping-en.txt line 14 (README Rule #1: SG discharge is instrument-based, not amount-based)`
- `TF_Balance_Component_Mapping-en.txt line 855 (T4: SG contingent goes to 0, no residual)`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
