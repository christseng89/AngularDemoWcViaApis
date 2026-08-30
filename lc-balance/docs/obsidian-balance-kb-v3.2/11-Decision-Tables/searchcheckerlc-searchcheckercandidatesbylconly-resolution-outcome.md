---
knowledge_id: searchcheckerlc-searchcheckercandidatesbylconly-resolution-outcome
title: "searchCheckerLc() / searchCheckerCandidatesByLcOnly() 解析结果"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# searchCheckerLc() / searchCheckerCandidatesByLcOnly() 解析结果

| selectedFunction 是否已设置？ | checkerLcNumber 是否已输入？ | 次要字段是否必填且为空？ | catalog() 候选数量 | 结果 |
|---|---|---|---|---|
| 否 | - | - | - | 空操作（提早返回，只执行方法开头的重置逻辑） |
| 是 | 否 | - | - | checkerSearchError = 'Type an LC Number to search.' |
| 是 | 是 | 否（次要参照已填写，或本就非必填） | - | 直接调用 resolveContract(instrumentType, naturalKey)；成功则加载队列，失败则设置 checkerSearchError |
| 是 | 是 | 是 | 0 | checkerSearchError = 'No {label} record found under this LC.' |
| 是 | 是 | 是 | 1 | 自动解析：设置 checkerContract，用该候选自身的 natural key 填充 checkerSecondaryRef，设置 checkerAutoPickedHint，立即加载 Checker 队列（无需再次往返调用 resolveContract） |
| 是 | 是 | 是 | >1 | 填充 checkerSecondaryCandidates，供用户经由 onSelectSecondaryCandidate() 手动挑选；此时尚未解析出合约，也未加载队列 |

## Source Evidence

- `checker-panel.component.ts:147-230`
- `checker-panel.component.spec.ts:245-426`

## Related Knowledge

- Angular Checker Panel + Actions
- [[Business-Rule-Index]]
