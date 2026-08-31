---
knowledge_id: post-balance-movements-id-cancel-maker-ec-error-correction
title: "POST /balance-movements/:id/cancel——Maker EC（错误更正）"
domain: Balance
category: Domain Concept
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-31
tags:
  - balance
  - domain-concept
---

# POST /balance-movements/:id/cancel——Maker EC（错误更正）

要求提供 cancelledBy（缺失则 400）；只能对 Maker 自己仍处于 PENDING 状态的记录执行（对已 RELEASED 的 Movement 执行会返回 409 ILLEGAL_STATE_TRANSITION）。会写入自己专属的 cancelledBy/cancelledAt 字段对（与 releasedBy/releasedAt 相区分——一笔 CANCELLED 的 Movement 上，这两个字段始终为 null）——这样设计专门是为了让 Submit/EC/Approve 三者始终是三条各自独立、可读的审计事实。省略时 reasonCode 默认取值为 'MAKER_EC'。一笔 CANCELLED 的 Movement，其对 pendingEarmarkTotal 的 PENDING earmark 贡献会被完全冲销，使 Available Balance 恢复到与 Confirmed Balance 相等。

## 2026-08-31 — Transaction Processing integration

- Endpoint 一次只取消一个 movement，并写入该 movement 的 Delete Pending audit。
- A3S／B4／B5 由 UI strategy 先取消 sibling、最后取消 primary；这是 ordered calls，不是 atomic batch cancel。中途失败时保留画面与实际状态。
- A4 不使用此 endpoint；它调用 `POST /balance-movements/{id}/withdraw-maker-submit`，避免误删 A3／A3S source。
- A1／B1 成功后回到全新输入，其他 Function 回到 Index，是 UI navigation，不是 API response contract。
- Transaction Processing 的同 session action 与 Maker Queue／Fix Pending 分离。

## Source Evidence

- `microservices/balance-component/src/routes/balanceMovements.ts`
- `analysis/balance-component-api.yaml` v1.42.1
- `src/app/transaction-builder/function-strategy.ts`

## Related Knowledge

- [[Business-Rule-Index]]
- [[Balance Component Overview]]
