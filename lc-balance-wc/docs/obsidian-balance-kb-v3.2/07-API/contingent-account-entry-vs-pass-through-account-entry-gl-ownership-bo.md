---
knowledge_id: contingent-account-entry-vs-pass-through-account-entry-gl-ownership-bo
title: "Contingent Account Entry 与直通式 Account Entry 的区别（GL 归属边界）"
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

# Contingent Account Entry 与直通式 Account Entry 的区别（GL 归属边界）

BalanceMovement 上并存两个结构完全不同的借贷（Dr/Cr）概念：`accountEntries`（AccountEntry[]）由调用方提供，本服务仅在放行（Release）时负责存储并原样传递，从不解读 accountRef，也不自行判断 drCr——其归属始终在下游的会计组件。`contingentAccountEntry`（ContingentAccountEntry，恰好零个或一个）则是服务端在创建时，依据 (instrumentType, movementType, amount 符号, 合约 tenorType) 一次性推导生成（依据 analysis/contingent-liability-ledger.html），并被不可变地持久化；对于三种 ON_BALANCE_ASSET instrument type，以及任何无法识别的 movementType，该字段恒为 null。一笔 exposureNature 为 MEMO 的 movement（EPLC_EXAMINATION）会在服务端被强制将 accountEntries 置为 null，因为 memo 性质的 earmark 从不过 GL 账。

## Source Evidence

- `balance-component-api.yaml lines 1240-1254 (ExposureNature MEMO description)`
- `balance-component-api.yaml lines 1284-1315 (AccountEntry/ContingentAccountEntry schemas)`
- `balance-component-api.yaml lines 210-231 (v1.1.0 changelog)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
