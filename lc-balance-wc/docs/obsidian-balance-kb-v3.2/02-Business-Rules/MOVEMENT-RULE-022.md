---
knowledge_id: MOVEMENT-RULE-022
title: "A3S SG 赎回金额/类型的客户端实时预览，与实际提交给服务端的公式完全一致"
domain: Balance
category: Business Rule
status: CONFIRMED
source_repository: Balance Component (lc-balance)
last_verified_commit: "N/A — no .git history in the analyzed snapshot, see [[Source-to-Knowledge-Map]]"
snapshot_date: 2026-08-22
tags:
  - balance
  - movement
  - confirmed
---

# MOVEMENT-RULE-022 — A3S SG 赎回金额/类型的客户端实时预览，与实际提交给服务端的公式完全一致

## Status
CONFIRMED

## Business Rule
Maker 面板侧的预览 getter（arrivalSgRedeemAmount、arrivalSgRedeemType、arrivalSgRemaining）计算的是与 MakerSubmitService 随后实际提交时相同的、带 MIN 上限的公式：赎回金额 = MIN(输入的 Bill Amount, 所选 SG 的 confirmedBalance/Outstanding)；类型判定为：若赎回金额达到或超过 Outstanding 则为 FULL_REDEEM，否则为 PARTIAL_REDEEM。

## Conditions
存在 arrivalSgSnapshot，且 model.amount 是一个正的有限数值

## Result
arrivalSgRedeemAmount = min(billAmount, sgConfirmedBalance)；arrivalSgRedeemType 由该值是否达到/超过 Outstanding 推导得出；arrivalSgRemaining = max(0, Outstanding − redeemAmount)

## Example
SG Outstanding 为 10,000，输入 Bill Amount 34,000 -> 预览的赎回金额为 10,000（FULL_REDEEM，剩余为 0）——与实际提交的 redeemReq 一致

## Verification Note
本轮未直接重新核对源码，但这是一条关于『UI 预览与服务端公式一致性』的独立声明（而非单纯重复 MIN() 公式本身的规则），本轮也未发现任何与其相矛盾的证据。作为与核心 MIN() 公式规则相独立的条目保留，未合并。

## Source Evidence

实现:
- `src/app/transaction-builder/maker-panel.component.ts:757-772`
- `src/app/transaction-builder/maker-submit.service.ts:91-98`

测试:
- （未引用直接测试证据）

## Related Knowledge
- [[BalanceMovement]]
- A3S 基于单据匹配的 SG 赎回
- [[Business-Rule-Index]]
- [[Balance-Traceability-Matrix]]
