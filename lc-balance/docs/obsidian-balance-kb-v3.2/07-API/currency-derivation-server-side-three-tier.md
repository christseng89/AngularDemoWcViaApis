---
knowledge_id: currency-derivation-server-side-three-tier
title: "币别推导（服务端，三层规则）"
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

# 币别推导（服务端，三层规则）

对于任何并非新建 Logical Contract 根级首次创建的 movement，微服务都会在服务端推导并校验 `currency`。这是一个三分支规则：(1) 请求解析到一个既有合约 → currency 由该合约推导得出，调用方所传值必须与之一致或干脆省略；(2) 通过 parentLogicalContractId 创建一个新的子合约 → currency 由父合约推导得出，同样遵循"一致或省略"的规则；(3) 确实是创建一个全新的根级 Logical Contract（既无既有解析结果，也无父合约）→ currency 由调用方提供且为必填，并成为该合约永久性的 Currency Code。这与面向 channel 的规则（仅 A1/B1 接受 Currency Code 作为输入）在效果上一致，只是未在此处直接点名具体业务功能。

## Source Evidence

- `balance-component-api.yaml lines 52-81 (CURRENCY DERIVATION top-level description)`
- `balance-component-api.yaml lines 748-753 (POST /balance-movements description excerpt)`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
