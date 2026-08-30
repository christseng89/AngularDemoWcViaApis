---
knowledge_id: contingent-liability-as-off-balance-sheet-memoranda-not-the-risk-numbe
title: "Contingent liability as off-balance-sheet memoranda, not the risk number (D1)"
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

# Contingent liability as off-balance-sheet memoranda, not the risk number (D1)

技术要点：一笔或有负债余额（例如 LC/SG/Confirmation 未结金额）是一组备忘记录（memorandum pair），而非财务报表上的负债本身；GL 会永久、按总额保留每一笔或有负债余额，真正的风险/风险暴露数字是透过遍历关联图（TRANSFORM/COVER/COLLATERAL）推导出的衍生数字，绝不在 GL 内部进行净额处理。

完整的范畴判断说明见 [[Balance Component Overview#範疇之外]] 的「范畴之外」小节，此处不重复展开。

## Source Evidence

- `TF_Contingent_Liability_Lifecycle-en.txt §1 D1: 'Contingent balances are memoranda, not the risk number...Never net inside the GL.'`
- `TF_Contingent_Liability_Lifecycle-en.txt §10.2 Rule 5: 'Never net inside the GL. The risk number is a query over the linkage graph.'`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
