---
knowledge_id: newcontractsufficiencyregistry-shgt-issue-eplc-examination-create-disp
title: "newContractSufficiencyRegistry（SHGT:ISSUE / EPLC_EXAMINATION:CREATE 分派表）"
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

# newContractSufficiencyRegistry（SHGT:ISSUE / EPLC_EXAMINATION:CREATE 分派表）

这是另一张更小的注册表，以字面字符串 `${instrumentType}:${movementType}` 为键，仅包含两条：'SHGT:ISSUE' -> checkNewShgtSufficiency、'EPLC_EXAMINATION:CREATE' -> checkNewPresentDocsSufficiency。刻意以 instrumentType+movementType 的完整组合作键，而非仅用 instrumentType，以完整保留原始的守卫条件，避免一个假设中构造错误的 SHGT+CREATE 请求被意外检查通过。该表在 resolveOrCreateContract() 内部、createContract() 执行之前被查询，从而确保一旦检查失败，就绝不会留下孤立的合约记录。

## Source Evidence

- `balanceService.ts:309-329 (buildNewContractSufficiencyRegistry + doc comment)`
- `balanceService.ts:942-949 (dispatch call site)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
