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

- Microservice OAS 更新至 v1.41.0；Channel OAS 更新至 v1.9.0。
- A1／B1 成功后回到新输入，其余 Function 回到 Transaction Index。
- A4 使用 withdraw-maker-submit，保留 A3／A3S source。
- A3S／B4／B5 是 sibling-first、primary-last 的多次单笔 cancel，不是 atomic batch。
- Maker Queue／Fix Pending 与上述 Transaction Processing flow 分离。

权威入口：`analysis/balance-component-api.yaml`、`docs/current-behavior.md`、`docs/balance-business-rules.md`。
