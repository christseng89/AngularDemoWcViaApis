---
knowledge_id: TOLERANCE-RULE-014
title: "Buyer's Usance 仅为进口侧融资；出口/保兑行一侧必须按 Sight 同等处理——业务已决议，但仅落实到测试样例层级，没有领域层强制校验"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - tolerance
  - confirmed
---

# TOLERANCE-RULE-014 — Buyer's Usance 仅为进口侧融资；出口/保兑行一侧必须按 Sight 同等处理——业务已决议，但仅落实到测试样例层级，没有领域层强制校验

## Status
CONFIRMED

## Business Rule
Buyer's Usance 期限代表的是开证行向申请人（Applicant）在进口侧提供的融资；从出口/保兑行自身的资产负债表角度看，Buyer's Usance 的 LC 本身不带有任何延期付款风险敞口，必须与 Sight LC 同等处理（B4 必须路由至 HONOUR，绝不可为 ACCEPT）——对 EPLC_CONFIRMATION 合约而言，tenorType: 'BUYERS_USANCE' 不是一个有效声明。

## Conditions
instrumentType = EPLC_CONFIRMATION（或出口侧的 EPLC_LC），声明或尝试声明 tenorType = BUYERS_USANCE。

## Result
业务决议已有文档记录；实际落实范围较为局限：仅有两个已知的 Business Case Registry 样例（export-case-2、export-case-4）已从 BUYERS_USANCE 更正为 SELLERS_USANCE。尚未落实之处：已通过 grep 独立确认，tenorRouting.ts 或 balanceService.ts 中并不存在任何领域层强制校验，用以拒绝或纠正直接调用方针对 EPLC_CONFIRMATION/EPLC_LC 声明 BUYERS_USANCE 的行为——目前只在 balanceService.ts 第 131 行有一段文档注释提及该项简化决议，完全没有对应的强制执行代码。

## Example
已独立确认 backend/data/businessCases.js 中的 export-case-2 与 export-case-4 在各自的 LC-issue 步骤已改为声明 tenorType: 'SELLERS_USANCE'（而非 BUYERS_USANCE）；该文件中其余 BUYERS_USANCE 用例均属进口侧（IPLC_LC）案例，与本规则的适用范围一致。

## Verification Note
已独立重新验证两项最关键的论点：(1) 已对 tenorRouting.ts 与 balanceService.ts 搜索 'BUYERS_USANCE'，确认不存在任何强制执行代码（仅有一段文档注释）——印证了"尚未落实"这一范围判断，而非与之矛盾；(2) 已对 businessCases.js 进行搜索，确认 export-case-2（第 1445 行）与 export-case-4（第 1627 行）均已声明 SELLERS_USANCE，该文件中其余的 BUYERS_USANCE 声明均属进口侧。维持 CONFIRMED。分类提示：本条本质上属于期限路由（tenor-routing）/ MOVEMENT-RULE 范畴的问题，并非容差/Ceiling 转换或外汇/币别相关规则——标记为很可能被错误归入 TOLERANCE-RULE 前缀，但内容本身并无疑问。

## Source Evidence

Implementation:
- `analysis/Balance-Component-Business-Rule-Decisions-2026-08-21.md (Decision 2 section, verified content matches)`
- `microservices/balance-component/src/service/balanceService.ts:131 (comment-only; independently confirmed no BUYERS_USANCE guard exists in tenorRouting.ts or balanceService.ts via grep)`
- `backend/data/businessCases.js (independently confirmed export-case-2/export-case-4 now use SELLERS_USANCE, not BUYERS_USANCE)`

Tests:
- `analysis/Balance-Component-Export-Case-2-4-Tenor-Fix-Verification-2026-08-22.md:45-60 (cited by candidate)`

## Related Knowledge
- [[Tolerance Processing]]
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
