---
knowledge_id: resolveorcreatecontract-contract-resolution-creation-preamble
title: "resolveOrCreateContract()——合约解析/创建前置流程"
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

# resolveOrCreateContract()——合约解析/创建前置流程

这是一个从原本圈复杂度高达 71 的 createMovement() 中抽取出来的私有方法（BAL-142）：先按 balanceContractId 或 naturalKey 解析既有合约；执行重复 ISSUE 的守卫检查；对已存在的合约执行 Root-Issue-Released 守卫检查；若合约尚不存在，则校验 movementType 是否为创建类型、检查父级自身的 ISSUE 是否已 Released（针对新建子记录的情形）、执行 Acceptance Tenor 一致性检查、执行 newContractSufficiencyRegistry 分派，最后调用 createContract()。每一条判断条件与提示信息都与重构前的内联版本逐字节保持一致。

## Source Evidence

- `balanceService.ts:863-950`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
