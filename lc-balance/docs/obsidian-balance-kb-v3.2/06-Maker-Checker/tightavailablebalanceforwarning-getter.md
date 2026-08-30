---
knowledge_id: tightavailablebalanceforwarning-getter
title: "tightAvailableBalanceForWarning 取值器（getter）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-30
tags:
  - balance
  - domain-concept
---

# tightAvailableBalanceForWarning 取值器（getter）

> [!info] 2026-08-30 authoritative rule
> Tight LC Balance 在贸易融资语义上不得小于 0。A2/B2 Decrease、A3、A3S、A8、B3 在适用的 UI Submit、API 与 Checker Release 阶段执行检查；UI warning 只是体验层，服务端/domain 才是权威控制。

针对两种特定的实时预警场景，对已持久化的普通 `tightAvailableBalance` 快照数值做放宽处理——这两种场景下，服务端实际校验出的可用额度，会比原始快照数字更宽松：A3S（documentArrivalWithSg 形态）会以所选 SG 自身的 `confirmedBalance`（Outstanding）做放宽；B4（HONOUR/ACCEPT）会以所引用/所选中的 Present-Docs 变动记录自身的 `ceilingAmount` 做放宽。其余所有功能则回退使用普通数值。

## Source Evidence

- `maker-panel.component.ts:774-808 (getter + extensive doc comment)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
