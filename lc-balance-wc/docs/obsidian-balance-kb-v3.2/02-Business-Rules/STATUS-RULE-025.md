---
knowledge_id: STATUS-RULE-025
title: "余额分页（Balance Tab）门控：承兑（Acceptance）分页仅在 IPLC_LC/EPLC_CONFIRMATION 根合约的远期（Usance）付款期限下出现；SG 分页仅在进口 IPLC_LC 下出现"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - status
  - confirmed
---

# STATUS-RULE-025 — 余额分页（Balance Tab）门控：承兑（Acceptance）分页仅在 IPLC_LC/EPLC_CONFIRMATION 根合约的远期（Usance）付款期限下出现；SG 分页仅在进口 IPLC_LC 下出现

## 状态
CONFIRMED

## 业务规则
只有当根合约的 instrumentType 为 IPLC_LC 或 EPLC_CONFIRMATION，且 tenorType 已设置并且不是 'SIGHT' 时，Acceptance（承兑）分页才会出现。只要 instrumentType 为 IPLC_LC，无论付款期限（tenor）为何，SG 分页都会出现。这一逻辑在 InquireEventsService（selectedEventIsUsanceLc/selectedEventHasSg）与 LookUpPanelService（lookupIsUsanceLc/lookupHasSg）中被完全相同地重复实现。

## 条件
instrumentType ∈ {IPLC_LC, EPLC_CONFIRMATION} && tenorType !== null && tenorType !== 'SIGHT' ⇒ 显示 Acceptance 分页；instrumentType === 'IPLC_LC' ⇒ 显示 SG 分页。

## 结果
进口即期（Import Sight）：2 个分页（LC、SG）。进口远期（Import Usance）：3 个分页。出口即期（Export Sight）：1 个分页（仅 LC）。出口远期（Export Usance）：2 个分页。

## 示例
出口即期保兑（Export Sight Confirmation）仅显示 Confirmed LC Balance 分页。

## 验证说明
直接阅读了两个 getter。对原候选规则的『条件』文字做了精修：Acceptance 分页的门控还要求 instrumentType ∈ {IPLC_LC, EPLC_CONFIRMATION}——instrumentType 为 EPLC_LC（未保兑的出口 LC）的根合约，无论付款期限为何都不会显示该分页，因为 selectedEventIsUsanceLc 明确排除了这两者之外的任何 instrumentType。实务上 Inquire Events 的根合约本来就必然是这两者之一，因此不会改变实际行为，但字面上的条件比原本陈述的更窄。这不是降级——仍为 CONFIRMED，只是收紧了表述。

## 来源证据

实现：
- `src/app/transaction-builder/inquire-events.service.ts:276-286`
- `src/app/transaction-builder/look-up-panel.service.ts:136-145`

测试：
- `src/app/transaction-builder/inquire-events.service.spec.ts:732-772`

## 相关知识
- [[Close Eligibility]]
- EventBalanceTab
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
