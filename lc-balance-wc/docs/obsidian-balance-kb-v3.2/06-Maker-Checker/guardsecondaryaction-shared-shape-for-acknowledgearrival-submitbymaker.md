---
knowledge_id: guardsecondaryaction-shared-shape-for-acknowledgearrival-submitbymaker
title: "guardSecondaryAction()——acknowledgeArrival()/submitByMaker() 的共用结构"
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

# guardSecondaryAction()——acknowledgeArrival()/submitByMaker() 的共用结构

这是一个私有辅助方法（最初是为 B3 那个现已移除的 acknowledge() 抽取出来的），实现了"查找变动记录 -> 校验结构 -> 校验状态是否为 PENDING -> 校验是否已处理过 -> 持久化并重新读取"这一固定流程。acknowledgeArrival()（A3/A3S 的 Checker 确认，仅限 IPLC_LC/UTILIZE）与 submitByMaker()（A4 的 Maker Submit，仅限 IPLC_LC/UTILIZE）均委托给它执行，两者的差异仅在于各自传入的 validate()/alreadyDoneAt()/alreadyDoneBy()/persist() 回调不同。两条调用路径都不会改动 movement.status——各自只写入自己的一组审计时间戳字段。

## Source Evidence

- `balanceService.ts:1279-1413`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
