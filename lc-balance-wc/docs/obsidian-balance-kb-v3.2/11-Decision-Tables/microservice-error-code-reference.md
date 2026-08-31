---
knowledge_id: microservice-error-code-reference
title: "微服务错误代码参考"
domain: Balance
category: Decision Table
snapshot_date: 2026-08-22
tags:
  - balance
  - decision-table
---

# 微服务错误代码参考

| Code | HTTP Status | Trigger（触发条件） |
|---|---|---|
| REQUEST_VALIDATION_FAILED | 400 | 字段格式错误、Acceptance/父级期限不匹配、缺失必填的 parentLogicalContractId、sourceTransactionRef 重复使用、金额超出该币种的小数位精度 |
| INSUFFICIENT_AVAILABLE_BALANCE | 409 | 该 movementType（UTILIZE、SHGT ISSUE、EPLC_EXAMINATION CREATE、AMEND_DECREASE、CLOSE 资格判定不满足）的 Available/Tight Available Balance 不足 |
| NATURAL_KEY_ALREADY_EXISTS | 409 | 以建立类 movementType（ISSUE/CREATE）对已解析出一笔 ACTIVE 合约的自然键进行操作 |
| CURRENCY_MISMATCH | 409 | 调用方提供的币种与服务端推导出的币种不一致（Currency Derivation 情形 1/2） |
| ILLEGAL_STATE_TRANSITION | 409 | 在执行 release/reject/cancel/maker-submit/acknowledge 时该移动记录并非 PENDING 状态；即期 UTILIZE 未经事先 maker-submit 即被释放；CLOSE 的资格判定/金额在 Release 时已不再成立 |
| NOT_FOUND | 404 | 按给定 id 或自然键找不到对应的合约/移动记录 |
| INTERNAL_ERROR | 500 | 未处理的服务端错误——响应体始终携带固定的通用信息，真实详情仅记录于服务端日志，从不回传给客户端 |

## Source Evidence

- `balance-component-api.yaml lines 1735-1751`

## Related Knowledge

- OpenAPI Specs — Microservice + Channel API
- [[Business-Rule-Index]]
