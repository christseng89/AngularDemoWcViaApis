---
knowledge_id: why-lc-sg-combined-exposure-uses-max-not-sum-and-re-weights-ccf-once-a
title: "为何信用证与 SG 的合并风险暴露应取 MAX 而非 SUM，且一旦开立 SG 就要对 CCF 重新加权"
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

# 为何信用证与 SG 的合并风险暴露应取 MAX 而非 SUM，且一旦开立 SG 就要对 CCF 重新加权

将信用证或有负债与 SG 或有负债简单相加会虚增风险暴露（两者覆盖的是同一批货物），但单纯轧差同样是错误的，理由更为深层且属于法律层面：一旦开立 SG，拒绝单证不符的交单在经济上就变得毫无意义（申请人在申请 SG 时已不可撤销地放弃了不符点抗辩，且货物已放行给承运人），尽管银行依据 UCP Art. 14/16 拒绝不符交单的法律权利在名义上仍然存续（UCP 600 具有自主性——对第三方承运人出具的保函并不会修改信用证本身）。正确的汇总方式是重新分类，而非轧差：按每笔关联货运计算，E_shipment = MAX(该批货运项下已预留/占用的信用证金额, SG 金额)——绝不是相加——按 100% CCF 计提，并剔除抵押品价值（因为货物/物权单据已经放行）。这套"取 MAX 而非 SUM／重新加权"的逻辑，正是实际 Balance Component 中 offBalanceExposure.ts 仅针对 SHGT 场景所做检查、以及其"discrepancy_refusal_economically_unavailable"式推理的理论依据，也是将仍未平仓的 SG 视为会削减该笔信用证自身 Tight Available Balance（紧口径可用余额，参见 CLAUDE.md 中的 tightAvailableBalance 推导逻辑）的原因。

## 来源证据

- `TF_Contingent_Liability_Lifecycle-en.txt §10.2 Rule 2/3`
- `TF_Contingent_Liability_Lifecycle-en.txt §4.5: 'E_shipment = MAX(LC_utilised_or_earmarked_for_shipment, SG_amount) ← not the sum'`

## 相关知识

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
</content>
