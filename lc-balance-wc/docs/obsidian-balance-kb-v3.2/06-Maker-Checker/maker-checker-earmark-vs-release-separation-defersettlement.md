---
knowledge_id: maker-checker-earmark-vs-release-separation-defersettlement
title: "Maker/Checker 的圈存（Earmark）与放行（Release）分离机制（deferSettlement）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — 本次分析快照中无 .git 历史记录，详见 [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - domain-concept
---

# Maker/Checker 的圈存（Earmark）与放行（Release）分离机制（deferSettlement）

根据 cs-tf-balance-knowhow 的定义，A3/A3S 属于 D3「物理事件而非法律事件」：这两个功能上 Checker 自己的 Approve 动作仅为确认（acknowledgment），并不会真正调用放行（release）API——无论如何，该笔变动记录都会保持 PENDING 状态（一旦确认完成即显示为 EARMARKED / 圈存）。只有 A4（Sight 结清）或 A6（Usance -> Acceptance 转换）才会真正把底层变动记录放行进入 LC Balance。这一行为通过 checkerRelease.deferSettlement=true 精确编码在 A3 与 A3S 这两个功能上。

## Source Evidence

- `src/app/transaction-builder/function-strategy.spec.ts lines 90-93`
- `src/app/transaction-builder/function-strategy.ts lines 50-51, 107-117`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
