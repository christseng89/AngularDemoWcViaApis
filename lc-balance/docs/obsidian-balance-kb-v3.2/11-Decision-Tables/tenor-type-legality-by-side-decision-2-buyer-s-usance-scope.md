---
knowledge_id: tenor-type-legality-by-side-decision-2-buyer-s-usance-scope
title: "按方向划分的 Tenor Type 合法性（决策 2）——Buyer's Usance 范畴"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# Tenor Type legality by side (Decision 2) — Buyer's Usance 范畴

| 金融工具/方向 | SIGHT | SELLERS_USANCE | BUYERS_USANCE | 执行现状 |
|---|---|---|---|---|
| 进口——IPLC_LC / IPLC_ACCEPTANCE | 合法 | 合法 | 合法——开证行对申请人的真实融资安排 | 已正确支持，无需改动 |
| 出口——EPLC_LC / EPLC_CONFIRMATION | 合法——B4 路由至 HONOUR | 合法——B4 路由至 ACCEPT | 业务已裁定为 INVALID——保兑行/出口行对 Buyer's Usance 本身不承担延期付款敞口，必须与 Sight 做完全相同的处理（B4 必须路由至 HONOUR，绝不可为 ACCEPT） | 仅完成测试数据层面的修复（export-case-2/4 已更正为 SELLERS_USANCE，2026-08-22，已在实机验证）——tenorRouting.ts/balanceService.ts 中领域层的拒绝/规整逻辑（行动项 3）仍明确列为 DEFERRED（延后处理），尚未实现 |

## Source Evidence

- `Balance-Component-Business-Rule-Decisions-2026-08-21.md:42-58`
- `Balance-Component-Export-Case-2-4-Tenor-Fix-Verification-2026-08-22.md:1-32`

## Related Knowledge

- Quality/Remediation History Docs
- [[Business-Rule-Index]]
