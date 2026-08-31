---
knowledge_id: currency-derivation-3-case-resolution
title: "币种推导——三种情形的解析方式"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 币种推导——三种情形的解析方式

| 情形 | 触发条件 | 币种来源 | 调用方传入币种时的行为 |
|---|---|---|---|
| 1 | 请求解析到一份「已存在」的合约（通过 balanceContractId，或 naturalKey 匹配到某份既有的 ACTIVE 合约） | 该既有合约自身存储的币种 | 可省略（推荐），若传入则必须精确匹配；不匹配 → 返回 409 CURRENCY_MISMATCH |
| 2 | 正在创建 movementType（ISSUE/CREATE），无既有解析结果，且提供了 parentLogicalContractId | 父合约自身当前的币种 | 同样遵循「匹配或省略」规则；不匹配 → 返回 409 CURRENCY_MISMATCH |
| 3 | 正在创建 movementType，无既有解析结果，且未提供 parentLogicalContractId（属于真正的根级全新逻辑合约——例如 IPLC_LC/EPLC_CONFIRMATION 的 ISSUE） | 由调用方提供 | 必填；将成为该新逻辑合约自身权威的币种代码，适用于其之后针对该合约或在其下创建的每一笔 movement |

## 来源证据

- `balance-component-api.yaml lines 52-81`

## 相关知识

- OpenAPI Specs — Microservice + Channel API
- [[Business-Rule-Index]]
