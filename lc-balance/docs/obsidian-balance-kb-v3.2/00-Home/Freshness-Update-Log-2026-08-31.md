---
title: Freshness Update Log 2026-08-31
domain: Balance
category: Freshness
snapshot_date: 2026-08-31
tags:
  - balance
  - freshness
---

# Freshness Update Log — 2026-08-31

以当前 source code 与 tests 为准，完成 Transaction Processing 同 session Delete Pending 的知识同步：

- Microservice OAS 更新至 v1.42.1；Channel OAS 维持 v1.9.0。
- A1／B1 成功后回到新输入，其余 Function 回到 Transaction Index。
- A4 使用 withdraw-maker-submit，保留 A3／A3S source。
- A3S／B4／B5 是 sibling-first、primary-last 的多次单笔 cancel，不是 atomic batch。
- Maker Queue／Fix Pending 与上述 Transaction Processing flow 分离。
- Maker Queue、Inquire Events、Inquire Delete Pending 保留原始 HTTP status；status 0／5xx 显示服务不可用，不再误报 `BAL-UI-UNEXPECTED`。
- Angular client 对安全读取采用 `.env` 可配置的 3 次 bounded exponential backoff；POST command 不自动重送。
- `x-client-retry-policy` 是 client operational metadata，不改变 HTTP 或 Channel wire contract。
- Maker Submit error policy 已覆盖 A1-A11／B1-B7：本地 validation 与 HTTP 4xx 分开呈现，保留 backend status／code／安全的 business reason；同步 dispatch exception 也统一转为 failed outcome。
- 本次 UI error-classification 没有 wire change，因此 Microservice OAS 保持 v1.42.1、Channel OAS 保持 v1.9.0。
- 所有 A1-A11／B1-B7 的 Checker Release 成功后统一 reset Maker／Checker 画面；旧 movement 与 Fix/Delete Pending signals 不再残留，Reject 保留资料供修正。此 lifecycle 修正没有 OAS wire change。

权威入口：`analysis/balance-component-api.yaml`、`docs/current-behavior.md`、`docs/balance-business-rules.md`。
